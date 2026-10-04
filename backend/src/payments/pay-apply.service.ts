import { Injectable, Logger } from '@nestjs/common';
import { PayConnection, PayTransaction, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PayContextService, corrId, dec, num } from './pay-context.service';
import {
  PayStripeService,
  SCharge,
  SDispute,
  SEvent,
  SPayout,
  SRefund,
  SBalanceTxn,
} from './pay-stripe.service';
import { PayRequestsService } from './pay-requests.service';
import { PayRecoveryService } from './pay-recovery.service';
import { PayRefundsService } from './pay-refunds.service';
import { PayDisputesService } from './pay-disputes.service';
import { PayRecurringService } from './pay-recurring.service';
import { PayMessagingService } from './pay-messaging.service';
import { PayLedgerService } from './pay-ledger.service';
import { PayReconService } from './pay-recon.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { ConnectorRegistry } from '../integrations/connector-registry';

/** Card data, contact details and addresses are stripped before an event is stored. */
const SENSITIVE =
  /(^|_)(email|phone|name|address|line1|line2|postal_code|city|state|fingerprint|last4|exp_month|exp_year|iin|ip|receipt_email|receipt_url|client_secret|card)$/i;
export function sanitize(v: unknown, depth = 0): unknown {
  if (depth > 6 || v == null) return v ?? null;
  if (Array.isArray(v))
    return v.slice(0, 20).map((x) => sanitize(x, depth + 1));
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>))
      out[k] = SENSITIVE.test(k) ? '[redacted]' : sanitize(x, depth + 1);
    return out;
  }
  return v;
}

/**
 * Applies provider truth to Payments: verified webhooks and the catch-up event feed run through
 * the same path. Events are deduplicated on (provider, event id); an older event never overwrites a
 * newer state (it is kept in history as ignored). Domain reactions — a request becoming paid, a
 * recovery case, a refund execution moving, a mandate cycle, a receipt — happen only here.
 */
@Injectable()
export class PayApplyService {
  private readonly logger = new Logger(PayApplyService.name);

  constructor(
    private readonly ctx: PayContextService,
    private readonly stripe: PayStripeService,
    private readonly requests: PayRequestsService,
    private readonly recovery: PayRecoveryService,
    private readonly refunds: PayRefundsService,
    private readonly disputes: PayDisputesService,
    private readonly recurring: PayRecurringService,
    private readonly msg: PayMessagingService,
    private readonly ledger: PayLedgerService,
    private readonly recon: PayReconService,
    private readonly integrations: IntegrationsService,
    private readonly connectors: ConnectorRegistry,
  ) {}

  private get db() {
    return this.ctx.db;
  }

