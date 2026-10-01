import { Injectable } from '@nestjs/common';
import { FinAccount, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  FinanceContextService,
  monthEnd,
  monthLabel,
  monthStart,
  num,
  r2,
} from './finance-context.service';
import {
  DEBIT_NATURE,
  FinanceConfig,
  MONTHS,
  PL_TYPES,
} from './finance.constants';

export interface Range {
  key: string;
  label: string;
  from: Date;
  to: Date;
  prior: { from: Date; to: Date; label: string };
  /** Fiscal year start for the range end (retained earnings vs current-period earnings split). */
  fyStart: Date;
}

export interface Scope {
  rootId: string;
  branchId: string | null;
  range: Range;
}

export type Totals = Map<string, { dr: number; cr: number }>;

export interface StmtRow {
  kind: 'head' | 'line' | 'total' | 'grand';
  l: string;
  a: number | null;
  b: number | null;
  code: string;
}

const fmtDay = (d: Date) =>
  `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;

/** Signed balance in the account's natural direction (credit-nature accounts read positive on credit). */
export function natural(a: Pick<FinAccount, 'type'>, dr: number, cr: number) {
  return r2(DEBIT_NATURE.has(a.type) ? dr - cr : cr - dr);
}

/**
 * Everything the reports read: posted lines only (drafts, approvals and failed journals never
 * affect a balance). P&L, Balance Sheet, Cash Flow and Trial Balance are all computed here from
 * the same line totals, so they agree with each other and with the General Ledger by construction.
 */
@Injectable()
export class FinanceLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FinanceContextService,
  ) {}

  // ── scope ────────────────────────────────────────────────────────────────

  fyStartMonth(cfg: FinanceConfig) {
    return Math.max(1, MONTHS.indexOf(cfg.profile.fyStart) + 1);
  }

  fyStartFor(cfg: FinanceConfig, d: Date) {
    const m = this.fyStartMonth(cfg);
    const y =
      d.getUTCMonth() + 1 >= m ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
    return monthStart(y, m);
  }

  /** `2026-09` (month), `2026-Q3` (calendar quarter), `FY2026` (fiscal year to date). */
  range(
    cfg: FinanceConfig,
    key: string | undefined,
    today = new Date(),
  ): Range {
    const now = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    let m = /^(\d{4})-(\d{2})$/.exec(key ?? '');
    if (!key || (!m && !/^\d{4}-Q[1-4]$/.test(key) && !/^FY\d{4}$/.test(key))) {
      key = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      m = /^(\d{4})-(\d{2})$/.exec(key);
    }
    if (m) {
      const y = +m[1];
      const mo = +m[2];
      const py = mo === 1 ? y - 1 : y;
      const pm = mo === 1 ? 12 : mo - 1;
      const to = monthEnd(y, mo);
      return {
        key,
        label: monthLabel(y, mo),
        from: monthStart(y, mo),
        to,
        prior: {
          from: monthStart(py, pm),
          to: monthEnd(py, pm),
          label: monthLabel(py, pm),
        },
        fyStart: this.fyStartFor(cfg, to),
      };
    }
    const q = /^(\d{4})-Q([1-4])$/.exec(key);
    if (q) {
      const y = +q[1];
      const n = +q[2];
      const sm = (n - 1) * 3 + 1;
      const to = monthEnd(y, sm + 2);
      const py = n === 1 ? y - 1 : y;
      const pn = n === 1 ? 4 : n - 1;
      const psm = (pn - 1) * 3 + 1;
      return {
        key,
        label: `Q${n} ${y}`,
        from: monthStart(y, sm),
        to,
        prior: {
          from: monthStart(py, psm),
          to: monthEnd(py, psm + 2),
          label: `Q${pn} ${py}`,
        },
        fyStart: this.fyStartFor(cfg, to),
      };
    }
    const fy = +key.slice(2);
    const sm = this.fyStartMonth(cfg);
    const from = monthStart(sm === 1 ? fy : fy - 1, sm);
    const fyEnd = new Date(
      Date.UTC(from.getUTCFullYear() + 1, from.getUTCMonth(), 0),
    );
    const to = fyEnd < now ? fyEnd : now;
    const span = to.getTime() - from.getTime();
    const pFrom = new Date(
      Date.UTC(from.getUTCFullYear() - 1, from.getUTCMonth(), 1),
    );
    return {
      key,
      label: `FY${fy} YTD`,
      from,
      to,
      prior: {
        from: pFrom,
        to: new Date(pFrom.getTime() + span),
        label: `FY${fy - 1} same period`,
      },
      fyStart: from,
    };
  }

  // ── totals ───────────────────────────────────────────────────────────────

  private where(
    rootId: string,
    branchId: string | null,
    from: Date | null,
    to: Date,
  ): Prisma.FinJournalLineWhereInput {
    return {
      businessId: rootId,
      postedAt: { not: null },
      accountId: { not: null },
      date: from ? { gte: from, lte: to } : { lte: to },
      ...(branchId ? { branchId } : {}),
    };
  }

  async totals(
    rootId: string,
    branchId: string | null,
    from: Date | null,
    to: Date,
  ): Promise<Totals> {
    const rows = await this.prisma.finJournalLine.groupBy({
      by: ['accountId'],
      where: this.where(rootId, branchId, from, to),
      _sum: { debit: true, credit: true },
    });
    return new Map(
      rows.map((r) => [
        r.accountId!,
        { dr: num(r._sum.debit), cr: num(r._sum.credit) },
      ]),
    );
  }

  async balanceOf(
    rootId: string,
    accountId: string,
    asAt: Date,
    branchId: string | null = null,
  ) {
    const t = await this.prisma.finJournalLine.aggregate({
      where: { ...this.where(rootId, branchId, null, asAt), accountId },
      _sum: { debit: true, credit: true },
    });
    return { dr: num(t._sum.debit), cr: num(t._sum.credit) };
  }

  bal(t: Totals, a: FinAccount) {
    const x = t.get(a.id);
    return x ? natural(a, x.dr, x.cr) : 0;
  }

  /** Header rows roll up their children's natural balances (in the header's own type). */
  rollup(accounts: FinAccount[], t: Totals): Map<string, number> {
    const out = new Map<string, number>();
    const kids = new Map<string, FinAccount[]>();
    for (const a of accounts)
      if (a.parentId)
        kids.set(a.parentId, [...(kids.get(a.parentId) ?? []), a]);
    const walk = (a: FinAccount): number => {
      if (out.has(a.id)) return out.get(a.id)!;
      const x = t.get(a.id);
      let v = x ? x.dr - x.cr : 0;
      for (const k of kids.get(a.id) ?? []) {
        const kv = walk(k);
        v += DEBIT_NATURE.has(k.type) ? kv : -kv;
      }
      const res = r2(DEBIT_NATURE.has(a.type) ? v : -v);
      out.set(a.id, res);
      return res;
    };
    accounts.forEach(walk);
    return out;
  }

  // ── statements ───────────────────────────────────────────────────────────

  private isCash(a: FinAccount) {
    return a.type === 'asset' && (a.subtype === 'Cash' || a.subtype === 'Bank');
  }

  async pnl(scope: Scope, accounts: FinAccount[], compare: boolean) {
    const { rootId, branchId, range } = scope;
    const [cur, prev] = await Promise.all([
      this.totals(rootId, branchId, range.from, range.to),
      compare
        ? this.totals(rootId, branchId, range.prior.from, range.prior.to)
        : Promise.resolve(new Map() as Totals),
    ]);
    const rows: StmtRow[] = [];
    const sum = { a: 0, b: 0 };
    const section = (types: string[], filter?: (a: FinAccount) => boolean) => {
      let a = 0;
      let b = 0;
      for (const acct of accounts.filter(
        (x) => types.includes(x.type) && !x.isHeader && (!filter || filter(x)),
      )) {
        const va = this.bal(cur, acct);
        const vb = this.bal(prev, acct);
        if (!va && !vb) continue;
        rows.push({
          kind: 'line',
          l: acct.name,
          a: va,
          b: compare ? vb : null,
          code: acct.code,
        });
        a += va;
        b += vb;
      }
      return { a: r2(a), b: r2(b) };
    };
    const t = (
      l: string,
      v: { a: number; b: number },
      kind: 'total' | 'grand' = 'total',
    ) =>
      rows.push({ kind, l, a: r2(v.a), b: compare ? r2(v.b) : null, code: '' });
    rows.push({ kind: 'head', l: 'Revenue', a: null, b: null, code: '' });
    const rev = section(['revenue']);
    t('Total revenue', rev);
    rows.push({ kind: 'head', l: 'Cost of Sales', a: null, b: null, code: '' });
    const cos = section(['cos']);
    const gp = { a: rev.a - cos.a, b: rev.b - cos.b };
    t('Gross profit', gp);
    rows.push({
      kind: 'head',
      l: 'Operating Expenses',
      a: null,
      b: null,
      code: '',
    });
    const opx = section(['expense']);
    t('Total operating expenses', opx);
    const op = { a: gp.a - opx.a, b: gp.b - opx.b };
    t('Operating profit', op);
    rows.push({
      kind: 'head',
      l: 'Other Income / Expense',
      a: null,
      b: null,
      code: '',
    });
    const oi = section(['other_inc']);
    t('Total other income', oi);
    const oe = section(['other_exp']);
    sum.a = op.a + oi.a - oe.a;
    sum.b = op.b + oi.b - oe.b;
    t('Net profit', sum, 'grand');
    return { rows, net: r2(sum.a), netPrior: r2(sum.b) };
  }

  async balanceSheet(scope: Scope, accounts: FinAccount[], compare: boolean) {
    const { rootId, branchId, range } = scope;
    const asAts = [range.to, range.prior.to];
    const calc = async (asAt: Date) => {
      const all = await this.totals(rootId, branchId, null, asAt);
      const fy = this.fyStartFor(await this.ctx.config(rootId), asAt);
      const ytd = await this.totals(rootId, branchId, fy, asAt);
      const plOf = (t: Totals) =>
        accounts
          .filter((a) => PL_TYPES.has(a.type))
          .reduce((s, a) => {
            const x = t.get(a.id);
            return s + (x ? x.cr - x.dr : 0);
          }, 0);
      const plAll = plOf(all);
      const plYtd = plOf(ytd);
      return { all, current: r2(plYtd), prior: r2(plAll - plYtd) };
    };
    const A = await calc(asAts[0]);
    const B = compare
      ? await calc(asAts[1])
      : { all: new Map() as Totals, current: 0, prior: 0 };
    const rows: StmtRow[] = [];
    const line = (acct: FinAccount, extraA = 0, extraB = 0, label?: string) => {
      const va = r2(this.bal(A.all, acct) + extraA);
      const vb = r2(this.bal(B.all, acct) + extraB);
      if (!va && !vb) return { a: 0, b: 0 };
      rows.push({
        kind: 'line',
        l: label ?? acct.name,
        a: va,
        b: compare ? vb : null,
        code: acct.code,
      });
      return { a: va, b: vb };
    };
    const add = (x: { a: number; b: number }, y: { a: number; b: number }) => ({
      a: x.a + y.a,
      b: x.b + y.b,
    });
    const tot = (
      l: string,
      v: { a: number; b: number },
      kind: 'total' | 'grand' = 'total',
    ) =>
      rows.push({ kind, l, a: r2(v.a), b: compare ? r2(v.b) : null, code: '' });
    const postable = accounts.filter((a) => !a.isHeader);
    rows.push({ kind: 'head', l: 'Assets', a: null, b: null, code: '' });
    let cur = { a: 0, b: 0 };
    for (const a of postable.filter(
      (x) => x.type === 'asset' && x.control !== 'fa',
    ))
      cur = add(cur, line(a));
    tot('Current assets', cur);
    let fa = { a: 0, b: 0 };
    for (const a of postable.filter(
      (x) => x.type === 'asset' && x.control === 'fa',
    ))
      fa = add(fa, line(a));
    tot('Net fixed assets', fa);
    const ta = add(cur, fa);
    tot('Total assets', ta, 'grand');
    rows.push({ kind: 'head', l: 'Liabilities', a: null, b: null, code: '' });
    let li = { a: 0, b: 0 };
    for (const a of postable.filter((x) => x.type === 'liability'))
      li = add(li, line(a));
    tot('Total liabilities', li);
    rows.push({ kind: 'head', l: 'Equity', a: null, b: null, code: '' });
    let eq = { a: 0, b: 0 };
    for (const a of postable.filter((x) => x.type === 'equity')) {
      if (a.systemKey === 'retained') eq = add(eq, line(a, A.prior, B.prior));
      else eq = add(eq, line(a));
    }
    if (
      !postable.some((x) => x.systemKey === 'retained') &&
      (A.prior || B.prior)
    ) {
      rows.push({
        kind: 'line',
        l: 'Retained earnings',
        a: A.prior,
        b: compare ? B.prior : null,
        code: '',
      });
      eq = add(eq, { a: A.prior, b: B.prior });
    }
    rows.push({
      kind: 'line',
      l: 'Current period earnings',
      a: A.current,
      b: compare ? B.current : null,
      code: 'PL',
    });
    eq = add(eq, { a: A.current, b: B.current });
    tot('Total equity', eq);
    const le = add(li, eq);
    tot('Total liabilities & equity', le, 'grand');
    return {
      rows,
      assets: r2(ta.a),
      liabilities: r2(li.a),
      equity: r2(eq.a),
      balanced: r2(ta.a) === r2(le.a),
      asAt: fmtDay(range.to),
      priorAsAt: fmtDay(range.prior.to),
    };
  }

  /** Indirect method: net profit plus the change in every non-cash balance sheet account. */
  async cashFlow(scope: Scope, accounts: FinAccount[]) {
    const { rootId, branchId, range } = scope;
    const dayBefore = new Date(range.from.getTime() - 86_400_000);
    const [open, close, mov] = await Promise.all([
      this.totals(rootId, branchId, null, dayBefore),
      this.totals(rootId, branchId, null, range.to),
      this.totals(rootId, branchId, range.from, range.to),
    ]);
    const postable = accounts.filter((a) => !a.isHeader);
    const pl = postable
      .filter((a) => PL_TYPES.has(a.type))
      .reduce((s, a) => {
        const x = mov.get(a.id);
        return s + (x ? x.cr - x.dr : 0);
      }, 0);
    const rows: StmtRow[] = [];
    const L = (l: string, v: number, code: string) => {
      if (r2(v)) rows.push({ kind: 'line', l, a: r2(v), b: null, code });
      return r2(v);
    };
    // Cash effect of an account's movement: assets up = cash out; liabilities/equity up = cash in.
    const effect = (a: FinAccount) => {
      const x = mov.get(a.id);
      return x ? r2(x.cr - x.dr) : 0;
    };
    const word = (a: FinAccount, v: number) => {
      const up = a.type === 'asset' ? v < 0 : v > 0;
      return `${up ? 'Increase' : 'Decrease'} in ${a.name.toLowerCase()}`;
    };
    rows.push({
      kind: 'head',
      l: 'Operating activities',
      a: null,
      b: null,
      code: '',
    });
    let opv = L('Net profit', pl, 'PL');
    for (const a of postable.filter((x) => x.systemKey === 'fa_accum'))
      opv += L('Depreciation', effect(a), a.code);
    for (const a of postable.filter(
      (x) =>
        (x.type === 'asset' && !this.isCash(x) && x.control !== 'fa') ||
        (x.type === 'liability' && x.subtype !== 'Long-term Liability'),
    )) {
      const v = effect(a);
      if (v) opv += L(word(a, v), v, a.code);
    }
    rows.push({
      kind: 'total',
      l: 'Net cash from operating activities',
      a: r2(opv),
      b: null,
      code: '',
    });
    rows.push({
      kind: 'head',
      l: 'Investing activities',
      a: null,
      b: null,
      code: '',
    });
    let inv = 0;
    for (const a of postable.filter(
      (x) => x.control === 'fa' && x.systemKey !== 'fa_accum',
    )) {
      const v = effect(a);
      if (v)
        inv += L(
          v < 0
            ? 'Purchase of fixed assets'
            : 'Disposal of fixed assets (cost)',
          v,
          a.code,
        );
    }
    rows.push({
      kind: 'total',
      l: 'Net cash from investing activities',
      a: r2(inv),
      b: null,
      code: '',
    });
    rows.push({
      kind: 'head',
      l: 'Financing activities',
      a: null,
      b: null,
      code: '',
    });
    let fin = 0;
    for (const a of postable.filter(
      (x) =>
        (x.type === 'liability' && x.subtype === 'Long-term Liability') ||
        x.type === 'equity',
    )) {
      const v = effect(a);
      if (v)
        fin += L(
          `${v > 0 ? 'Increase' : 'Decrease'} in ${a.name.toLowerCase()}`,
          v,
          a.code,
        );
    }
    rows.push({
      kind: 'total',
      l: 'Net cash from financing activities',
      a: r2(fin),
      b: null,
      code: '',
    });
    const net = r2(opv + inv + fin);
    const cashAccts = postable.filter((a) => this.isCash(a));
    const cashOpen = r2(cashAccts.reduce((s, a) => s + this.bal(open, a), 0));
    const cashClose = r2(cashAccts.reduce((s, a) => s + this.bal(close, a), 0));
    rows.push({
      kind: 'total',
      l: 'Net change in cash',
      a: net,
      b: null,
      code: '',
    });
    rows.push({
      kind: 'line',
      l: `Cash at ${fmtDay(range.from)}`,
      a: cashOpen,
      b: null,
      code: '',
    });
    rows.push({
      kind: 'grand',
      l: `Cash at ${fmtDay(range.to)}`,
      a: cashClose,
      b: null,
      code: '',
    });
    return {
      rows,
      ties: r2(cashOpen + net) === cashClose,
      net,
      cashOpen,
      cashClose,
    };
  }

  async trialBalance(scope: Scope, accounts: FinAccount[]) {
    const t = await this.totals(
      scope.rootId,
      scope.branchId,
      null,
      scope.range.to,
    );
    const rows: { code: string; name: string; dr: number; cr: number }[] = [];
    let dr = 0;
    let cr = 0;
    for (const a of accounts.filter((x) => !x.isHeader)) {
      const x = t.get(a.id);
      if (!x) continue;
      const v = r2(x.dr - x.cr);
      if (!v) continue;
      rows.push({
        code: a.code,
        name: a.name,
        dr: v > 0 ? v : 0,
        cr: v < 0 ? -v : 0,
      });
      if (v > 0) dr += v;
      else cr -= v;
    }
    return { rows, dr: r2(dr), cr: r2(cr), asAt: fmtDay(scope.range.to) };
  }
}
