import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  IntegrationProvider,
  IntegrationStatus,
  PayConnection,
  Prisma,
} from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { PayContextService, corrId, dec, num, r2 } from './pay-context.service';
import {
  CapKey,
  Caps,
  PAY_ERRORS,
  PROVIDERS,
  PayEnv,
  fromMinor,
  providerDef,
  providerName,
  toMinor,
} from './payments.constants';
import {
  ProviderError,
  ProviderTimeoutError,
  STRIPE_TRANSPORT,
  StripeParams,
} from './providers/stripe.transport';
import type { StripeTransport } from './providers/stripe.transport';

// Minimal shapes of the Stripe objects Payments reads.
export interface SList<T> {
  data: T[];
  has_more: boolean;
}
export interface SBalanceTxn {
  id: string;
  object: 'balance_transaction';
  amount: number;
  fee: number;
  net: number;
  currency: string;
  available_on: number;
  created: number;
  status: string;
  type: string;
  reporting_category?: string;
  source?: string | { id: string } | null;
}
export interface SCharge {
  id: string;
  amount: number;
  amount_captured: number;
  amount_refunded: number;
  captured: boolean;
  refunded: boolean;
  disputed: boolean;
  currency: string;
  created: number;
  status: 'succeeded' | 'pending' | 'failed';
  paid: boolean;
  payment_intent?: string | null;
  failure_code?: string | null;
  failure_message?: string | null;
  outcome?: {
    type?: string;
    reason?: string | null;
    risk_level?: string;
    seller_message?: string;
  } | null;
  payment_method_details?: {
    type?: string;
    card?: { brand?: string; last4?: string; wallet?: unknown };
  } | null;
  balance_transaction?: string | SBalanceTxn | null;
  metadata?: Record<string, string>;
  billing_details?: { email?: string | null; name?: string | null };
  refunds?: SList<SRefund>;
  invoice?: string | null;
}
export interface SRefund {
  id: string;
  amount: number;
  currency: string;
  status: string;
  charge?: string | null;
  failure_reason?: string | null;
  created: number;
  metadata?: Record<string, string>;
}
export interface SDispute {
  id: string;
  amount: number;
  currency: string;
  charge: string | { id: string };
  reason: string;
  status: string;
  created: number;
  is_charge_refundable: boolean;
  evidence_details?: { due_by?: number | null; submission_count?: number };
  balance_transactions?: SBalanceTxn[];
}
export interface SPayout {
  id: string;
  amount: number;
  currency: string;
  status: string;
  arrival_date: number;
  created: number;
  automatic: boolean;
  failure_code?: string | null;
  destination?:
    string | { id: string; bank_name?: string; last4?: string } | null;
}
export interface SEvent {
  id: string;
  type: string;
  created: number;
  livemode: boolean;
  account?: string;
  data: { object: Record<string, unknown> & { id?: string; object?: string } };
}

const PAY_STATUS_RANK: Record<string, number> = {
  Pending: 1,
  'Pending Verification': 1,
  'Provider Unknown': 1,
  Authorized: 2,
  Succeeded: 4,
  Failed: 4,
  Cancelled: 4,
};

const ENV_PROVIDER: Record<string, { provider: string; env: PayEnv }> = {
  [IntegrationProvider.stripe]: { provider: 'stripe', env: 'live' },
  [IntegrationProvider.stripe_test]: { provider: 'stripe', env: 'test' },
  [IntegrationProvider.square]: { provider: 'square', env: 'live' },
  [IntegrationProvider.paypal]: { provider: 'paypal', env: 'live' },
};

export const integrationOf = (
  provider: string,
  env: PayEnv,
): IntegrationProvider =>
  provider === 'stripe'
    ? env === 'test'
      ? IntegrationProvider.stripe_test
      : IntegrationProvider.stripe
    : (provider as IntegrationProvider);

type Feed =
  | 'charges'
  | 'balanceTxns'
  | 'payouts'
  | 'disputes'
  | 'balance'
  | 'events'
  | 'account';
export type SyncState = Partial<
  Record<
    Feed,
    {
      lastOkAt?: string;
      lastAttemptAt?: string;
      lastError?: string | null;
      cursor?: number;
    }
  >
>;

/**
 * Stripe on the merchant's own connected account — connections, guarded writes and the raw sync
 * of charges, balance transactions, payouts, disputes and balances into the Payments tables.
 * Domain reactions (a request becoming paid, a recovery case opening, a refund execution moving)
 * live in PayApplyService so this layer stays a faithful mirror of what the provider reports.
 */
@Injectable()
export class PayStripeService {
  private readonly logger = new Logger(PayStripeService.name);

  constructor(
    private readonly ctx: PayContextService,
    @Inject(STRIPE_TRANSPORT) private readonly transport: StripeTransport,
  ) {}

  private get db() {
    return this.ctx.db;
  }

  configured(env: PayEnv) {
    return this.transport.configured(env);
  }

  // ── connections ──────────────────────────────────────────────────────────

