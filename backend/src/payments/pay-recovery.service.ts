import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PayRecoveryCase, PayTransaction } from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { PayActor, PayContextService, num } from './pay-context.service';
import { PayIdempotencyService } from './pay-idempotency.service';
import { PayMessagingService, PayChannel } from './pay-messaging.service';
import { PayRequestsService } from './pay-requests.service';
import { PayStripeService } from './pay-stripe.service';
import { PayAiService } from './pay-ai.service';
import {
  ProviderError,
  ProviderTimeoutError,
} from './providers/stripe.transport';
import {
  PAY_ERRORS,
  REQUEST_OPEN,
  normalizeFailure,
  parseIntervals,
} from './payments.constants';

const CLOSED = ['Recovered', 'Unrecoverable', 'Resolved elsewhere'];

/**
 * Failed payments and their recovery. A case opens when a provider declines a payment; the raw
 * provider code is kept beside the normalized reason. Retries happen only where the provider holds
 * a saved method (an open subscription invoice) — a one-off checkout decline has nothing to retry,
 * so the customer gets a fresh secure link instead. Hard declines and risk blocks are never retried.
 */
@Injectable()
export class PayRecoveryService {
  private readonly logger = new Logger(PayRecoveryService.name);

  constructor(
    private readonly ctx: PayContextService,
    private readonly stripe: PayStripeService,
    private readonly idem: PayIdempotencyService,
    private readonly msg: PayMessagingService,
    private readonly requests: PayRequestsService,
    private readonly ai: PayAiService,
  ) {}

  private get db() {
    return this.ctx.db;
  }

  async must(rootId: string, id: string) {
    const c = await this.db.payRecoveryCase.findFirst({
      where: { id, businessId: rootId },
    });
    if (!c)
      throw new AppException(
        PAY_ERRORS.NOT_FOUND,
        'Recovery case not found',
        HttpStatus.NOT_FOUND,
      );
    return c;
  }

  /** The open subscription invoice behind a failed recurring charge (what "Retry" pays). */
  private async invoiceOf(tx: PayTransaction) {
    if (!tx.mandateId) return null;
    const at = await this.db.payMandateAttempt.findFirst({
      where: {
        mandateId: tx.mandateId,
        txId: tx.id,
        providerInvoiceId: { not: null },
      },
    });
    return at?.providerInvoiceId ?? null;
  }

  async onFailed(rootId: string, tx: PayTransaction) {
    if (tx.status !== 'Failed') return null;
    const have = await this.db.payRecoveryCase.findUnique({
      where: { txId: tx.id },
    });
    if (have) return have;
    const pol = await this.ctx.policy(rootId);
    const n = normalizeFailure(tx.failureCode, tx.riskOutcome);
    const retryable = !!(await this.invoiceOf(tx));
    // Earlier failed attempts for the same request / mandate count toward the attempt limit.
    const prior =
      tx.requestId || tx.mandateId
        ? await this.db.payTransaction.count({
            where: {
              businessId: rootId,
              status: 'Failed',
              id: { not: tx.id },
              ...(tx.requestId
                ? { requestId: tx.requestId }
                : { mandateId: tx.mandateId }),
            },
          })
        : 0;
    const attempts = prior + 1;
    const gaps = parseIntervals(pol.retry.intervals);
    const status =
      n.rec === 'Unrecoverable'
        ? 'Unrecoverable'
        : n.rec === 'Blocked'
          ? 'Blocked'
          : n.rec === 'Manual review'
            ? 'Manual Review'
            : n.rec === 'Needs customer' || !retryable
              ? 'Waiting on customer'
              : attempts >= pol.retry.maxAttempts
                ? pol.retry.pauseAfter.startsWith('Mark')
                  ? 'Unrecoverable'
                  : 'Paused'
                : 'Scheduled';
    const next =
      status === 'Scheduled' &&
      retryable &&
      pol.retry.soft === 'Retry on schedule'
        ? new Date(
            Date.now() +
              (gaps[Math.min(attempts - 1, gaps.length - 1)] ?? 1440) * 60000,
          )
        : null;
    const c = await this.db.payRecoveryCase.create({
      data: {
        businessId: rootId,
        txId: tx.id,
        customerId: tx.customerId,
        category: n.cat,
        rawCode: tx.failureCode ?? 'none',
        recoverability: n.rec,
        guidance: n.guidance,
        attempts,
        nextRetryAt: next,
        status,
        retryable,
        firstFailedAt: tx.occurredAt,
        lastAttemptAt: tx.occurredAt,
      },
    });
    await this.ctx.audit(
      rootId,
      'System',
      'Recovery case opened',
      'recovery',
      c.id,
      `${tx.number} · ${n.cat} (${c.rawCode}) · ${status}`,
      tx.correlationId,
    );
    // Owner policy: notify the customer automatically after the configured failed attempt.
    const after = pol.messaging.failureNotify.startsWith('After 1st')
      ? 1
      : pol.messaging.failureNotify.startsWith('After 2nd')
        ? 2
        : 0;
    if (
      after &&
      attempts >= after &&
      tx.customerId &&
      !['Blocked', 'Unrecoverable'].includes(status) &&
      tx.env === 'live'
    )
      await this.notify('System', rootId, c.id, {
        channel: undefined,
        text: undefined,
        method: false,
      }).catch((e: Error) => this.logger.warn(`auto notify: ${e.message}`));
    return c;
  }

