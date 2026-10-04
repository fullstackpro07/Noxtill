import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PayRefund, PayTransaction, Return } from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import {
  PayActor,
  PayContextService,
  dec,
  num,
  r2,
} from './pay-context.service';
import { PayIdempotencyService } from './pay-idempotency.service';
import { PayLedgerService } from './pay-ledger.service';
import { PayApprovalsService } from './pay-approvals.service';
import { PayStripeService } from './pay-stripe.service';
import {
  ProviderError,
  ProviderTimeoutError,
} from './providers/stripe.transport';
import {
  PAY_ERRORS,
  PayEnv,
  REFUND_IN_FLIGHT,
  REFUND_T,
} from './payments.constants';

/**
 * Refund execution. Payments only moves money for refunds already approved upstream in Orders —
 * it never decides a refund, never exceeds the approved amount or the provider's remaining
 * refundable balance, and shows "Succeeded" only after the provider verifies it.
 */
@Injectable()
export class PayRefundsService {
  private readonly logger = new Logger(PayRefundsService.name);

  constructor(
    private readonly ctx: PayContextService,
    private readonly stripe: PayStripeService,
    private readonly idem: PayIdempotencyService,
    private readonly ledger: PayLedgerService,
    private readonly approvals: PayApprovalsService,
  ) {}

  private get db() {
    return this.ctx.db;
  }

  async must(rootId: string, id: string) {
    const r = await this.db.payRefund.findFirst({
      where: { id, businessId: rootId },
    });
    if (!r)
      throw new AppException(
        PAY_ERRORS.NOT_FOUND,
        'Refund execution not found',
        HttpStatus.NOT_FOUND,
      );
    return r;
  }

  private async move(r: PayRefund, to: string, extra: Partial<PayRefund> = {}) {
    if (r.status !== to && !(REFUND_T[r.status] ?? []).includes(to))
      throw new AppException(
        PAY_ERRORS.INVALID_TRANSITION,
        `INVALID_TRANSITION — refund ${r.status} → ${to} is not allowed.`,
        HttpStatus.CONFLICT,
      );
    return this.db.payRefund.update({
      where: { id: r.id },
      data: { status: to, ...extra },
    });
  }

