import { Injectable } from '@nestjs/common';
import {
  PayDispute,
  PayPayout,
  PayRefund,
  PayTransaction,
} from '@prisma/client';
import { PayActor, PayContextService, num, r2 } from './pay-context.service';
import { Data, PayDataService, Scope } from './pay-data.service';
import { PayRequestsService } from './pay-requests.service';
import { PayLedgerService } from './pay-ledger.service';
import { PayStripeService } from './pay-stripe.service';
import { PayRoutingService, RuleConds } from './pay-routing.service';
import {
  Btn,
  K,
  R,
  btn,
  card,
  cell,
  chip,
  cols,
  emptyRows,
  fBtns,
  fChips,
  fRead,
  fSel,
  fTog,
  fTxt,
  kpiRow,
  mkBars,
  row,
  seg,
  sel2,
  stc,
} from './pay-vm';
import {
  DISPUTE_OPEN,
  METHODS,
  PRECEDENCE,
  PROVIDERS,
  REFUND_IN_FLIGHT,
  REQUEST_OPEN,
  SECS,
  TABS,
  TEMPLATES,
  UNAVAILABLE_PROVIDERS,
  bigUnit,
  providerDef,
} from './payments.constants';

const LOCK = '🔒 Restricted';
const RC_OPEN = ['Recovered', 'Unrecoverable', 'Resolved elsewhere'];

/**
 * Builds every Payments screen from real rows, in the exact view-model shapes of the design's
 * renderer. Nothing here is fabricated: an empty source shows an honest empty state, a figure a
 * provider doesn't report says so, and restricted fields are never computed for the browser.
 */
@Injectable()
export class PayViewsService {
  constructor(
    private readonly ctx: PayContextService,
    private readonly data: PayDataService,
    private readonly routing: PayRoutingService,
    private readonly requests: PayRequestsService,
    private readonly ledger: PayLedgerService,
    private readonly stripe: PayStripeService,
  ) {}

  private get db() {
    return this.ctx.db;
  }

  // ── shared lookups ─────────────────────────────────────────────────────

  private async openDisputeTx(d: Data) {
    const ds = await this.db.payDispute.findMany({
      where: {
        businessId: d.a.rootId,
        env: d.s.env,
        status: { in: DISPUTE_OPEN },
      },
      select: { txId: true },
    });
    return new Set(ds.map((x) => x.txId).filter((x): x is string => !!x));
  }

  private async settleMaps(d: Data) {
    const payouts = await this.db.payPayout.findMany({
      where: { businessId: d.a.rootId, env: d.s.env },
      select: { providerPayoutId: true, status: true },
    });
    const pend = await this.db.payBalanceTxn.findMany({
      where: {
        businessId: d.a.rootId,
        env: d.s.env,
        status: 'pending',
        txId: { not: null },
      },
      select: { txId: true },
    });
    return {
      po: new Map(payouts.map((p) => [p.providerPayoutId, p.status])),
      pend: new Set(pend.map((p) => p.txId as string)),
    };
  }

  private async snapshots(d: Data) {
    const conns = d.conns.filter(
      (c) =>
        c.provider === 'stripe' &&
        c.env === d.s.env &&
        (!d.s.prov || c.provider === d.s.prov),
    );
    const out: {
      c: (typeof conns)[number];
      available: number;
      pending: number;
      reserved: number;
      partial: boolean;
      at: Date | null;
    }[] = [];
    for (const c of conns) {
      const s = await this.db.payBalanceSnapshot.findFirst({
        where: { connectionId: c.id },
        orderBy: { fetchedAt: 'desc' },
      });
      // No balance reported yet: the figure is "Not available", never a zero.
      if (!s) continue;
      const sum = async (l: unknown) => {
        let v = 0;
        let partial = false;
        for (const x of (l as { currency: string; amount: number }[]) ?? []) {
          const rate = await this.ctx.rateOn(
            d.a.rootId,
            x.currency,
            new Date(),
            d.base,
          );
          if (rate == null) partial = true;
          else v += x.amount * rate;
        }
        return { v: r2(v), partial };
      };
      const av = s ? await sum(s.available) : { v: 0, partial: true };
      const pe = s ? await sum(s.pending) : { v: 0, partial: true };
      const re = s ? await sum(s.reserved) : { v: 0, partial: false };
      out.push({
        c,
        available: av.v,
        pending: pe.v,
        reserved: re.v,
        partial: !s || av.partial || pe.partial,
        at: s?.fetchedAt ?? null,
      });
    }
    return out;
  }

  private amtCell(d: Data, v: number | null, cur?: string | null, s = '') {
    return cell({ t: d.fmt.money(v, cur), fw: 800, fg: '#101828', s });
  }

  private cmp(d: Data, v: number, pv: number, hasPrev: boolean) {
    if (!hasPrev) return 'No prior-period data';
    if (!pv) return 'Prior period: 0';
    return `${v >= pv ? '▲ ' : '▼ '}${Math.abs(((v - pv) / pv) * 100).toFixed(1)}% vs prior ${d.s.period}d`;
  }

  private missFx(n: number) {
    return n
      ? ` · ${n} payment(s) without an FX rate excluded — incomplete`
      : '';
  }

  private amtRange(d: Data) {
    const big = bigUnit(d.base);
    return { lo: big / 20, hi: big / 2 };
  }

  private paged<T>(d: Data, key: string, L: T[], n = 12) {
    const p = Math.min(
      d.s.page[key] ?? 0,
      Math.max(0, Math.ceil(L.length / n) - 1),
    );
    return {
      rows: L.slice(p * n, p * n + n),
      pager:
        L.length > n
          ? {
              t: `Showing ${p * n + 1}–${Math.min(L.length, p * n + n)} of ${L.length}`,
              noPrev: p === 0,
              noNext: (p + 1) * n >= L.length,
            }
          : null,
    };
  }

  private nOn(f: Record<string, string>, skip: string[] = []) {
    return (
      Object.entries(f).filter(([k, v]) => v && !skip.includes(k)).length ||
      null
    );
  }

  // ── header ──────────────────────────────────────────────────────────────

  async header(d: Data, projectedAt: Date | null) {
    const S = d.s;
    const T = TABS.find((t) => t[0] === S.tab) ?? TABS[0];
    const test = S.env === 'test';
    const F = this.data.fresh(d, projectedAt);
    const stale = F.m > d.pol.safeguards.staleMinutes && Number.isFinite(F.m);
    const pend = await this.db.payApproval.count({
      where: { businessId: d.a.rootId, status: 'Pending' },
    });
    const provOpts = [
      { v: '', t: 'All providers' },
      ...(['overview', 'transactions'].includes(S.tab)
        ? [{ v: 'manual', t: 'Cash / manual' }]
        : []),
      ...d.conns
        .filter((c) => c.env === S.env || c.provider !== 'stripe')
        .map((c) => ({ v: c.provider, t: this.data.provName(c.provider) }))
        .filter((x, i, arr) => arr.findIndex((y) => y.v === x.v) === i),
    ];
    const hdrSels = [
      {
        k: 'env',
        l: 'Environment',
        v: S.env,
        opts: [
          { v: 'live', t: '● Live' },
          { v: 'test', t: '◆ Test mode' },
        ],
        bd: test ? '#F79009' : '#12A150',
      },
      ...([
        'overview',
        'transactions',
        'recovery',
        'refunds',
        'disputes',
      ].includes(S.tab) && d.branches.length > 1
        ? [
            {
              k: 'branch',
              l: 'Branch / store scope',
              v: S.branch,
              opts: [
                {
                  v: '',
                  t: d.a.branches
                    ? `${d.a.branches.map((b) => this.data.brName(d, b)).join(', ')} (your scope)`
                    : 'All branches & stores',
                },
                ...d.branches
                  .filter((b) => !d.a.branches || d.a.branches.includes(b.id))
                  .map((b) => ({ v: b.id, t: b.name })),
              ],
              bd: S.branch ? '#12A150' : '#E6EAF0',
            },
          ]
        : []),
      ...(['overview', 'transactions'].includes(S.tab)
        ? [
            {
              k: 'period',
              l: 'Date range',
              v: String(S.period),
              opts: [
                { v: '30', t: 'Last 30 days' },
                { v: '7', t: 'Last 7 days' },
                { v: '90', t: 'Last 90 days' },
                { v: '1', t: 'Today' },
              ],
              bd: '#E6EAF0',
            },
            {
              k: 'cur',
              l: 'Currency',
              v: S.cur,
              opts: [
                { v: 'rep', t: `${d.base} reporting (all)` },
                ...[...new Set(d.all.map((t) => t.currency))].map((c) => ({
                  v: c,
                  t: `${c} only`,
                })),
              ],
              bd: S.cur !== 'rep' ? '#12A150' : '#E6EAF0',
            },
          ]
        : []),
      ...(['overview', 'transactions', 'payouts', 'reconciliation'].includes(
        S.tab,
      )
        ? [
            {
              k: 'prov',
              l: 'Provider',
              v: S.prov,
              opts: provOpts,
              bd: S.prov ? '#12A150' : '#E6EAF0',
            },
          ]
        : []),
      {
        k: 'more',
        l: 'More',
        v: '',
        opts: [
          { v: '', t: 'More…' },
          { v: 'export', t: 'Export' },
          { v: 'saveview', t: 'Save view' },
          { v: 'approvals', t: `Approvals (${pend})` },
          { v: 'audit', t: 'Audit / history' },
          { v: 'fresh', t: 'Data freshness' },
          { v: 'help', t: 'Help' },
        ],
        bd: '#E6EAF0',
      },
    ];
    // Badges are live counts of work waiting on each tab.
    const rid = d.a.rootId;
    const [rc, rf, dsp, rec] = test
      ? [0, 0, 0, 0]
      : await Promise.all([
          this.db.payRecoveryCase.count({
            where: {
              businessId: rid,
              status: { in: ['Scheduled', 'Manual Review'] },
            },
          }),
          this.db.payRefund.count({
            where: {
              businessId: rid,
              env: 'live',
              status: { in: ['Ready', 'Approval Required', 'Failed'] },
            },
          }),
          this.db.payDispute.count({
            where: {
              businessId: rid,
              env: 'live',
              status: 'Needs Response',
              dueBy: {
                lte: new Date(Date.now() + d.pol.disputes.warnDays * 86400000),
              },
            },
          }),
          this.db.payReconItem.count({
            where: {
              businessId: rid,
              env: 'live',
              status: {
                in: [
                  'Unmatched Provider',
                  'Unmatched Noxtill',
                  'Amount Mismatch',
                ],
              },
            },
          }),
        ]);
    const badge = (k: string) =>
      k === 'recovery'
        ? rc || null
        : k === 'refunds'
          ? rf || null
          : k === 'disputes'
            ? dsp
              ? `${dsp} due`
              : null
            : k === 'reconciliation'
              ? rec || null
              : null;
    const fresh = F.partial
      ? {
          label: F.t,
          bg: '#EFF8FF',
          bd: '#D1E9FF',
          fg: '#175CD3',
          dot: '#2E90FA',
        }
      : stale
        ? {
            label: F.t,
            bg: '#FEF6E7',
            bd: '#FDE3B3',
            fg: '#B54708',
            dot: '#F79009',
          }
        : {
            label: F.t,
            bg: '#F7FCF9',
            bd: '#D1F2DF',
            fg: '#0E8442',
            dot: '#12A150',
          };
    const a = d.a;
    const H: Record<string, Btn[]> = {
      overview: [
        btn('ai', 'Ask AI'),
        btn('newreq', 'Create Payment Request', 'primary', !a.request),
      ],
      transactions: [btn('export', 'Export', 'ghost', !a.export)],
      requests: [btn('newreq', '+ New Request', 'primary', !a.request)],
      recovery: [btn('ai', 'Ask AI')],
      refunds: [btn('ext:/orders/returns', 'Orders refunds')],
      disputes: [btn('ext:/helpdesk', 'Helpdesk cases')],
      payouts: [
        btn('ext:/finance/bank-feeds', 'Finance bank reconciliation'),
        btn('export', 'Export settlement report', 'ghost', !a.export),
      ],
      recurring: [],
      routing: [btn('rt-test', 'Test route', 'dark')],
      reconciliation: [btn('rcn-auto', 'Auto match', 'primary', !a.recon)],
      settings: [
        btn('ext:/integrations', 'Open Integrations'),
        btn('audit', 'View audit'),
      ],
    };
    // Banners: provider timing out, partial feeds, stale data — never the design's demo states.
    let banner: Record<string, unknown> | null = null;
    const timing = d.conns.find(
      (c) =>
        c.env === S.env &&
        c.lastErrorCode === 'PROVIDER_TIMEOUT' &&
        c.lastErrorAt &&
        Date.now() - c.lastErrorAt.getTime() < 15 * 60000,
    );
    const needsAuth = d.conns.find(
      (c) => c.env === S.env && c.status === 'Connection Required',
    );
    const stripeConn = d.conns.find(
      (c) =>
        c.provider === 'stripe' &&
        c.env === S.env &&
        c.status !== 'Disconnected',
    );
    if (stripeConn && !this.stripe.configured(S.env))
      banner = {
        t: `Stripe is connected, but Noxtill can’t reach it in ${S.env} mode`,
        d: `This Noxtill server has no Stripe ${S.env === 'test' ? 'test-mode' : 'live'} secret key configured, so the account’s charges, payouts, balances and disputes don’t sync and no payment action can be sent. Cash and counter payments below are complete.`,
        bg: '#FEF6E7',
        bd: '#FDE3B3',
        fg: '#B54708',
        acts: [{ k: 'fresh', t: 'Provider health' }],
      };
    else if (stripeConn && !stripeConn.writeEnabled)
      banner = {
        t: 'Stripe is connected read-only',
        d: 'It was connected before Payments & Billing asked for payment access. Reconnect Stripe in Integrations to take payment links, capture, refund and answer disputes; until then its data is read-only.',
        bg: '#EFF8FF',
        bd: '#D1E9FF',
        fg: '#175CD3',
        acts: [{ k: 'ext:/integrations', t: 'Open Integrations' }],
      };
    else if (timing)
      banner = {
        t: `${this.data.provName(timing.provider)} is timing out`,
        d: `${this.data.provName(timing.provider)} write calls aren’t being confirmed. Affected refunds, captures and retries go to “Provider Unknown” — never “Succeeded”. Retrying reuses the same idempotency key, so nothing is charged twice.`,
        bg: '#FEF3F2',
        bd: '#FDD9D6',
        fg: '#B42318',
        acts: [{ k: 'fresh', t: 'Provider health' }],
      };
    else if (needsAuth)
      banner = {
        t: `${this.data.provName(needsAuth.provider)} needs to be reconnected`,
        d: 'The provider refused Noxtill’s access. Its balances, payouts and disputes stop updating until it is reconnected in Integrations; nothing shows as zero in the meantime.',
        bg: '#FEF3F2',
        bd: '#FDD9D6',
        fg: '#B42318',
        acts: [{ k: 'ext:/integrations', t: 'Open Integrations' }],
      };
    else if (F.partial)
      banner = {
        t: 'Some provider data is partial',
        d: `${F.names.join(', ')} ${F.names.length > 1 ? 'feeds are' : 'feed is'} behind or failed on the last sync. Affected payouts and balances show “Partial”, never zero.`,
        bg: '#EFF8FF',
        bd: '#D1E9FF',
        fg: '#175CD3',
        acts: [
          { k: 'refresh', t: 'Retry' },
          { k: 'fresh', t: 'Provider health' },
        ],
      };
    else if (stale)
      banner = {
        t: 'Provider data may be out of date',
        d: `Last successful sync was ${Math.round(F.m)}m ago. Values are marked Stale until refreshed.`,
        bg: '#FEF6E7',
        bd: '#FDE3B3',
        fg: '#B54708',
        acts: [{ k: 'refresh', t: 'Refresh' }],
      };
    else if (S.env === 'test' && !this.data.conn(d, 'stripe', 'test'))
      banner = {
        t: 'Test mode needs a Stripe test-mode connection',
        d: 'Test mode uses your Stripe account’s sandbox. Connect “Stripe — test mode” in Integrations to try payment links, refunds and disputes without real money.',
        bg: '#FEF6E7',
        bd: '#FDE3B3',
        fg: '#B54708',
        acts: [{ k: 'ext:/integrations', t: 'Open Integrations' }],
      };
    return {
      hdr: { title: T[3], sub: T[4], icon: T[5] },
      envB: test
        ? { t: '◆ TEST MODE', bg: '#FEF6E7', fg: '#B54708', bd: '#F79009' }
        : { t: '● LIVE', bg: '#ECFDF3', fg: '#0E8442', bd: '#12A150' },
      testBand: test,
      hdrSels,
      hdrActs: H[S.tab] ?? [],
      tabs: TABS.map((t) => ({
        k: t[0],
        label: t[1],
        path: t[2],
        cur: t[0] === S.tab ? 'page' : null,
        fw: t[0] === S.tab ? 800 : 600,
        fg: t[0] === S.tab ? '#0F172A' : '#667085',
        bar: t[0] === S.tab ? (test ? '#F79009' : '#12A150') : 'transparent',
        badge: test ? null : badge(t[0]),
      })),
      fresh,
      banner,
      roleLabel: `${a.roleLabel} · ${a.name}`,
      screenLabel: `${String(TABS.findIndex((t) => t[0] === S.tab) + 1).padStart(2, '0')} ${T[3]}`,
    };
  }

  // ── screens ───────────────────────────────────────────────────────────

  async screen(a: PayActor, s: Scope) {
    // Noxtill's own records are projected at most every 5 minutes between scheduled runs.
    const pre = await this.ctx.ensure(a.rootId);
    if (
      !pre.projectedAt ||
      Date.now() - pre.projectedAt.getTime() > 5 * 60_000
    ) {
      await this.stripe.refreshConnections(a.rootId);
      await this.ledger.project(a.rootId);
    }
    const d = await this.data.load(a, s);
    const st = await this.db.paySettings.findUnique({
      where: { businessId: a.rootId },
    });
    const head = await this.header(d, st?.projectedAt ?? null);
    if (s.tab === 'settings')
      return {
        ...head,
        isSettings: true,
        generic: false,
        rows: [],
        se: await this.vSettings(d, null),
      };
    const fn: Record<string, (d: Data) => Promise<unknown[]>> = {
      overview: (x) => this.vOverview(x),
      transactions: (x) => this.vTransactions(x),
      requests: (x) => this.vRequests(x),
      recovery: (x) => this.vRecovery(x),
      refunds: (x) => this.vRefunds(x),
      disputes: (x) => this.vDisputes(x),
      payouts: (x) => this.vPayouts(x),
      recurring: (x) => this.vRecurring(x),
      routing: (x) => this.vRouting(x),
      reconciliation: (x) => this.vReconciliation(x),
    };
    const rows = await (fn[s.tab] ?? fn.overview)(d);
    return { ...head, isSettings: false, generic: true, rows, se: null };
  }

  // ===== metrics (KPI cards + metric drawer share this)
  ovPass(
    d: Data,
    t: PayTransaction,
    open: Set<string>,
    settle: (t: PayTransaction) => string,
  ) {
    const f = d.s.f.ov ?? {};
    const { lo, hi } = this.amtRange(d);
    const v = this.data.rep(t) ?? num(t.amount);
    if (f.method && t.method !== f.method) return false;
    if (f.ch && t.channel !== f.ch) return false;
    if (f.seg && !this.data.segOf(d, t.customerId).includes(f.seg))
      return false;
    if (f.amt === 'lt' && v >= lo) return false;
    if (f.amt === 'mid' && (v < lo || v > hi)) return false;
    if (f.amt === 'gt' && v <= hi) return false;
    if (f.settle && settle(t) !== f.settle) return false;
    if (f.st && this.data.dispSt(t, open) !== f.st) return false;
    return true;
  }