  /** Returns false when the event was a duplicate. */
  async record(
    e: SEvent,
    businessId: string | null,
    signature: string,
    processing: string,
    error?: string,
    txId?: string | null,
  ) {
    try {
      await this.db.payEvent.create({
        data: {
          businessId,
          provider: 'stripe',
          env: e.livemode ? 'live' : 'test',
          externalId: e.id,
          accountId: e.account ?? null,
          type: e.type,
          txId: txId ?? null,
          refType: e.data.object.object ?? null,
          refId: e.data.object.id ?? null,
          payload: sanitize(e.data.object) as Prisma.InputJsonValue,
          payloadHash: createHash('sha256')
            .update(JSON.stringify(e.data.object))
            .digest('hex'),
          signature,
          processing,
          error: error?.slice(0, 300) ?? null,
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  async handleEvent(e: SEvent, signature: 'Verified' | 'API re-fetch') {
    const env = e.livemode ? 'live' : 'test';
    const conn = e.account
      ? await this.db.payConnection.findFirst({
          where: { accountId: e.account, provider: 'stripe', env },
        })
      : null;
    if (!conn) {
      await this.record(
        e,
        null,
        signature,
        'Unroutable',
        'No Noxtill business is connected to this Stripe account',
      );
      return { processing: 'Unroutable' };
    }
    const dup = await this.db.payEvent.findUnique({
      where: { provider_externalId: { provider: 'stripe', externalId: e.id } },
    });
    if (dup) {
      await this.db.payEvent
        .create({
          data: {
            businessId: conn.businessId,
            provider: 'stripe',
            env,
            externalId: `${e.id}#dup${Date.now()}`,
            accountId: e.account ?? null,
            type: e.type,
            txId: dup.txId,
            refType: dup.refType,
            refId: dup.refId,
            payload: {},
            payloadHash: dup.payloadHash,
            signature,
            processing: 'Duplicate',
          },
        })
        .catch(() => null);
      return { processing: 'Duplicate' };
    }
    await this.db.payConnection.update({
      where: { id: conn.id },
      data: { lastEventAt: new Date(e.created * 1000) },
    });
    try {
      const { txId, processing } = await this.apply(conn, e);
      await this.record(
        e,
        conn.businessId,
        signature,
        processing,
        undefined,
        txId,
      );
      return { processing };
    } catch (err) {
      await this.record(
        e,
        conn.businessId,
        signature,
        'Failed',
        (err as Error).message,
      );
      throw err;
    }
  }

  private async apply(
    c: PayConnection,
    e: SEvent,
  ): Promise<{ txId: string | null; processing: string }> {
    const root = c.businessId;
    const o = e.data.object as Record<string, unknown>;
    const t = e.type;
    if (
      t.startsWith('charge.') &&
      !t.startsWith('charge.dispute') &&
      !t.startsWith('charge.refund')
    ) {
      // The charge object in the event may be older than what we hold — upsertCharge refuses to regress.
      const ch = o as unknown as SCharge;
      const full =
        ch.balance_transaction && typeof ch.balance_transaction === 'string'
          ? await this.stripe.charge(c, ch.id).catch(() => ch)
          : ch;
      const r = await this.stripe.upsertCharge(root, c, full);
      for (const rf of full.refunds?.data ?? [])
        await this.stripe.upsertRefund(root, c, rf, r.tx.id);
      if (r.stale) return { txId: r.tx.id, processing: 'Ignored (stale)' };
      if (r.changed) await this.react(root, [r.tx.id], r.prevStatus);
      return { txId: r.tx.id, processing: 'Applied' };
    }
    if (t.startsWith('charge.refund') || t.startsWith('refund.')) {
      const before = o.id
        ? await this.db.payRefund.findUnique({
            where: { providerRefundId: String(o.id as string) },
          })
        : null;
      const row = await this.stripe.upsertRefund(
        root,
        c,
        o as unknown as SRefund,
      );
      if (row.status === 'Succeeded' && before?.status !== 'Succeeded')
        await this.refunds.afterSuccess(root, row);
      return { txId: row.txId, processing: 'Applied' };
    }
    if (t.startsWith('charge.dispute')) {
      const { row, created } = await this.stripe.upsertDispute(
        root,
        c,
        o as unknown as SDispute,
      );
      if (created) await this.disputes.seedEvidence(root, row);
      return { txId: row.txId, processing: 'Applied' };
    }
    if (t.startsWith('payout.')) {
      await this.stripe.upsertPayout(root, c, o as unknown as SPayout);
      return { txId: null, processing: 'Applied' };
    }
    if (t === 'balance.available') {
      return { txId: null, processing: 'Applied' };
    }
    if (
      t === 'checkout.session.completed' ||
      t === 'checkout.session.async_payment_succeeded'
    ) {
      const s = o as {
        mode?: string;
        subscription?: string | null;
        customer?: string | null;
        payment_intent?: string | null;
        metadata?: Record<string, string>;
      };
      if (s.mode === 'subscription')
        await this.recurring.onCheckoutCompleted(root, c, s);
      if (s.mode === 'payment' && s.payment_intent) {
        const ch = await this.stripe
          .intentCharge(c, s.payment_intent)
          .catch(() => null);
        if (ch) {
          const r = await this.stripe.upsertCharge(root, c, ch);
          if (r.changed) await this.react(root, [r.tx.id], r.prevStatus);
          return { txId: r.tx.id, processing: 'Applied' };
        }
      }
      return { txId: null, processing: 'Applied' };
    }
    if (
      t === 'invoice.paid' ||
      t === 'invoice.payment_succeeded' ||
      t === 'invoice.payment_failed'
    ) {
      const inv = o as unknown as Parameters<
        PayRecurringService['onInvoice']
      >[2];
      if (inv.charge) {
        const ch = await this.stripe.charge(c, inv.charge).catch(() => null);
        if (ch) await this.stripe.upsertCharge(root, c, ch);
      }
      const tx = await this.recurring.onInvoice(
        root,
        c,
        inv,
        t !== 'invoice.payment_failed',
      );
      if (tx) await this.react(root, [tx.id], null);
      return { txId: tx?.id ?? null, processing: 'Applied' };
    }
    if (t.startsWith('customer.subscription.')) {
      await this.recurring.onSubscription(
        root,
        o as unknown as {
          id: string;
          status: string;
          pause_collection?: unknown;
          current_period_end?: number;
        },
        t === 'customer.subscription.deleted',
      );
      return { txId: null, processing: 'Applied' };
    }
    if (
      t === 'balance_transaction.created' ||
      t === 'balance_transaction.updated'
    ) {
      await this.stripe.upsertBalanceTxn(root, c, o as unknown as SBalanceTxn);
      return { txId: null, processing: 'Applied' };
    }
    if (t === 'account.application.deauthorized') {
      await this.db.payConnection.update({
        where: { id: c.id },
        data: { status: 'Disconnected', writeEnabled: false },
      });
      return { txId: null, processing: 'Applied' };
    }
    return { txId: null, processing: 'Ignored (not used)' };
  }

  /** Domain reactions after transactions changed state. */
  async react(rootId: string, txIds: string[], prevStatus: string | null) {
    const pol = await this.ctx.policy(rootId);
    for (const id of txIds) {
      const tx = await this.db.payTransaction.findUnique({ where: { id } });
      if (!tx) continue;
      if (tx.status === 'Succeeded') {
        if (tx.requestId)
          await this.requests.applyProviderPayment(rootId, tx.id);
        await this.recovery.onSucceeded(rootId, tx);
        if (
          prevStatus !== 'Succeeded' &&
          tx.env === 'live' &&
          pol.messaging.receipts !== 'Off' &&
          tx.customerId
        )
          await this.receipt(
            rootId,
            tx,
            pol.messaging.receipts.startsWith('Email only')
              ? 'email'
              : undefined,
          );
      }
      if (tx.status === 'Failed') await this.recovery.onFailed(rootId, tx);
    }
  }

  async receipt(rootId: string, tx: PayTransaction, channel?: 'email') {
    const biz = await this.ctx.business(rootId);
    const cust = tx.customerId
      ? await this.db.customer.findUnique({
          where: { id: tx.customerId },
          select: { name: true },
        })
      : null;
    const res = await this.msg.send({
      customerId: tx.customerId!,
      templateKey: 'payment_receipt',
      channel,
      variables: {
        customerName: (cust?.name ?? '').split(' ')[0],
        businessName: biz.name,
        amount: `${tx.currency} ${num(tx.captured).toFixed(2)}`,
        paymentRef: tx.number,
      },
    });
    await this.ctx.audit(
      rootId,
      'System',
      res.message ? 'Receipt sent' : 'Receipt not sent',
      'tx',
      tx.id,
      res.message
        ? `${tx.number} via ${res.channel} (Unified Inbox)`
        : `${tx.number}: ${res.error}`,
      tx.correlationId,
    );
    return res;
  }

  /** Catch-up feed: events missed by webhooks (self-healing). */
  async catchUp(c: PayConnection) {
    const st = (c.syncState ?? {}) as { events?: { cursor?: number } };
    const since =
      st.events?.cursor ?? Math.floor(Date.now() / 1000) - 3 * 86400;
    const events = await this.stripe.events(c, since);
    let mx = since;
    for (const e of events.sort((x, y) => x.created - y.created)) {
      mx = Math.max(mx, e.created);
      const known = await this.db.payEvent.findUnique({
        where: {
          provider_externalId: { provider: 'stripe', externalId: e.id },
        },
      });
      if (known) continue;
      await this.handleEvent(
        { ...e, account: e.account ?? c.accountId ?? undefined },
        'API re-fetch',
      ).catch((err: Error) =>
        this.logger.warn(`event ${e.id}: ${err.message}`),
      );
    }
    await this.stripe.markFeed(c, 'events', true, undefined, mx);
    return events.length;
  }

  /** Full refresh for one business group (Refresh button and the scheduled job). */
  async syncGroup(rootId: string) {
    await this.ctx.ensure(rootId);
    const conns = await this.stripe.refreshConnections(rootId);
    const errors: string[] = [];
    for (const c of conns.filter(
      (x) =>
        x.provider === 'stripe' &&
        x.accountId &&
        !['Disconnected', 'Connection Required'].includes(x.status) &&
        this.stripe.configured(x.env as 'live' | 'test'),
    )) {
      try {
        const r = await this.stripe.syncAll(rootId, c);
        errors.push(...r.errors);
        if (r.changed.length) await this.react(rootId, r.changed, null);
        await this.catchUp(
          await this.db.payConnection.findUniqueOrThrow({
            where: { id: c.id },
          }),
        );
        for (const d of await this.db.payDispute.findMany({
          where: { connectionId: c.id },
        }))
          await this.disputes.seedEvidence(rootId, d);
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
    for (const c of conns.filter(
      (x) =>
        ['square', 'paypal'].includes(x.provider) &&
        x.status !== 'Disconnected',
    ))
      await this.importReadOnly(rootId, c).catch((e: Error) =>
        errors.push(`${c.provider}: ${e.message}`),
      );
    await this.ledger.project(rootId);
    await this.recurring.project(rootId);
    await this.recon.autoMatch(rootId);
    await this.refunds.resolveOpen(rootId);
    await this.requests.expireDue(rootId);
    return { errors };
  }

  /**
   * Square and PayPal are read-only: their payments are imported (status updates included) and
   * shown, but nothing can be refunded, captured or disputed through Noxtill. They don't report
   * fees through the read APIs Noxtill uses, so fees stay "not reported" rather than estimated.
   */
  async importReadOnly(rootId: string, c: PayConnection) {
    const integ = await this.db.integration.findUnique({
      where: { id: c.integrationId },
    });
    if (!integ) return;
    const st = (c.syncState ?? {}) as { charges?: { cursor?: number } };
    try {
      const tokens = await this.integrations.getTokens(
        integ.businessId,
        integ.provider,
      );
      const conn = this.connectors.get(integ.provider);
      if (!tokens || !conn.fetchPayments) throw new Error('not readable');
      const since = new Date(
        (st.charges?.cursor ?? Math.floor(Date.now() / 1000) - 90 * 86400) *
          1000 -
          86400000,
      ).toISOString();
      const rows = await conn.fetchPayments(
        tokens,
        (integ.meta as Record<string, unknown>) ?? {},
        since,
      );
      let mx = st.charges?.cursor ?? 0;
      const base = (await this.ctx.business(rootId)).currency;
      for (const p of rows) {
        await this.db.externalPayment.upsert({
          where: {
            businessId_provider_externalId: {
              businessId: integ.businessId,
              provider: integ.provider,
              externalId: p.externalId,
            },
          },
          create: {
            businessId: integ.businessId,
            provider: integ.provider,
            externalId: p.externalId,
            kind: p.kind,
            status: p.status,
            amount: dec(p.amount),
            currency: p.currency,
            occurredAt: new Date(p.occurredAt),
          },
          update: { status: p.status, amount: dec(p.amount) },
        });
        mx = Math.max(mx, Math.floor(new Date(p.occurredAt).getTime() / 1000));
        if (p.kind !== 'charge') continue;
        const s = p.status.toLowerCase();
        const status = [
          'completed',
          'succeeded',
          'success',
          's',
          'approved',
        ].includes(s)
          ? 'Succeeded'
          : [
                'failed',
                'canceled',
                'cancelled',
                'declined',
                'denied',
                'v',
              ].includes(s)
            ? 'Failed'
            : 'Pending';
        const key = `${c.provider}:${p.externalId}`;
        const rate = await this.ctx.rateOn(
          rootId,
          p.currency,
          new Date(p.occurredAt),
          base,
        );
        const data = {
          status,
          amount: dec(p.amount),
          captured: dec(status === 'Succeeded' ? p.amount : 0),
          currency: p.currency,
          reportAmount: rate == null ? null : dec(p.amount * rate),
          fxRate: rate == null ? null : new Prisma.Decimal(rate),
        };
        const prev = await this.db.payTransaction.findUnique({
          where: {
            businessId_sourceKey: { businessId: rootId, sourceKey: key },
          },
        });
        if (prev)
          await this.db.payTransaction.update({ where: { id: prev.id }, data });
        else
          await this.db.payTransaction.create({
            data: {
              businessId: rootId,
              branchId: integ.businessId,
              env: 'live',
              number: await this.ctx.number(rootId, 'tx'),
              origin: 'provider',
              sourceKey: key,
              sourceType: 'Provider',
              sourceRef: p.externalId.slice(0, 60),
              provider: c.provider,
              connectionId: c.id,
              channel: 'POS',
              method: c.provider === 'paypal' ? 'Wallet' : 'Card',
              authStatus: status === 'Failed' ? 'Declined' : 'Authorized',
              captureStatus: status === 'Succeeded' ? 'Captured' : '—',
              feeSource: 'pending',
              providerChargeId: p.externalId,
              correlationId: corrId(),
              initiatedBy:
                c.provider === 'square'
                  ? 'Square (read-only import)'
                  : 'PayPal (read-only import)',
              occurredAt: new Date(p.occurredAt),
              ...data,
            },
          });
      }
      await this.stripe.markFeed(
        c,
        'charges',
        true,
        undefined,
        mx || undefined,
      );
      await this.db.payConnection.update({
        where: { id: c.id },
        data: { status: 'Connected' },
      });
    } catch (e) {
      await this.stripe.markFeed(c, 'charges', false, (e as Error).message);
      throw e;
    }
  }

  // ── transaction actions ─────────────────────────────────────────────────

  /** Ask the provider for this payment's real state (charge + refunds + fee). */
  async refreshTx(rootId: string, txId: string) {
    const t = await this.db.payTransaction.findFirst({
      where: { id: txId, businessId: rootId },
    });
    if (!t) return null;
    if (
      t.provider !== 'stripe' ||
      !t.connectionId ||
      !(t.providerChargeId || t.providerIntentId)
    )
      return {
        status: t.status,
        changed: false,
        note:
          t.provider === 'manual'
            ? 'Recorded in Noxtill — there is no provider to ask.'
            : `${t.provider} is a read-only import; it refreshes with the next sync.`,
      };
    const c = await this.db.payConnection.findUniqueOrThrow({
      where: { id: t.connectionId },
    });
    const ch = t.providerChargeId
      ? await this.stripe.charge(c, t.providerChargeId)
      : await this.stripe.intentCharge(c, t.providerIntentId!);
    if (!ch)
      return {
        status: t.status,
        changed: false,
        note: 'The provider has no charge for this payment yet.',
      };
    const r = await this.stripe.upsertCharge(rootId, c, ch);
    for (const rf of ch.refunds?.data ?? [])
      await this.stripe.upsertRefund(rootId, c, rf, r.tx.id);
    if (r.changed) await this.react(rootId, [r.tx.id], r.prevStatus);
    return {
      status: r.tx.status,
      changed: r.changed,
      note: r.stale
        ? 'Provider reported an older state — kept the newer one.'
        : '',
    };
  }

  async capture(
    rootId: string,
    actor: { userId: string; name: string } & Record<string, unknown>,
    txId: string,
    amount: number | null,
  ) {
    const t = await this.db.payTransaction.findFirst({
      where: { id: txId, businessId: rootId },
    });
    if (!t) throw new Error('Transaction not found');
    if (t.status !== 'Authorized' || !t.providerIntentId)
      return {
        ok: false,
        note: `${t.number} is ${t.status} — only an authorized payment can be captured.`,
      };
    const c = t.connectionId
      ? await this.db.payConnection.findUnique({
          where: { id: t.connectionId },
        })
      : null;
    if (amount != null && amount > num(t.amount) + 0.004)
      return {
        ok: false,
        note: `Can’t capture more than the authorized ${num(t.amount).toFixed(2)} ${t.currency}.`,
      };
    const out = await this.stripe.capture(
      c!,
      t.providerIntentId,
      amount,
      t.currency,
      `capture:${t.id}`,
    );
    const res = await this.refreshTx(rootId, t.id);
    return { ok: true, note: `Stripe ${out.status}`, status: res?.status };
  }
}