  /** A later successful payment for the same request / mandate closes the open cases. */
  async onSucceeded(rootId: string, tx: PayTransaction) {
    if (tx.status !== 'Succeeded' || (!tx.requestId && !tx.mandateId)) return;
    const failed = await this.db.payTransaction.findMany({
      where: {
        businessId: rootId,
        status: 'Failed',
        ...(tx.requestId
          ? { requestId: tx.requestId }
          : { mandateId: tx.mandateId }),
      },
      select: { id: true },
    });
    if (!failed.length) return;
    const open = await this.db.payRecoveryCase.findMany({
      where: {
        txId: { in: failed.map((f) => f.id) },
        status: { notIn: CLOSED },
      },
    });
    for (const c of open) {
      await this.db.payRecoveryCase.update({
        where: { id: c.id },
        data: { status: 'Recovered', recoveredTxId: tx.id, nextRetryAt: null },
      });
      await this.ctx.audit(
        rootId,
        'System',
        'Recovered',
        'recovery',
        c.id,
        `Paid by ${tx.number} (${num(tx.captured).toFixed(2)} ${tx.currency})`,
        tx.correlationId,
      );
    }
  }

  async retry(a: PayActor, id: string) {
    this.ctx.need(a, 'recover', 'Retrying a payment');
    const c = await this.must(a.rootId, id);
    const pol = await this.ctx.policy(a.rootId);
    if (CLOSED.includes(c.status) || c.status === 'Blocked')
      throw new AppException(
        PAY_ERRORS.CONFLICT,
        c.status === 'Blocked'
          ? 'Blocked by provider risk — never retried.'
          : `This case is ${c.status}.`,
        HttpStatus.CONFLICT,
      );
    if (c.recoverability === 'Unrecoverable')
      throw new AppException(
        PAY_ERRORS.CONFLICT,
        'Hard decline — the issuer says do not retry. Ask for a new payment method.',
        HttpStatus.CONFLICT,
      );
    if (c.attempts >= pol.retry.maxAttempts)
      throw new AppException(
        PAY_ERRORS.CONFLICT,
        `Already ${c.attempts} of ${pol.retry.maxAttempts} attempts (Payments › Settings › Retry policies).`,
        HttpStatus.CONFLICT,
      );
    if (c.nextRetryAt && c.nextRetryAt > new Date())
      throw new AppException(
        PAY_ERRORS.CONFLICT,
        `Retry is allowed from ${c.nextRetryAt.toISOString().slice(0, 16).replace('T', ' ')} UTC.`,
        HttpStatus.CONFLICT,
      );
    const tx = await this.db.payTransaction.findUniqueOrThrow({
      where: { id: c.txId },
    });
    const invoice = await this.invoiceOf(tx);
    if (!invoice)
      throw new AppException(
        PAY_ERRORS.METHOD_NOT_SUPPORTED,
        'No saved payment method to retry — send the customer a new secure payment link instead.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    // Re-check the source: a mandate already paid for this cycle is never charged again.
    const paid = await this.db.payMandateAttempt.findFirst({
      where: { providerInvoiceId: invoice, status: 'Succeeded' },
    });
    if (paid) {
      await this.db.payRecoveryCase.update({
        where: { id: c.id },
        data: { status: 'Resolved elsewhere' },
      });
      throw new AppException(
        PAY_ERRORS.CONFLICT,
        'Already paid for this cycle — nothing was charged.',
        HttpStatus.CONFLICT,
      );
    }
    const conn = tx.connectionId
      ? await this.db.payConnection.findUnique({
          where: { id: tx.connectionId },
        })
      : null;
    this.stripe.assertCan(conn, tx.provider, 'supportsRecurring');
    const key = `retry:${invoice}:${c.attempts}`;
    const { replay } = await this.idem.begin(a.rootId, key, 'retry', {
      invoice,
    });
    if (replay)
      throw new AppException(
        PAY_ERRORS.IDEMPOTENT_REPLAY,
        'This retry already ran — replayed the stored result, nothing was charged twice.',
        HttpStatus.CONFLICT,
      );
    await this.ctx.audit(
      a.rootId,
      a,
      'Retry requested',
      'recovery',
      c.id,
      `${tx.number} · invoice ${invoice} · idempotency ${key}`,
      tx.correlationId,
    );
    try {
      const inv = await this.stripe.invoicePay(conn!, invoice, key);
      await this.idem.finish(key, inv.paid ? 'done' : 'failed', inv);
      await this.db.payRecoveryCase.update({
        where: { id: c.id },
        data: {
          attempts: c.attempts + 1,
          lastAttemptAt: new Date(),
          ...(inv.paid ? { status: 'Recovered', nextRetryAt: null } : {}),
        },
      });
      return { paid: !!inv.paid };
    } catch (e) {
      const timeout = e instanceof ProviderTimeoutError;
      await this.idem.finish(key, timeout ? 'unknown' : 'failed', {
        error: (e as Error).message,
      });
      const gaps = parseIntervals(pol.retry.intervals);
      await this.db.payRecoveryCase.update({
        where: { id: c.id },
        data: {
          attempts: c.attempts + 1,
          lastAttemptAt: new Date(),
          rawCode: e instanceof ProviderError ? e.code.slice(0, 80) : c.rawCode,
          nextRetryAt: new Date(
            Date.now() +
              (gaps[Math.min(c.attempts, gaps.length - 1)] ?? 1440) * 60000,
          ),
          status:
            c.attempts + 1 >= pol.retry.maxAttempts
              ? pol.retry.pauseAfter.startsWith('Mark')
                ? 'Unrecoverable'
                : 'Paused'
              : c.status,
        },
      });
      throw new AppException(
        timeout ? PAY_ERRORS.PROVIDER_TIMEOUT : PAY_ERRORS.PROVIDER_ERROR,
        timeout
          ? 'Stripe didn’t answer — the retry state is unknown; refreshing reuses the same key.'
          : `Stripe declined the retry: ${(e as Error).message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /** A secure link for the customer: the open request's own link, or a fresh request for the same money. */
  private async payUrl(
    rootId: string,
    tx: PayTransaction,
    a: PayActor | 'System',
  ) {
    if (tx.requestId) {
      const r = await this.db.payRequest.findUnique({
        where: { id: tx.requestId },
      });
      if (r && REQUEST_OPEN.includes(r.status)) return this.requests.url(r);
    }
    if (tx.mandateId) {
      const m = await this.db.payMandate.findUnique({
        where: { id: tx.mandateId },
      });
      const conn = m?.connectionId
        ? await this.db.payConnection.findUnique({
            where: { id: m.connectionId },
          })
        : null;
      if (m?.providerCustomerId && conn?.writeEnabled) {
        const fe = (
          process.env.FRONTEND_URL ?? 'http://localhost:3000'
        ).replace(/\/$/, '');
        const s = await this.stripe.setupCheckout(conn, {
          customer: m.providerCustomerId,
          currency: m.currency,
          successUrl: `${fe}/pay/updated`,
          cancelUrl: `${fe}/pay/updated`,
          metadata: { noxtill_mandate: m.id, noxtill_business: rootId },
          idem: `setup:${m.id}:${Math.floor(Date.now() / 3600000)}`,
        });
        return s.url;
      }
    }
    if (!tx.customerId || a === 'System') return null;
    const fresh = await this.requests.create(a, {
      env: tx.env === 'test' ? 'test' : 'live',
      customerId: tx.customerId,
      contact: 'none',
      amountType: 'Fixed',
      amount: num(tx.amount),
      currency: tx.currency,
      description: `Payment for ${tx.sourceRef ?? tx.number}`,
      reference: tx.number,
    });
    return this.requests.url(fresh);
  }

  async draft(a: PayActor, id: string, method: boolean) {
    const c = await this.must(a.rootId, id);
    const tx = await this.db.payTransaction.findUniqueOrThrow({
      where: { id: c.txId },
    });
    const biz = await this.ctx.business(a.rootId);
    const cust = tx.customerId
      ? await this.db.customer.findUnique({
          where: { id: tx.customerId },
          select: { name: true },
        })
      : null;
    const first = (cust?.name ?? 'there').split(' ')[0];
    const amt = `${tx.currency} ${num(tx.amount).toFixed(2)}`;
    const fallback = method
      ? `Hi ${first}, your payment of ${amt} to ${biz.name} couldn’t go through with the saved method. You can update it securely here: {secure_link}. Thank you!`
      : `Hi ${first}, we noticed your payment of ${amt} to ${biz.name} didn’t go through${c.category === 'Authentication required' ? ' because the verification step wasn’t completed' : ''}. No money was taken. You can try again here: {secure_link}.`;
    const d = await this.ai.draft(
      a.rootId,
      method
        ? 'ask the customer to update their saved payment method'
        : 'tell the customer a payment failed and offer a secure link to try again',
      [
        `Customer first name: ${first}`,
        `Business: ${biz.name}`,
        `Amount: ${amt}`,
        `What happened: ${c.category}`,
        'No money was taken',
        'Include the placeholder {secure_link} exactly once',
      ],
      fallback,
    );
    return {
      text: d.text.includes('{secure_link}')
        ? d.text
        : `${d.text} {secure_link}`,
      source: d.source,
    };
  }

  async notify(
    a: PayActor | 'System',
    rootId: string,
    id: string,
    p: { channel?: string; text?: string; method: boolean },
  ) {
    if (a !== 'System')
      this.ctx.need(a, 'recover', 'Messaging a customer about a payment');
    const c = await this.must(rootId, id);
    const tx = await this.db.payTransaction.findUniqueOrThrow({
      where: { id: c.txId },
    });
    if (!tx.customerId)
      throw new AppException(
        PAY_ERRORS.INVALID,
        'No customer is linked to this payment.',
        HttpStatus.BAD_REQUEST,
      );
    const url = await this.payUrl(rootId, tx, a);
    if (!url)
      throw new AppException(
        PAY_ERRORS.INVALID,
        'There is no open payment link for this customer — create a payment request first.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const biz = await this.ctx.business(rootId);
    const cust = await this.db.customer.findUnique({
      where: { id: tx.customerId },
      select: { name: true },
    });
    const res = await this.msg.send({
      customerId: tx.customerId,
      templateKey: p.method ? 'payment_method_update' : 'payment_failed',
      channel: (['whatsapp', 'sms', 'email'].includes(p.channel ?? '')
        ? p.channel
        : undefined) as PayChannel | undefined,
      variables: {
        customerName: (cust?.name ?? '').split(' ')[0],
        businessName: biz.name,
        amount: `${tx.currency} ${num(tx.amount).toFixed(2)}`,
        payUrl: url,
      },
      customBody: p.text
        ? p.text
            .replace('{secure_link}', url)
            .replace('{secure_payment_link}', url)
            .replace('{secure_update_link}', url)
        : undefined,
    });
    if (!res.message)
      throw new AppException(
        PAY_ERRORS.INVALID,
        `Not sent — ${res.error}`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    await this.db.payRecoveryCase.update({
      where: { id: c.id },
      data: {
        notifiedAt: new Date(),
        notifyChannel: res.channel,
        ...(c.status === 'Scheduled' && !c.retryable
          ? { status: 'Waiting on customer' }
          : {}),
      },
    });
    await this.ctx.audit(
      rootId,
      a,
      p.method ? 'New payment method requested' : 'Customer update sent',
      'recovery',
      c.id,
      `${tx.number} via ${res.channel} (Unified Inbox) · message ${res.message.id}`,
      tx.correlationId,
    );
    return { channel: res.channel };
  }

  async setPaused(a: PayActor, id: string, pause: boolean) {
    this.ctx.need(
      a,
      'recover',
      pause ? 'Pausing recovery' : 'Resuming recovery',
    );
    const c = await this.must(a.rootId, id);
    if (CLOSED.includes(c.status))
      throw new AppException(
        PAY_ERRORS.CONFLICT,
        `This case is ${c.status}.`,
        HttpStatus.CONFLICT,
      );
    const status = pause
      ? 'Paused'
      : c.retryable && c.recoverability === 'Soft'
        ? 'Scheduled'
        : c.recoverability === 'Manual review'
          ? 'Manual Review'
          : 'Waiting on customer';
    await this.db.payRecoveryCase.update({
      where: { id },
      data: { status, ...(pause ? { nextRetryAt: null } : {}) },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      pause ? 'Recovery paused' : 'Recovery resumed',
      'recovery',
      id,
      status,
    );
  }

  async markUnrecoverable(a: PayActor, id: string, reason: string) {
    this.ctx.need(a, 'recover', 'Closing a recovery case');
    const c = await this.must(a.rootId, id);
    if (CLOSED.includes(c.status))
      throw new AppException(
        PAY_ERRORS.CONFLICT,
        `This case is ${c.status}.`,
        HttpStatus.CONFLICT,
      );
    await this.db.payRecoveryCase.update({
      where: { id },
      data: {
        status: 'Unrecoverable',
        nextRetryAt: null,
        note: reason.slice(0, 500),
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Marked unrecoverable',
      'recovery',
      id,
      reason,
    );
  }

  isClosed(c: PayRecoveryCase) {
    return CLOSED.includes(c.status);
  }
}