  async metrics(d: Data) {
    const open = await this.openDisputeTx(d);
    const sm = await this.settleMaps(d);
    const settle = (t: PayTransaction) => this.data.settleSt(t, sm.po, sm.pend);
    const L = this.data.txs(d).filter((t) => this.ovPass(d, t, open, settle));
    const P = d.s.period;
    const prev = this.data
      .txs(d, true)
      .filter(
        (t) =>
          t.occurredAt.getTime() < Date.now() - P * 86400000 &&
          t.occurredAt.getTime() >= Date.now() - 2 * P * 86400000 &&
          this.ovPass(d, t, open, settle),
      );
    const succ = L.filter((t) => t.status === 'Succeeded');
    const fail = L.filter((t) => t.status === 'Failed');
    const pS = prev.filter((t) => t.status === 'Succeeded');
    const pF = prev.filter((t) => t.status === 'Failed');
    const g = this.data.sum(succ, 'captured');
    const fe = this.data.sum(
      succ.filter((t) => t.fee != null),
      'fee',
    );
    const feePending = succ.filter((t) => t.feeSource === 'pending').length;
    const rf = this.data.sum(L, 'refunded');
    const openD = await this.db.payDispute.findMany({
      where: {
        businessId: d.a.rootId,
        env: d.s.env,
        status: { in: DISPUTE_OPEN },
        txId: { in: L.map((t) => t.id) },
      },
    });
    const snaps = await this.snapshots(d);
    const hasPrev = prev.length > 0;
    const fx = (n: number) => this.missFx(n);
    const short = (v: number) => d.fmt.short(v);
    const noBal = !snaps.length;
    const partialBal = snaps.some((x) => x.partial);
    const M: Record<
      string,
      {
        l: string;
        v: string;
        def: string;
        list: PayTransaction[];
        sub: string;
        filter?: Record<string, string>;
        fg?: string | null;
        est?: boolean;
      }
    > = {
      gross: {
        l: 'Gross Collected',
        v: short(g.v),
        def: `Captured amount of successful payments in the period, before fees and refunds. Cash and counter payments come from Noxtill’s own records; card payments are provider-confirmed. Converted to ${d.base} with the rate stored on each payment.`,
        list: succ,
        sub:
          this.cmp(d, g.v, this.data.sum(pS, 'captured').v, hasPrev) +
          fx(g.miss),
        filter: { st: 'Succeeded' },
      },
      net: {
        l: 'Net Collected',
        v: d.a.fees ? short(g.v - fe.v - rf.v) : LOCK,
        def: 'Gross collected − provider fees − refunds. Operational figure only; Finance decides accounting treatment.',
        list: succ,
        sub: d.a.fees
          ? feePending
            ? `Partial — fees not reported for ${feePending} payment(s)`
            : this.cmp(
                d,
                g.v - fe.v - rf.v,
                this.data.sum(pS, 'captured').v -
                  this.data.sum(
                    pS.filter((t) => t.fee != null),
                    'fee',
                  ).v -
                  this.data.sum(prev, 'refunded').v,
                hasPrev,
              )
          : 'Fees restricted for your role',
        filter: { st: 'Succeeded' },
      },
      succ: {
        l: 'Successful Payments',
        v: String(succ.length),
        def: 'Payments whose success was recorded in Noxtill or confirmed by the provider (webhook or API). Links sent but not paid are excluded.',
        list: succ,
        sub: this.cmp(d, succ.length, pS.length, hasPrev),
        filter: { st: 'Succeeded' },
      },
      fail: {
        l: 'Failed Payments',
        v: String(fail.length),
        def: 'Payments a provider declined, blocked or timed out. Each has a recovery case. Cash can’t fail, so only provider payments appear here.',
        list: fail,
        sub: `${short(this.data.sum(fail).v)} at risk`,
        filter: { st: 'Failed' },
        fg: fail.length ? '#B42318' : null,
      },
      refund: {
        l: 'Refund Value',
        v: short(rf.v),
        def: 'Refunded amount on payments in the period — provider-confirmed for card payments, recorded at the counter for cash. Refunds still processing are not counted.',
        list: L.filter((t) => num(t.refunded) > 0),
        sub: `${L.filter((t) => num(t.refunded) > 0).length} payments · confirmed only`,
        filter: { flag: 'refund' },
      },
      disp: {
        l: 'Disputed Amount',
        v: short(openD.reduce((s, x) => s + num(x.amount), 0)),
        def: 'Amount under open provider disputes (needs response or under review).',
        list: L.filter((t) => open.has(t.id)),
        sub: `${openD.length} open disputes`,
        filter: { flag: 'dispute' },
        fg: openD.length ? '#B42318' : null,
      },
      pend: {
        l: 'Pending Settlements',
        v: noBal
          ? 'Not available'
          : short(snaps.reduce((s, x) => s + x.pending, 0)),
        def: 'Provider balance captured but not yet available for payout, as the provider reports it (balance API).',
        list: [],
        sub: noBal
          ? 'No provider balance API connected'
          : partialBal
            ? 'Partial — a balance feed is missing or has no FX rate'
            : `Across ${snaps.length} provider account(s)`,
        est: true,
      },
      avail: {
        l: 'Available Payout Balance',
        v: noBal
          ? 'Not available'
          : short(snaps.reduce((s, x) => s + x.available, 0)),
        def: 'Provider balance available for the next payout, as the provider reports it.',
        list: [],
        sub: noBal
          ? 'No provider balance API connected'
          : partialBal
            ? 'Partial — a balance feed is missing'
            : 'Provider-reported',
        est: true,
      },
      fees: {
        l: 'Provider Fees',
        v: d.a.fees ? short(fe.v) : LOCK,
        def: 'Fees providers reported on successful payments in the period. Payments whose fee hasn’t been reported are not estimated.',
        list: succ.filter((t) => t.provider !== 'manual'),
        sub: d.a.fees
          ? g.v
            ? `${((fe.v / g.v) * 100).toFixed(2)}% of gross${feePending ? ` · ${feePending} not reported yet` : ''}`
            : '—'
          : 'Restricted for your role',
      },
      rate: {
        l: 'Collection Success Rate',
        v:
          succ.length + fail.length
            ? d.fmt.pct(succ.length, succ.length + fail.length)
            : '—',
        def: 'Successful ÷ (successful + failed) payment attempts. Pending attempts are excluded until the provider decides.',
        list: [...succ, ...fail],
        sub: `${succ.length + fail.length} decided attempts${pF.length || pS.length ? ` · prior ${d.fmt.pct(pS.length, pS.length + pF.length)}` : ''}`,
        filter: {},
      },
    };
    return { M, L, open, settle, snaps, sm };
  }