  /** Captured − refunded − refunds already in flight. */
  async refundable(tx: PayTransaction, exceptId?: string) {
    const flight = await this.db.payRefund.aggregate({
      where: {
        txId: tx.id,
        status: { in: REFUND_IN_FLIGHT },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      _sum: { amount: true },
    });
    return Math.max(
      0,
      r2(num(tx.captured) - num(tx.refunded) - num(flight._sum.amount)),
    );
  }

  /**
   * Called by Orders when a card/online return is approved: the execution starts "Approved
   * Upstream" and moves to Approval Required (above the Owner threshold), Ready, or Manual Review
   * when there is no provider charge to refund against.
   */
  async createFromReturn(
    ret: Return,
    rootId: string,
    approverUserId: string | null,
  ) {
    const exists = await this.db.payRefund.findUnique({
      where: { returnId: ret.id },
    });
    if (exists) return exists;
    const pol = await this.ctx.policy(rootId);
    let txs = await this.db.payTransaction.findMany({
      where: { businessId: rootId, orderId: ret.orderId, status: 'Succeeded' },
      orderBy: { captured: 'desc' },
    });
    if (!txs.length) {
      // The sale may not be in the ledger yet (projector runs every few minutes).
      await this.ledger.project(rootId);
      txs = await this.db.payTransaction.findMany({
        where: {
          businessId: rootId,
          orderId: ret.orderId,
          status: 'Succeeded',
        },
        orderBy: { captured: 'desc' },
      });
    }
    const tx =
      txs.find((t) => t.provider === 'stripe' && t.providerChargeId) ??
      txs[0] ??
      null;
    const amount = num(ret.refundAmount);
    const number = await this.ctx.number(rootId, 'refund');
    let status = 'Ready';
    let failureCode: string | null = null;
    if (!tx) {
      status = 'Manual Review';
      failureCode = 'No payment for this order in the payment ledger';
    } else if (tx.provider === 'manual') {
      status = 'Manual Review';
      failureCode = `The ${tx.method.toLowerCase()} payment wasn’t taken through a connected provider — refund it where it was taken, then mark it refunded here`;
    } else if (amount > pol.refund.approvalAbove) status = 'Approval Required';
    const row = await this.db.payRefund.create({
      data: {
        businessId: rootId,
        env: tx?.env ?? 'live',
        number,
        returnId: ret.id,
        txId: tx?.id ?? null,
        origin: 'noxtill',
        approvedAmount: ret.refundAmount,
        amount: ret.refundAmount,
        currency: tx?.currency ?? (await this.ctx.business(rootId)).currency,
        status,
        reason: ret.reason.slice(0, 300),
        method: String(ret.refundMethod),
        upstreamById: approverUserId,
        upstreamAt: new Date(),
        idempotencyKey: `refund:${ret.id}`,
        failureCode,
      },
    });
    if (status === 'Approval Required')
      await this.approvals.request(rootId, 'System', {
        kind: 'refund',
        subjectId: row.id,
        title: `Refund ${row.number} · ${amount.toFixed(2)} ${row.currency}`,
        amount,
        rule: `Refund execution above ${pol.refund.approvalAbove} needs the Owner (Payments › Settings › Refund execution)`,
      });
    await this.ctx.audit(
      rootId,
      'System',
      'Refund approved upstream',
      'refund',
      row.id,
      `${row.number} from Orders return · ${status}${failureCode ? ` · ${failureCode}` : ''}`,
    );
    return row;
  }

  private async checkRole(a: PayActor) {
    this.ctx.need(a, 'refund', 'Executing a refund');
    const pol = await this.ctx.policy(a.rootId);
    if (a.role !== 'Owner' && !pol.refund.roles.includes(a.role))
      throw new AppException(
        PAY_ERRORS.FORBIDDEN,
        `PERMISSION_DENIED — refund execution is limited to ${pol.refund.roles.join(', ')} (Payments › Settings).`,
        HttpStatus.FORBIDDEN,
      );
    return pol;
  }

  async approve(a: PayActor, id: string, comment?: string) {
    const r = await this.must(a.rootId, id);
    if (r.status !== 'Approval Required')
      throw new AppException(
        PAY_ERRORS.CONFLICT,
        `${r.number} is ${r.status}.`,
        HttpStatus.CONFLICT,
      );
    const ap = await this.approvals.pending(a.rootId, 'refund', r.id);
    if (ap) await this.approvals.decide(a, ap.id, true, comment);
    else this.ctx.need(a, 'approve', 'Approving a refund execution');
    await this.move(r, 'Ready');
    await this.ctx.audit(
      a.rootId,
      a,
      'Refund execution approved',
      'refund',
      r.id,
      r.number,
    );
  }

  /** Execute (or retry) against the provider. Returns the resulting status. */
  async execute(a: PayActor, id: string, amountIn?: number | null) {
    const pol = await this.checkRole(a);
    let r = await this.must(a.rootId, id);
    if (!['Ready', 'Failed', 'Manual Review'].includes(r.status))
      throw new AppException(
        PAY_ERRORS.CONFLICT,
        r.status === 'Approval Required'
          ? 'Owner approval is required first (Action Center).'
          : `${r.number} is ${r.status}.`,
        HttpStatus.CONFLICT,
      );
    if (!r.txId)
      throw new AppException(
        PAY_ERRORS.INVALID,
        'No payment is linked to this refund.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const tx = await this.db.payTransaction.findUniqueOrThrow({
      where: { id: r.txId },
    });
    const amount = r2(amountIn ?? num(r.amount));
    const left = await this.refundable(tx, r.id);
    if (amount > num(r.approvedAmount) + 0.004)
      throw new AppException(
        PAY_ERRORS.INVALID,
        `Can’t exceed the approved ${num(r.approvedAmount).toFixed(2)} ${r.currency}.`,
        HttpStatus.BAD_REQUEST,
      );
    if (amount > left + 0.004)
      throw new AppException(
        PAY_ERRORS.INVALID,
        `Only ${left.toFixed(2)} ${r.currency} is still refundable on ${tx.number}.`,
        HttpStatus.BAD_REQUEST,
      );
    const partial = amount < num(tx.captured) - num(tx.refunded) - 0.004;
    if (partial && !pol.refund.partial)
      throw new AppException(
        PAY_ERRORS.INVALID,
        'Partial refund execution is off in Payments › Settings.',
        HttpStatus.BAD_REQUEST,
      );
    if (
      amount > pol.refund.approvalAbove &&
      !a.approve &&
      !(await this.db.payApproval.findFirst({
        where: { kind: 'refund', subjectId: r.id, status: 'Approved' },
      }))
    )
      throw new AppException(
        PAY_ERRORS.FORBIDDEN,
        `Above ${pol.refund.approvalAbove} the Owner must approve this execution first.`,
        HttpStatus.FORBIDDEN,
      );
    const conn = tx.connectionId
      ? await this.db.payConnection.findUnique({
          where: { id: tx.connectionId },
        })
      : null;
    this.stripe.assertCan(
      conn,
      tx.provider,
      partial ? 'supportsPartialRefund' : 'supportsRefund',
    );
    const attempt = r.attempts + 1;
    const key =
      r.status === 'Ready'
        ? r.idempotencyKey
        : `${r.idempotencyKey}:retry${attempt}`;
    const { replay } = await this.idem.begin(a.rootId, key, 'refund', {
      charge: tx.providerChargeId,
      amount,
      refund: r.id,
    });
    if (replay)
      throw new AppException(
        PAY_ERRORS.IDEMPOTENT_REPLAY,
        `This exact refund already completed (${JSON.stringify(replay).slice(0, 80)}). Nothing was sent twice.`,
        HttpStatus.CONFLICT,
      );
    r = await this.move(r, 'Queued', {
      amount: dec(amount),
      attempts: attempt,
      executedById: a.userId,
      failureCode: null,
    });
    r = await this.move(r, 'Processing', { submittedAt: new Date() });
    await this.ctx.audit(
      a.rootId,
      a,
      'Refund execution requested',
      'refund',
      r.id,
      `${r.number} · ${amount.toFixed(2)} ${r.currency} · ${tx.providerChargeId} · idempotency ${key}`,
      tx.correlationId,
    );
    try {
      const out = await this.stripe.refund(
        conn!,
        tx.providerChargeId!,
        amount,
        r.currency,
        {
          noxtill_refund: r.id,
          noxtill_business: a.rootId,
          noxtill_return: r.returnId ?? '',
        },
        key,
      );
      const st =
        out.status === 'succeeded'
          ? 'Succeeded'
          : out.status === 'failed' || out.status === 'canceled'
            ? 'Failed'
            : 'Provider Accepted';
      r = await this.move(r, st, {
        providerRefundId: out.id,
        ...(st === 'Succeeded' ? { verifiedAt: new Date() } : {}),
        ...(st === 'Failed'
          ? { failureCode: out.failure_reason ?? 'failed' }
          : {}),
      });
      await this.idem.finish(
        key,
        st === 'Failed' ? 'failed' : 'done',
        { refund: out.id, status: out.status },
        out.id,
      );
    } catch (e) {
      if (e instanceof ProviderTimeoutError) {
        await this.idem.finish(key, 'unknown');
        r = await this.move(r, 'Provider Unknown', {
          failureCode: 'PROVIDER_TIMEOUT',
        });
        await this.ctx.audit(
          a.rootId,
          a,
          'Refund execution — provider timeout',
          'refund',
          r.id,
          `${r.number} · state unknown · refresh reuses ${key}`,
        );
      } else {
        await this.idem.finish(key, 'failed', { error: (e as Error).message });
        r = await this.move(r, 'Failed', {
          failureCode:
            e instanceof ProviderError
              ? e.code
              : (e as Error).message.slice(0, 80),
        });
      }
    }
    if (r.status === 'Succeeded') await this.afterSuccess(a.rootId, r);
    return r;
  }