  /** Mirrors the group's payment Integrations into PayConnection rows (status, write scope, caps). */
  async refreshConnections(rootId: string): Promise<PayConnection[]> {
    const group = await this.ctx.branches(rootId);
    const rows = await this.db.integration.findMany({
      where: {
        businessId: { in: group.map((g) => g.id) },
        provider: { in: Object.keys(ENV_PROVIDER) as IntegrationProvider[] },
      },
      orderBy: { connectedAt: 'asc' },
    });
    const seen = new Set<string>();
    for (const r of rows) {
      const m = ENV_PROVIDER[r.provider];
      const def = providerDef(m.provider)!;
      const meta = (r.meta ?? {}) as Record<string, unknown>;
      const key = `${m.provider}|${m.env}`;
      if (seen.has(key) && r.status !== IntegrationStatus.connected) continue;
      seen.add(key);
      const write =
        m.provider === 'stripe' &&
        meta.scope === 'read_write' &&
        this.transport.configured(m.env);
      const prev = await this.db.payConnection.findUnique({
        where: {
          businessId_provider_env: {
            businessId: rootId,
            provider: m.provider,
            env: m.env,
          },
        },
      });
      const degraded =
        !!prev?.lastErrorAt &&
        Date.now() - prev.lastErrorAt.getTime() < 15 * 60_000;
      const status =
        r.status === IntegrationStatus.connected
          ? degraded
            ? 'Degraded'
            : 'Connected'
          : r.status === IntegrationStatus.needs_attention
            ? 'Connection Required'
            : 'Disconnected';
      const data = {
        integrationId: r.id,
        accountId:
          typeof meta.accountId === 'string'
            ? meta.accountId
            : (prev?.accountId ?? null),
        status,
        writeEnabled: write,
        caps: (write
          ? def.caps
          : def.readCaps) as unknown as Prisma.InputJsonValue,
      };
      await this.db.payConnection.upsert({
        where: {
          businessId_provider_env: {
            businessId: rootId,
            provider: m.provider,
            env: m.env,
          },
        },
        create: {
          businessId: rootId,
          provider: m.provider,
          env: m.env,
          syncState: {},
          ...data,
        },
        update: data,
      });
    }
    // A connection whose Integration row is gone is disconnected, not deleted (history stays).
    await this.db.payConnection.updateMany({
      where: {
        businessId: rootId,
        integrationId: { notIn: rows.map((r) => r.id) },
      },
      data: { status: 'Disconnected', writeEnabled: false },
    });
    return this.db.payConnection.findMany({
      where: { businessId: rootId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async connections(rootId: string) {
    return this.db.payConnection.findMany({
      where: { businessId: rootId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async connection(rootId: string, provider: string, env: PayEnv) {
    return this.db.payConnection.findUnique({
      where: { businessId_provider_env: { businessId: rootId, provider, env } },
    });
  }

  capsOf(c: PayConnection | null | undefined): Caps {
    const def = c ? providerDef(c.provider) : null;
    return (c?.caps as unknown as Caps) ?? def?.readCaps ?? PROVIDERS[3].caps;
  }

  /** Throws the design's exact refusal before anything is sent to a provider. */
  assertCan(
    c: PayConnection | null | undefined,
    provider: string,
    cap: CapKey,
  ) {
    if (provider === 'manual')
      throw new AppException(
        PAY_ERRORS.METHOD_NOT_SUPPORTED,
        'This payment was taken by cash or another manual method — there is no provider to act on.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const def = providerDef(provider);
    if (!c || ['Disconnected', 'Connection Required'].includes(c.status))
      throw new AppException(
        PAY_ERRORS.CONNECTION_REQUIRED,
        `${providerName(provider)} isn’t connected. Reconnect it in Integrations.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    if (def?.adapter !== 'stripe')
      throw new AppException(
        PAY_ERRORS.METHOD_NOT_SUPPORTED,
        def?.why ?? `${providerName(provider)} is read-only in Noxtill.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    if (!c.writeEnabled)
      throw new AppException(
        PAY_ERRORS.METHOD_NOT_SUPPORTED,
        this.transport.configured(c.env as PayEnv)
          ? 'Stripe is connected read-only. Reconnect it in Integrations to allow payment actions.'
          : `Stripe ${c.env} mode isn’t configured on this Noxtill server, so payment actions can’t be sent.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    if (!this.capsOf(c)[cap])
      throw new AppException(
        PAY_ERRORS.METHOD_NOT_SUPPORTED,
        `${providerName(provider)} doesn’t support ${cap
          .replace('supports', '')
          .replace(/([A-Z])/g, ' $1')
          .trim()
          .toLowerCase()}.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
  }

  /** One Stripe call on the connection's account. Timeouts mark the connection degraded. */
  async call<T>(
    c: PayConnection,
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    params?: StripeParams,
    idempotencyKey?: string,
  ): Promise<T> {
    if (!c.accountId)
      throw new AppException(
        PAY_ERRORS.CONNECTION_REQUIRED,
        'The Stripe connection has no account id — reconnect it in Integrations.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    try {
      const out = await this.transport.request<T>({
        env: c.env as PayEnv,
        method,
        path,
        params,
        account: c.accountId,
        idempotencyKey,
      });
      if (c.lastErrorCode)
        await this.db.payConnection.update({
          where: { id: c.id },
          data: {
            lastErrorCode: null,
            lastErrorAt: null,
            status: c.status === 'Degraded' ? 'Connected' : c.status,
          },
        });
      return out;
    } catch (e) {
      if (e instanceof ProviderTimeoutError)
        await this.db.payConnection.update({
          where: { id: c.id },
          data: {
            lastErrorCode: 'PROVIDER_TIMEOUT',
            lastErrorAt: new Date(),
            status: 'Degraded',
          },
        });
      else if (
        e instanceof ProviderError &&
        (e.status === 401 || e.status === 403)
      )
        await this.db.payConnection.update({
          where: { id: c.id },
          data: {
            lastErrorCode: 'AUTH',
            lastErrorAt: new Date(),
            status: 'Connection Required',
          },
        });
      throw e;
    }
  }

  private async mark(
    c: PayConnection,
    feed: Feed,
    ok: boolean,
    error?: string,
    cursor?: number,
  ) {
    const fresh = await this.db.payConnection.findUniqueOrThrow({
      where: { id: c.id },
    });
    const st = (fresh.syncState ?? {}) as SyncState;
    const now = new Date().toISOString();
    st[feed] = {
      ...(st[feed] ?? {}),
      lastAttemptAt: now,
      ...(ok
        ? { lastOkAt: now, lastError: null }
        : { lastError: (error ?? 'failed').slice(0, 200) }),
      ...(cursor != null ? { cursor } : {}),
    };
    await this.db.payConnection.update({
      where: { id: c.id },
      data: { syncState: st },
    });
  }

  private async list<T extends { id: string }>(
    c: PayConnection,
    path: string,
    params: StripeParams,
    max = 1000,
  ): Promise<T[]> {
    const out: T[] = [];
    let after: string | undefined;
    for (;;) {
      const page = await this.call<SList<T>>(c, 'GET', path, {
        limit: 100,
        ...params,
        ...(after ? { starting_after: after } : {}),
      });
      out.push(...page.data);
      if (!page.has_more || !page.data.length || out.length >= max) break;
      after = page.data[page.data.length - 1].id;
    }
    return out;
  }

  // ── sync ─────────────────────────────────────────────────────────────────

  /** Full pull for one Stripe connection. Returns the ids of transactions whose state changed. */
  async syncAll(
    rootId: string,
    c: PayConnection,
  ): Promise<{ changed: string[]; errors: string[] }> {
    const changed: string[] = [];
    const errors: string[] = [];
    const st = (c.syncState ?? {}) as SyncState;
    const since = (feed: Feed, days: number) =>
      Math.max(
        0,
        (st[feed]?.cursor ?? Math.floor(Date.now() / 1000) - days * 86400) -
          2 * 86400,
      );
    const step = async (feed: Feed, fn: () => Promise<number | void>) => {
      try {
        const cur = await fn();
        await this.mark(
          c,
          feed,
          true,
          undefined,
          typeof cur === 'number' ? cur : undefined,
        );
      } catch (e) {
        errors.push(`${feed}: ${(e as Error).message}`);
        await this.mark(c, feed, false, (e as Error).message);
      }
    };
    await step('account', async () => {
      const a = await this.call<{
        country?: string;
        default_currency?: string;
        settings?: {
          payouts?: {
            schedule?: {
              interval?: string;
              delay_days?: number;
              weekly_anchor?: string;
              monthly_anchor?: number;
            };
          };
        };
      }>(c, 'GET', '/account');
      const s = a.settings?.payouts?.schedule;
      const sched = s?.interval
        ? `${s.interval === 'manual' ? 'Manual payouts' : s.interval === 'weekly' ? `Weekly (${s.weekly_anchor ?? ''})` : s.interval === 'monthly' ? `Monthly (day ${s.monthly_anchor ?? ''})` : 'Daily'}${s.delay_days != null ? ` · T+${s.delay_days}` : ''}`
        : null;
      await this.db.payConnection.update({
        where: { id: c.id },
        data: {
          country: a.country?.toUpperCase() ?? null,
          defaultCurrency: a.default_currency?.toUpperCase() ?? null,
          payoutSchedule: sched,
        },
      });
    });
    let maxCreated = 0;
    await step('charges', async () => {
      const list = await this.list<SCharge>(c, '/charges', {
        'created[gte]': since('charges', 90),
        'expand[]': 'data.balance_transaction',
      });
      for (const ch of list) {
        maxCreated = Math.max(maxCreated, ch.created);
        const r = await this.upsertCharge(rootId, c, ch);
        if (r.changed) changed.push(r.tx.id);
        for (const rf of ch.refunds?.data ?? [])
          await this.upsertRefund(rootId, c, rf, r.tx.id);
      }
      return maxCreated || st.charges?.cursor;
    });
    await step('balanceTxns', async () => {
      const list = await this.list<SBalanceTxn>(
        c,
        '/balance_transactions',
        { 'created[gte]': since('balanceTxns', 90) },
        3000,
      );
      let mx = 0;
      for (const b of list) {
        mx = Math.max(mx, b.created);
        await this.upsertBalanceTxn(rootId, c, b);
      }
      return mx || st.balanceTxns?.cursor;
    });
    await step('payouts', async () => {
      const list = await this.list<SPayout>(c, '/payouts', {
        'created[gte]': since('payouts', 120),
        'expand[]': 'data.destination',
      });
      let mx = 0;
      for (const p of list) {
        mx = Math.max(mx, p.created);
        await this.upsertPayout(rootId, c, p);
      }
      return mx || st.payouts?.cursor;
    });
    await step('disputes', async () => {
      const list = await this.list<SDispute>(c, '/disputes', {
        'created[gte]': since('disputes', 180),
      });
      let mx = 0;
      for (const d of list) {
        mx = Math.max(mx, d.created);
        await this.upsertDispute(rootId, c, d);
      }
      return mx || st.disputes?.cursor;
    });
    await step('balance', async () => {
      const b = await this.call<{
        available: { amount: number; currency: string }[];
        pending: { amount: number; currency: string }[];
        connect_reserved?: { amount: number; currency: string }[];
      }>(c, 'GET', '/balance');
      const conv = (l?: { amount: number; currency: string }[]) =>
        (l ?? []).map((x) => ({
          currency: x.currency.toUpperCase(),
          amount: fromMinor(x.amount, x.currency),
        }));
      await this.db.payBalanceSnapshot.create({
        data: {
          businessId: rootId,
          connectionId: c.id,
          available: conv(b.available),
          pending: conv(b.pending),
          reserved: conv(b.connect_reserved),
        },
      });
    });
    return { changed, errors };
  }

  // ── upserts (provider object → Payments row) ─────────────────────────────

  async upsertCharge(rootId: string, c: PayConnection, ch: SCharge) {
    const cur = ch.currency.toUpperCase();
    const md = ch.metadata ?? {};
    const amount = fromMinor(ch.amount, cur);
    const captured = ch.captured
      ? fromMinor(ch.amount_captured || ch.amount, cur)
      : 0;
    const status =
      ch.status === 'succeeded'
        ? ch.captured
          ? 'Succeeded'
          : ch.refunded
            ? 'Cancelled'
            : 'Authorized'
        : ch.status === 'pending'
          ? 'Pending'
          : 'Failed';
    const bt =
      ch.balance_transaction && typeof ch.balance_transaction === 'object'
        ? ch.balance_transaction
        : null;
    const pm = ch.payment_method_details;
    const method =
      pm?.type === 'card'
        ? pm.card?.wallet
          ? 'Wallet'
          : 'Card'
        : pm?.type === 'link'
          ? 'Wallet'
          : pm?.type
            ? 'Other'
            : 'Card';
    const sourceKey = `stripe:${c.env}:${ch.id}`;
    // Found by its provider charge id: once a paid request writes the money into Orders / Credit /
    // Bookings, the ledger row is re-keyed to that source but still carries the charge id.
    const prev =
      (await this.db.payTransaction.findUnique({
        where: { businessId_sourceKey: { businessId: rootId, sourceKey } },
      })) ??
      (await this.db.payTransaction.findFirst({
        where: {
          businessId: rootId,
          env: c.env,
          provider: 'stripe',
          providerChargeId: ch.id,
        },
      }));
    const base = (await this.ctx.business(rootId)).currency;
    const rate = await this.ctx.rateOn(
      rootId,
      cur,
      new Date(ch.created * 1000),
      base,
    );
    const data = {
      status,
      authStatus:
        status === 'Failed'
          ? 'Declined'
          : status === 'Pending'
            ? 'Requested'
            : 'Authorized',
      captureStatus: ch.captured
        ? ch.amount_captured < ch.amount
          ? 'Partially captured'
          : 'Captured'
        : status === 'Authorized'
          ? 'Not captured'
          : status === 'Cancelled'
            ? 'Expired'
            : '—',
      amount: dec(amount),
      captured: dec(captured),
      refunded: dec(fromMinor(ch.amount_refunded, cur)),
      disputed: dec(ch.disputed ? amount : 0),
      fee: bt ? dec(fromMinor(bt.fee, bt.currency)) : null,
      feeSource: bt ? 'actual' : status === 'Succeeded' ? 'pending' : 'none',
      currency: cur,
      fxRate: rate == null ? null : new Prisma.Decimal(rate),
      fxSource:
        rate == null || cur === base ? null : 'Finance › Exchange rates',
      reportAmount: rate == null ? null : dec(amount * rate),
      method,
      methodBrand: pm?.card?.brand ?? null,
      methodLast4: pm?.card?.last4 ?? null,
      providerIntentId: ch.payment_intent ?? null,
      failureCode: ch.outcome?.reason ?? ch.failure_code ?? null,
      failureMessage:
        (ch.failure_message ?? ch.outcome?.seller_message ?? null)?.slice(
          0,
          300,
        ) ?? null,
      riskOutcome:
        ch.outcome?.type === 'blocked'
          ? 'blocked'
          : (ch.outcome?.risk_level ?? null),
      authExpiresAt:
        status === 'Authorized'
          ? new Date((ch.created + 7 * 86400) * 1000)
          : null,
      capturedAt: ch.captured ? (prev?.capturedAt ?? new Date()) : null,
    };
    if (prev) {
      // Out-of-order provider events: an older state never overwrites a newer one.
      if ((PAY_STATUS_RANK[prev.status] ?? 0) > (PAY_STATUS_RANK[status] ?? 0))
        return {
          tx: prev,
          changed: false,
          stale: true,
          prevStatus: prev.status,
        };
      const tx = await this.db.payTransaction.update({
        where: { id: prev.id },
        data,
      });
      const changed =
        prev.status !== tx.status ||
        r2(num(prev.refunded)) !== r2(num(tx.refunded)) ||
        r2(num(prev.captured)) !== r2(num(tx.captured)) ||
        r2(num(prev.disputed)) !== r2(num(tx.disputed));
      return { tx, changed, stale: false, prevStatus: prev.status };
    }
    const reqId = !md.noxtill_request
      ? null
      : await this.db.payRequest.findFirst({
          where: { id: md.noxtill_request, businessId: rootId },
          select: {
            id: true,
            number: true,
            customerId: true,
            branchId: true,
            linkType: true,
            linkId: true,
            linkRef: true,
          },
        });
    const tx = await this.db.payTransaction.create({
      data: {
        businessId: rootId,
        branchId: md.noxtill_branch ?? reqId?.branchId ?? rootId,
        env: c.env,
        number: await this.ctx.number(rootId, 'tx'),
        origin: 'provider',
        sourceKey,
        sourceType: reqId
          ? 'Payment request'
          : md.noxtill_membership
            ? 'Membership'
            : 'Provider',
        sourceId: reqId ? reqId.id : (md.noxtill_membership ?? null),
        sourceRef: reqId ? reqId.number : null,
        customerId: md.noxtill_customer ?? reqId?.customerId ?? null,
        requestId: reqId ? reqId.id : null,
        provider: 'stripe',
        connectionId: c.id,
        channel:
          md.noxtill_channel ??
          (reqId ? 'Payment Link' : ch.invoice ? 'Recurring' : 'Website'),
        providerChargeId: ch.id,
        correlationId: md.noxtill_corr ?? corrId(),
        idempotencyKey: md.noxtill_idem ?? null,
        initiatedBy: reqId
          ? 'Customer (self-serve)'
          : ch.invoice
            ? 'Stripe (scheduled)'
            : 'Stripe',
        occurredAt: new Date(ch.created * 1000),
        authorizedAt:
          status !== 'Failed' && status !== 'Pending'
            ? new Date(ch.created * 1000)
            : null,
        ...data,
      },
    });
    return {
      tx,
      changed: true,
      stale: false,
      prevStatus: null as string | null,
    };
  }

  async upsertRefund(
    rootId: string,
    c: PayConnection,
    rf: SRefund,
    txId?: string | null,
  ) {
    const cur = rf.currency.toUpperCase();
    const status =
      rf.status === 'succeeded'
        ? 'Succeeded'
        : rf.status === 'failed' || rf.status === 'canceled'
          ? 'Failed'
          : 'Pending';
    const mine = rf.metadata?.noxtill_refund
      ? await this.db.payRefund.findFirst({
          where: { id: rf.metadata.noxtill_refund, businessId: rootId },
        })
      : null;
    const existing =
      mine ??
      (await this.db.payRefund.findUnique({
        where: { providerRefundId: rf.id },
      }));
    const tx =
      txId ??
      (rf.charge
        ? (
            await this.db.payTransaction.findFirst({
              where: { businessId: rootId, providerChargeId: rf.charge },
              select: { id: true },
            })
          )?.id
        : null) ??
      null;
    if (existing) {
      if (existing.status === status && existing.providerRefundId === rf.id)
        return existing;
      const next = existing.status === 'Succeeded' ? existing.status : status;
      return this.db.payRefund.update({
        where: { id: existing.id },
        data: {
          status: next,
          providerRefundId: rf.id,
          failureCode:
            status === 'Failed' ? (rf.failure_reason ?? 'failed') : null,
          verifiedAt:
            next === 'Succeeded'
              ? (existing.verifiedAt ?? new Date())
              : existing.verifiedAt,
          txId: existing.txId ?? tx,
        },
      });
    }
    // A refund issued outside Noxtill (e.g. in the Stripe Dashboard) is recorded as provider-origin.
    return this.db.payRefund.create({
      data: {
        businessId: rootId,
        env: c.env,
        number: await this.ctx.number(rootId, 'refund'),
        txId: tx,
        origin: 'provider',
        approvedAmount: dec(fromMinor(rf.amount, cur)),
        amount: dec(fromMinor(rf.amount, cur)),
        currency: cur,
        status,
        reason: 'Issued in the Stripe Dashboard (outside Noxtill)',
        method: 'Card',
        providerRefundId: rf.id,
        idempotencyKey: `refund:provider:${rf.id}`,
        failureCode:
          status === 'Failed' ? (rf.failure_reason ?? 'failed') : null,
        submittedAt: new Date(rf.created * 1000),
        verifiedAt: status === 'Succeeded' ? new Date(rf.created * 1000) : null,
      },
    });
  }

  async upsertBalanceTxn(
    rootId: string,
    c: PayConnection,
    b: SBalanceTxn,
    payoutRef?: string,
  ) {
    const cur = b.currency.toUpperCase();
    const src =
      typeof b.source === 'string' ? b.source : (b.source?.id ?? null);
    const tx =
      src && src.startsWith('ch_')
        ? await this.db.payTransaction.findFirst({
            where: { businessId: rootId, providerChargeId: src },
            select: { id: true, fee: true, feeSource: true },
          })
        : null;
    const data = {
      type: b.type,
      category: b.reporting_category ?? null,
      amount: dec(fromMinor(b.amount, cur)),
      fee: dec(fromMinor(b.fee, cur)),
      net: dec(fromMinor(b.net, cur)),
      currency: cur,
      availableOn: new Date(b.available_on * 1000),
      status: b.status,
      sourceObjectId: src,
      txId: tx?.id ?? null,
      occurredAt: new Date(b.created * 1000),
      ...(payoutRef ? { payoutRef } : {}),
    };
    await this.db.payBalanceTxn.upsert({
      where: { providerTxnId: b.id },
      create: {
        businessId: rootId,
        connectionId: c.id,
        env: c.env,
        providerTxnId: b.id,
        ...data,
      },
      update: data,
    });
    if (
      tx &&
      b.type === 'charge' &&
      (tx.feeSource !== 'actual' ||
        r2(num(tx.fee)) !== r2(fromMinor(b.fee, cur)))
    )
      await this.db.payTransaction.update({
        where: { id: tx.id },
        data: { fee: dec(fromMinor(b.fee, cur)), feeSource: 'actual' },
      });
    if (tx && payoutRef)
      await this.db.payTransaction.update({
        where: { id: tx.id },
        data: { payoutRef },
      });
  }

  async upsertPayout(rootId: string, c: PayConnection, p: SPayout) {
    const cur = p.currency.toUpperCase();
    const status =
      (
        {
          pending: 'Pending',
          in_transit: 'In Transit',
          paid: 'Paid',
          failed: 'Failed',
          canceled: 'Cancelled',
        } as Record<string, string>
      )[p.status] ?? 'Pending';
    const dest =
      p.destination && typeof p.destination === 'object'
        ? `${p.destination.bank_name ?? 'Bank'} ••••${p.destination.last4 ?? ''}`
        : null;
    const prev = await this.db.payPayout.findUnique({
      where: { providerPayoutId: p.id },
    });
    // Finance turns provider payouts into bank lines from ExternalPayment; keep it in step.
    const integ = await this.db.integration.findUnique({
      where: { id: c.integrationId },
      select: { businessId: true, provider: true },
    });
    let externalPaymentId: string | null = prev?.externalPaymentId ?? null;
    if (integ) {
      const ep = await this.db.externalPayment.upsert({
        where: {
          businessId_provider_externalId: {
            businessId: integ.businessId,
            provider: integ.provider,
            externalId: p.id,
          },
        },
        create: {
          businessId: integ.businessId,
          provider: integ.provider,
          externalId: p.id,
          kind: 'payout',
          status: p.status,
          amount: dec(fromMinor(p.amount, cur)),
          currency: cur,
          occurredAt: new Date(p.arrival_date * 1000),
        },
        update: {
          status: p.status,
          amount: dec(fromMinor(p.amount, cur)),
          occurredAt: new Date(p.arrival_date * 1000),
        },
      });
      externalPaymentId = ep.id;
    }
    const data = {
      amount: dec(fromMinor(p.amount, cur)),
      currency: cur,
      status,
      arrivalDate: new Date(p.arrival_date * 1000),
      providerCreatedAt: new Date(p.created * 1000),
      destination: dest ?? prev?.destination ?? null,
      automatic: p.automatic,
      failureCode: p.failure_code ?? null,
      externalPaymentId,
    };
    await this.db.payPayout.upsert({
      where: { providerPayoutId: p.id },
      create: {
        businessId: rootId,
        connectionId: c.id,
        env: c.env,
        providerPayoutId: p.id,
        ...data,
      },
      update: data,
    });
    if (dest)
      await this.db.payConnection.update({
        where: { id: c.id },
        data: { destination: dest },
      });
    // Link the balance transactions that make up this payout (settlement components).
    if (
      !prev ||
      prev.status !== status ||
      !(await this.db.payBalanceTxn.findFirst({
        where: { payoutRef: p.id },
        select: { id: true },
      }))
    ) {
      const parts = await this.list<SBalanceTxn>(
        c,
        '/balance_transactions',
        { payout: p.id },
        2000,
      );
      for (const b of parts)
        if (b.type !== 'payout')
          await this.upsertBalanceTxn(rootId, c, b, p.id);
    }
  }

  async upsertDispute(rootId: string, c: PayConnection, d: SDispute) {
    const cur = d.currency.toUpperCase();
    const chargeId = typeof d.charge === 'string' ? d.charge : d.charge.id;
    const pstatus =
      (
        {
          warning_needs_response: 'Needs Response',
          needs_response: 'Needs Response',
          warning_under_review: 'Under Review',
          under_review: 'Under Review',
          won: 'Won',
          lost: 'Lost',
          warning_closed: 'Won',
        } as Record<string, string>
      )[d.status] ?? 'Under Review';
    const tx = await this.db.payTransaction.findFirst({
      where: { businessId: rootId, providerChargeId: chargeId },
      select: { id: true },
    });
    const prev = await this.db.payDispute.findUnique({
      where: { providerDisputeId: d.id },
    });
    // Local workflow states survive a provider status that hasn't moved yet.
    let status = pstatus;
    if (prev?.status === 'Approval Required' && pstatus === 'Needs Response')
      status = 'Approval Required';
    if (
      prev?.status === 'Accepted (lost)' &&
      ['Lost', 'Needs Response'].includes(pstatus)
    )
      status = 'Accepted (lost)';
    const fee = (d.balance_transactions ?? []).reduce((s, b) => s + b.fee, 0);
    const data = {
      txId: tx?.id ?? null,
      providerChargeId: chargeId,
      reason: d.reason.replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase()),
      status,
      amount: dec(fromMinor(d.amount, cur)),
      currency: cur,
      fee: d.balance_transactions?.length
        ? dec(fromMinor(fee, cur))
        : (prev?.fee ?? null),
      dueBy: d.evidence_details?.due_by
        ? new Date(d.evidence_details.due_by * 1000)
        : null,
      chargeRefundable: d.is_charge_refundable,
      outcome: ['Won', 'Lost'].includes(pstatus)
        ? pstatus
        : (prev?.outcome ?? null),
      submittedAt:
        prev?.submittedAt ??
        ((d.evidence_details?.submission_count ?? 0) > 0 ? new Date() : null),
    };
    const row = await this.db.payDispute.upsert({
      where: { providerDisputeId: d.id },
      create: {
        businessId: rootId,
        connectionId: c.id,
        env: c.env,
        providerDisputeId: d.id,
        openedAt: new Date(d.created * 1000),
        ...data,
      },
      update: data,
    });
    if (tx)
      await this.db.payTransaction.update({
        where: { id: tx.id },
        data: { disputed: ['Won'].includes(pstatus) ? dec(0) : data.amount },
      });
    return { row, created: !prev };
  }

  // ── writes ───────────────────────────────────────────────────────────────

  async checkout(
    c: PayConnection,
    p: {
      amount: number;
      currency: string;
      name: string;
      description?: string;
      email?: string | null;
      capture: 'automatic' | 'manual';
      successUrl: string;
      cancelUrl: string;
      metadata: Record<string, string>;
      methods: string[];
      idem: string;
    },
  ) {
    this.assertCan(c, 'stripe', 'supportsPaymentLinks');
    if (p.capture === 'manual')
      this.assertCan(c, 'stripe', 'supportsSeparateCapture');
    return this.call<{
      id: string;
      url: string;
      payment_intent?: string | null;
    }>(
      c,
      'POST',
      '/checkout/sessions',
      {
        mode: 'payment',
        success_url: p.successUrl,
        cancel_url: p.cancelUrl,
        ...(p.email ? { customer_email: p.email } : {}),
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: p.currency.toLowerCase(),
              unit_amount: toMinor(p.amount, p.currency),
              product_data: {
                name: p.name.slice(0, 120),
                ...(p.description
                  ? { description: p.description.slice(0, 300) }
                  : {}),
              },
            },
          },
        ],
        payment_intent_data: {
          capture_method: p.capture,
          metadata: p.metadata,
        },
        metadata: p.metadata,
        expires_at: Math.floor(Date.now() / 1000) + 23 * 3600,
      },
      p.idem,
    );
  }

  async capture(
    c: PayConnection,
    intentId: string,
    amount: number | null,
    currency: string,
    idem: string,
  ) {
    this.assertCan(c, 'stripe', 'supportsSeparateCapture');
    return this.call<{ id: string; status: string; latest_charge?: string }>(
      c,
      'POST',
      `/payment_intents/${intentId}/capture`,
      amount != null ? { amount_to_capture: toMinor(amount, currency) } : {},
      idem,
    );
  }

  async refund(
    c: PayConnection,
    chargeId: string,
    amount: number,
    currency: string,
    metadata: Record<string, string>,
    idem: string,
  ) {
    this.assertCan(c, 'stripe', 'supportsRefund');
    return this.call<SRefund>(
      c,
      'POST',
      '/refunds',
      { charge: chargeId, amount: toMinor(amount, currency), metadata },
      idem,
    );
  }

  async refundsOf(c: PayConnection, chargeId: string) {
    return this.list<SRefund>(c, '/refunds', { charge: chargeId }, 100);
  }

  async charge(c: PayConnection, id: string) {
    return this.call<SCharge>(c, 'GET', `/charges/${id}`, {
      'expand[]': 'balance_transaction',
    });
  }

  async intentCharge(c: PayConnection, intentId: string) {
    const pi = await this.call<{ id: string; latest_charge?: string | null }>(
      c,
      'GET',
      `/payment_intents/${intentId}`,
    );
    return pi.latest_charge ? this.charge(c, pi.latest_charge) : null;
  }

  async disputeUpdate(
    c: PayConnection,
    id: string,
    evidence: Record<string, string>,
    submit: boolean,
    idem: string,
  ) {
    this.assertCan(c, 'stripe', 'supportsDisputesAPI');
    return this.call<SDispute>(
      c,
      'POST',
      `/disputes/${id}`,
      { evidence, submit },
      idem,
    );
  }

  async disputeClose(c: PayConnection, id: string, idem: string) {
    this.assertCan(c, 'stripe', 'supportsDisputesAPI');
    return this.call<SDispute>(c, 'POST', `/disputes/${id}/close`, {}, idem);
  }

  async ensureCustomer(
    rootId: string,
    c: PayConnection,
    customer: {
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
    },
  ) {
    const have = await this.db.payProviderCustomer.findUnique({
      where: {
        connectionId_customerId: {
          connectionId: c.id,
          customerId: customer.id,
        },
      },
    });
    if (have) return have.providerCustomerId;
    const cu = await this.call<{ id: string }>(
      c,
      'POST',
      '/customers',
      {
        name: customer.name,
        ...(customer.email ? { email: customer.email } : {}),
        ...(customer.phone ? { phone: customer.phone } : {}),
        metadata: { noxtill_customer: customer.id },
      },
      `customer:${c.id}:${customer.id}`,
    );
    await this.db.payProviderCustomer.create({
      data: {
        businessId: rootId,
        connectionId: c.id,
        customerId: customer.id,
        providerCustomerId: cu.id,
      },
    });
    return cu.id;
  }

  async ensurePrice(
    rootId: string,
    c: PayConnection,
    plan: {
      id: string;
      name: string;
      price: number;
      interval: 'monthly' | 'yearly';
    },
    currency: string,
  ) {
    const have = await this.db.payPlanPrice.findFirst({
      where: {
        connectionId: c.id,
        membershipPlanId: plan.id,
        amount: dec(plan.price),
        interval: plan.interval,
      },
    });
    if (have) return have.priceId;
    const product = await this.call<{ id: string }>(
      c,
      'POST',
      '/products',
      {
        name: plan.name.slice(0, 120),
        metadata: { noxtill_membership_plan: plan.id },
      },
      `product:${c.id}:${plan.id}`,
    );
    const price = await this.call<{ id: string }>(
      c,
      'POST',
      '/prices',
      {
        product: product.id,
        currency: currency.toLowerCase(),
        unit_amount: toMinor(plan.price, currency),
        recurring: { interval: plan.interval === 'yearly' ? 'year' : 'month' },
      },
      `price:${c.id}:${plan.id}:${plan.price}:${plan.interval}`,
    );
    await this.db.payPlanPrice.create({
      data: {
        businessId: rootId,
        connectionId: c.id,
        membershipPlanId: plan.id,
        productId: product.id,
        priceId: price.id,
        amount: dec(plan.price),
        interval: plan.interval,
      },
    });
    return price.id;
  }

  async subscriptionCheckout(
    c: PayConnection,
    p: {
      customer: string;
      price: string;
      successUrl: string;
      cancelUrl: string;
      metadata: Record<string, string>;
      idem: string;
    },
  ) {
    this.assertCan(c, 'stripe', 'supportsRecurring');
    return this.call<{ id: string; url: string }>(
      c,
      'POST',
      '/checkout/sessions',
      {
        mode: 'subscription',
        customer: p.customer,
        line_items: [{ price: p.price, quantity: 1 }],
        success_url: p.successUrl,
        cancel_url: p.cancelUrl,
        subscription_data: { metadata: p.metadata },
        metadata: p.metadata,
      },
      p.idem,
    );
  }

  async setupCheckout(
    c: PayConnection,
    p: {
      customer: string;
      currency: string;
      successUrl: string;
      cancelUrl: string;
      metadata: Record<string, string>;
      idem: string;
    },
  ) {
    this.assertCan(c, 'stripe', 'supportsRecurring');
    return this.call<{ id: string; url: string }>(
      c,
      'POST',
      '/checkout/sessions',
      {
        mode: 'setup',
        customer: p.customer,
        currency: p.currency.toLowerCase(),
        success_url: p.successUrl,
        cancel_url: p.cancelUrl,
        metadata: p.metadata,
      },
      p.idem,
    );
  }

  async subscriptionUpdate(
    c: PayConnection,
    id: string,
    params: StripeParams,
    idem: string,
  ) {
    this.assertCan(c, 'stripe', 'supportsRecurring');
    return this.call<{
      id: string;
      status: string;
      current_period_end?: number;
    }>(c, 'POST', `/subscriptions/${id}`, params, idem);
  }

  async subscriptionCancel(c: PayConnection, id: string, idem: string) {
    this.assertCan(c, 'stripe', 'supportsRecurring');
    return this.call<{ id: string; status: string }>(
      c,
      'DELETE',
      `/subscriptions/${id}`,
      undefined,
      idem,
    );
  }

  async invoicePay(c: PayConnection, id: string, idem: string) {
    this.assertCan(c, 'stripe', 'supportsRecurring');
    return this.call<{
      id: string;
      status: string;
      charge?: string | null;
      paid?: boolean;
    }>(c, 'POST', `/invoices/${id}/pay`, {}, idem);
  }

  async events(c: PayConnection, sinceUnix: number) {
    return this.list<SEvent>(c, '/events', { 'created[gte]': sinceUnix }, 1000);
  }

  async markFeed(
    c: PayConnection,
    feed: Feed,
    ok: boolean,
    error?: string,
    cursor?: number,
  ) {
    return this.mark(c, feed, ok, error, cursor);
  }
}