  // ===== 1 Overview
  async vOverview(d: Data) {
    const S = d.s;
    const f = S.f.ov ?? {};
    const { M, L, open } = await this.metrics(d);
    const kpis = [
      'gross',
      'net',
      'succ',
      'fail',
      'refund',
      'disp',
      'pend',
      'avail',
      'fees',
      'rate',
    ].map((k) => {
      const m = M[k];
      return K(
        `m:${k}`,
        m.l,
        m.v,
        `${m.sub} · ${m.est ? 'Provider-reported' : 'Actual'}`,
        m.fg,
        m.fg ? '#F04438' : '#12A150',
      );
    });
    const anyConn = d.conns.some((c) => c.status !== 'Disconnected');
    if (!d.all.length)
      return [
        kpiRow(kpis),
        ...emptyRows(
          `No ${S.env === 'test' ? 'test' : 'live'} payments yet`,
          S.env === 'test'
            ? 'Test mode uses your Stripe sandbox (connect “Stripe — test mode” in Integrations). Create a test payment request to see the full lifecycle — test money never appears in live totals.'
            : anyConn
              ? 'Payments appear here as soon as a sale is paid, a deposit is captured, a credit payment is recorded or a provider confirms a charge.'
              : 'Cash and counter payments from Fast Sale, deposits and credit appear here automatically. Connect a payment provider through Integrations to take card payments and payment links.',
          [
            btn('newreq', 'Create Payment Request', 'primary', !d.a.request),
            btn(
              'env-toggle',
              S.env === 'test' ? 'Switch to Live' : 'Switch to Test mode',
            ),
            ...(anyConn ? [] : [btn('ext:/integrations', 'Open Integrations')]),
          ],
        ),
      ];
    const P = S.period;
    const nb = P <= 7 ? P : P <= 30 ? 10 : 13;
    const size = (P * 86400000) / nb;
    const now = Date.now();
    const colsT: { a: number; b: number; l: string }[] = [];
    for (let i = nb - 1; i >= 0; i--) {
      const inB = L.filter(
        (t) =>
          now - t.occurredAt.getTime() >= i * size &&
          now - t.occurredAt.getTime() < (i + 1) * size,
      );
      colsT.push({
        a: this.data.sum(
          inB.filter((t) => t.status === 'Succeeded'),
          'captured',
        ).v,
        b: this.data.sum(inB.filter((t) => t.status === 'Failed')).v,
        l: d.fmt.day(new Date(now - (i + 0.5) * size)),
      });
    }
    const mx = Math.max(1, ...colsT.map((c) => Math.max(c.a, c.b)));
    const trend = {
      legend: [
        { t: 'Collected', c: '#12A150' },
        { t: 'Failed', c: '#F04438' },
      ],
      note: `${d.base} reporting currency · ${nb} buckets`,
      aria: 'Collection trend: collected vs failed per bucket',
      cols: colsT.map((c) => ({
        l: c.l,
        tip: `${c.l}: collected ${d.fmt.short(c.a)}, failed ${d.fmt.short(c.b)}`,
        bars: [
          { h: `${Math.round((c.a / mx) * 100)}%`, c: '#12A150' },
          {
            h: `${Math.max(c.b ? 3 : 0, Math.round((c.b / mx) * 100))}%`,
            c: '#F04438',
          },
        ],
      })),
    };
    const ch = S.view.ovChart || 'funnel';
    const succ = L.filter((t) => t.status === 'Succeeded');
    const grp = (
      key: (t: PayTransaction) => string,
      list: PayTransaction[],
      fn?: (t: PayTransaction) => number,
    ) =>
      Object.entries(
        list.reduce<Record<string, number>>((o, t) => {
          const k2 = key(t);
          o[k2] = (o[k2] ?? 0) + (fn ? fn(t) : 1);
          return o;
        }, {}),
      ).sort((a, b) => b[1] - a[1]);
    const cases = await this.db.payRecoveryCase.findMany({
      where: { businessId: d.a.rootId, txId: { in: L.map((t) => t.id) } },
    });
    const refunds = await this.db.payRefund.findMany({
      where: { businessId: d.a.rootId, env: S.env },
    });
    const disputes = await this.db.payDispute.findMany({
      where: {
        businessId: d.a.rootId,
        env: S.env,
        status: { in: ['Needs Response', 'Under Review'] },
      },
    });
    const payouts = await this.db.payPayout.findMany({
      where: {
        businessId: d.a.rootId,
        env: S.env,
        status: { in: ['Pending', 'In Transit'] },
      },
      orderBy: { arrivalDate: 'asc' },
    });
    const charts: Record<string, [string, ReturnType<typeof mkBars>]> = {
      funnel: [
        'Payment status funnel',
        mkBars(
          [
            ['Attempted', L.length],
            [
              'Authorized',
              L.filter((t) => ['Authorized', 'Succeeded'].includes(t.status))
                .length,
            ],
            ['Captured', succ.length],
            [
              'Refunded (any)',
              L.filter((t) => num(t.refunded) > 0).length,
              '#6941C6',
            ],
            [
              'Disputed',
              L.filter((t) => open.has(t.id) || num(t.disputed) > 0).length,
              '#F04438',
            ],
          ],
          '#12A150',
        ),
      ],
      provider: [
        'Provider mix · gross',
        mkBars(
          grp(
            (t) => this.data.provName(t.provider),
            succ,
            (t) => this.data.rep(t, 'captured') ?? 0,
          ),
          '#12A150',
          (v) => d.fmt.short(v),
        ),
      ],
      method: [
        'Payment method mix · gross',
        mkBars(
          grp(
            (t) => t.method,
            succ,
            (t) => this.data.rep(t, 'captured') ?? 0,
          ),
          '#2E90FA',
          (v) => d.fmt.short(v),
        ),
      ],
      failure: [
        'Failure reason distribution',
        mkBars(
          Object.entries(
            cases.reduce<Record<string, number>>(
              (o, c) => ({ ...o, [c.category]: (o[c.category] ?? 0) + 1 }),
              {},
            ),
          ).sort((a, b) => b[1] - a[1]),
          '#F04438',
        ),
      ],
      pressure: [
        'Refund / dispute pressure',
        mkBars(
          [
            ['Refunded', this.data.sum(L, 'refunded').v, '#6941C6'],
            [
              'Refunds in flight',
              refunds
                .filter((r) => REFUND_IN_FLIGHT.includes(r.status))
                .reduce((s, r) => s + num(r.amount), 0),
              '#9E77ED',
            ],
            [
              'Approved, awaiting execution',
              refunds
                .filter((r) =>
                  ['Ready', 'Approval Required'].includes(r.status),
                )
                .reduce((s, r) => s + num(r.amount), 0),
              '#B692F6',
            ],
            [
              'Open disputes',
              disputes.reduce((s, x) => s + num(x.amount), 0),
              '#F04438',
            ],
          ],
          null,
          (v) => d.fmt.short(v),
        ),
      ],
      settle: [
        'Settlement timeline · next payouts',
        mkBars(
          payouts
            .filter(() => !S.prov || S.prov === 'stripe')
            .map(
              (p) =>
                [
                  `${this.data.provName('stripe')} · ${p.arrivalDate && p.arrivalDate.getTime() < Date.now() - d.pol.payout.delayHours * 3600000 ? 'overdue' : d.fmt.day(p.arrivalDate)}`,
                  num(p.amount),
                  p.arrivalDate &&
                  p.arrivalDate.getTime() <
                    Date.now() - d.pol.payout.delayHours * 3600000
                    ? '#F04438'
                    : '#2E90FA',
                ] as [string, number, string],
            ),
          null,
          (v) => d.fmt.short(v),
        ),
      ],
    };
    const chart = charts[ch] ?? charts.funnel;
    const ex = await this.exceptions(d);
    const tags = [...new Set([...d.custs.values()].flatMap((c) => c.tags))]
      .sort()
      .slice(0, 20);
    const { lo, hi } = this.amtRange(d);
    const views = await this.db.paySavedView.findMany({
      where: { businessId: d.a.rootId, userId: d.a.userId },
      orderBy: { name: 'asc' },
    });
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'ov-f',
          filters: {
            search: null,
            sels: [
              sel2('method', 'Method', f.method ?? '', [
                ['', 'Any method'],
                ...METHODS,
              ]),
              sel2('ch', 'Channel', f.ch ?? '', [
                ['', 'Any channel'],
                'POS',
                'Website',
                'Payment Link',
                'Customer Portal',
                'Recurring',
              ]),
              sel2('st', 'Payment status', f.st ?? '', [
                ['', 'Any status'],
                'Succeeded',
                'Pending',
                'Failed',
                'Authorized',
                'Refunded',
                'Partially Refunded',
                'Disputed',
              ]),
              sel2('seg', 'Customer segment', f.seg ?? '', [
                ['', tags.length ? 'Any segment' : 'No customer tags yet'],
                ...tags,
              ]),
              sel2('amt', 'Amount range', f.amt ?? '', [
                ['', 'Any amount'],
                ['lt', `Under ${d.fmt.money(lo)}`],
                ['mid', `${d.fmt.money(lo)} – ${d.fmt.money(hi)}`],
                ['gt', `Over ${d.fmt.money(hi)}`],
              ]),
              sel2('settle', 'Settlement', f.settle ?? '', [
                ['', 'Any settlement'],
                'Pending',
                'Settled',
                'Scheduled',
                'In Transit',
                'Paid out',
                'Not applicable (cash)',
              ]),
              sel2('__view', 'Saved view', '', [
                ['', views.length ? 'Saved views…' : 'No saved views yet'],
                ...views.map((v) => [v.id, v.name] as [string, string]),
              ]),
            ],
            nOn: this.nOn(f),
            count: `${L.length} payments in scope`,
          },
        }),
      ]),
      R('minmax(0,1.5fr) minmax(0,1fr)', [
        card({
          title: 'Collection trend',
          sub: `Collections vs failures · ${this.data.fresh(d, null).t}`,
          trend,
          acts: [btn('go:transactions', 'Open transactions')],
        }),
        card({
          id: 'ov-chart',
          title: chart[0],
          seg: seg(
            [
              ['funnel', 'Funnel'],
              ['provider', 'Providers'],
              ['method', 'Methods'],
              ['failure', 'Failures'],
              ['pressure', 'Refund/dispute'],
              ['settle', 'Settlement'],
            ],
            ch,
          ),
          bars:
            chart[1].length &&
            chart[1].some((b) => b.v !== '0' && b.v !== d.fmt.short(0))
              ? chart[1]
              : null,
          empty:
            chart[1].length &&
            chart[1].some((b) => b.v !== '0' && b.v !== d.fmt.short(0))
              ? null
              : {
                  t: 'Nothing in this view',
                  d:
                    ch === 'settle'
                      ? 'No upcoming provider payouts. Payouts appear once a connected provider settles card payments.'
                      : 'No records match the current scope.',
                  acts: [],
                },
          info:
            ch === 'settle' && !d.conns.some((c) => c.provider === 'stripe')
              ? 'Only Stripe reports payouts to Noxtill. Cash has no settlement; Square and PayPal are read-only imports without payout data.'
              : null,
        }),
      ]),
      R('minmax(0,1fr)', [
        card({
          id: 'ov-ex',
          title: 'Needs attention',
          sub: 'Critical exceptions across payments, refunds, disputes, payouts and reconciliation',
          acts: [
            btn('newreq', 'Create Payment Request', 'primary', !d.a.request),
            btn('go:recovery', 'Open Recovery'),
            btn('go:disputes', 'Review Disputes'),
            btn('go:payouts', 'View Payouts'),
          ],
          table: ex.length
            ? {
                hasActs: true,
                cols: cols([
                  'Provider',
                  'Entity',
                  'Amount',
                  'Issue',
                  'Status',
                  ['Age', '1'],
                  ['Owner', '1'],
                  'Recommended next action',
                ]),
                rows: ex.map((x) =>
                  row(
                    x.id,
                    [
                      cell({ t: this.data.provName(x.prov) }),
                      cell({ t: x.ent, s: x.entS, fw: 700, fg: '#101828' }),
                      x.amt == null
                        ? cell({ t: '—' })
                        : this.amtCell(d, x.amt, x.cur),
                      cell({ t: x.issue, mw: '260px' }),
                      stc(x.st),
                      cell({ t: d.fmt.ago(x.at), opt: '1' }),
                      cell({ t: x.owner ?? 'Unassigned', opt: '1' }),
                      cell({ t: x.next, fg: '#0E8442', fw: 700 }),
                    ],
                    ['Open', ...(x.more ?? [])],
                    [
                      x.issue,
                      `${this.data.provName(x.prov)} · ${x.ent}${x.amt == null ? '' : ` · ${d.fmt.money(x.amt, x.cur)}`}`,
                      [chip(x.st)],
                    ],
                  ),
                ),
              }
            : null,
          empty: ex.length
            ? null
            : {
                t: 'Nothing needs attention',
                d: 'No failed high-value collections, delayed payouts, unmatched items, refund failures or dispute deadlines in scope.',
                acts: [],
              },
        }),
      ]),
    ];
  }

  async exceptions(d: Data) {
    const S = d.s;
    const pol = d.pol;
    const out: {
      id: string;
      sev: number;
      prov: string;
      ent: string;
      entS: string;
      amt: number | null;
      cur: string;
      issue: string;
      st: string;
      at: Date;
      owner: string | null;
      next: string;
      more?: string[];
    }[] = [];
    const vis = new Map(this.data.txs(d, true).map((t) => [t.id, t]));
    const owners = await this.ctx.userNames([]);
    void owners;
    const cases = await this.db.payRecoveryCase.findMany({
      where: {
        businessId: d.a.rootId,
        txId: { in: [...vis.keys()] },
        status: { notIn: [...RC_OPEN, 'Paused'] },
      },
    });
    const caseOwners = await this.ctx.userNames(cases.map((c) => c.ownerId));
    for (const c of cases) {
      const t = vis.get(c.txId)!;
      const v = this.data.rep(t) ?? num(t.amount);
      if (
        v >= pol.risk.manualReviewAbove ||
        c.recoverability === 'Manual review'
      )
        out.push({
          id: `ex:rcv:${c.id}`,
          sev: 3,
          prov: t.provider,
          ent: t.number,
          entS: this.data.srcLabel(t),
          amt: num(t.amount),
          cur: t.currency,
          issue: `Failed ${v >= pol.risk.manualReviewAbove ? 'high-value ' : ''}collection · ${c.category}`,
          st: c.status === 'Scheduled' ? 'Failed' : c.status,
          at: t.occurredAt,
          owner: c.ownerId ? (caseOwners.get(c.ownerId) ?? null) : null,
          next:
            c.recoverability === 'Soft'
              ? 'Retry when allowed'
              : c.recoverability === 'Manual review'
                ? 'Review provider code'
                : 'Ask customer for new method',
        });
    }
    if (S.env === 'live') {
      const delayed = await this.db.payPayout.findMany({
        where: {
          businessId: d.a.rootId,
          env: 'live',
          OR: [
            { status: 'Failed' },
            {
              status: { in: ['Pending', 'In Transit'] },
              arrivalDate: {
                lt: new Date(Date.now() - pol.payout.delayHours * 3600000),
              },
            },
          ],
        },
      });
      for (const p of delayed)
        out.push({
          id: `ex:po:${p.id}`,
          sev: 3,
          prov: 'stripe',
          ent: p.providerPayoutId,
          entS: p.status,
          amt: num(p.amount),
          cur: p.currency,
          issue:
            p.status === 'Failed'
              ? `Payout failed · ${p.failureCode ?? 'provider reported failure'}`
              : `Delayed payout — expected ${d.fmt.rel(p.arrivalDate)}`,
          st: p.status === 'Failed' ? 'Failed' : 'Delayed',
          at: p.arrivalDate ?? p.providerCreatedAt,
          owner: null,
          next: 'Refresh provider status',
        });
      const recon = await this.db.payReconItem.findMany({
        where: {
          businessId: d.a.rootId,
          env: 'live',
          status: {
            in: ['Unmatched Provider', 'Unmatched Noxtill', 'Amount Mismatch'],
          },
        },
      });
      for (const r of recon)
        out.push({
          id: `ex:rec:${r.id}`,
          sev: 2,
          prov: 'stripe',
          ent: r.providerRef.startsWith('nx:')
            ? (vis.get(r.txId ?? '')?.number ?? r.providerRef)
            : r.providerRef,
          entS: r.batchRef ?? 'Not in a payout yet',
          amt:
            r.providerGross != null
              ? num(r.providerGross)
              : num(r.noxtillGross),
          cur: r.currency,
          issue:
            r.status === 'Unmatched Provider'
              ? 'Unmatched provider transaction'
              : r.status === 'Unmatched Noxtill'
                ? 'Noxtill payment missing at provider'
                : `Amount mismatch ${d.fmt.money(Math.abs(num(r.providerGross) - num(r.noxtillGross)), r.currency)}`,
          st: r.status,
          at: r.occurredAt,
          owner: null,
          next: 'Resolve in Reconciliation',
        });
      const snaps = await this.snapshots(d);
      for (const s of snaps)
        if (
          s.available + s.pending > 0 &&
          (s.reserved / (s.available + s.pending)) * 100 > pol.payout.holdPct
        )
          out.push({
            id: `ex:hold:${s.c.id}`,
            sev: 2,
            prov: 'stripe',
            ent: 'Provider reserve',
            entS: `${((s.reserved / (s.available + s.pending)) * 100).toFixed(1)}% held`,
            amt: s.reserved,
            cur: d.base,
            issue: `Reserve above ${pol.payout.holdPct}% of balance`,
            st: 'Delayed',
            at: s.at ?? new Date(),
            owner: null,
            next: 'Review provider reserve',
          });
    }
    const refunds = await this.db.payRefund.findMany({
      where: {
        businessId: d.a.rootId,
        env: S.env,
        status: { in: ['Failed', 'Manual Review', 'Provider Unknown'] },
      },
    });
    for (const r of refunds) {
      const t = r.txId ? vis.get(r.txId) : null;
      if (r.txId && !t) continue;
      out.push({
        id: `ex:rf:${r.id}`,
        sev: 3,
        prov: t?.provider ?? 'manual',
        ent: r.number,
        entS: r.returnId
          ? 'Orders return'
          : r.origin === 'provider'
            ? 'Issued at provider'
            : 'Manual',
        amt: num(r.amount),
        cur: r.currency,
        issue: `Refund execution ${r.status === 'Failed' ? `failed · ${r.failureCode ?? ''}` : r.status === 'Provider Unknown' ? 'state unknown — provider timeout' : `needs manual review · ${r.failureCode ?? ''}`}`,
        st: r.status,
        at: r.updatedAt,
        owner: null,
        next:
          r.status === 'Provider Unknown' ? 'Refresh status' : 'Review & retry',
      });
    }
    const due = await this.db.payDispute.findMany({
      where: {
        businessId: d.a.rootId,
        env: S.env,
        status: 'Needs Response',
        dueBy: { lte: new Date(Date.now() + pol.disputes.warnDays * 86400000) },
      },
    });
    const dOwners = await this.ctx.userNames(due.map((x) => x.ownerId));
    for (const x of due)
      out.push({
        id: `ex:dsp:${x.id}`,
        sev: 4,
        prov: 'stripe',
        ent: x.providerDisputeId,
        entS: x.reason,
        amt: num(x.amount),
        cur: x.currency,
        issue: `Dispute evidence due ${d.fmt.rel(x.dueBy)} (${d.biz.timezone})`,
        st: 'Needs Response',
        at: x.openedAt,
        owner: x.ownerId ? (dOwners.get(x.ownerId) ?? null) : null,
        next: 'Complete evidence & submit',
      });
    for (const t of vis.values())
      if (
        ['Pending Verification', 'Pending', 'Provider Unknown'].includes(
          t.status,
        ) &&
        Date.now() - t.occurredAt.getTime() > 60 * 60000 &&
        t.provider !== 'manual'
      )
        out.push({
          id: `ex:tx:${t.id}`,
          sev: 2,
          prov: t.provider,
          ent: t.number,
          entS: this.data.srcLabel(t),
          amt: num(t.amount),
          cur: t.currency,
          issue: 'Provider hasn’t confirmed this payment after an hour',
          st: t.status,
          at: t.occurredAt,
          owner: null,
          next: 'Refresh provider state',
        });
    for (const c of d.conns.filter(
      (x) =>
        x.env === S.env &&
        ['Degraded', 'Connection Required'].includes(x.status),
    ))
      out.push({
        id: `ex:prov:${c.id}`,
        sev: 3,
        prov: c.provider,
        ent: `${this.data.provName(c.provider)} connection`,
        entS: c.lastErrorCode ?? 'Feed delayed',
        amt: null,
        cur: d.base,
        issue: `Provider ${c.status === 'Degraded' ? 'degraded — calls failing or timing out' : 'needs reconnecting'}`,
        st: c.status,
        at: c.lastErrorAt ?? c.updatedAt,
        owner: null,
        next: 'Open provider health',
      });
    return out.sort((a, b) => b.sev - a.sev || b.at.getTime() - a.at.getTime());
  }

  // ===== 2 Transactions
  async txList(d: Data) {
    const f = d.s.f.tx ?? {};
    const q = (f.q ?? '').trim().toLowerCase();
    const open = await this.openDisputeTx(d);
    const sm = await this.settleMaps(d);
    const { lo, hi } = this.amtRange(d);
    const L = this.data.txs(d).filter((t) => {
      const v = this.data.rep(t) ?? num(t.amount);
      const settle = this.data.settleSt(t, sm.po, sm.pend);
      return (
        (!q ||
          [
            t.number,
            t.providerChargeId ?? '',
            t.providerIntentId ?? '',
            this.data.cname(d, t.customerId),
            t.sourceRef ?? '',
            t.requestId ?? '',
            t.correlationId,
          ]
            .join(' ')
            .toLowerCase()
            .includes(q)) &&
        (!f.st || this.data.dispSt(t, open) === f.st) &&
        (!f.method || t.method === f.method) &&
        (!f.ch || t.channel === f.ch) &&
        (!f.settle ||
          (f.settle === 'settled'
            ? ['Paid out', 'In Transit', 'Scheduled', 'Settled'].includes(
                settle,
              )
            : settle === 'Pending')) &&
        (!f.flag ||
          (f.flag === 'refund'
            ? num(t.refunded) > 0
            : open.has(t.id) || num(t.disputed) > 0)) &&
        (!f.amt ||
          (f.amt === 'lt'
            ? v < lo
            : f.amt === 'mid'
              ? v >= lo && v <= hi
              : v > hi)) &&
        (!f.cur || t.currency === f.cur)
      );
    });
    L.sort((a, b) =>
      f.sort === 'amt'
        ? (this.data.rep(b) ?? num(b.amount)) -
          (this.data.rep(a) ?? num(a.amount))
        : f.sort === 'old'
          ? a.occurredAt.getTime() - b.occurredAt.getTime()
          : b.occurredAt.getTime() - a.occurredAt.getTime(),
    );
    return { L, open, sm };
  }

  txActs(d: Data, t: PayTransaction) {
    const o = ['Open', 'Copy reference', 'Open source entity'];
    if (t.status === 'Succeeded' && t.customerId) o.push('Send receipt');
    if (t.provider === 'stripe') o.push('Refresh provider state');
    if (t.status === 'Authorized' && d.a.refund) o.push('Capture');
    if (t.status === 'Failed') o.push('Open recovery');
    return o;
  }

  async vTransactions(d: Data) {
    const S = d.s;
    const f = S.f.tx ?? {};
    const base = this.data.txs(d);
    const { L, open, sm } = await this.txList(d);
    const adv = S.view.txCols === 'adv';
    const fees = d.a.fees;
    const succ = base.filter((t) => t.status === 'Succeeded');
    const smv = this.data.sum(succ, 'captured');
    const feeRows = succ.filter(
      (t) => t.provider !== 'manual' && t.fee != null,
    );
    const kpis = [
      K(
        'm:gross',
        'Total Volume',
        d.fmt.short(smv.v),
        `${base.length} attempts${this.missFx(smv.miss)}`,
        null,
        '#12A150',
      ),
      K(
        'tf:Succeeded',
        'Succeeded',
        succ.length,
        d.fmt.short(smv.v),
        null,
        '#12A150',
      ),
      K(
        'tf:Pending',
        'Pending',
        base.filter((t) =>
          [
            'Pending',
            'Pending Verification',
            'Authorized',
            'Provider Unknown',
          ].includes(t.status),
        ).length,
        'Awaiting provider or capture',
        null,
        '#F79009',
      ),
      K(
        'tf:Failed',
        'Failed',
        base.filter((t) => t.status === 'Failed').length,
        d.fmt.short(this.data.sum(base.filter((t) => t.status === 'Failed')).v),
        '#B42318',
        '#F04438',
      ),
      K(
        'tf:refund',
        'Refunded',
        base.filter((t) => num(t.refunded) > 0).length,
        `${d.fmt.short(this.data.sum(base, 'refunded').v)} confirmed`,
        null,
        '#6941C6',
      ),
      K(
        'tf:dispute',
        'Disputed',
        base.filter((t) => open.has(t.id) || num(t.disputed) > 0).length,
        'Any dispute state',
        null,
        '#F04438',
      ),
      K(
        'm:fees',
        'Average Fee',
        fees
          ? feeRows.length
            ? d.fmt.money(this.data.sum(feeRows, 'fee').v / feeRows.length)
            : '—'
          : LOCK,
        fees
          ? feeRows.length
            ? 'Per provider payment with a reported fee'
            : 'No provider fees reported yet'
          : 'Restricted for your role',
        null,
        '#98A2B3',
      ),
    ];
    if (!base.length)
      return [
        kpiRow(kpis),
        ...emptyRows(
          `No ${S.env} transactions in this scope`,
          'Change the date range, branch or provider — or switch Live/Test.',
        ),
      ];
    const pg = this.paged(d, 'transactions', L);
    const colsList: (string | [string, string?])[] = [
      'Transaction ID',
      'Customer / Reference',
      'Provider',
      ['Method', '1'],
      'Gross',
      'Status',
      ['Created', '1'],
      'Settlement',
      ...(adv
        ? [
            'External ID',
            'Channel',
            'Branch / Store',
            'Fee',
            'Net',
            'Currency / FX',
            'Authorization',
            'Capture',
            'Refunded',
            'Dispute',
            'Initiated by',
            'Correlation',
          ]
        : []),
    ];
    const dispMap = new Map(
      (
        await this.db.payDispute.findMany({
          where: { txId: { in: pg.rows.map((t) => t.id) } },
        })
      ).map((x) => [x.txId, x.status]),
    );
    const rows = pg.rows.map((t) => {
      const st = this.data.dispSt(t, open);
      const net =
        t.fee == null ? null : num(t.captured) - num(t.fee) - num(t.refunded);
      return row(
        t.id,
        [
          cell({
            t: t.number,
            fw: 800,
            fg: '#101828',
            ff: 'ui-monospace,monospace',
            s: t.env === 'test' ? 'TEST' : '',
          }),
          cell({
            t: this.data.cname(d, t.customerId),
            s: this.data.srcLabel(t),
          }),
          cell({ t: this.data.provName(t.provider) }),
          cell({ t: t.method, opt: '1' }),
          this.amtCell(
            d,
            num(t.amount),
            t.currency,
            t.currency !== d.base
              ? t.reportAmount != null
                ? `≈ ${d.fmt.money(num(t.reportAmount))}`
                : 'No FX rate'
              : '',
          ),
          stc(st),
          cell({ t: d.fmt.dtm(t.occurredAt), opt: '1' }),
          cell({ t: this.data.settleSt(t, sm.po, sm.pend) }),
          ...(adv
            ? [
                cell({
                  t: t.providerChargeId ?? '—',
                  ff: 'ui-monospace,monospace',
                }),
                cell({ t: t.channel }),
                cell({ t: this.data.brName(d, t.branchId) }),
                cell({
                  t: fees
                    ? t.fee == null
                      ? 'Not reported'
                      : d.fmt.money(num(t.fee), t.currency)
                    : LOCK,
                }),
                cell({
                  t: fees
                    ? net == null
                      ? '—'
                      : d.fmt.money(net, t.currency)
                    : LOCK,
                }),
                cell({
                  t:
                    t.currency +
                    (t.fxRate && t.currency !== d.base
                      ? ` @ ${num(t.fxRate)}`
                      : t.currency !== d.base
                        ? ' · FX missing'
                        : ''),
                }),
                cell({ t: t.authStatus }),
                cell({ t: t.captureStatus }),
                cell({
                  t: num(t.refunded)
                    ? d.fmt.money(num(t.refunded), t.currency)
                    : '—',
                }),
                cell({ t: dispMap.get(t.id) ?? '—' }),
                cell({ t: t.initiatedBy }),
                cell({ t: t.correlationId, ff: 'ui-monospace,monospace' }),
              ]
            : []),
        ],
        this.txActs(d, t),
        [
          `${t.number} · ${d.fmt.money(num(t.amount), t.currency)}`,
          `${this.data.cname(d, t.customerId)} · ${this.data.provName(t.provider)} · ${d.fmt.dtm(t.occurredAt)}`,
          [chip(st)],
        ],
      );
    });
    const curs = [...new Set(d.all.map((t) => t.currency))];
    const { lo, hi } = this.amtRange(d);
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'tx',
          seg: seg(
            [
              ['def', 'Default columns'],
              ['adv', 'Advanced columns'],
            ],
            adv ? 'adv' : 'def',
          ),
          filters: {
            search:
              'Search transaction ID, provider ID, customer, order, invoice, booking, reference',
            q: f.q ?? '',
            sels: [
              sel2('st', 'Status', f.st ?? '', [
                ['', 'Any status'],
                'Succeeded',
                'Pending',
                'Pending Verification',
                'Authorized',
                'Failed',
                'Refunded',
                'Partially Refunded',
                'Disputed',
                'Cancelled',
              ]),
              sel2('method', 'Method', f.method ?? '', [
                ['', 'Any method'],
                ...METHODS,
              ]),
              sel2('ch', 'Channel', f.ch ?? '', [
                ['', 'Any channel'],
                'POS',
                'Website',
                'Payment Link',
                'Customer Portal',
                'Recurring',
              ]),
              sel2('settle', 'Settlement', f.settle ?? '', [
                ['', 'Settled or not'],
                ['settled', 'Settled'],
                ['unsettled', 'Unsettled'],
              ]),
              sel2('flag', 'Refund / dispute', f.flag ?? '', [
                ['', 'Has refund / dispute'],
                ['refund', 'Has refund'],
                ['dispute', 'Has dispute'],
              ]),
              sel2('amt', 'Amount', f.amt ?? '', [
                ['', 'Any amount'],
                ['lt', `Under ${d.fmt.money(lo)}`],
                ['mid', `${d.fmt.money(lo)} – ${d.fmt.money(hi)}`],
                ['gt', `Over ${d.fmt.money(hi)}`],
              ]),
              sel2('cur', 'Currency', f.cur ?? '', [
                ['', 'Any currency'],
                ...curs,
              ]),
              sel2('sort', 'Sort', f.sort ?? '', [
                ['', 'Newest first'],
                ['old', 'Oldest first'],
                ['amt', 'Largest amount'],
              ]),
            ],
            nOn: this.nOn(f, ['sort', 'q']) ?? (f.q ? 1 : null),
            count: `${L.length} transactions`,
          },
          table: L.length
            ? {
                sel: true,
                allOn: false,
                hasActs: true,
                cols: cols(colsList),
                rows,
              }
            : null,
          pager: pg.pager,
          empty: L.length
            ? null
            : {
                t: 'No transactions match',
                d: 'Try a different search or clear filters.',
                acts: [btn('clear:tx', 'Clear filters', 'primary')],
              },
          info: `Card numbers, CVV, provider secrets and payment tokens never reach this screen — only brand and last four.${this.data.sum(succ, 'captured').miss ? ` ${this.data.sum(succ, 'captured').miss} payment(s) have no stored FX rate, so they are excluded from ${d.base} totals (not counted as zero).` : ''}`,
        }),
      ]),
    ];
  }

  // ===== 3 Payment requests
  async vRequests(d: Data) {
    const S = d.s;
    const v = S.view.rqView || 'list';
    const f = S.f.rq ?? {};
    const where = {
      businessId: d.a.rootId,
      env: S.env,
      ...(d.a.ownOnly ? { createdById: d.a.userId } : {}),
      ...(d.a.branches ? { branchId: { in: d.a.branches } } : {}),
    };
    const all = await this.db.payRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    const open = all.filter((r) => REQUEST_OPEN.includes(r.status));
    const sent = all.filter((r) => r.status !== 'Draft');
    const paid = all.filter((r) => r.status === 'Paid');
    const outAmt = open
      .filter((r) => r.amountType === 'Fixed')
      .reduce((s, r) => s + num(r.amount) - num(r.amountPaid), 0);
    const kpis = [
      K(
        'rq:open',
        'Open Requests',
        open.length,
        'Open, sent, viewed or part-paid',
        null,
        '#2E90FA',
      ),
      K(
        'rq:Paid',
        'Paid',
        paid.length,
        `${d.fmt.short(paid.reduce((s, r) => s + num(r.amountPaid), 0))} confirmed`,
        null,
        '#12A150',
      ),
      K(
        'rq:Expired',
        'Expired',
        all.filter((r) => r.status === 'Expired').length,
        'Captured payments are never reversed',
        null,
        '#98A2B3',
      ),
      K(
        'rq:out',
        'Amount Outstanding',
        d.fmt.short(outAmt),
        open.some((r) => r.amountType === 'Flexible')
          ? 'Excludes flexible-amount requests'
          : 'Fixed-amount requests',
        null,
        '#F79009',
      ),
      K(
        'rq:conv',
        'Conversion Rate',
        d.fmt.pct(
          paid.length + all.filter((r) => r.status === 'Partially Paid').length,
          sent.length,
        ),
        'Paid or part-paid ÷ sent',
        null,
        '#12A150',
      ),
    ];
    const sg = seg(
      [
        ['list', 'Requests', all.length],
        ['tpl', 'Templates', TEMPLATES.length],
        ['act', 'Request activity'],
      ],
      v,
    );
    if (v === 'tpl')
      return [
        kpiRow(kpis),
        R('minmax(0,1fr)', [
          card({
            id: 'rq',
            seg: sg,
            title: 'Templates',
            sub: 'Start a request with sensible defaults. Amounts and recipients are always confirmed in the wizard.',
            qcards: TEMPLATES.map((t) => ({
              id: t.id,
              t: t.name,
              d: t.d,
              badge: t.link ?? 'No link',
              bbg: '#F2F4F7',
              bfg: '#344054',
              bg: '#fff',
              aria: `Use template ${t.name}`,
              stats: [
                { l: 'Amount', v: t.type, fg: '#101828' },
                { l: 'Expiry', v: `${t.exp} days`, fg: '#101828' },
              ],
            })),
            info: 'Templates never copy customer data or internal notes into the public link.',
          }),
        ]),
      ];
    if (v === 'act') {
      const ids = all.map((r) => r.id);
      const dels = await this.db.payRequestDelivery.findMany({
        where: { requestId: { in: ids } },
      });
      const pays = await this.db.payTransaction.findMany({
        where: { requestId: { in: ids } },
        select: {
          id: true,
          requestId: true,
          occurredAt: true,
          provider: true,
          captured: true,
          amount: true,
          currency: true,
          status: true,
        },
      });
      const names = await this.ctx.userNames(all.map((r) => r.createdById));
      const byId = new Map(all.map((r) => [r.id, r]));
      const ev = [
        ...all.map((r) => ({
          r,
          at: r.createdAt,
          t: 'Created',
          dd: `by ${names.get(r.createdById) ?? '—'}`,
        })),
        ...dels.map((x) => ({
          r: byId.get(x.requestId)!,
          at: x.sentAt,
          t: `Sent · ${x.channel}`,
          dd: x.status + (x.error ? ` · ${x.error}` : ''),
        })),
        ...all
          .filter((r) => r.lastViewedAt)
          .map((r) => ({
            r,
            at: r.lastViewedAt!,
            t: 'Viewed by customer',
            dd: `${r.viewCount} views`,
          })),
        ...pays.map((p) => ({
          r: byId.get(p.requestId!)!,
          at: p.occurredAt,
          t:
            p.status === 'Succeeded'
              ? `Payment ${p.provider === 'manual' ? 'recorded' : `confirmed by ${this.data.provName(p.provider)}`}`
              : `Payment ${p.status.toLowerCase()}`,
          dd: d.fmt.money(
            num(p.status === 'Succeeded' ? p.captured : p.amount),
            p.currency,
          ),
        })),
        ...all
          .filter((r) => r.status === 'Expired' && r.closedAt)
          .map((r) => ({
            r,
            at: r.closedAt!,
            t: 'Expired',
            dd: 'No captured payment reversed',
          })),
      ]
        .filter((e) => e.r)
        .sort((a, b) => b.at.getTime() - a.at.getTime())
        .slice(0, 40);
      return [
        kpiRow(kpis),
        R('minmax(0,1fr)', [
          card({
            id: 'rq-act',
            seg: sg,
            table: ev.length
              ? {
                  hasActs: false,
                  cols: cols(['When', 'Request', 'Event', 'Detail']),
                  rows: ev.map((e, i) =>
                    row(
                      `${e.r.id}|${i}`,
                      [
                        cell({ t: d.fmt.dtm(e.at) }),
                        cell({
                          t: e.r.number,
                          s: d.a.pii ? e.r.recipientName : 'Customer',
                          fw: 700,
                        }),
                        cell({ t: e.t }),
                        cell({ t: e.dd }),
                      ],
                      [],
                      [e.t, `${e.r.number} · ${d.fmt.dtm(e.at)}`, []],
                    ),
                  ),
                }
              : null,
            empty: ev.length
              ? null
              : {
                  t: 'No request activity yet',
                  d: 'Creating, sending, viewing and paying requests is logged here.',
                  acts: [],
                },
          }),
        ]),
      ];
    }
    const q = (f.q ?? '').trim().toLowerCase();
    const L = all.filter(
      (r) =>
        (!q ||
          [
            r.number,
            r.recipientName,
            r.description,
            r.reference ?? '',
            r.linkRef ?? '',
          ]
            .join(' ')
            .toLowerCase()
            .includes(q)) &&
        (!f.st ||
          (f.st === 'open'
            ? REQUEST_OPEN.includes(r.status)
            : r.status === f.st)),
    );
    const names = await this.ctx.userNames(L.map((r) => r.createdById));
    const firstDel = new Map(
      (
        await this.db.payRequestDelivery.findMany({
          where: { requestId: { in: L.map((r) => r.id) } },
          orderBy: { sentAt: 'asc' },
        })
      ).map((x) => [x.requestId, x.channel]),
    );
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'rq',
          seg: sg,
          filters: {
            search: 'Search request, customer, reference or linked entity',
            q: f.q ?? '',
            sels: [
              sel2('st', 'Status', f.st ?? '', [
                ['', 'Any status'],
                ['open', 'All open'],
                'Open',
                'Sent',
                'Viewed',
                'Partially Paid',
                'Paid',
                'Expired',
                'Cancelled',
              ]),
            ],
            nOn: this.nOn(f, ['q']) ?? (f.q ? 1 : null),
            count: `${L.length} requests`,
          },
          table: L.length
            ? {
                hasActs: true,
                cols: cols([
                  'Request',
                  'Customer',
                  ['Linked entity', '1'],
                  'Amount',
                  'Due',
                  ['Expiry', '1'],
                  'Status',
                  ['Sent', '1'],
                  ['Views', '1'],
                  'Paid',
                  ['Created by', '1'],
                ]),
                rows: L.map((r) => {
                  const overdue =
                    r.dueOn &&
                    r.dueOn.getTime() < Date.now() &&
                    REQUEST_OPEN.includes(r.status);
                  return row(
                    r.id,
                    [
                      cell({
                        t: r.number,
                        fw: 800,
                        fg: '#101828',
                        s: r.description,
                      }),
                      cell({
                        t: d.a.pii
                          ? r.recipientName
                          : `Customer ••${(r.customerId ?? '').slice(-3)}`,
                      }),
                      cell({
                        t: r.linkType
                          ? `${r.linkType} ${r.linkRef ?? ''}`
                          : '—',
                        s: this.requests.moduleOf(r.linkType),
                        opt: '1',
                      }),
                      r.amountType === 'Flexible'
                        ? cell({
                            t: 'Flexible',
                            s: 'Customer enters amount',
                            fw: 800,
                          })
                        : this.amtCell(
                            d,
                            num(r.amount),
                            r.currency,
                            r.allowPartial ? 'Partial payments allowed' : '',
                          ),
                      cell({
                        t: d.fmt.day(r.dueOn),
                        s: d.fmt.rel(r.dueOn),
                        fg: overdue ? '#B42318' : '#344054',
                      }),
                      cell({
                        t: d.fmt.day(r.expiresAt),
                        s: d.fmt.rel(r.expiresAt),
                        opt: '1',
                      }),
                      stc(r.status),
                      cell({
                        t: firstDel.get(r.id)?.split(' ')[0] ?? '—',
                        opt: '1',
                      }),
                      cell({ t: String(r.viewCount), opt: '1' }),
                      cell({
                        t: num(r.amountPaid)
                          ? d.fmt.money(num(r.amountPaid), r.currency)
                          : '—',
                        fw: 700,
                        fg: num(r.amountPaid) ? '#0E8442' : '#344054',
                      }),
                      cell({ t: names.get(r.createdById) ?? '—', opt: '1' }),
                    ],
                    this.reqActs(d, r),
                    [
                      `${r.number} · ${r.amountType === 'Flexible' ? 'Flexible' : d.fmt.money(num(r.amount), r.currency)}`,
                      `${d.a.pii ? r.recipientName : 'Customer'} · due ${d.fmt.day(r.dueOn)}`,
                      [chip(r.status)],
                    ],
                  );
                }),
              }
            : null,
          empty: L.length
            ? null
            : {
                t: all.length ? 'No requests match' : 'No payment requests yet',
                d: all.length
                  ? ''
                  : 'Send a secure payment link without creating a full invoice.',
                acts: [
                  btn(
                    all.length ? 'clear:rq' : 'newreq',
                    all.length ? 'Clear filters' : 'Create Payment Request',
                    'primary',
                    !all.length && !d.a.request,
                  ),
                ],
              },
          info: 'Public links use a signed opaque token (never a sequential ID). Only the token hash is stored. Money that arrives outside a provider is recorded against the request by your team.',
        }),
      ]),
    ];
  }

  reqActs(
    d: Data,
    r: { status: string; linkType: string | null; env: string },
  ) {
    const o = ['View', 'Public link preview'];
    if (d.a.request) {
      if (REQUEST_OPEN.includes(r.status))
        o.push(
          'Copy link',
          'Share',
          'QR code',
          ...(r.env === 'live' ? ['Record payment'] : []),
          'Expire',
        );
      o.push('Duplicate');
    }
    if (r.linkType) o.push('Open linked entity');
    return o;
  }

  // ===== 4 Recovery
  async vRecovery(d: Data) {
    const S = d.s;
    const v = S.view.rcView || 'queue';
    const f = S.f.rcv ?? {};
    const vis = new Map(this.data.txs(d, true).map((t) => [t.id, t]));
    const all = (
      await this.db.payRecoveryCase.findMany({
        where: { businessId: d.a.rootId, txId: { in: [...vis.keys()] } },
        orderBy: { lastAttemptAt: 'desc' },
      })
    ).filter((c) => vis.has(c.txId));
    const open = all.filter((c) => !RC_OPEN.includes(c.status));
    const val = (L: typeof all) =>
      L.reduce((s, c) => s + (this.data.rep(vis.get(c.txId)!) ?? 0), 0);
    const recov = all.filter((c) => c.status === 'Recovered');
    const recable = open.filter((c) =>
      ['Soft', 'Needs customer'].includes(c.recoverability),
    );
    const kpis = [
      K(
        'rc:today',
        'Failed Today',
        all.filter((c) => Date.now() - c.lastAttemptAt.getTime() < 86400000)
          .length,
        'Last 24 hours',
        null,
        '#F04438',
      ),
      K(
        'rc:risk',
        'Value at Risk',
        d.fmt.short(val(open)),
        `${open.length} open cases`,
        '#B42318',
        '#F04438',
      ),
      K(
        'rc:rec',
        'Recoverable',
        d.fmt.short(val(recable)),
        `${recable.length} soft / customer-fixable`,
        null,
        '#F79009',
      ),
      K(
        'rc:done',
        'Recovered',
        recov.length,
        `${d.fmt.short(val(recov))} confirmed`,
        null,
        '#12A150',
      ),
      K(
        'rc:rate',
        'Recovery Rate',
        d.fmt.pct(recov.length, all.length),
        'Recovered ÷ all cases',
        null,
        '#12A150',
      ),
      K(
        'rc:rep',
        'Repeated Failures',
        all.filter((c) => c.attempts >= 2).length,
        '2+ attempts',
        null,
        '#F79009',
      ),
    ];
    const sg = seg(
      [
        ['queue', 'Failure queue', open.length],
        ['clusters', 'Reason clusters'],
        ['sched', 'Retry schedule'],
        ['contact', 'Customer contact'],
        ['tl', 'Recovery timeline'],
      ],
      v,
    );
    if (!all.length)
      return [
        kpiRow(kpis),
        ...emptyRows(
          'No failed payments',
          d.conns.some((c) => c.provider === 'stripe')
            ? 'Nothing to recover in this scope. Cases open automatically when a provider declines a payment.'
            : 'Failed payments come from a connected card provider — cash can’t fail. Connect Stripe in Integrations to take card payments.',
        ),
      ];
    if (v === 'clusters') {
      const g: Record<string, { n: number; v: number }> = {};
      for (const c of all) {
        g[c.category] = g[c.category] ?? { n: 0, v: 0 };
        g[c.category].n++;
        g[c.category].v += this.data.rep(vis.get(c.txId)!) ?? 0;
      }
      return [
        kpiRow(kpis),
        R('minmax(0,1fr) minmax(0,1fr)', [
          card({
            id: 'rcv-c',
            seg: sg,
            title: 'By normalized reason · count',
            bars: mkBars(
              Object.entries(g)
                .map(([k, x]) => [k, x.n] as [string, number])
                .sort((a, b) => b[1] - a[1]),
              '#F04438',
            ),
          }),
          card({
            title: 'By normalized reason · value',
            bars: mkBars(
              Object.entries(g)
                .map(([k, x]) => [k, x.v] as [string, number])
                .sort((a, b) => b[1] - a[1]),
              '#F79009',
              (x) => d.fmt.short(x),
            ),
            info: 'Raw provider codes are kept separately on every case. Noxtill never invents a reason the provider did not send — unknown codes stay “Unknown provider code”.',
          }),
        ]),
      ];
    }
    let L = (
      v === 'sched'
        ? open.filter((c) => c.nextRetryAt)
        : v === 'contact' || v === 'tl'
          ? all
          : open
    ).filter(
      (c) => (!f.cat || c.category === f.cat) && (!f.st || c.status === f.st),
    );
    if (v === 'sched')
      L = L.sort((a, b) => a.nextRetryAt!.getTime() - b.nextRetryAt!.getTime());
    const owners = await this.ctx.userNames(L.map((c) => c.ownerId));
    const colsQ: (string | [string, string?])[] =
      v === 'contact'
        ? [
            'Transaction',
            'Customer',
            'Amount',
            'Failure reason',
            'Customer notified',
            'Via',
            'Recovery status',
          ]
        : v === 'tl'
          ? [
              'Transaction',
              'First failed',
              'Last attempt',
              'Attempts',
              'Next retry',
              'Recovery status',
            ]
          : [
              'Transaction',
              'Customer',
              'Amount',
              'Provider',
              ['Method', '1'],
              'Failure reason',
              ['First failed', '1'],
              ['Last attempt', '1'],
              'Attempts',
              'Next retry',
              ['Notified', '1'],
              'Recovery status',
              ['Linked entity', '1'],
              ['Owner', '1'],
            ];
    const rows = L.map((c) => {
      const t = vis.get(c.txId)!;
      const nx = c.nextRetryAt
        ? d.fmt.until(c.nextRetryAt)
        : c.retryable && c.recoverability === 'Soft'
          ? 'Manual'
          : 'Not scheduled';
      const reason = cell({ t: c.category, s: `Raw: ${c.rawCode}` });
      const notified = c.notifiedAt
        ? `Sent via Inbox · ${d.fmt.day(c.notifiedAt)}`
        : 'Not yet';
      const cells =
        v === 'contact'
          ? [
              cell({ t: t.number, fw: 800 }),
              cell({ t: this.data.cname(d, t.customerId) }),
              this.amtCell(d, num(t.amount), t.currency),
              reason,
              cell({ t: notified }),
              cell({
                t: c.notifyChannel
                  ? `Unified Inbox · ${c.notifyChannel}`
                  : 'Unified Inbox',
              }),
              stc(c.status),
            ]
          : v === 'tl'
            ? [
                cell({ t: t.number, fw: 800 }),
                cell({ t: d.fmt.dtm(c.firstFailedAt) }),
                cell({ t: d.fmt.dtm(c.lastAttemptAt) }),
                cell({ t: String(c.attempts) }),
                cell({ t: nx }),
                stc(c.status),
              ]
            : [
                cell({ t: t.number, fw: 800, fg: '#101828' }),
                cell({ t: this.data.cname(d, t.customerId) }),
                this.amtCell(d, num(t.amount), t.currency),
                cell({ t: this.data.provName(t.provider) }),
                cell({ t: t.method, opt: '1' }),
                reason,
                cell({ t: d.fmt.dtm(c.firstFailedAt), opt: '1' }),
                cell({ t: d.fmt.ago(c.lastAttemptAt), opt: '1' }),
                cell({ t: `${c.attempts} / ${d.pol.retry.maxAttempts}` }),
                cell({
                  t: nx,
                  fg: nx === 'Allowed now' ? '#0E8442' : '#344054',
                  fw: 700,
                }),
                cell({ t: notified, opt: '1' }),
                stc(c.status),
                cell({ t: this.data.srcLabel(t), opt: '1' }),
                cell({
                  t: c.ownerId ? (owners.get(c.ownerId) ?? '—') : 'Unassigned',
                  opt: '1',
                }),
              ];
      return row(c.id, cells, this.rcvActs(d, c), [
        `${t.number} · ${d.fmt.money(num(t.amount), t.currency)}`,
        `${c.category} · ${this.data.cname(d, t.customerId)}`,
        [chip(c.status)],
      ]);
    });
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'rcv',
          seg: sg,
          filters: {
            search: null,
            sels: [
              sel2('cat', 'Failure category', f.cat ?? '', [
                ['', 'Any reason'],
                'Soft decline',
                'Hard decline',
                'Insufficient funds',
                'Authentication required',
                'Expired method',
                'Provider unavailable',
                'Risk/policy block',
                'Timeout',
                'Invalid account',
                'Unknown provider code',
              ]),
              sel2('st', 'Recovery status', f.st ?? '', [
                ['', 'Any status'],
                'Scheduled',
                'Waiting on customer',
                'Manual Review',
                'Blocked',
                'Paused',
                'Recovered',
                'Unrecoverable',
              ]),
            ],
            nOn: this.nOn(f),
            count: `${L.length} cases`,
          },
          table: L.length ? { hasActs: true, cols: cols(colsQ), rows } : null,
          empty: L.length
            ? null
            : {
                t: 'No cases in this view',
                d: '',
                acts: [btn('clear:rcv', 'Clear filters', 'primary')],
              },
          info: 'Hard declines, risk blocks and already-paid sources are never retried. A retry needs a saved method (subscriptions) and reuses its idempotency key; a one-off decline gets a fresh secure link instead. Messages hand off to Unified Inbox.',
        }),
      ]),
    ];
  }

  rcvActs(d: Data, c: { status: string; retryable: boolean }) {
    const o = ['Open', 'Open transaction'];
    if (d.a.recover && !RC_OPEN.includes(c.status)) {
      if (c.retryable) o.push('Retry now');
      o.push(
        'Send customer update',
        'Request new payment method',
        c.status === 'Paused' ? 'Resume recovery' : 'Pause recovery',
        'Mark unrecoverable',
      );
    }
    o.push('Open customer', 'Open invoice / order');
    return o;
  }

  // ===== 5 Refunds
  async vRefunds(d: Data) {
    const S = d.s;
    const v = S.view.rfView || 'queue';
    const vis = new Map(this.data.txs(d, true).map((t) => [t.id, t]));
    const allR = await this.db.payRefund.findMany({
      where: { businessId: d.a.rootId, env: S.env },
      orderBy: { updatedAt: 'desc' },
    });
    const all = allR.filter(
      (r) => !r.txId || vis.has(r.txId) || (!d.a.branches && !d.a.ownOnly),
    );
    const ok = all.filter((r) => r.status === 'Succeeded');
    const lag = ok.filter(
      (r) => r.verifiedAt && r.submittedAt && r.origin === 'noxtill',
    );
    const awaiting = all.filter((r) =>
      ['Ready', 'Approval Required'].includes(r.status),
    );
    const kpis = [
      K(
        'rf:await',
        'Approved Awaiting Execution',
        awaiting.length,
        `${d.fmt.short(awaiting.reduce((s, r) => s + num(r.amount), 0))} approved in Orders`,
        null,
        '#2E90FA',
      ),
      K(
        'rf:proc',
        'Processing',
        all.filter((r) => REFUND_IN_FLIGHT.includes(r.status)).length,
        'Not yet provider-confirmed',
        null,
        '#F79009',
      ),
      K(
        'rf:ok',
        'Succeeded',
        ok.length,
        'Provider-verified or paid out at the counter',
        null,
        '#12A150',
      ),
      K(
        'rf:fail',
        'Failed',
        all.filter((r) => ['Failed', 'Manual Review'].includes(r.status))
          .length,
        'Orders refund stays pending',
        all.some((r) => r.status === 'Failed') ? '#B42318' : null,
        '#F04438',
      ),
      K(
        'rf:total',
        'Total Refunded',
        d.fmt.short(ok.reduce((s, r) => s + num(r.amount), 0)),
        'Confirmed',
        null,
        '#6941C6',
      ),
      K(
        'rf:lag',
        'Provider Recovery Lag',
        lag.length
          ? `${Math.round(lag.reduce((s, r) => s + (r.verifiedAt!.getTime() - r.submittedAt!.getTime()), 0) / lag.length / 60000)} min`
          : '—',
        lag.length
          ? 'Submit → provider verification'
          : 'No provider refunds yet',
        null,
        '#98A2B3',
      ),
    ];
    const sg = seg(
      [
        [
          'queue',
          'Execution queue',
          all.filter(
            (r) => !['Succeeded', 'Failed', 'Manual Review'].includes(r.status),
          ).length,
        ],
        ['hist', 'Refund history', ok.length],
        [
          'exc',
          'Failure / retry exceptions',
          all.filter((r) =>
            ['Failed', 'Manual Review', 'Provider Unknown'].includes(r.status),
          ).length,
        ],
      ],
      v,
    );
    const L = all.filter((r) =>
      v === 'hist'
        ? r.status === 'Succeeded'
        : v === 'exc'
          ? ['Failed', 'Manual Review', 'Provider Unknown'].includes(r.status)
          : !['Succeeded', 'Failed', 'Manual Review'].includes(r.status),
    );
    const names = await this.ctx.userNames(L.map((r) => r.upstreamById));
    const returns = await this.db.return.findMany({
      where: {
        id: { in: L.map((r) => r.returnId).filter((x): x is string => !!x) },
      },
      select: { id: true, orderId: true },
    });
    const orderNo = new Map(
      (
        await this.db.order.findMany({
          where: { id: { in: returns.map((r) => r.orderId) } },
          select: { id: true, orderNo: true },
        })
      ).map((o) => [o.id, o.orderNo]),
    );
    const retRef = new Map(
      returns.map((r) => [
        r.id,
        `Return · Order #${orderNo.get(r.orderId) ?? '—'}`,
      ]),
    );
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'rf',
          seg: sg,
          table: L.length
            ? {
                hasActs: true,
                cols: cols([
                  'Execution',
                  'Source refund',
                  'Payment',
                  'Customer',
                  'Amount',
                  'Provider',
                  ['Method', '1'],
                  ['Approved by', '1'],
                  'Execution status',
                  ['Provider refund ID', '1'],
                  ['Submitted', '1'],
                  ['Verified', '1'],
                  'Failure',
                ]),
                rows: L.map((r) => {
                  const t = r.txId ? vis.get(r.txId) : undefined;
                  return row(
                    r.id,
                    [
                      cell({ t: r.number, fw: 800, fg: '#101828' }),
                      cell({
                        t: r.returnId
                          ? (retRef.get(r.returnId) ?? 'Orders return')
                          : r.origin === 'provider'
                            ? 'Issued at provider'
                            : 'Manual',
                        s: r.returnId ? 'Orders · Returns & Refunds' : '',
                      }),
                      cell({
                        t: t?.number ?? '—',
                        s: t
                          ? `${d.fmt.money(num(t.captured), t.currency)} captured`
                          : '',
                      }),
                      cell({ t: this.data.cname(d, t?.customerId) }),
                      this.amtCell(
                        d,
                        num(r.amount),
                        r.currency,
                        t
                          ? num(r.amount) < num(t.captured) - 0.004
                            ? 'Partial'
                            : 'Full'
                          : '',
                      ),
                      cell({ t: this.data.provName(t?.provider ?? 'manual') }),
                      cell({ t: t?.method ?? r.method, opt: '1' }),
                      cell({
                        t: r.upstreamById
                          ? (names.get(r.upstreamById) ?? '—')
                          : r.origin === 'provider'
                            ? 'Provider'
                            : '—',
                        opt: '1',
                      }),
                      stc(r.status),
                      cell({
                        t: r.providerRefundId ?? '—',
                        ff: 'ui-monospace,monospace',
                        opt: '1',
                      }),
                      cell({
                        t: r.submittedAt ? d.fmt.ago(r.submittedAt) : '—',
                        opt: '1',
                      }),
                      cell({
                        t: r.verifiedAt ? d.fmt.ago(r.verifiedAt) : '—',
                        opt: '1',
                      }),
                      cell({
                        t: r.failureCode ?? '—',
                        fg: r.failureCode ? '#B42318' : '#344054',
                        mw: '220px',
                      }),
                    ],
                    this.rfActs(d, r, t),
                    [
                      `${r.number} · ${d.fmt.money(num(r.amount), r.currency)}`,
                      `${r.returnId ? 'Orders return' : r.origin} · ${this.data.cname(d, t?.customerId)}`,
                      [chip(r.status)],
                    ],
                  );
                }),
              }
            : null,
          empty: L.length
            ? null
            : {
                t:
                  v === 'exc'
                    ? 'No refund exceptions'
                    : v === 'hist'
                      ? 'No completed refunds yet'
                      : 'Nothing waiting to execute',
                d: 'Refunds are approved in Orders › Returns & Refunds and appear here ready for execution.',
                acts: [btn('ext:/orders/returns', 'Open Orders refunds')],
              },
          info: 'Payments only moves money for refunds already approved upstream. Amounts can’t exceed the approved amount or the payment’s remaining refundable balance (validated server-side). “Succeeded” appears only after provider verification — or, for cash and terminal payments outside Noxtill, when your team records the payout.',
        }),
      ]),
    ];
  }

  rfActs(d: Data, r: PayRefund, t?: PayTransaction) {
    const o = ['Open'];
    if (d.a.refund && r.status === 'Ready') o.push('Execute refund');
    if (d.a.refund && ['Failed'].includes(r.status) && t?.provider === 'stripe')
      o.push('Retry execution');
    if (
      d.a.refund &&
      r.status === 'Manual Review' &&
      (!t || t.provider === 'manual')
    )
      o.push('Mark refunded outside Noxtill');
    if (d.a.refund && r.status === 'Manual Review' && t?.provider === 'stripe')
      o.push('Retry execution');
    if (r.status === 'Approval Required')
      o.push(d.a.approve ? 'Approve & execute' : 'View approval');
    if (t?.provider === 'stripe') o.push('Refresh status');
    if (r.returnId) o.push('Open source refund');
    if (t) o.push('Open payment');
    return o;
  }

  // ===== 6 Disputes
  async evPct(id: string) {
    const ev = await this.db.payDisputeEvidence.findMany({
      where: { disputeId: id, requirement: 'Required' },
    });
    return {
      pct: ev.length
        ? Math.round(
            (ev.filter((e) => e.status !== 'Missing').length / ev.length) * 100,
          )
        : 0,
      n: ev.length,
    };
  }

  async vDisputes(d: Data) {
    const S = d.s;
    const v = S.view.dsView || 'queue';
    const all = await this.db.payDispute.findMany({
      where: { businessId: d.a.rootId, env: S.env },
      orderBy: { openedAt: 'desc' },
    });
    const open = all.filter((x) => DISPUTE_OPEN.includes(x.status));
    const won = all.filter((x) => x.status === 'Won').length;
    const lost = all.filter((x) =>
      ['Lost', 'Accepted (lost)'].includes(x.status),
    ).length;
    const due = open.filter(
      (x) =>
        x.status === 'Needs Response' &&
        x.dueBy &&
        x.dueBy.getTime() <= Date.now() + d.pol.disputes.warnDays * 86400000,
    );
    const kpis = [
      K(
        'ds:open',
        'Open Disputes',
        open.length,
        'Needs response or under review',
        null,
        '#F04438',
      ),
      K(
        'ds:risk',
        'Amount at Risk',
        d.fmt.short(open.reduce((s, x) => s + num(x.amount), 0)),
        d.a.fees
          ? `+ ${d.fmt.short(open.reduce((s, x) => s + num(x.fee), 0))} provider dispute fees`
          : '+ provider dispute fees',
        '#B42318',
        '#F04438',
      ),
      K(
        'ds:due',
        'Evidence Due',
        due.length,
        `Within ${d.pol.disputes.warnDays} days (${d.biz.timezone})`,
        null,
        '#F79009',
      ),
      K('ds:won', 'Won', won, '', null, '#12A150'),
      K('ds:lost', 'Lost', lost, '', null, '#98A2B3'),
      K(
        'ds:rate',
        'Win Rate',
        won + lost ? d.fmt.pct(won, won + lost) : '—',
        won + lost < 5
          ? `Low volume — ${won + lost} closed`
          : 'Closed disputes',
        null,
        '#12A150',
      ),
    ];
    const sg = seg(
      [
        ['queue', 'Dispute queue', open.length],
        ['cal', 'Deadline calendar'],
        ['out', 'Outcome analysis'],
      ],
      v,
    );
    if (!all.length)
      return [
        kpiRow(kpis),
        ...emptyRows(
          'No disputes',
          d.conns.some((c) => c.provider === 'stripe' && c.env === S.env)
            ? 'Provider disputes appear here automatically from provider webhooks.'
            : 'Disputes come from a connected card provider. Cash payments can’t be charged back.',
        ),
      ];
    if (v === 'cal') {
      const startOff = -((new Date().getDay() + 6) % 7);
      const days: unknown[] = [];
      for (let i = 0; i < 28; i++) {
        const day = new Date(Date.now() + (startOff + i) * 86400000);
        const n = d.fmt.daysFrom(day);
        const items = open
          .filter((x) => x.dueBy && d.fmt.daysFrom(x.dueBy) === n)
          .map((x) => ({
            id: x.id,
            t: `${x.providerDisputeId.slice(-6)} · ${d.fmt.short(num(x.amount))}`,
            bg: n <= 2 ? '#FEF3F2' : '#FEF6E7',
            fg: n <= 2 ? '#B42318' : '#B54708',
          }));
        days.push({
          d: d.fmt.day(day),
          bd: n === 0 ? '#12A150' : '#E6EAF0',
          bg: n < 0 ? '#FAFBFC' : '#fff',
          fw: n === 0 ? 800 : 600,
          fg: n === 0 ? '#0E8442' : '#475467',
          items,
        });
      }
      return [
        kpiRow(kpis),
        R('minmax(0,1fr)', [
          card({
            id: 'dsp-cal',
            seg: sg,
            title: 'Evidence deadlines',
            sub: `Deadlines shown in business timezone (${d.biz.timezone}). Providers enforce their own cut-off.`,
            cal: {
              aria: 'Dispute deadline calendar',
              head: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
              days,
            },
          }),
        ]),
      ];
    }
    if (v === 'out') {
      const cl = all.filter((x) =>
        ['Won', 'Lost', 'Accepted (lost)'].includes(x.status),
      );
      return [
        kpiRow(kpis),
        R('minmax(0,1fr) minmax(0,1fr)', [
          card({
            id: 'dsp-out',
            seg: sg,
            title: 'Outcomes by reason',
            bars: cl.length
              ? mkBars(
                  cl.map(
                    (x) =>
                      [
                        `${x.reason} · ${x.status}`,
                        num(x.amount),
                        x.status === 'Won' ? '#12A150' : '#F04438',
                      ] as [string, number, string],
                  ),
                  null,
                  (x) => d.fmt.short(x),
                )
              : null,
            empty: cl.length
              ? null
              : { t: 'No closed disputes yet', d: '', acts: [] },
            info:
              cl.length && cl.length < 5
                ? `Only ${cl.length} closed disputes — too few to draw conclusions.`
                : null,
          }),
          card({
            title: 'Financial impact (operational)',
            bars: mkBars(
              [
                [
                  'Recovered (won)',
                  cl
                    .filter((x) => x.status === 'Won')
                    .reduce((s, x) => s + num(x.amount), 0),
                  '#12A150',
                ],
                [
                  'Lost to chargeback',
                  cl
                    .filter((x) => x.status !== 'Won')
                    .reduce((s, x) => s + num(x.amount), 0),
                  '#F04438',
                ],
                [
                  'Provider dispute fees',
                  d.a.fees ? all.reduce((s, x) => s + num(x.fee), 0) : 0,
                  '#98A2B3',
                ],
              ],
              null,
              (x) => d.fmt.short(x),
            ),
            info: 'Accounting impact (lost amount and dispute fees) is posted by Finance & Accounting from the provider’s balance transactions. The original captured history is never altered.',
          }),
        ]),
      ];
    }
    const owners = await this.ctx.userNames(all.map((x) => x.ownerId));
    const txs = new Map(
      (
        await this.db.payTransaction.findMany({
          where: {
            id: { in: all.map((x) => x.txId).filter((x): x is string => !!x) },
          },
        })
      ).map((t) => [t.id, t]),
    );
    const sorted = [...all].sort(
      (a, b) =>
        (a.dueBy?.getTime() ?? Infinity) - (b.dueBy?.getTime() ?? Infinity),
    );
    const rows: unknown[] = [];
    for (const x of sorted) {
      const ev = await this.evPct(x.id);
      const t = x.txId ? txs.get(x.txId) : undefined;
      const n = x.dueBy ? d.fmt.daysFrom(x.dueBy) : null;
      rows.push(
        row(
          x.id,
          [
            cell({
              t: x.providerDisputeId.slice(0, 18),
              fw: 800,
              fg: '#101828',
              ff: 'ui-monospace,monospace',
            }),
            cell({
              t: x.providerDisputeId,
              ff: 'ui-monospace,monospace',
              opt: '1',
            }),
            cell({
              t: t?.number ?? x.providerChargeId ?? '—',
              s: this.data.provName('stripe'),
            }),
            cell({ t: this.data.cname(d, t?.customerId) }),
            cell({ t: x.reason, mw: '200px' }),
            this.amtCell(d, num(x.amount), x.currency),
            cell({
              t: x.dueBy ? d.fmt.day(x.dueBy) : '—',
              s: x.dueBy ? d.fmt.rel(x.dueBy) : '',
              fg:
                n != null && n <= 2 && x.status === 'Needs Response'
                  ? '#B42318'
                  : '#344054',
              fw: 700,
            }),
            stc(x.status),
            cell({
              // Stripe takes the disputed funds unless it is an inquiry (warning); nothing else is assumed.
              t:
                x.status === 'Warning'
                  ? 'Inquiry — funds not withdrawn'
                  : 'Merchant — funds withdrawn',
              opt: '1',
            }),
            cell({
              t: ev.n ? `${ev.pct}% required` : '—',
              fg:
                ev.pct === 100
                  ? '#0E8442'
                  : ev.pct >= 50
                    ? '#B54708'
                    : '#B42318',
              fw: 700,
            }),
            cell({
              t: x.ownerId ? (owners.get(x.ownerId) ?? '—') : 'Unassigned',
              opt: '1',
            }),
            cell({ t: x.outcome ?? '—', opt: '1' }),
          ],
          this.dspActs(d, x),
          [
            `${x.providerDisputeId.slice(-8)} · ${d.fmt.money(num(x.amount), x.currency)}`,
            `${x.reason} · due ${x.dueBy ? d.fmt.rel(x.dueBy) : '—'}`,
            [chip(x.status)],
          ],
        ),
      );
    }
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'dsp',
          seg: sg,
          table: {
            hasActs: true,
            cols: cols([
              'Dispute',
              ['Provider case', '1'],
              'Transaction',
              'Customer',
              'Reason',
              'Amount',
              'Evidence due',
              'Status',
              ['Liability', '1'],
              'Evidence',
              ['Owner', '1'],
              ['Outcome', '1'],
            ]),
            rows,
          },
          info: 'Evidence can only reference real Noxtill records (orders, delivery proof, conversations, receipts). AI can draft and flag gaps but never invents evidence or submits.',
        }),
      ]),
    ];
  }

  dspActs(d: Data, x: PayDispute) {
    const o = ['Open case'];
    if (d.a.dispute && x.status === 'Needs Response')
      o.push('Collect evidence', 'Submit response', 'Accept dispute', 'Assign');
    if (x.status === 'Approval Required' && d.a.approve)
      o.push('Approve submission');
    if (x.txId) o.push('Open transaction');
    return o;
  }

  // ===== 7 Payouts
  async vPayouts(d: Data) {
    const S = d.s;
    const v = S.view.poView || 'bal';
    const stripeConns = d.conns.filter(
      (c) => c.provider === 'stripe' && c.env === S.env,
    );
    const all =
      S.prov && S.prov !== 'stripe'
        ? []
        : await this.db.payPayout.findMany({
            where: { businessId: d.a.rootId, env: S.env },
            orderBy: { arrivalDate: 'desc' },
          });
    const snaps = await this.snapshots(d);
    const btAll = await this.db.payBalanceTxn.findMany({
      where: {
        businessId: d.a.rootId,
        env: S.env,
        payoutRef: { in: all.map((p) => p.providerPayoutId) },
      },
    });
    const comp = (p: PayPayout) => {
      const L = btAll.filter((b) => b.payoutRef === p.providerPayoutId);
      const by = (types: string[]) =>
        L.filter((b) => types.includes(b.type)).reduce(
          (s, b) => s + num(b.amount),
          0,
        );
      return {
        gross: by(['charge', 'payment']),
        refunds: -by(['refund', 'payment_refund']),
        // Chargebacks taken (negative) net of reversals of won disputes (positive).
        disputes: -L.filter(
          (b) =>
            b.type === 'dispute' || (b.category ?? '').startsWith('dispute'),
        ).reduce((s, b) => s + num(b.amount), 0),
        fees: L.reduce((s, b) => s + num(b.fee), 0),
        adj: L.filter(
          (b) =>
            ['adjustment', 'stripe_fee', 'application_fee', 'tax'].includes(
              b.type,
            ) && !(b.category ?? '').startsWith('dispute'),
        ).reduce((s, b) => s + num(b.amount), 0),
        reserve: -L.filter((b) => b.type.startsWith('reserve')).reduce(
          (s, b) => s + num(b.amount),
          0,
        ),
        n: L.filter((b) => ['charge', 'payment'].includes(b.type)).length,
        known: L.length > 0,
      };
    };
    const P = S.period;
    const late = (p: PayPayout) =>
      p.status === 'Failed' ||
      (['Pending', 'In Transit'].includes(p.status) &&
        !!p.arrivalDate &&
        p.arrivalDate.getTime() <
          Date.now() - d.pol.payout.delayHours * 3600000);
    const next = all
      .filter((p) => ['Pending', 'In Transit'].includes(p.status))
      .sort(
        (a, b) =>
          (a.arrivalDate?.getTime() ?? 0) - (b.arrivalDate?.getTime() ?? 0),
      )[0];
    const fees = d.a.fees;
    const allFees = all.reduce((s, p) => s + comp(p).fees, 0);
    const kpis = [
      K(
        'po:avail',
        'Available Balance',
        snaps.length
          ? d.fmt.short(snaps.reduce((s, x) => s + x.available, 0))
          : 'Not available',
        snaps.length
          ? snaps.some((x) => x.partial)
            ? 'Partial — a balance feed is missing'
            : 'Settled, available for payout'
          : 'No provider balance API connected',
        null,
        '#12A150',
      ),
      K(
        'po:pend',
        'Pending Balance',
        snaps.length
          ? d.fmt.short(snaps.reduce((s, x) => s + x.pending, 0))
          : 'Not available',
        snaps.length
          ? 'Captured, not yet settled'
          : 'No provider balance API connected',
        null,
        '#F79009',
      ),
      K(
        'po:next',
        'Next Expected Payout',
        next ? d.fmt.short(num(next.amount), next.currency) : '—',
        next ? `Stripe · ${d.fmt.day(next.arrivalDate)}` : 'None scheduled',
        null,
        '#2E90FA',
      ),
      K(
        'po:paid',
        'Paid This Period',
        d.fmt.short(
          all
            .filter(
              (p) =>
                p.status === 'Paid' &&
                p.arrivalDate &&
                p.arrivalDate.getTime() >= Date.now() - P * 86400000,
            )
            .reduce((s, p) => s + num(p.amount), 0),
        ),
        'Provider-reported paid',
        null,
        '#12A150',
      ),
      K(
        'po:fees',
        'Provider Fees',
        fees ? d.fmt.short(allFees) : LOCK,
        fees ? 'Deducted from payouts' : 'Restricted',
        null,
        '#98A2B3',
      ),
      K(
        'po:res',
        'Reserves / Holds',
        snaps.length
          ? d.fmt.short(snaps.reduce((s, x) => s + x.reserved, 0))
          : '—',
        'Held by provider',
        null,
        '#F79009',
      ),
      K(
        'po:delay',
        'Delayed Payouts',
        all.filter(late).length,
        `Past expected date + ${d.pol.payout.delayHours}h`,
        all.some(late) ? '#B42318' : null,
        '#F04438',
      ),
    ];
    const sg = seg(
      [
        ['bal', 'Provider balances'],
        ['cal', 'Payout calendar'],
        ['hist', 'Payout history', all.length],
        ['comp', 'Settlement components'],
        ['exc', 'Delay / hold exceptions', all.filter(late).length],
      ],
      v,
    );
    if (!stripeConns.length && !all.length)
      return [
        kpiRow(kpis),
        ...emptyRows(
          'No payouts',
          'Payouts appear once a connected provider settles card payments. Cash needs no payout; Square and PayPal are read-only imports without payout data in Noxtill.',
          [btn('ext:/integrations', 'Open Integrations', 'primary')],
        ),
      ];
    if (v === 'bal') {
      const provs = this.data.providerRows(d);
      return [
        kpiRow(kpis),
        R('minmax(0,1fr)', [
          card({
            id: 'po-bal',
            seg: sg,
            title: 'Provider balances',
            sub: 'Balance API where available · providers without one are shown as such, never as zero',
            qcards: [
              ...provs.map(({ def, c }) => {
                const s = snaps.find((x) => x.c.id === c?.id);
                const noApi = def.adapter !== 'stripe';
                const inTransit = all
                  .filter(
                    (p) =>
                      p.connectionId === c?.id && p.status === 'In Transit',
                  )
                  .reduce((x, p) => x + num(p.amount), 0);
                return {
                  id: def.key,
                  t: def.name,
                  d: `${d.a.dest ? (c?.destination ?? 'Destination not reported yet') : 'Destination 🔒'} · ${c?.payoutSchedule ?? (noApi ? 'Read-only import' : 'Schedule not reported yet')}`,
                  badge: !c
                    ? 'Not connected'
                    : noApi
                      ? 'No balance API'
                      : s?.partial
                        ? 'Partial'
                        : c.status,
                  bbg: !c || noApi || s?.partial ? '#FEF6E7' : '#ECFDF3',
                  bfg: !c || noApi || s?.partial ? '#B54708' : '#0E8442',
                  bg: '#fff',
                  aria: `${def.name} balance`,
                  stats: [
                    {
                      l: 'Available',
                      v: s ? d.fmt.short(s.available) : 'Not available',
                      fg: '#0E8442',
                    },
                    {
                      l: 'Pending',
                      v: s ? d.fmt.short(s.pending) : 'Not available',
                      fg: '#B54708',
                    },
                    {
                      l: 'In transit',
                      v: c && !noApi ? d.fmt.short(inTransit) : '—',
                      fg: '#175CD3',
                    },
                    {
                      l: 'Reserve',
                      v: s ? d.fmt.short(s.reserved) : '—',
                      fg: '#101828',
                    },
                  ],
                };
              }),
              ...UNAVAILABLE_PROVIDERS.map((p) => ({
                id: p.key,
                t: p.name,
                d: 'No adapter in Noxtill',
                badge: 'Not available',
                bbg: '#F2F4F7',
                bfg: '#667085',
                bg: '#FAFBFC',
                aria: `${p.name} not available`,
                stats: [
                  { l: 'Available', v: '—', fg: '#667085' },
                  { l: 'Pending', v: '—', fg: '#667085' },
                ],
              })),
            ],
            info: snaps.some((s) => s.at)
              ? `Balances as reported by the provider · fetched ${d.fmt.ago(
                  snaps
                    .map((s) => s.at)
                    .filter((x): x is Date => !!x)
                    .sort((a, b) => a.getTime() - b.getTime())[0],
                )}. Other currencies are converted with Finance’s exchange rates; balances without a rate show Partial.`
              : null,
          }),
        ]),
      ];
    }
    if (v === 'cal') {
      const startOff = -((new Date().getDay() + 6) % 7) - 7;
      const days: unknown[] = [];
      for (let i = 0; i < 21; i++) {
        const day = new Date(Date.now() + (startOff + i) * 86400000);
        const n = d.fmt.daysFrom(day);
        const items = all
          .filter((p) => p.arrivalDate && d.fmt.daysFrom(p.arrivalDate) === n)
          .map((p) => ({
            id: p.id,
            t: `Stripe ${d.fmt.short(num(p.amount), p.currency)}`,
            bg: late(p)
              ? '#FEF3F2'
              : p.status === 'Paid'
                ? '#ECFDF3'
                : '#EFF8FF',
            fg: late(p)
              ? '#B42318'
              : p.status === 'Paid'
                ? '#0E8442'
                : '#175CD3',
          }));
        days.push({
          d: d.fmt.day(day),
          bd: n === 0 ? '#12A150' : '#E6EAF0',
          bg: n < 0 ? '#FAFBFC' : '#fff',
          fw: n === 0 ? 800 : 600,
          fg: n === 0 ? '#0E8442' : '#475467',
          items,
        });
      }
      return [
        kpiRow(kpis),
        R('minmax(0,1fr)', [
          card({
            id: 'po-cal',
            seg: sg,
            title: 'Payout calendar',
            sub: 'Expected dates are provider estimates. Paid = provider says sent; bank arrival is matched in Finance.',
            cal: {
              aria: 'Payout calendar',
              head: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
              days,
            },
          }),
        ]),
      ];
    }
    if (v === 'comp') {
      const g = all.map(comp);
      return [
        kpiRow(kpis),
        R('minmax(0,1fr)', [
          card({
            id: 'po-comp',
            seg: sg,
            title: 'Settlement components · all payouts with provider detail',
            bars: g.some((x) => x.known)
              ? mkBars(
                  [
                    [
                      'Gross collections',
                      g.reduce((s, x) => s + x.gross, 0),
                      '#12A150',
                    ],
                    [
                      'Refund deductions',
                      g.reduce((s, x) => s + x.refunds, 0),
                      '#6941C6',
                    ],
                    [
                      'Dispute deductions',
                      g.reduce((s, x) => s + x.disputes, 0),
                      '#F04438',
                    ],
                    [
                      'Provider fees',
                      fees ? g.reduce((s, x) => s + x.fees, 0) : 0,
                      '#98A2B3',
                    ],
                    [
                      'Adjustments',
                      Math.abs(g.reduce((s, x) => s + x.adj, 0)),
                      '#F79009',
                    ],
                    [
                      'Reserves held',
                      g.reduce((s, x) => s + x.reserve, 0),
                      '#F79009',
                    ],
                    [
                      'Net payouts',
                      all.reduce((s, p) => s + num(p.amount), 0),
                      '#0A1B2A',
                    ],
                  ],
                  null,
                  (x) => d.fmt.short(x),
                )
              : null,
            empty: g.some((x) => x.known)
              ? null
              : {
                  t: 'No settlement detail yet',
                  d: 'Components appear once the provider reports the balance transactions inside each payout.',
                  acts: [],
                },
            info: fees
              ? null
              : 'Fees are restricted for your role and shown as 0 here.',
          }),
        ]),
      ];
    }
    const L = (v === 'exc' ? all.filter((p) => late(p)) : all).sort(
      (a, b) =>
        (b.arrivalDate?.getTime() ?? 0) - (a.arrivalDate?.getTime() ?? 0),
    );
    const pg = this.paged(d, 'payouts', L);
    const bank = await this.bankMatch(pg.rows);
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'po',
          seg: sg,
          table: L.length
            ? {
                hasActs: true,
                cols: cols([
                  'Payout',
                  'Provider',
                  ['Destination', '1'],
                  'Gross',
                  ['Refunds', '1'],
                  ['Disputes', '1'],
                  ['Fees', '1'],
                  ['Adjustments', '1'],
                  ['Reserve', '1'],
                  'Net payout',
                  'Expected',
                  'Status',
                  'Bank match',
                  ['Bank ref', '1'],
                  ['Txns', '1'],
                ]),
                rows: pg.rows.map((p) => {
                  const c = comp(p);
                  const bm = bank.get(p.id);
                  const st =
                    late(p) && p.status !== 'Failed' ? 'Delayed' : p.status;
                  return row(
                    p.id,
                    [
                      cell({
                        t: p.providerPayoutId,
                        fw: 800,
                        fg: '#101828',
                        ff: 'ui-monospace,monospace',
                      }),
                      cell({ t: 'Stripe', s: 'Payout API' }),
                      cell({
                        t: d.a.dest ? (p.destination ?? '—') : '🔒',
                        opt: '1',
                      }),
                      c.known
                        ? this.amtCell(d, c.gross, p.currency)
                        : cell({ t: 'Not reported' }),
                      cell({
                        t: c.known ? d.fmt.money(-c.refunds, p.currency) : '—',
                        opt: '1',
                      }),
                      cell({
                        t: c.known ? d.fmt.money(-c.disputes, p.currency) : '—',
                        opt: '1',
                      }),
                      cell({
                        t: fees
                          ? c.known
                            ? d.fmt.money(-c.fees, p.currency)
                            : '—'
                          : '🔒',
                        opt: '1',
                      }),
                      cell({
                        t: c.adj ? d.fmt.money(c.adj, p.currency) : '—',
                        opt: '1',
                      }),
                      cell({
                        t: c.reserve
                          ? d.fmt.money(-c.reserve, p.currency)
                          : '—',
                        opt: '1',
                      }),
                      this.amtCell(d, num(p.amount), p.currency),
                      cell({
                        t: d.fmt.day(p.arrivalDate),
                        s: d.fmt.rel(p.arrivalDate),
                        fg: st === 'Delayed' ? '#B42318' : '#344054',
                      }),
                      stc(st),
                      p.status === 'Paid'
                        ? stc(
                            bm?.matched ? 'Bank Matched' : 'Bank Match Pending',
                          )
                        : cell({ t: '—' }),
                      cell({ t: bm?.ref ?? '—', opt: '1' }),
                      cell({ t: String(c.n), opt: '1' }),
                    ],
                    [
                      'Open payout',
                      'View included transactions',
                      'Refresh provider status',
                      'Export settlement report',
                      'Open Finance bank reconciliation',
                    ],
                    [
                      `${p.providerPayoutId} · ${d.fmt.money(num(p.amount), p.currency)}`,
                      `Stripe · ${d.fmt.day(p.arrivalDate)}`,
                      [
                        chip(st),
                        ...(p.status === 'Paid'
                          ? [
                              chip(
                                bm?.matched
                                  ? 'Bank Matched'
                                  : 'Bank Match Pending',
                              ),
                            ]
                          : []),
                      ],
                    ],
                  );
                }),
              }
            : null,
          pager: pg.pager,
          empty: L.length
            ? null
            : {
                t: v === 'exc' ? 'No exceptions' : 'No payouts yet',
                d:
                  v === 'exc'
                    ? 'No delayed or failed payouts.'
                    : 'The provider hasn’t reported a payout yet.',
                acts: [],
              },
          info: '“Paid” means the provider reports it sent the money. Arrival in your bank is confirmed separately in Finance & Accounting (“Bank Match Pending” until matched).',
        }),
      ]),
    ];
  }

  /** Bank match status comes from Finance's bank lines (FinBankLine.externalPaymentId). */
  async bankMatch(list: PayPayout[]) {
    const ids = list
      .map((p) => p.externalPaymentId)
      .filter((x): x is string => !!x);
    const out = new Map<string, { matched: boolean; ref: string | null }>();
    if (!ids.length) return out;
    const lines = await this.db.finBankLine.findMany({
      where: { externalPaymentId: { in: ids } },
    });
    for (const p of list) {
      const l = lines.find((x) => x.externalPaymentId === p.externalPaymentId);
      if (l)
        out.set(p.id, {
          matched: l.status === 'Matched' || l.status === 'Reconciled',
          ref: l.reference ?? null,
        });
    }
    return out;
  }

  // ===== 8 Recurring
  async vRecurring(d: Data) {
    const S = d.s;
    const v = S.view.mdView || 'list';
    const all = d.a.ownOnly
      ? []
      : await this.db.payMandate.findMany({
          where: { businessId: d.a.rootId, env: S.env },
          orderBy: { createdAt: 'desc' },
        });
    const act = all.filter((m) => m.status === 'Active');
    const hist = await this.db.payMandateAttempt.findMany({
      where: { mandateId: { in: all.map((m) => m.id) } },
      orderBy: { dueAt: 'desc' },
    });
    const recent = hist.filter(
      (h) => h.dueAt.getTime() >= Date.now() - 30 * 86400000,
    );
    const per = (f: string) =>
      f === 'Weekly' ? 7 : f === 'Monthly' ? 30 : f === 'Yearly' ? 365 : 0;
    const upcoming: { m: (typeof act)[number]; at: Date }[] = [];
    for (const m of act) {
      if (!m.nextChargeAt) continue;
      const step = per(m.frequency);
      for (
        let t = m.nextChargeAt.getTime();
        t <= Date.now() + 30 * 86400000;
        t += step * 86400000
      ) {
        if (t >= Date.now() - 86400000) upcoming.push({ m, at: new Date(t) });
        if (!step) break;
      }
    }
    const kpis = [
      K(
        'md:act',
        'Active Mandates',
        act.length,
        `${all.length} total`,
        null,
        '#12A150',
      ),
      K(
        'md:due',
        'Due Today',
        act.filter(
          (m) => m.nextChargeAt && d.fmt.daysFrom(m.nextChargeAt) === 0,
        ).length,
        d.fmt.short(
          act
            .filter(
              (m) => m.nextChargeAt && d.fmt.daysFrom(m.nextChargeAt) === 0,
            )
            .reduce((s, m) => s + num(m.amount), 0),
        ),
        null,
        '#2E90FA',
      ),
      K(
        'md:ok',
        'Collected',
        recent.filter((h) => h.status === 'Succeeded').length,
        'Last 30 days · confirmed',
        null,
        '#12A150',
      ),
      K(
        'md:fail',
        'Failed',
        recent.filter((h) => h.status === 'Failed').length,
        'Attempts last 30 days',
        null,
        '#F04438',
      ),
      K(
        'md:pd',
        'Past Due',
        all.filter((m) => m.status === 'Past Due').length,
        'In dunning',
        all.some((m) => m.status === 'Past Due') ? '#B42318' : null,
        '#F04438',
      ),
      K(
        'md:up',
        'Upcoming 30 Days',
        d.fmt.short(upcoming.reduce((s, x) => s + num(x.m.amount), 0)),
        'Scheduled collections',
        null,
        '#6941C6',
      ),
    ];
    const sg = seg(
      [
        ['list', 'Mandates', all.length],
        ['sched', 'Collection schedule'],
        ['att', 'Attempt history', hist.length],
        [
          'dun',
          'Dunning status',
          all.filter((m) => m.status === 'Past Due').length,
        ],
      ],
      v,
    );
    if (!all.length)
      return [
        kpiRow(kpis),
        ...emptyRows(
          S.env === 'test' ? 'No test mandates' : 'No recurring mandates',
          'Mandates are created when a customer joins a membership plan (Customers › Memberships) or agrees an installment plan (Credit).',
          [btn('ext:/customers', 'Open Customers')],
        ),
      ];
    if (v === 'sched') {
      const rows = upcoming.sort((a, b) => a.at.getTime() - b.at.getTime());
      return [
        kpiRow(kpis),
        R('minmax(0,1fr)', [
          card({
            id: 'mnd-s',
            seg: sg,
            table: rows.length
              ? {
                  hasActs: false,
                  cols: cols([
                    'Charge date',
                    'Mandate',
                    'Customer',
                    'Source plan',
                    'Provider',
                    'Amount',
                    'Idempotency key',
                  ]),
                  rows: rows.map((x, i) =>
                    row(
                      `${x.m.id}|${i}`,
                      [
                        cell({
                          t: d.fmt.day(x.at),
                          s: d.fmt.rel(x.at),
                          fw: 700,
                        }),
                        cell({ t: x.m.planRef }),
                        cell({ t: this.data.cname(d, x.m.customerId) }),
                        cell({ t: x.m.planName }),
                        cell({ t: this.data.provName(x.m.provider) }),
                        this.amtCell(d, num(x.m.amount), x.m.currency),
                        cell({
                          t: `${x.m.id.slice(0, 8)}:${x.at.toISOString().slice(0, 10)}`,
                          ff: 'ui-monospace,monospace',
                        }),
                      ],
                      [],
                      [
                        `${d.fmt.day(x.at)} · ${d.fmt.money(num(x.m.amount))}`,
                        x.m.planName,
                        [],
                      ],
                    ),
                  ),
                }
              : null,
            empty: rows.length
              ? null
              : { t: 'Nothing due in the next 30 days', d: '', acts: [] },
            info: 'One idempotency key per mandate + period, so a retry can never charge twice for the same cycle. Manual schedules are collected at the counter.',
          }),
        ]),
      ];
    }
    if (v === 'att') {
      const byM = new Map(all.map((m) => [m.id, m]));
      return [
        kpiRow(kpis),
        R('minmax(0,1fr)', [
          card({
            id: 'mnd-a',
            seg: sg,
            table: hist.length
              ? {
                  hasActs: false,
                  cols: cols([
                    'Date',
                    'Mandate',
                    'Customer',
                    'Amount',
                    'Result',
                    'Idempotency key',
                  ]),
                  rows: hist.map((h, i) => {
                    const m = byM.get(h.mandateId)!;
                    return row(
                      `${h.id}|${i}`,
                      [
                        cell({ t: d.fmt.day(h.dueAt) }),
                        cell({ t: m.planRef, s: m.planName }),
                        cell({ t: this.data.cname(d, m.customerId) }),
                        this.amtCell(d, num(h.amount), m.currency),
                        stc(h.status),
                        cell({ t: h.idemKey, ff: 'ui-monospace,monospace' }),
                      ],
                      [],
                      [
                        `${m.planRef} · ${h.status}`,
                        d.fmt.day(h.dueAt),
                        [chip(h.status)],
                      ],
                    );
                  }),
                }
              : null,
            empty: hist.length
              ? null
              : {
                  t: 'No collection attempts recorded yet',
                  d: 'Provider charges and counter collections (cash renewals, installments) are logged here.',
                  acts: [],
                },
          }),
        ]),
      ];
    }
    const L = v === 'dun' ? all.filter((m) => m.status === 'Past Due') : all;
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'mnd',
          seg: sg,
          table: L.length
            ? {
                hasActs: true,
                cols: cols([
                  'Mandate',
                  'Customer',
                  'Source plan',
                  'Provider',
                  'Amount',
                  'Frequency',
                  'Next charge',
                  ['Last charge', '1'],
                  'Status',
                  ['Retry policy', '1'],
                ]),
                rows: L.map((m) =>
                  row(
                    m.id,
                    [
                      cell({
                        t: m.planRef,
                        fw: 800,
                        fg: '#101828',
                        s:
                          m.kind === 'manual'
                            ? 'Manual schedule'
                            : m.legacyPlatform
                              ? 'Legacy · platform account'
                              : 'Provider mandate',
                      }),
                      cell({ t: this.data.cname(d, m.customerId) }),
                      cell({
                        t: m.planName,
                        s: `${m.sourceModule}${m.planStatus !== 'Active' ? ` · plan ${m.planStatus.toLowerCase()}` : ''}`,
                      }),
                      cell({
                        t:
                          m.kind === 'manual'
                            ? 'Counter (manual)'
                            : this.data.provName(m.provider),
                      }),
                      this.amtCell(d, num(m.amount), m.currency),
                      cell({ t: m.frequency }),
                      cell({
                        t:
                          !m.nextChargeAt ||
                          ['Cancelled', 'Paused', 'Completed'].includes(
                            m.status,
                          )
                            ? '—'
                            : d.fmt.day(m.nextChargeAt),
                        s:
                          !m.nextChargeAt ||
                          ['Cancelled', 'Paused', 'Completed'].includes(
                            m.status,
                          )
                            ? ''
                            : d.fmt.rel(m.nextChargeAt),
                        fg: m.status === 'Past Due' ? '#B42318' : '#344054',
                      }),
                      cell({ t: d.fmt.day(m.lastChargeAt), opt: '1' }),
                      stc(m.status),
                      cell({
                        t:
                          m.kind === 'manual'
                            ? 'Collected at the counter'
                            : `Provider schedule (Stripe Billing settings)${m.status === 'Past Due' ? ` · ${m.attempts} failed` : ''}`,
                        opt: '1',
                      }),
                    ],
                    this.mndActs(d, m),
                    [
                      `${m.planRef} · ${d.fmt.money(num(m.amount))}`,
                      `${this.data.cname(d, m.customerId)} · ${m.planName}`,
                      [chip(m.status)],
                    ],
                  ),
                ),
              }
            : null,
          empty: L.length
            ? null
            : { t: 'No mandates in dunning', d: '', acts: [] },
          info: 'Payments runs the mandate and collection attempts. The source plan (Customers › Memberships, Credit › Installments) owns entitlement, pricing and status — if a plan is cancelled there, future collections stop here.',
        }),
      ]),
    ];
  }

  mndActs(
    d: Data,
    m: { kind: string; status: string; legacyPlatform: boolean },
  ) {
    const o = ['Open'];
    if (d.a.recover && m.kind === 'provider' && !m.legacyPlatform) {
      if (['Active', 'Past Due'].includes(m.status)) o.push('Pause collection');
      if (m.status === 'Paused') o.push('Resume');
      if (m.status === 'Past Due')
        o.push('Retry', 'Request new payment method');
      if (!['Cancelled'].includes(m.status)) o.push('Cancel mandate');
    }
    o.push('Open source plan');
    return o;
  }

  // ===== 9 Routing
  async vRouting(d: Data) {
    const S = d.s;
    const v = S.view.rtView || 'matrix';
    const m = await this.routing.methods(d.a.rootId);
    const rules = await this.routing.rules(d.a.rootId);
    const provs = this.data.providerRows(d);
    const conn = provs.filter((p) => p.c && p.c.status !== 'Disconnected');
    const sup = new Map<string, boolean>();
    for (const x of m)
      sup.set(
        x.method,
        await this.routing.supported(d.a.rootId, x.method, x.primary),
      );
    const exc =
      m.filter(
        (x) =>
          x.enabled &&
          (!sup.get(x.method) ||
            (x.primary &&
              x.primary !== 'manual' &&
              this.data.conn(d, x.primary, 'live')?.status === 'Degraded')),
      ).length +
      rules.filter(
        (r) =>
          r.fallback && !providerDef(r.fallback)?.methods.includes(r.method),
      ).length;
    const stripeRate = await this.routing.feeRate(d.a.rootId, 'stripe');
    const kpis = [
      K(
        'rt:m',
        'Active Methods',
        m.filter((x) => x.enabled && sup.get(x.method)).length,
        `${m.length} configured`,
        null,
        '#12A150',
      ),
      K(
        'rt:p',
        'Connected Providers',
        conn.length,
        'Managed in Integrations',
        null,
        '#2E90FA',
      ),
      K(
        'rt:fb',
        'Fallback Routes',
        m.filter((x) => x.enabled && x.fallback).length +
          rules.filter((r) => r.fallback && r.status === 'Active').length,
        'Methods + rules with fallback',
        null,
        '#6941C6',
      ),
      K(
        'rt:x',
        'Routing Exceptions',
        exc,
        exc ? 'Unsupported or degraded primary' : 'None',
        exc ? '#B42318' : null,
        '#F04438',
      ),
      K(
        'rt:fee',
        'Effective Card Fee',
        d.a.fees
          ? stripeRate == null
            ? 'Not reported'
            : `${stripeRate.toFixed(2)}%`
          : LOCK,
        'Your actual Stripe fees ÷ volume, 90 days',
        null,
        '#98A2B3',
      ),
    ];
    const sg = seg(
      [
        ['matrix', 'Method matrix', m.length],
        ['prio', 'Provider priority'],
        ['rules', 'Routing rules', rules.length],
        ['fb', 'Fallbacks'],
        ['cc', 'Country / currency'],
      ],
      v,
    );
    const acts = [
      btn('rt-test', 'Test route', 'dark'),
      btn('rt-new', 'Create rule', 'primary', !d.a.admin),
    ];
    const y = (x: boolean) => (x ? '✓' : '—');
    if (v === 'prio')
      return [
        kpiRow(kpis),
        R('minmax(0,1fr)', [
          card({
            id: 'rt-p',
            seg: sg,
            acts,
            title: 'Provider priority & capabilities',
            sub: 'What Noxtill can actually do with each provider. Unsupported actions are disabled everywhere in Payments.',
            table: {
              hasActs: false,
              cols: cols([
                'Provider',
                'Connection',
                'Methods',
                'Auth / capture',
                'Refunds',
                'Links',
                'Recurring',
                'Disputes API',
                'Payout API',
                'Webhook signatures',
                'Settlement',
              ]),
              rows: [
                ...PROVIDERS.map((p) => {
                  const c =
                    p.key === 'manual'
                      ? null
                      : this.data.conn(
                          d,
                          p.key,
                          p.key === 'stripe' ? S.env : 'live',
                        );
                  const caps = c
                    ? (c.caps as unknown as typeof p.caps)
                    : p.key === 'manual'
                      ? p.caps
                      : p.readCaps;
                  return row(
                    p.key,
                    [
                      cell({
                        t: p.name,
                        fw: 800,
                        s:
                          p.adapter === 'readonly'
                            ? 'Read-only import'
                            : p.key === 'stripe' && c && !c.writeEnabled
                              ? 'Read-only until reconnected'
                              : '',
                      }),
                      p.key === 'manual'
                        ? stc('Built-in')
                        : stc(c ? c.status : 'Disconnected'),
                      cell({ t: p.methods.join(', ') }),
                      cell({
                        t: `${y(caps.supportsAuthorization)} / ${caps.supportsSeparateCapture ? (caps.supportsPartialCapture ? 'separate + partial' : 'separate') : '—'}`,
                      }),
                      cell({
                        t: caps.supportsRefund
                          ? caps.supportsPartialRefund
                            ? 'Full + partial'
                            : 'Full only'
                          : '—',
                      }),
                      cell({ t: y(caps.supportsPaymentLinks) }),
                      cell({ t: y(caps.supportsRecurring) }),
                      cell({ t: y(caps.supportsDisputesAPI) }),
                      cell({ t: y(caps.supportsPayoutAPI) }),
                      cell({ t: y(caps.supportsWebhookSignatures) }),
                      cell({
                        t:
                          p.key === 'manual'
                            ? '—'
                            : (c?.payoutSchedule ?? 'Not reported'),
                      }),
                    ],
                    [],
                    [
                      p.name,
                      p.methods.join(', '),
                      [
                        chip(
                          c
                            ? c.status
                            : p.key === 'manual'
                              ? 'Built-in'
                              : 'Disconnected',
                        ),
                      ],
                    ],
                  );
                }),
                ...UNAVAILABLE_PROVIDERS.map((p) =>
                  row(
                    p.key,
                    [
                      cell({ t: p.name, fw: 800, s: 'No adapter in Noxtill' }),
                      stc('Not available'),
                      cell({ t: '—' }),
                      cell({ t: '—' }),
                      cell({ t: '—' }),
                      cell({ t: '—' }),
                      cell({ t: '—' }),
                      cell({ t: '—' }),
                      cell({ t: '—' }),
                      cell({ t: '—' }),
                      cell({ t: '—' }),
                    ],
                    [],
                    [p.name, 'Not available', [chip('Not available')]],
                  ),
                ),
              ],
            },
          }),
        ]),
      ];
    if (v === 'rules') {
      const names = new Map(d.branches.map((b) => [b.id, b.name]));
      return [
        kpiRow(kpis),
        R('minmax(0,1fr)', [
          card({
            id: 'rule',
            seg: sg,
            acts,
            title: 'Routing rules',
            sub: `Evaluated top to bottom. Precedence: ${PRECEDENCE.join(' › ')} — first match wins, ties are rejected.`,
            table: rules.length
              ? {
                  hasActs: true,
                  cols: cols([
                    '#',
                    'Rule',
                    'Level',
                    'Conditions',
                    'Method',
                    'Primary',
                    'Fallback',
                    'Status',
                    ['Version', '1'],
                  ]),
                  rows: rules.map((r, i) =>
                    row(
                      r.id,
                      [
                        cell({ t: String(i + 1), fw: 800 }),
                        cell({ t: r.name, fw: 700, fg: '#101828' }),
                        cell({ t: r.level }),
                        cell({
                          t:
                            this.condTxt(d, r.conditions as RuleConds, names) ||
                            'Everything else',
                          mw: '220px',
                        }),
                        cell({ t: r.method }),
                        cell({
                          t: this.data.provName(r.primary),
                          s:
                            this.data.conn(d, r.primary, 'live')?.status ===
                            'Degraded'
                              ? 'Degraded'
                              : '',
                        }),
                        cell({
                          t: r.fallback
                            ? this.data.provName(r.fallback)
                            : 'None — fail closed',
                        }),
                        stc(r.status),
                        cell({ t: `v${r.version}`, opt: '1' }),
                      ],
                      d.a.admin
                        ? [
                            'Test with this rule',
                            'Move up',
                            'Move down',
                            r.status === 'Active' ? 'Disable' : 'Enable',
                            'Edit',
                          ]
                        : ['Test with this rule'],
                      [
                        r.name,
                        `${r.method} → ${this.data.provName(r.primary)}`,
                        [chip(r.status)],
                      ],
                    ),
                  ),
                }
              : null,
            empty: rules.length
              ? null
              : {
                  t: 'No routing rules yet',
                  d: 'Without rules each method uses its default provider from the method matrix.',
                  acts: [btn('rt-new', 'Create rule', 'primary', !d.a.admin)],
                },
            info: 'Rules can’t create fallback loops, and provider/method combinations the provider doesn’t support are rejected on save. Routing decides the provider for payment links and the /pay page — the checkouts Noxtill runs.',
          }),
        ]),
      ];
    }
    if (v === 'fb') {
      const list = [
        ...m
          .filter((x) => x.enabled && x.primary)
          .map((x) => ({
            id: `m_${x.method}`,
            t: `${x.method} (method default)`,
            p: x.primary as string,
            f: x.fallback,
            meth: x.method,
          })),
        ...rules
          .filter((r) => r.status === 'Active')
          .map((r) => ({
            id: r.id,
            t: r.name,
            p: r.primary,
            f: r.fallback,
            meth: r.method,
          })),
      ];
      return [
        kpiRow(kpis),
        R('minmax(0,1fr)', [
          card({
            id: 'rt-fb',
            seg: sg,
            acts,
            table: {
              hasActs: false,
              cols: cols([
                'Route',
                'Primary',
                'Primary health',
                'Fallback',
                'Fallback supports method?',
                'Behaviour',
              ]),
              rows: list.map((x) =>
                row(
                  x.id,
                  [
                    cell({ t: x.t, fw: 700 }),
                    cell({ t: this.data.provName(x.p) }),
                    x.p === 'manual'
                      ? stc('Built-in')
                      : stc(
                          this.data.conn(d, x.p, 'live')?.status ??
                            'Disconnected',
                        ),
                    cell({ t: x.f ? this.data.provName(x.f) : '—' }),
                    cell({
                      t: !x.f
                        ? '—'
                        : providerDef(x.f)?.methods.includes(x.meth)
                          ? 'Yes'
                          : 'No — invalid',
                      fg:
                        x.f && !providerDef(x.f)?.methods.includes(x.meth)
                          ? '#B42318'
                          : '#344054',
                    }),
                    cell({
                      t: x.f
                        ? 'Fallback on provider unavailable / timeout only · never on decline'
                        : 'Fail closed — show other methods',
                    }),
                  ],
                  [],
                  [
                    x.t,
                    `${this.data.provName(x.p)} → ${x.f ? this.data.provName(x.f) : 'none'}`,
                    [],
                  ],
                ),
              ),
            },
          }),
        ]),
      ];
    }
    if (v === 'cc')
      return [
        kpiRow(kpis),
        R('minmax(0,1fr)', [
          card({
            id: 'rt-cc',
            seg: sg,
            acts,
            table: {
              hasActs: false,
              cols: cols([
                'Provider',
                'Account country',
                'Account currency',
                'Methods',
              ]),
              rows: PROVIDERS.filter((p) => p.key !== 'manual').map((p) => {
                const c = this.data.conn(
                  d,
                  p.key,
                  p.key === 'stripe' ? S.env : 'live',
                );
                return row(
                  p.key,
                  [
                    cell({ t: p.name, fw: 800 }),
                    cell({
                      t:
                        c?.country ??
                        (c ? 'Not reported yet' : 'Not connected'),
                    }),
                    cell({
                      t: c?.defaultCurrency ?? (c ? 'Not reported yet' : '—'),
                    }),
                    cell({ t: p.methods.join(', ') }),
                  ],
                  [],
                  [p.name, c?.defaultCurrency ?? '—', []],
                );
              }),
            },
            info: 'Country and currency come from the connected provider account itself. Stripe onboards businesses only in its supported countries — check stripe.com/global before connecting.',
          }),
        ]),
      ];
    const brs = d.branches;
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'mth',
          seg: sg,
          acts,
          title: 'Method matrix',
          table: {
            hasActs: true,
            cols: cols([
              'Method',
              'Enabled',
              'Channels',
              ['Branches / stores', '1'],
              ['Account country', '1'],
              ['Currency', '1'],
              'Primary',
              'Fallback',
              ['Min', '1'],
              ['Max', '1'],
              ['Fee (actual)', '1'],
              ['Settlement', '1'],
              ['Risk policy', '1'],
            ]),
            rows: await Promise.all(
              m.map(async (x) => {
                const ok = sup.get(x.method);
                const c =
                  x.primary && x.primary !== 'manual'
                    ? this.data.conn(d, x.primary, 'live')
                    : null;
                const accepting = await this.branchesAccepting(brs, x.method);
                const rate = x.primary
                  ? await this.routing.feeRate(d.a.rootId, x.primary)
                  : null;
                return row(
                  x.method,
                  [
                    cell({ t: x.method, fw: 800, fg: '#101828' }),
                    ok
                      ? stc(x.enabled ? 'Enabled' : 'Disabled')
                      : cell({
                          bt: 'Not available',
                          bfg: '#667085',
                          bbg: '#F2F4F7',
                          s: 'No connected provider supports it',
                        }),
                    cell({
                      t: (x.channels as string[]).join(', ') || '—',
                      mw: '200px',
                    }),
                    cell({ t: accepting, opt: '1' }),
                    cell({
                      t: x.primary === 'manual' ? '—' : (c?.country ?? '—'),
                      opt: '1',
                    }),
                    cell({
                      t:
                        x.primary === 'manual'
                          ? d.base
                          : (c?.defaultCurrency ?? '—'),
                      opt: '1',
                    }),
                    cell({
                      t: x.primary ? this.data.provName(x.primary) : '—',
                      s: c?.status === 'Degraded' ? '⚠ Degraded' : '',
                    }),
                    cell({
                      t: x.fallback ? this.data.provName(x.fallback) : '—',
                    }),
                    cell({ t: d.fmt.money(num(x.minAmount)), opt: '1' }),
                    cell({ t: d.fmt.money(num(x.maxAmount)), opt: '1' }),
                    cell({
                      t: !d.a.fees
                        ? '🔒'
                        : x.primary === 'manual'
                          ? 'None'
                          : rate == null
                            ? 'Not reported'
                            : `${rate.toFixed(2)}%`,
                      opt: '1',
                    }),
                    cell({
                      t:
                        x.primary === 'manual'
                          ? '—'
                          : (c?.payoutSchedule ?? 'Not reported'),
                      opt: '1',
                    }),
                    cell({ t: x.riskPolicy, opt: '1', mw: '180px' }),
                  ],
                  d.a.admin && ok
                    ? [
                        x.enabled ? 'Disable' : 'Enable',
                        'Change primary / fallback',
                        'Test route',
                        'Preview impact',
                      ]
                    : d.a.admin
                      ? ['Change primary / fallback', 'Test route']
                      : ['Test route'],
                  [
                    x.method,
                    `${ok ? (x.enabled ? 'Enabled' : 'Disabled') : 'Not available'} · ${this.data.provName(x.primary)}`,
                    [],
                  ],
                );
              }),
            ),
          },
          info: '“Branches / stores” is each branch’s own accepted-methods setting (Branches). Payment links and the /pay page read this matrix; POS keeps every method available so a sale is never blocked.',
        }),
      ]),
    ];
  }

  private async branchesAccepting(
    brs: { id: string; name: string }[],
    method: string,
  ) {
    const key = (
      {
        Cash: 'cash',
        Card: 'card',
        Online: 'online',
        Wallet: 'online',
        'Bank transfer': 'online',
        'Mobile wallet': 'online',
      } as Record<string, string>
    )[method];
    if (!key) return '—';
    const rows = await this.db.business.findMany({
      where: { id: { in: brs.map((b) => b.id) } },
      select: { id: true, name: true, acceptedPaymentMethods: true },
    });
    const on = rows.filter(
      (r) =>
        Array.isArray(r.acceptedPaymentMethods) &&
        (r.acceptedPaymentMethods as string[]).includes(key),
    );
    if (!on.length) return 'None set';
    return on.length === rows.length ? 'All' : on.map((r) => r.name).join(', ');
  }

  condTxt(d: Data, c: RuleConds, names: Map<string, string>) {
    return [
      c.branch && `Branch ${names.get(c.branch) ?? '—'}`,
      c.channel && `Channel ${c.channel}`,
      c.country && `Country ${c.country}`,
      c.currency,
      c.minAmount && `≥ ${d.fmt.money(c.minAmount)}`,
      c.maxAmount && `≤ ${d.fmt.money(c.maxAmount)}`,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  // ===== 10 Reconciliation
  async vReconciliation(d: Data) {
    const S = d.s;
    const v = S.view.rcnView || 'exc';
    const all =
      S.env === 'live' && (!S.prov || S.prov === 'stripe')
        ? await this.db.payReconItem.findMany({
            where: { businessId: d.a.rootId, env: 'live' },
            orderBy: { occurredAt: 'desc' },
          })
        : [];
    const cnt = (st: string) => all.filter((r) => r.status === st).length;
    const kpis = [
      K(
        'rn:Matched',
        'Matched',
        cnt('Matched'),
        'Exact ID or confirmed',
        null,
        '#12A150',
      ),
      K(
        'rn:Unmatched Noxtill',
        'Unmatched Noxtill',
        cnt('Unmatched Noxtill'),
        'In Noxtill, not at provider',
        cnt('Unmatched Noxtill') ? '#B42318' : null,
        '#F04438',
      ),
      K(
        'rn:Unmatched Provider',
        'Unmatched Provider',
        cnt('Unmatched Provider'),
        'At provider, not in Noxtill',
        cnt('Unmatched Provider') ? '#B42318' : null,
        '#F04438',
      ),
      K(
        'rn:Amount Mismatch',
        'Amount Mismatch',
        cnt('Amount Mismatch'),
        '',
        null,
        '#F04438',
      ),
      K(
        'rn:Fee Mismatch',
        'Fee Mismatch',
        cnt('Fee Mismatch'),
        `Beyond ${d.pol.payout.feeVariancePct}% of your usual rate`,
        null,
        '#F79009',
      ),
      K(
        'rn:Resolved',
        'Resolved',
        cnt('Resolved') + cnt('Ignored'),
        'With recorded reason',
        null,
        '#12A150',
      ),
    ];
    const sg = seg(
      [
        ['sum', 'Summary'],
        [
          'exc',
          'Exceptions',
          all.filter(
            (r) => !['Matched', 'Resolved', 'Ignored'].includes(r.status),
          ).length,
        ],
        ['matched', 'Matched items', cnt('Matched')],
        ['batch', 'Provider batches'],
        ['log', 'Resolution log'],
      ],
      v,
    );
    const acts = [
      btn('rcn-auto', 'Auto match', 'primary', !d.a.recon),
      btn('export', 'Export', 'ghost', !d.a.export),
    ];
    if (!all.length)
      return [
        kpiRow(kpis),
        ...emptyRows(
          S.env === 'test'
            ? 'Reconciliation runs on live data only'
            : 'Nothing to reconcile yet',
          'Provider balance transactions are compared with Noxtill’s own records here — before Finance does bank reconciliation. Cash has nothing to reconcile with a provider.',
          d.conns.some((c) => c.provider === 'stripe')
            ? []
            : [btn('ext:/integrations', 'Open Integrations')],
        ),
      ];
    if (v === 'sum') {
      const byConn = [...new Set(all.map((r) => r.connectionId))];
      return [
        kpiRow(kpis),
        R('minmax(0,1fr) minmax(0,1fr)', [
          card({
            id: 'rcn-s',
            seg: sg,
            acts,
            title: 'Status',
            bars: mkBars(
              [
                'Matched',
                'Pending',
                'Suggested',
                'Amount Mismatch',
                'Fee Mismatch',
                'Unmatched Provider',
                'Unmatched Noxtill',
                'Manual Review',
                'Resolved',
                'Ignored',
              ]
                .map(
                  (s) =>
                    [
                      s,
                      cnt(s),
                      (
                        {
                          Matched: '#12A150',
                          Resolved: '#12A150',
                          Pending: '#98A2B3',
                          Suggested: '#6941C6',
                        } as Record<string, string>
                      )[s] ?? '#F04438',
                    ] as [string, number, string],
                )
                .filter((x) => x[1]),
              null,
            ),
          }),
          card({
            title: 'Match rate by provider',
            bars: mkBars(
              byConn.map((cid) => {
                const L = all.filter((r) => r.connectionId === cid);
                return [
                  this.data.provName(
                    d.conns.find((c) => c.id === cid)?.provider ?? 'stripe',
                  ),
                  Math.round(
                    (L.filter((r) => ['Matched', 'Resolved'].includes(r.status))
                      .length /
                      Math.max(1, L.length)) *
                      100,
                  ),
                ] as [string, number];
              }),
              '#12A150',
              (x) => `${x}%`,
            ),
            info: 'Matching order: exact provider reference → Noxtill metadata on the charge → constrained suggestion (currency, amount, ±15 minutes, customer). Amount alone never matches.',
          }),
        ]),
      ];
    }
    if (v === 'batch') {
      const b: Record<string, { n: number; g: number; ok: number }> = {};
      for (const r of all) {
        if (!r.batchRef) continue;
        b[r.batchRef] = b[r.batchRef] ?? { n: 0, g: 0, ok: 0 };
        b[r.batchRef].n++;
        b[r.batchRef].g += num(r.providerGross);
        if (['Matched', 'Resolved'].includes(r.status)) b[r.batchRef].ok++;
      }
      const L = Object.entries(b).sort((x, y) => (x[0] < y[0] ? 1 : -1));
      return [
        kpiRow(kpis),
        R('minmax(0,1fr)', [
          card({
            id: 'rcn-b',
            seg: sg,
            acts,
            table: L.length
              ? {
                  hasActs: false,
                  cols: cols([
                    'Batch',
                    'Provider',
                    'Lines',
                    'Provider gross',
                    'Matched',
                    'Status',
                  ]),
                  rows: L.map(([k, x]) =>
                    row(
                      k,
                      [
                        cell({ t: k, ff: 'ui-monospace,monospace', fw: 800 }),
                        cell({ t: 'Stripe' }),
                        cell({ t: String(x.n) }),
                        this.amtCell(d, x.g),
                        cell({ t: `${x.ok} / ${x.n}` }),
                        stc(x.ok === x.n ? 'Matched' : 'Manual Review'),
                      ],
                      [],
                      [k, `Stripe · ${x.ok}/${x.n}`, []],
                    ),
                  ),
                }
              : null,
            empty: L.length
              ? null
              : {
                  t: 'No payouts reported yet',
                  d: 'Lines are grouped by the payout that settled them.',
                  acts: [],
                },
          }),
        ]),
      ];
    }
    if (v === 'log') {
      const L = await this.db.payReconResolution.findMany({
        where: { businessId: d.a.rootId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      const names = await this.ctx.userNames(L.map((x) => x.byId));
      const items = new Map(all.map((r) => [r.id, r]));
      return [
        kpiRow(kpis),
        R('minmax(0,1fr)', [
          card({
            id: 'rcn-l',
            seg: sg,
            acts,
            table: L.length
              ? {
                  hasActs: false,
                  cols: cols([
                    'Item',
                    'Provider ref',
                    'Resolution',
                    'Method',
                    'By',
                    'When',
                  ]),
                  rows: L.map((x) =>
                    row(
                      x.id,
                      [
                        cell({ t: x.itemId.slice(0, 8), fw: 800 }),
                        cell({
                          t: items.get(x.itemId)?.providerRef ?? '—',
                          ff: 'ui-monospace,monospace',
                        }),
                        cell({ t: `${x.action} · ${x.reason}`, mw: '320px' }),
                        cell({ t: items.get(x.itemId)?.matchMethod ?? '—' }),
                        cell({ t: names.get(x.byId) ?? '—' }),
                        cell({ t: d.fmt.dtm(x.createdAt) }),
                      ],
                      [],
                      [x.action, x.reason, []],
                    ),
                  ),
                }
              : null,
            empty: L.length
              ? null
              : {
                  t: 'No manual resolutions yet',
                  d: 'Manual matches, adjustments and ignores are logged here with their reason.',
                  acts: [],
                },
          }),
        ]),
      ];
    }
    const L =
      v === 'matched'
        ? all.filter((r) => r.status === 'Matched')
        : all.filter(
            (r) => !['Matched', 'Resolved', 'Ignored'].includes(r.status),
          );
    const pg = this.paged(d, 'reconciliation', L);
    const txs = new Map(
      (
        await this.db.payTransaction.findMany({
          where: {
            id: {
              in: pg.rows
                .flatMap((r) => [r.txId, r.candidateTxId])
                .filter((x): x is string => !!x),
            },
          },
        })
      ).map((t) => [t.id, t]),
    );
    const f = d.a.fees;
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'rec',
          seg: sg,
          acts,
          table: L.length
            ? {
                hasActs: true,
                cols: cols([
                  'Provider ref',
                  'Noxtill transaction',
                  ['Type', '1'],
                  'Provider gross',
                  'Noxtill gross',
                  ['Provider fee', '1'],
                  ['Noxtill fee', '1'],
                  ['Time', '1'],
                  'Difference',
                  'Confidence',
                  'Status',
                ]),
                rows: pg.rows.map((r) => {
                  const diff =
                    r.providerGross != null && r.noxtillGross != null
                      ? num(r.providerGross) - num(r.noxtillGross)
                      : null;
                  const fd =
                    r.providerFee != null && r.noxtillFee != null
                      ? num(r.providerFee) - num(r.noxtillFee)
                      : null;
                  const tx = r.txId ? txs.get(r.txId) : null;
                  const cand = r.candidateTxId
                    ? txs.get(r.candidateTxId)
                    : null;
                  return row(
                    r.id,
                    [
                      cell({
                        t: r.providerRef.startsWith('nx:')
                          ? '—'
                          : r.providerRef,
                        ff: 'ui-monospace,monospace',
                        fw: 700,
                        s: `Stripe · ${r.batchRef ?? 'not in a payout yet'}`,
                      }),
                      cell({
                        t: tx
                          ? tx.number
                          : cand
                            ? `Candidate ${cand.number}`
                            : '—',
                        fg: tx ? '#101828' : '#667085',
                        s: tx ? this.data.srcLabel(tx) : '',
                      }),
                      cell({ t: r.type, opt: '1' }),
                      cell({
                        t:
                          r.providerGross == null
                            ? 'Not reported'
                            : d.fmt.money(num(r.providerGross), r.currency),
                      }),
                      cell({
                        t:
                          r.noxtillGross == null
                            ? 'Not in Noxtill'
                            : d.fmt.money(num(r.noxtillGross), r.currency),
                      }),
                      cell({
                        t: f
                          ? d.fmt.money(
                              r.providerFee == null ? null : num(r.providerFee),
                              r.currency,
                            )
                          : '🔒',
                        opt: '1',
                      }),
                      cell({
                        t: f
                          ? d.fmt.money(
                              r.noxtillFee == null ? null : num(r.noxtillFee),
                              r.currency,
                            )
                          : '🔒',
                        opt: '1',
                      }),
                      cell({ t: d.fmt.dtm(r.occurredAt), opt: '1' }),
                      cell({
                        t:
                          diff && Math.abs(diff) >= 0.005
                            ? d.fmt.money(diff, r.currency)
                            : r.status === 'Fee Mismatch' && f
                              ? (r.note ?? 'Fee')
                              : fd && f && Math.abs(fd) >= 0.005
                                ? `Fee ${d.fmt.money(fd, r.currency)}`
                                : '—',
                        fg:
                          (diff && Math.abs(diff) >= 0.005) ||
                          r.status === 'Fee Mismatch'
                            ? '#B42318'
                            : '#344054',
                        fw: 700,
                        mw: '200px',
                      }),
                      cell({
                        t: r.confidence ?? '—',
                        s: r.status === 'Suggested' ? 'Suggestion only' : '',
                      }),
                      stc(r.status),
                    ],
                    this.recActs(d, r),
                    [
                      `${r.providerRef} · ${r.status}`,
                      `${tx?.number ?? '—'}${diff ? ` · diff ${d.fmt.money(diff)}` : ''}`,
                      [chip(r.status)],
                    ],
                  );
                }),
              }
            : null,
          pager: pg.pager,
          empty: L.length
            ? null
            : {
                t: v === 'matched' ? 'No matched items' : 'No exceptions',
                d: 'Everything in scope reconciles.',
                acts: [],
              },
          info: 'Provider reconciliation is NOT bank reconciliation — bank matching stays in Finance & Accounting.',
        }),
      ]),
    ];
  }

  recActs(d: Data, r: { status: string; type: string }) {
    const o = ['Open'];
    if (!d.a.recon) return o;
    if (r.status === 'Suggested') o.push('Confirm suggested match');
    if (!['Matched', 'Resolved', 'Ignored'].includes(r.status)) {
      o.push(
        'Manual match',
        'Split match',
        'Mark provider adjustment',
        'Send to Finance review',
        'Ignore with reason',
      );
    }
    return o;
  }

  // ===== 11 Settings
  async vSettings(
    d: Data,
    draftIn: Record<string, Record<string, unknown>> | null,
  ) {
    const pol = d.pol;
    const D = (
      draftIn
        ? { ...JSON.parse(JSON.stringify(pol)), ...draftIn }
        : JSON.parse(JSON.stringify(pol))
    ) as typeof pol;
    const sec = (SECS.find((x) => x[0] === d.s.sec) ?? SECS[0])[0];
    const dis = !d.a.admin;
    const cur = d.base;
    const members = await this.ctx.members(d.a.rootId);
    const F: Record<string, unknown[]> = {
      collection: [
        fSel(
          'Capture mode',
          'collection.captureMode',
          D.collection.captureMode,
          ['Automatic', 'Manual for selected flows'],
          {
            dis,
            h: 'Manual capture authorizes first and captures later. Only Stripe supports separate capture.',
          },
        ),
        fChips(
          'Manual capture applies to',
          'collection.manualCaptureFor',
          ['Booking deposits', 'Requests above the review threshold'],
          D.collection.manualCaptureFor,
          { dis },
        ),
        fTog(
          'Allow partial payments on requests',
          'collection.partialPayments',
          D.collection.partialPayments,
          { dis },
        ),
        fTxt(
          `Minimum request (${cur})`,
          'collection.minRequest',
          D.collection.minRequest,
          { type: 'number', dis },
        ),
        fTxt(
          `Maximum request (${cur})`,
          'collection.maxRequest',
          D.collection.maxRequest,
          { type: 'number', dis },
        ),
        fTxt(
          'Default request expiry (days)',
          'collection.requestExpiryDays',
          D.collection.requestExpiryDays,
          { type: 'number', dis },
        ),
      ],
      retry: [
        fTxt('Max attempts', 'retry.maxAttempts', D.retry.maxAttempts, {
          type: 'number',
          dis,
          h: 'High-risk: more attempts can raise issuer fraud flags.',
        }),
        fTxt('Retry intervals', 'retry.intervals', D.retry.intervals, {
          dis,
          h: 'Minimum gap before each manual retry, e.g. “6h, 24h, 72h”. Stripe also retries subscription invoices on the schedule in your Stripe Billing settings.',
        }),
        fSel(
          'Soft declines',
          'retry.soft',
          D.retry.soft,
          ['Retry on schedule', 'Ask customer first'],
          { dis },
        ),
        fSel(
          'Hard declines',
          'retry.hard',
          D.retry.hard,
          ['Never retry — ask for a new method'],
          {
            dis: true,
            h: 'Fixed: hard declines and risk blocks are never retried.',
          },
        ),
        fSel(
          'After max attempts',
          'retry.pauseAfter',
          D.retry.pauseAfter,
          ['Pause recovery after max attempts', 'Mark unrecoverable'],
          { dis },
        ),
      ],
      refund: [
        fChips(
          'Roles that can execute',
          'refund.roles',
          ['Owner', 'Manager', 'Staff'],
          D.refund.roles,
          {
            dis,
            h: 'They also need the “payments.refund” capability (Staff › Roles).',
          },
        ),
        fTxt(
          `Owner approval above (${cur})`,
          'refund.approvalAbove',
          D.refund.approvalAbove,
          {
            type: 'number',
            dis,
            h: 'Routed to Action Center. Approval is on execution only — the refund decision stays in Orders.',
          },
        ),
        fTog(
          'Allow partial refund execution',
          'refund.partial',
          D.refund.partial,
          { dis },
        ),
        fRead(
          'Upstream approval',
          'Always required — Payments can’t execute a refund Orders hasn’t approved.',
        ),
      ],
      disputes: [
        fTxt(
          'Warn before deadline (days)',
          'disputes.warnDays',
          D.disputes.warnDays,
          { type: 'number', dis },
        ),
        fSel(
          'Default owner',
          'disputes.ownerId',
          D.disputes.ownerId ?? '',
          [
            { v: '', t: 'Unassigned' },
            ...members.map((m) => ({ v: m.id, t: m.name })),
          ],
          { dis },
        ),
        fTxt(
          'Evidence review policy',
          'disputes.evidenceReview',
          D.disputes.evidenceReview,
          { dis },
        ),
        fTxt(
          `Owner approval to submit above (${cur})`,
          'disputes.submitApprovalAbove',
          D.disputes.submitApprovalAbove,
          { type: 'number', dis },
        ),
        fTog(
          'Let AI auto-submit low-value responses',
          'disputes.aiAutoSubmit',
          false,
          {
            dis: true,
            h: 'Off and locked — AI drafts only; a person always submits.',
          },
        ),
      ],
      payout: [
        fTxt(
          'Delay alert after (hours)',
          'payout.delayHours',
          D.payout.delayHours,
          { type: 'number', dis },
        ),
        fTxt(
          'Hold alert above (% of balance)',
          'payout.holdPct',
          D.payout.holdPct,
          { type: 'number', dis },
        ),
        fTxt(
          'Unexpected fee variance (%)',
          'payout.feeVariancePct',
          D.payout.feeVariancePct,
          {
            type: 'number',
            dis,
            h: 'Reconciliation flags a fee this far from your own usual rate.',
          },
        ),
      ],
      messaging: [
        fSel(
          'Receipts',
          'messaging.receipts',
          D.messaging.receipts,
          [
            'Email + WhatsApp via Unified Inbox',
            'Email only via Unified Inbox',
            'Off',
          ],
          { dis, h: 'Sent automatically when a provider confirms a payment.' },
        ),
        fSel(
          'Payment request channel',
          'messaging.requestChannel',
          D.messaging.requestChannel,
          [
            'WhatsApp via Unified Inbox',
            'SMS via Unified Inbox',
            'Email via Unified Inbox',
          ],
          { dis },
        ),
        fSel(
          'Failure notifications',
          'messaging.failureNotify',
          D.messaging.failureNotify,
          [
            'After 1st failed attempt',
            'After 2nd failed attempt',
            'Never automatically',
          ],
          { dis },
        ),
        fRead(
          'Where messages live',
          'Unified Inbox — Payments keeps only a delivery reference.',
        ),
      ],
      risk: [
        fRead(
          'Provider risk state',
          'Provider risk state is final — no manual override.',
        ),
        fTxt(
          `Manual review above (${cur})`,
          'risk.manualReviewAbove',
          D.risk.manualReviewAbove,
          {
            type: 'number',
            dis,
            h: 'Failed payments at or above this amount are flagged as high-value in Needs attention.',
          },
        ),
        fChips(
          'Manual review triggers',
          'risk.triggers',
          ['Provider risk block', 'Amount over threshold'],
          D.risk.triggers,
          { dis },
        ),
      ],
      retention: [
        fSel(
          'Operational records',
          'retention.operational',
          D.retention.operational,
          ['5 years', '7 years', '10 years'],
          { dis },
        ),
        fSel(
          'Provider raw events',
          'retention.rawEvents',
          D.retention.rawEvents,
          [
            '6 months (sanitised)',
            '13 months (sanitised)',
            '24 months (sanitised)',
          ],
          {
            dis,
            h: 'Older sanitised event payloads are deleted by a nightly job.',
          },
        ),
        fSel(
          'Exports',
          'retention.exportPII',
          D.retention.exportPII,
          ['Masked unless Owner', 'Always masked'],
          { dis },
        ),
      ],
      safeguards: [
        fTog(
          'Confirm every live money action',
          'safeguards.liveConfirm',
          D.safeguards.liveConfirm,
          { dis },
        ),
        fTog(
          'Keep test data out of live totals',
          'safeguards.testSeparate',
          true,
          { dis: true, h: 'Always on — can’t be disabled.' },
        ),
        fTxt(
          'Delete test data after (days)',
          'safeguards.testRetentionDays',
          D.safeguards.testRetentionDays,
          { type: 'number', dis },
        ),
        fTxt(
          'Mark provider data stale after (minutes)',
          'safeguards.staleMinutes',
          D.safeguards.staleMinutes,
          { type: 'number', dis },
        ),
        fRead(
          'Current environment',
          d.s.env === 'live' ? 'LIVE — real money' : 'TEST MODE — sandbox only',
        ),
      ],
    };
    const fields = [
      ...(F[sec] ?? []),
      fBtns('', [
        btn('pol-test', 'Test policy'),
        btn('pol-reset', 'Reset section', 'ghost', dis),
        ...(sec === 'collection' || sec === 'retry'
          ? [
              btn('ext:/integrations', 'Open Integrations'),
              btn('ext:/settings?category=money', 'Open Taxes & Currency'),
            ]
          : []),
      ]),
    ];
    const dirtyOf = (k: string) =>
      JSON.stringify((D as unknown as Record<string, unknown>)[k]) !==
      JSON.stringify((pol as unknown as Record<string, unknown>)[k]);
    const dn = SECS.filter((x) => dirtyOf(x[0])).length;
    const curSec = SECS.find((x) => x[0] === sec) ?? SECS[0];
    return {
      nav: SECS.map(([k, t]) => ({
        k,
        t,
        cur: k === sec ? 'page' : null,
        bg: k === sec ? '#ECFDF3' : 'transparent',
        fg: k === sec ? '#0E8442' : '#344054',
        fw: k === sec ? 800 : 600,
        dirty: dirtyOf(k),
      })),
      sec: { k: sec, t: curSec[1], d: curSec[2] },
      v: d.policyVersion,
      readOnly: dis,
      roText: `Read-only for ${d.a.roleLabel}. Owners and people with “payments.admin” change payment policy (checked server-side).`,
      fields,
      dirty: dn > 0,
      dirtyN: dn,
      nextV: d.policyVersion + 1,
      policy: pol,
    };
  }
}