  /** Refund paid out where the payment was taken (cash drawer, a POS terminal outside Noxtill). */
  async markOutside(a: PayActor, id: string, reference: string) {
    await this.checkRole(a);
    const r = await this.must(a.rootId, id);
    if (r.status !== 'Manual Review')
      throw new AppException(
        PAY_ERRORS.CONFLICT,
        `${r.number} is ${r.status} — only refunds in Manual Review can be marked as refunded outside Noxtill.`,
        HttpStatus.CONFLICT,
      );
    const tx = r.txId
      ? await this.db.payTransaction.findUnique({ where: { id: r.txId } })
      : null;
    if (tx && tx.provider !== 'manual')
      throw new AppException(
        PAY_ERRORS.INVALID,
        'This payment was taken through a provider — execute the refund there through Noxtill.',
        HttpStatus.BAD_REQUEST,
      );
    const done = await this.move(r, 'Succeeded', {
      verifiedAt: new Date(),
      executedById: a.userId,
      failureCode: null,
      providerRefundId: null,
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Refund marked as paid out outside Noxtill',
      'refund',
      r.id,
      `${r.number} · reference ${reference}`,
    );
    await this.afterSuccess(a.rootId, done);
    return done;
  }

  /** Ask the provider for the true state (Provider Unknown / Accepted / Pending). */
  async refresh(rootId: string, id: string, a?: PayActor) {
    let r = await this.must(rootId, id);
    if (!r.txId) return r;
    const tx = await this.db.payTransaction.findUniqueOrThrow({
      where: { id: r.txId },
    });
    if (tx.provider !== 'stripe' || !tx.connectionId || !tx.providerChargeId)
      return r;
    const conn = await this.db.payConnection.findUniqueOrThrow({
      where: { id: tx.connectionId },
    });
    const list = await this.stripe.refundsOf(conn, tx.providerChargeId);
    const mine =
      list.find((x) => x.id === r.providerRefundId) ??
      list.find((x) => x.metadata?.noxtill_refund === r.id);
    if (!mine) {
      if (r.status === 'Provider Unknown') {
        // The provider never created it: safe to send again with the same key.
        r = await this.move(r, 'Processing');
        r = await this.move(r, 'Failed', {
          failureCode:
            'Not received by provider — safe to retry with the same key',
        });
      }
      return r;
    }
    const before = r.status;
    r = await this.stripe.upsertRefund(rootId, conn, mine, tx.id);
    if (r.status === 'Succeeded' && before !== 'Succeeded')
      await this.afterSuccess(rootId, r);
    if (a)
      await this.ctx.audit(
        rootId,
        a,
        'Refund status refreshed',
        'refund',
        r.id,
        `${r.number}: ${before} → ${r.status}`,
      );
    return r;
  }

  async afterSuccess(rootId: string, r: PayRefund) {
    if (r.txId) await this.ledger.syncRefunded(rootId, [r.txId]);
    await this.ctx.outbox(
      rootId,
      'refund.succeeded',
      {
        refund: r.id,
        number: r.number,
        amount: num(r.amount),
        currency: r.currency,
        returnId: r.returnId,
      },
      ['Orders', 'Finance & Accounting'],
    );
  }

  /** Job: resolve executions stuck in Provider Unknown / Accepted / Pending. */
  async resolveOpen(rootId: string) {
    const open = await this.db.payRefund.findMany({
      where: {
        businessId: rootId,
        status: { in: ['Provider Unknown', 'Provider Accepted', 'Pending'] },
      },
    });
    for (const r of open)
      await this.refresh(rootId, r.id).catch((e: Error) =>
        this.logger.warn(`refund refresh ${r.id}: ${e.message}`),
      );
    return open.length;
  }

  envOf(r: PayRefund): PayEnv {
    return r.env === 'test' ? 'test' : 'live';
  }
}
