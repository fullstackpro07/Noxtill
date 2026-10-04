import { Injectable } from '@nestjs/common';
import { PayConnection, PayTransaction, Prisma } from '@prisma/client';
import { PayActor, PayContextService, num, r2 } from './pay-context.service';
import { Fmt } from './pay-vm';
import {
  PayEnv,
  PayPolicy,
  PROVIDERS,
  UNAVAILABLE_PROVIDERS,
  providerDef,
} from './payments.constants';
import type { SyncState } from './pay-stripe.service';

export interface Scope {
  tab: string;
  env: PayEnv;
  branch: string;
  prov: string;
  cur: string;
  period: number;
  view: Record<string, string>;
  f: Record<string, Record<string, string>>;
  page: Record<string, number>;
  sec: string;
}

export function parseScope(q: Record<string, unknown>): Scope {
  const j = (v: unknown) => {
    try {
      return typeof v === 'string' && v
        ? (JSON.parse(v) as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  };
  const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
  const period = Number(q.period ?? 30);
  return {
    tab: str(q.tab, 'overview'),
    env: q.env === 'test' ? 'test' : 'live',
    branch: str(q.branch, ''),
    prov: str(q.prov, ''),
    cur: str(q.cur, 'rep') || 'rep',
    period: [1, 7, 30, 90].includes(period) ? period : 30,
    view: j(q.view) as Record<string, string>,
    f: j(q.f) as Record<string, Record<string, string>>,
    page: j(q.page) as Record<string, number>,
    sec: str(q.sec, 'collection'),
  };
}

/** Everything a screen / drawer reads for one request, loaded once and scoped to the actor. */
export interface Data {
  a: PayActor;
  s: Scope;
  pol: PayPolicy;
  fmt: Fmt;
  base: string;
  biz: {
    id: string;
    name: string;
    currency: string;
    timezone: string;
    country: string | null;
  };
  branches: { id: string; name: string }[];
  conns: PayConnection[];
  /** All transactions of this env visible to the actor (no period filter). */
  all: PayTransaction[];
  names: Map<string, string>;
  custs: Map<
    string,
    { name: string; email: string | null; phone: string; tags: string[] }
  >;
  policyVersion: number;
}

/**
 * Loads and scopes the data behind Payments screens. Role scope is enforced here, before any
 * figure is computed: a Manager sees only their branches, Staff only payments they took.
 */
@Injectable()
export class PayDataService {
  constructor(private readonly ctx: PayContextService) {}

  async load(a: PayActor, s: Scope): Promise<Data> {
    const settings = await this.ctx.ensure(a.rootId);
    const pol = await this.ctx.policy(a.rootId);
    const biz = await this.ctx.business(a.rootId);
    const branches = (await this.ctx.branches(a.rootId)).map((b) => ({
      id: b.id,
      name: b.name,
    }));
    const conns = await this.ctx.db.payConnection.findMany({
      where: { businessId: a.rootId },
      orderBy: { createdAt: 'asc' },
    });
    const where: Prisma.PayTransactionWhereInput = {
      businessId: a.rootId,
      env: s.env,
    };
    if (a.branches) where.branchId = { in: a.branches };
    if (a.ownOnly) where.createdById = a.userId;
    const all = await this.ctx.db.payTransaction.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      take: 5000,
    });
    const custIds = [
      ...new Set(all.map((t) => t.customerId).filter((x): x is string => !!x)),
    ];
    const custRows = custIds.length
      ? await this.ctx.db.customer.findMany({
          where: { id: { in: custIds } },
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            tags: true,
          },
        })
      : [];
    const custs = new Map(
      custRows.map((c) => [
        c.id,
        {
          name: c.name,
          email: c.email,
          phone: c.phone,
          tags: Array.isArray(c.tags) ? (c.tags as string[]) : [],
        },
      ]),
    );
    const names = await this.ctx.userNames(all.map((t) => t.createdById));
    return {
      a,
      s,
      pol,
      fmt: new Fmt(biz.currency, biz.timezone || 'UTC'),
      base: biz.currency,
      biz: {
        id: biz.id,
        name: biz.name,
        currency: biz.currency,
        timezone: biz.timezone,
        country: biz.country,
      },
      branches,
      conns,
      all,
      names,
      custs,
      policyVersion: settings.policyVersion,
    };
  }

  // ── shared helpers used by views and drawers ─────────────────────────────

  inScope(d: Data, t: PayTransaction, noPeriod = false) {
    const s = d.s;
    if (s.branch && t.branchId !== s.branch) return false;
    if (s.prov && t.provider !== s.prov) return false;
    if (s.cur && s.cur !== 'rep' && t.currency !== s.cur) return false;
    if (!noPeriod && t.occurredAt.getTime() < Date.now() - s.period * 86400000)
      return false;
    return true;
  }

  txs(d: Data, noPeriod = false) {
    return d.all.filter((t) => this.inScope(d, t, noPeriod));
  }

  /** Base-currency value of a money field of a transaction; null when FX is missing. */
  rep(
    t: PayTransaction,
    field: 'amount' | 'captured' | 'refunded' | 'fee' | 'disputed' = 'amount',
  ): number | null {
    const v = num(t[field]);
    if (t.reportAmount == null) return null;
    const amt = num(t.amount);
    return amt ? (v * num(t.reportAmount)) / amt : 0;
  }

  sum(
    list: PayTransaction[],
    field: 'amount' | 'captured' | 'refunded' | 'fee' | 'disputed' = 'amount',
  ) {
    let v = 0;
    let miss = 0;
    for (const t of list) {
      const x = this.rep(t, field);
      if (x == null) miss++;
      else v += x;
    }
    return { v: r2(v), miss };
  }

  cname(d: Data, id: string | null | undefined) {
    if (!id) return 'Walk-in';
    const c = d.custs.get(id);
    if (!c) return 'Customer';
    return d.a.pii ? c.name : `Customer ••${id.slice(-3)}`;
  }

  /** Customer segment = the customer's tags in the CRM (Noxtill has no separate segment field). */
  segOf(d: Data, id: string | null | undefined) {
    return id ? (d.custs.get(id)?.tags ?? []) : [];
  }

  brName(d: Data, id: string | null | undefined) {
    return d.branches.find((b) => b.id === id)?.name ?? '—';
  }

  srcLabel(t: PayTransaction) {
    return t.sourceType === 'Provider'
      ? 'Provider only'
      : `${t.sourceType}${t.sourceRef ? ` ${t.sourceRef}` : ''}`;
  }

  srcOwner(t: Pick<PayTransaction, 'sourceType'>) {
    return (
      (
        {
          Order: 'Orders',
          Invoice: 'Orders',
          Booking: 'Bookings',
          'Credit balance': 'Credit',
          Installment: 'Credit',
          Membership: 'Customers',
          'Payment request': 'Payments',
          Provider: 'Provider',
        } as Record<string, string>
      )[t.sourceType] ?? 'Orders'
    );
  }

  provName(k: string | null | undefined) {
    if (!k) return '—';
    return (
      providerDef(k)?.name ??
      UNAVAILABLE_PROVIDERS.find((p) => p.key === k)?.name ??
      k
    );
  }

  conn(d: Data, provider: string, env: string = d.s.env) {
    return (
      d.conns.find((c) => c.provider === provider && c.env === env) ?? null
    );
  }

  /** The "Disputed / Refunded" view of a transaction's status, as the design shows it. */
  dispSt(t: PayTransaction, openDisputeTx: Set<string>) {
    if (openDisputeTx.has(t.id)) return 'Disputed';
    if (num(t.refunded) > 0 && num(t.refunded) >= num(t.captured) - 0.004)
      return 'Refunded';
    if (num(t.refunded) > 0) return 'Partially Refunded';
    return t.status;
  }

  /** Settlement state from real provider data — never estimated. */
  settleSt(
    t: PayTransaction,
    payoutStatus: Map<string, string>,
    btPending: Set<string>,
  ) {
    if (t.status !== 'Succeeded') return '—';
    if (t.provider === 'manual') return 'Not applicable (cash)';
    if (t.env === 'test') return 'Test — never settles';
    if (t.provider !== 'stripe') return 'Not reported';
    if (t.payoutRef) {
      const st = payoutStatus.get(t.payoutRef) ?? 'Pending';
      return st === 'Paid' ? 'Paid out' : st === 'Pending' ? 'Scheduled' : st;
    }
    if (btPending.has(t.id)) return 'Pending';
    return t.feeSource === 'actual' ? 'Settled' : 'Pending';
  }

  /** Freshness across active provider feeds plus the Noxtill-source projector. */
  fresh(d: Data, projectedAt: Date | null) {
    const P = d.conns.filter(
      (c) => c.env === d.s.env && !['Disconnected'].includes(c.status),
    );
    const stale = d.pol.safeguards.staleMinutes;
    const ages: { name: string; m: number; partial: boolean }[] = [];
    for (const c of P) {
      const st = (c.syncState ?? {}) as SyncState;
      const feeds = Object.values(st).filter(Boolean);
      const okTimes = feeds
        .map((f) => (f?.lastOkAt ? Date.parse(f.lastOkAt) : 0))
        .filter((x) => x > 0);
      const partial =
        feeds.some((f) => f?.lastError) ||
        c.status === 'Degraded' ||
        c.status === 'Connection Required';
      const worst = okTimes.length ? Math.min(...okTimes) : 0;
      ages.push({
        name: this.provName(c.provider),
        m: worst ? (Date.now() - worst) / 60000 : Infinity,
        partial,
      });
    }
    const proj = projectedAt
      ? (Date.now() - projectedAt.getTime()) / 60000
      : Infinity;
    if (!ages.length)
      return {
        m: proj,
        partial: false,
        t: Number.isFinite(proj)
          ? `Noxtill records · updated ${Math.max(1, Math.round(proj))}m ago`
          : 'Not synced yet',
        noProvider: true,
        names: [] as string[],
      };
    const worst = Math.max(...ages.map((x) => x.m), proj);
    const partials = ages.filter((x) => x.partial);
    const never = ages.filter((x) => !Number.isFinite(x.m));
    return {
      m: worst,
      partial: partials.length > 0,
      noProvider: false,
      names: partials.map((x) => x.name),
      t: never.length
        ? `${never.map((x) => x.name).join(', ')} not synced yet`
        : partials.length
          ? `Partial · ${partials.map((x) => x.name).join(', ')} delayed`
          : worst > stale
            ? `Stale · updated ${Math.round(worst)}m ago`
            : `Updated ${Math.max(1, Math.round(worst))}m ago`,
    };
  }

  providerRows(d: Data) {
    const out = PROVIDERS.filter((p) => p.key !== 'manual').map((p) => {
      const c = this.conn(d, p.key, p.key === 'stripe' ? d.s.env : 'live');
      return { def: p, c, st: c ? c.status : 'Disconnected' };
    });
    return out;
  }
}
