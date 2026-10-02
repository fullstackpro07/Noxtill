import { HttpStatus, Injectable } from '@nestjs/common';
import { FinAccount, FinJournal } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import {
  Branch,
  FinActor,
  FinanceContextService,
  dayOf,
  monthEnd,
  monthKey,
  monthLabel,
  num,
  r2,
  FAR_FUTURE,
} from './finance-context.service';
import { FinanceLedgerService, Range, natural } from './finance-ledger.service';
import {
  FinanceSourcesService,
  SOURCE_MODULE,
} from './finance-sources.service';
import { FinanceBankingService, Suggestion } from './finance-banking.service';
import {
  FinanceReceivablesService,
  BUCKETS,
} from './finance-receivables.service';
import { FinancePayablesService } from './finance-payables.service';
import {
  FinanceTaxService,
  TAX_STEPS,
  TAX_STEP_AT,
} from './finance-tax.service';
import { FinanceAssetsService } from './finance-assets.service';
import { FinanceBudgetsService } from './finance-budgets.service';
import { FinanceCloseService } from './finance-close.service';
import { FinanceFxService } from './finance-fx.service';
import {
  ACCOUNT_TYPES,
  CLOSE_TEMPLATE,
  CONTROL_LABEL,
  FIN_ERRORS,
  MONTHS,
} from './finance.constants';
import {
  A,
  B,
  Kpi,
  M,
  Notice,
  S,
  T,
  Table,
  ago,
  chip,
  flow,
  kpi,
  md,
  mdy,
  money,
  notice,
  toneAmber,
  toneGray,
  toneRed,
  toneViolet,
} from './finance-format';

export const SCREEN_KEYS = [
  'overview',
  'coa',
  'gl',
  'journals',
  'bankacc',
  'feeds',
  'recon',
  'ar',
  'ap',
  'bills',
  'taxes',
  'fa',
  'budgets',
  'statements',
  'close',
  'settings',
] as const;
export type ScreenKey = (typeof SCREEN_KEYS)[number];

export interface ScopeQuery {
  period?: string;
  branch?: string;
  cur?: string;
  bver?: string;
  stmt?: string;
  cmp?: string;
  account?: string;
  source?: string;
  q?: string;
  bank?: string;
}

export interface Ctx {
  actor: FinActor;
  rootId: string;
  base: string;
  entity: string;
  branches: Branch[];
  branchId: string | null;
  range: Range;
  txn: boolean;
  accounts: FinAccount[];
  byId: Map<string, FinAccount>;
  byKey: Map<string, FinAccount>;
  periodStatus: string;
}

const MANUAL_OPEN = [
  'Draft',
  'Pending Review',
  'Approval Required',
  'Ready to Post',
  'Failed',
];

/**
 * Builds every Finance screen the way the design lays it out, from real queries only. Anything
 * Noxtill genuinely can't know is said plainly in the copy instead of being shown as a number.
 */
@Injectable()
export class FinanceViewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FinanceContextService,
    private readonly ledger: FinanceLedgerService,
    private readonly sources: FinanceSourcesService,
    private readonly banking: FinanceBankingService,
    private readonly ar: FinanceReceivablesService,
    private readonly ap: FinancePayablesService,
    private readonly tax: FinanceTaxService,
    private readonly assets: FinanceAssetsService,
    private readonly budgets: FinanceBudgetsService,
    private readonly close: FinanceCloseService,
    private readonly fx: FinanceFxService,
  ) {}

  // ── scope ────────────────────────────────────────────────────────────────

  async scope(actor: FinActor, q: ScopeQuery): Promise<Ctx> {
    const rootId = actor.rootId;
    const cfg = await this.ctx.config(rootId);
    const branches = await this.ctx.branches(rootId);
    let branchId =
      q.branch && q.branch !== 'all' && branches.some((b) => b.id === q.branch)
        ? q.branch
        : null;
    if (actor.scopeBranches) {
      if (!branchId || !actor.scopeBranches.includes(branchId))
        branchId = actor.scopeBranches[0];
    }
    const maps = await this.ctx.accountMaps(rootId);
    const range = this.ledger.range(cfg, q.period);
    const end = monthKey(range.to);
    const p = await this.ctx.period(rootId, end.year, end.month);
    const biz = await this.ctx.business(rootId);
    return {
      actor,
      rootId,
      base: biz.currency,
      entity: biz.name,
      branches,
      branchId,
      range,
      txn: q.cur === 'txn',
      accounts: maps.all,
      byId: maps.byId,
      byKey: maps.byKey,
      periodStatus: p.status,
    };
  }

  private m(c: Ctx, n: number | null | undefined, dp = 2) {
    return money(n, c.base, dp);
  }
  branchName(c: Ctx, id: string | null | undefined) {
    if (!id) return 'All';
    return c.branches.find((b) => b.id === id)?.name ?? '—';
  }
  private acctLabel(c: Ctx, id: string | null | undefined) {
    const a = id ? c.byId.get(id) : null;
    return a ? `${a.code} ${a.name}` : '—';
  }

  /** The left-nav badges and the scope bar's options. */
  async boot(actor: FinActor) {
    const rootId = actor.rootId;
    const settings = await this.ctx.settingsRow(rootId);
    const branches = await this.ctx.branches(rootId);
    const biz = await this.ctx.business(rootId);
    const cfg = await this.ctx.config(rootId);
    const today = dayOf(new Date());
    const first = await this.prisma.finJournalLine.findFirst({
      where: { businessId: rootId, postedAt: { not: null } },
      orderBy: { date: 'asc' },
      select: { date: true },
    });
    const periods: { k: string; l: string }[] = [];
    const tk = monthKey(today);
    const fk = first ? monthKey(first.date) : tk;
    let { year, month } = tk;
    for (
      let i = 0;
      i < 24 && year * 12 + month >= fk.year * 12 + fk.month;
      i++
    ) {
      periods.push({
        k: `${year}-${String(month).padStart(2, '0')}`,
        l: `${MONTHS[month - 1].slice(0, 3)} ${year}`,
      });
      month -= 1;
      if (month < 1) {
        month = 12;
        year -= 1;
      }
    }
    if (periods.length < 2)
      periods.push({
        k: `${tk.month === 1 ? tk.year - 1 : tk.year}-${String(tk.month === 1 ? 12 : tk.month - 1).padStart(2, '0')}`,
        l: `${MONTHS[(tk.month + 10) % 12].slice(0, 3)} ${tk.month === 1 ? tk.year - 1 : tk.year}`,
      });
    const q = Math.floor((tk.month - 1) / 3) + 1;
    periods.splice(Math.min(2, periods.length), 0, {
      k: `${tk.year}-Q${q}`,
      l: `Q${q} ${tk.year}`,
    });
    const fyStart = this.ledger.fyStartFor(cfg, today);
    const fy =
      this.ledger.fyStartMonth(cfg) === 1
        ? fyStart.getUTCFullYear()
        : fyStart.getUTCFullYear() + 1;
    periods.splice(Math.min(3, periods.length), 0, {
      k: `FY${fy}`,
      l: `FY${fy} YTD`,
    });
    const visible = actor.scopeBranches
      ? branches.filter((b) => actor.scopeBranches!.includes(b.id))
      : branches;
    return {
      actor: {
        name: actor.name,
        title: actor.title,
        role: actor.role,
        view: actor.view,
        manage: actor.manage,
        approve: actor.approve,
        admin: actor.admin,
        scoped: !!actor.scopeBranches,
      },
      entity: biz.name,
      base: biz.currency,
      branches: visible,
      allBranches: !actor.scopeBranches,
      periods,
      badges: await this.badges(rootId),
      sweep: {
        lastSweepAt: settings.lastSweepAt,
        backfilledAt: settings.backfilledAt,
        error: settings.sweepError,
        running: this.sources.isRunning(rootId),
      },
      settingsVersion: settings.version,
      periodStatus: Object.fromEntries(
        (
          await this.prisma.finPeriod.findMany({
            where: { businessId: rootId, status: { not: 'open' } },
          })
        ).map((p) => [
          `${p.year}-${String(p.month).padStart(2, '0')}`,
          p.status,
        ]),
      ),
      departments: cfg.departments,
      thresholds: cfg.thresholds,
      accounts: (await this.ctx.accounts(rootId)).map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
        header: a.isHeader,
        active: a.active,
        control: a.control,
        currency: a.currency,
        systemKey: a.systemKey,
      })),
      taxCodes: await this.prisma.finTaxCode.findMany({
        where: { businessId: rootId, active: true },
        select: { code: true, name: true, rate: true, kind: true },
      }),
      bankAccounts: (await this.banking.list(rootId)).map((b) => ({
        id: b.id,
        name: b.name,
        mask: b.mask,
        currency: b.currency,
        kind: b.kind,
        glAccountId: b.glAccountId,
        active: b.active,
      })),
    };
  }

  async badges(rootId: string): Promise<Record<string, number>> {
    const [jr, feeds, bills, recon] = await Promise.all([
      this.prisma.finJournal.count({
        where: {
          businessId: rootId,
          sourceType: null,
          status: { in: ['Approval Required', 'Pending Review'] },
        },
      }),
      this.prisma.finBankLine.count({
        where: {
          businessId: rootId,
          status: { in: ['New', 'Suggested', 'Needs Review'] },
        },
      }),
      this.prisma.finApproval.count({
        where: { businessId: rootId, subjectType: 'bill', status: 'Pending' },
      }),
      this.prisma.finReconciliation.count({
        where: {
          businessId: rootId,
          status: { in: ['In Progress', 'Reopened', 'Review Required'] },
        },
      }),
    ]);
    const failed = await this.prisma.finJournal.count({
      where: { businessId: rootId, status: 'Failed' },
    });
    const taxApprovals = await this.prisma.finApproval.count({
      where: { businessId: rootId, subjectType: 'tax', status: 'Pending' },
    });
    return { journals: jr + failed, feeds, bills, recon, taxes: taxApprovals };
  }

  // ── screens ──────────────────────────────────────────────────────────────

  async screen(actor: FinActor, key: string, q: ScopeQuery) {
    if (!(SCREEN_KEYS as readonly string[]).includes(key))
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Unknown Finance screen',
        HttpStatus.NOT_FOUND,
      );
    const c = await this.scope(actor, q);
    const base = {
      notices: [] as Notice[],
      kpis: [] as Kpi[],
      kpis2: [] as Kpi[],
      flow: null as ReturnType<typeof flow> | null,
      table: null as Table | null,
      freshness: await this.freshness(c),
      scope: {
        branchId: c.branchId,
        period: c.range.key,
        periodLabel: c.range.label,
        periodStatus: c.periodStatus,
      },
    };
    if (c.periodStatus === 'locked')
      base.notices.push(
        notice(
          'dark',
          `${c.range.label} is locked`,
          'You’re viewing a locked period — read-only. New postings need an authorized reopen.',
          actor.admin ? 'Reopen Period' : 'Request Reopen',
          `reopenPeriod:${c.range.key}`,
        ),
      );
    const s = await this.settingsNotice(c);
    if (s) base.notices.push(s);
    const fn = {
      overview: () => this.overview(c),
      coa: () => this.coa(c),
      gl: () => this.gl(c, q),
      journals: () => this.journalsScreen(c),
      bankacc: () => this.bankacc(c),
      feeds: () => this.feeds(c, q),
      recon: () => this.reconScreen(c),
      ar: () => this.arScreen(c),
      ap: () => this.apScreen(c),
      bills: () => this.billsScreen(c),
      taxes: () => this.taxScreen(c),
      fa: () => this.faScreen(c),
      budgets: () => this.budgetScreen(c, q),
      statements: () => this.statements(c, q),
      close: () => this.closeScreen(c),
      settings: () => this.settingsScreen(c),
    }[key as ScreenKey];
    const out = (await fn()) as Record<string, unknown> & {
      notices?: Notice[];
    };
    return {
      ...base,
      ...out,
      notices: [...base.notices, ...(out.notices ?? [])],
    };
  }

  private async freshness(c: Ctx) {
    if (c.periodStatus === 'locked') return 'Locked period · final figures';
    const s = await this.ctx.settingsRow(c.rootId);
    if (this.sources.isRunning(c.rootId))
      return 'Posting history into the ledger…';
    if (!s.backfilledAt)
      return 'Ledger not built yet — first posting run pending';
    return `Posted ledger · updated ${ago(s.lastSweepAt)}`;
  }

  private async settingsNotice(c: Ctx): Promise<Notice | null> {
    const s = await this.ctx.settingsRow(c.rootId);
    if (!s.backfilledAt && !this.sources.isRunning(c.rootId))
      return notice(
        'warn',
        'The ledger hasn’t been built yet',
        'Run the first posting run to turn your sales, payments, credit, returns, stock movements, expenses and deposits into journals. It runs automatically within a minute.',
        c.actor.manage ? 'Run Posting Now' : '',
        'sweep',
      );
    if (s.sweepError)
      return notice(
        'bad',
        'Some records couldn’t be posted',
        s.sweepError,
        c.actor.admin ? 'Open Settings' : '',
        'go:settings',
      );
    return null;
  }

  // ── overview ─────────────────────────────────────────────────────────────

  private cashAccounts(c: Ctx) {
    return c.accounts.filter(
      (a) =>
        a.type === 'asset' &&
        !a.isHeader &&
        (a.subtype === 'Cash' || a.subtype === 'Bank'),
    );
  }

  async controlFigures(c: Ctx) {
    const all = await this.ledger.totals(c.rootId, null, null, FAR_FUTURE);
    const arCtl = this.ledger.bal(all, c.byKey.get('ar')!);
    const apCtl = this.ledger.bal(all, c.byKey.get('ap')!);
    const items = await this.ar.items(c.rootId);
    const arSub = r2(items.reduce((s, i) => s + i.balanceBase, 0));
    const apItems = await this.ap.openItems(c.rootId);
    const apSub = r2(apItems.reduce((s, i) => s + i.openBase, 0));
    return { all, arCtl, apCtl, arSub, apSub, items, apItems };
  }

  async overview(c: Ctx) {
    const { range } = c;
    const t = await this.ledger.totals(c.rootId, c.branchId, null, range.to);
    const cash = this.cashAccounts(c);
    const cashBal = r2(cash.reduce((s, a) => s + this.ledger.bal(t, a), 0));
    const banks = await this.banking.list(c.rootId);
    const stale = banks.filter(
      (b) =>
        b.active &&
        b.kind !== 'cash' &&
        (!b.lastImportAt ||
          Date.now() - b.lastImportAt.getTime() > 3 * 86_400_000),
    );
    const cf = await this.controlFigures(c);
    const unrec = await this.prisma.finBankLine.groupBy({
      by: ['bankAccountId'],
      where: {
        businessId: c.rootId,
        status: { in: ['New', 'Suggested', 'Needs Review'] },
      },
      _count: true,
    });
    const unrecN = unrec.reduce((s, r) => s + r._count, 0);
    const lastFeed = banks.reduce<Date | null>(
      (d, b) =>
        b.lastImportAt && (!d || b.lastImportAt > d) ? b.lastImportAt : d,
      null,
    );
    const rets = await this.tax.list(c.rootId);
    const openRets = rets.filter((r) => r.status !== 'Filed');
    const nextRet = [...openRets].sort(
      (a, b) => a.ret.dueOn.getTime() - b.ret.dueOn.getTime(),
    )[0];
    const taxNet = r2(openRets.reduce((s, r) => s + r.calc.net, 0));
    const jrCounts = await this.prisma.finJournal.groupBy({
      by: ['status'],
      where: {
        businessId: c.rootId,
        sourceType: null,
        status: { in: MANUAL_OPEN },
      },
      _count: true,
    });
    const jc = (s: string) => jrCounts.find((x) => x.status === s)?._count ?? 0;
    const cp = await this.close.currentPeriod(c.rootId);
    const cv = await this.close.view(c.rootId, cp.year, cp.month);
    const doneN = cv.tasks.filter(
      (x) => x.status === 'Done' || x.status === 'N/A',
    ).length;
    const cfg = await this.ctx.config(c.rootId);
    const target = FinanceCloseService.closeDue(cfg, cp.year, cp.month);
    const bs = await this.ledger.balanceSheet(
      { rootId: c.rootId, branchId: c.branchId, range },
      c.accounts,
      false,
    );
    const reRow = bs.rows.find(
      (r) =>
        r.l === 'Retained earnings' || r.code === c.byKey.get('retained')?.code,
    );
    const retained = reRow?.a ?? 0;
    const fx = cash.filter((a) => a.currency && a.currency !== c.base);
    const kpis = [
      kpi({
        label: 'Bank & cash balance',
        value: this.m(c, cashBal, 0),
        state: stale.length ? 'Partial' : '',
        meta: `Book balance · ${mdy(range.to < dayOf(new Date()) ? range.to : dayOf(new Date()))} · ${c.base}`,
        def: `Sum of posted balances in ${cash.map((a) => a.code).join(', ') || 'cash & bank accounts'}.${fx.length ? ` ${fx.map((a) => a.currency).join(', ')} converted at the posted rates.` : ''}`,
        adv: stale.length
          ? `${stale.map((b) => b.name).join(', ')}: no statement imported in 3+ days — balance may be incomplete.`
          : `Accounts ${cash.map((a) => a.code).join(', ')}.`,
        go: 'bankacc',
        ic: 'cash',
      }),
      kpi({
        label: 'Accounts receivable',
        value: this.m(c, cf.arCtl, 0),
        state: r2(cf.arCtl - cf.arSub) ? 'Mismatch' : '',
        meta: `Open balance · ${mdy(dayOf(new Date()))} · ${c.base}`,
        def: 'What customers owe you, from completed sales less payments, credit and write-offs.',
        adv: `Control ${c.byKey.get('ar')!.code} ${this.m(c, cf.arCtl)} ${r2(cf.arCtl - cf.arSub) ? '≠' : '='} subledger ${this.m(c, cf.arSub)} · ${cf.items.filter((i) => i.balance > 0).length} open items`,
        go: 'ar',
        ic: 'ar',
      }),
      kpi({
        label: 'Accounts payable',
        value: this.m(c, cf.apSub, 0),
        state: r2(cf.apCtl - cf.apSub) ? 'Mismatch' : '',
        meta: `Open balance · ${mdy(dayOf(new Date()))} · ${c.base}`,
        def: 'What you owe vendors from posted bills less recorded payments.',
        adv: `Subledger ${this.m(c, cf.apSub)} vs control ${c.byKey.get('ap')!.code} ${this.m(c, cf.apCtl)}${r2(cf.apCtl - cf.apSub) ? ` — difference ${this.m(c, r2(cf.apCtl - cf.apSub))}` : ''}`,
        go: 'ap',
        ic: 'ap',
      }),
      kpi({
        label: 'Unreconciled transactions',
        value: String(unrecN),
        meta: `Bank feeds · ${banks.length} account${banks.length === 1 ? '' : 's'} · ${lastFeed ? `last import ${ago(lastFeed)}` : 'nothing imported yet'}`,
        def: 'Imported bank lines not yet matched, categorized or excluded.',
        adv:
          unrec
            .map(
              (r) =>
                `${banks.find((b) => b.id === r.bankAccountId)?.name ?? 'Account'}: ${r._count}`,
            )
            .join(' · ') || 'No open bank lines.',
        go: 'feeds',
        ic: 'feeds',
        ...toneAmber,
      }),
    ];
    const kpis2 = [
      kpi({
        label: 'Tax liability',
        value: this.m(c, taxNet, 0),
        state: openRets.length ? 'Estimated' : '',
        meta: nextRet
          ? `${nextRet.taxType} · due ${md(nextRet.ret.dueOn)}`
          : 'No open returns',
        def: 'Net tax from posted transactions across returns not yet filed. Estimated until each return is locked.',
        go: 'taxes',
        ic: 'taxes',
      }),
      kpi({
        label: 'Draft journals',
        value: String(jc('Draft') + jc('Pending Review')),
        meta: `${jc('Approval Required')} awaiting approval`,
        def: 'Journals not yet posted. They do not affect balances.',
        go: 'journals',
        seg: 'Draft',
        ic: 'journals',
      }),
      kpi({
        label: 'Close status',
        value: cv.run
          ? `${Math.round((doneN / Math.max(1, cv.tasks.length)) * 100)}%`
          : 'Not started',
        meta: `${monthLabel(cp.year, cp.month)} · target ${md(target)}`,
        def: cv.run
          ? `${doneN} of ${cv.tasks.length} controls complete.`
          : `The ${monthLabel(cp.year, cp.month)} close hasn’t been started.`,
        go: 'close',
        ic: 'close',
      }),
      kpi({
        label: 'Retained earnings',
        value: this.m(c, retained, 0),
        meta: `Before FY starting ${md(range.fyStart)}`,
        def: 'Earnings of prior financial years plus any entries to the retained earnings account.',
        go: 'statements',
        ic: 'statements',
      }),
    ];
    const attention = await this.attention(c, {
      unrecN,
      cf,
      rets,
      cv,
      cp,
      target,
      jc,
    });
    const health = await this.health(c, cf);
    const brief = await this.brief(c, cf, cv);
    return {
      kpis,
      kpis2,
      attention,
      health: health.rows,
      healthAt: health.at,
      brief,
    };
  }

  private async attention(
    c: Ctx,
    x: {
      unrecN: number;
      cf: Awaited<ReturnType<FinanceViewsService['controlFigures']>>;
      rets: Awaited<ReturnType<FinanceTaxService['list']>>;
      cv: Awaited<ReturnType<FinanceCloseService['view']>>;
      cp: { year: number; month: number };
      target: Date;
      jc: (s: string) => number;
    },
  ) {
    const items: {
      issue: string;
      impact: string;
      amt: string;
      due: string;
      owner: string;
      al: string;
      a: string;
      sev: 'bad' | 'warn';
      weight: number;
    }[] = [];
    const today = dayOf(new Date());
    const s = await this.ctx.settingsRow(c.rootId);
    if (s.sweepError)
      items.push({
        issue: 'Some source records couldn’t be posted',
        impact: s.sweepError.slice(0, 180),
        amt: '',
        due: 'Today',
        owner: 'Owner / Controller',
        al: 'Open Settings',
        a: 'go:settings',
        sev: 'bad',
        weight: 1e9,
      });
    const failed = await this.prisma.finJournal.findMany({
      where: { businessId: c.rootId, status: 'Failed' },
      select: { number: true, total: true, failureReason: true },
      take: 50,
    });
    if (failed.length)
      items.push({
        issue: `${failed.length} journal${failed.length === 1 ? '' : 's'} failed to post`,
        impact:
          failed[0].failureReason?.slice(0, 160) ?? 'Nothing was committed.',
        amt: this.m(c, r2(failed.reduce((a, j) => a + num(j.total), 0))),
        due: 'Today',
        owner: 'Finance team',
        al: 'Review Failed',
        a: 'goseg:journals|Failed',
        sev: 'bad',
        weight: 9e8,
      });
    if (x.unrecN)
      items.push({
        issue: `${x.unrecN} bank transaction${x.unrecN === 1 ? '' : 's'} need matching`,
        impact:
          'Books can’t reconcile until these are matched, categorized or excluded.',
        amt: '',
        due: 'Today',
        owner: 'Finance team',
        al: 'Review Transactions',
        a: 'go:feeds',
        sev: 'warn',
        weight: x.unrecN * 1000,
      });
    const over30 = x.cf.items.filter(
      (i) => i.balance > 0 && i.daysPastDue > 30,
    );
    if (over30.length) {
      const amt = r2(over30.reduce((a, i) => a + i.balanceBase, 0));
      const custs = new Set(over30.map((i) => i.customerId ?? i.customer)).size;
      const disp = over30.filter((i) => i.dispute).length;
      items.push({
        issue: `${this.m(c, amt, 0)} of receivables are over 30 days overdue`,
        impact: `${custs} customer${custs === 1 ? '' : 's'}${disp ? ` · ${disp} in dispute` : ''}. Cash you’ve earned but not collected.`,
        amt: this.m(c, amt, 0),
        due: '—',
        owner: 'Finance team',
        al: 'Review Overdue',
        a: 'goseg:ar|Overdue',
        sev: 'bad',
        weight: amt,
      });
    }
    const billAppr = await this.prisma.finApproval.findMany({
      where: { businessId: c.rootId, subjectType: 'bill', status: 'Pending' },
    });
    if (billAppr.length) {
      const dups = await this.prisma.finBill.count({
        where: { businessId: c.rootId, status: 'Review Required' },
      });
      const amt = r2(billAppr.reduce((a, b) => a + num(b.amount), 0));
      items.push({
        issue: `${billAppr.length} vendor bill${billAppr.length === 1 ? '' : 's'} require approval`,
        impact: dups
          ? `${dups} more bill${dups === 1 ? ' is' : 's are'} flagged for review (possible duplicate or match exception).`
          : 'Bills post to A/P only after approval.',
        amt: this.m(c, amt),
        due: '—',
        owner: billAppr.some((b) => b.approverRole === 'Owner/Controller')
          ? 'Owner / Controller'
          : 'Finance Manager',
        al: 'Review Bills',
        a: 'goseg:bills|Approval Required',
        sev: 'warn',
        weight: amt,
      });
    }
    const recons = await this.prisma.finReconciliation.findMany({
      where: {
        businessId: c.rootId,
        status: { in: ['In Progress', 'Reopened'] },
      },
    });
    for (const r of recons) {
      const w = await this.banking.workspace(c.rootId, r.id);
      if (w.diff)
        items.push({
          issue: `Bank reconciliation has a ${this.m(c, w.diff)} difference`,
          impact: `${w.account.name}, to ${mdy(r.periodEnd)}. Blocks the close.`,
          amt: this.m(c, w.diff),
          due: md(x.target),
          owner:
            (await this.ctx.userNames([r.preparedById])).get(
              r.preparedById ?? '',
            ) ?? 'Finance team',
          al: 'Open Reconciliation',
          a: `openRecon:${r.id}`,
          sev: 'bad',
          weight: Math.abs(w.diff) + 5e8,
        });
    }
    const jAppr = x.jc('Approval Required') + x.jc('Pending Review');
    if (jAppr) {
      const js = await this.prisma.finJournal.findMany({
        where: {
          businessId: c.rootId,
          sourceType: null,
          status: { in: ['Approval Required', 'Pending Review'] },
        },
        select: { total: true, preparedById: true },
      });
      const names = await this.ctx.userNames(js.map((j) => j.preparedById));
      const amt = r2(js.reduce((a, j) => a + num(j.total), 0));
      items.push({
        issue: `${jAppr} journal${jAppr === 1 ? '' : 's'} await review`,
        impact: `Prepared by ${[...new Set(js.map((j) => names.get(j.preparedById ?? '') ?? 'someone'))].join(', ')}. Not posted until approved.`,
        amt: this.m(c, amt, 0),
        due: '—',
        owner: 'Finance Manager',
        al: 'Review Journals',
        a: 'goseg:journals|Approval Required',
        sev: 'warn',
        weight: amt,
      });
    }
    for (const r of x.rets.filter((r) => r.status !== 'Filed')) {
      const days = Math.round(
        (r.ret.dueOn.getTime() - today.getTime()) / 86_400_000,
      );
      if (days > 14) continue;
      items.push({
        issue:
          days < 0
            ? `${r.taxType} return is ${-days} day${days === -1 ? '' : 's'} overdue`
            : `${r.taxType} return is due in ${days} day${days === 1 ? '' : 's'}`,
        impact: `${r.jurisdiction} · ${monthLabel(r.ret.periodStart.getUTCFullYear(), r.ret.periodStart.getUTCMonth() + 1)}${r.calc.exceptions.length ? ` · ${r.calc.exceptions.length} exception${r.calc.exceptions.length === 1 ? '' : 's'} to review` : ''}.`,
        amt: this.m(c, r.calc.net, 0),
        due: md(r.ret.dueOn),
        owner: 'Finance team',
        al: 'Review Tax Period',
        a: `openRec:taxes|${r.ret.id}`,
        sev: days < 0 ? 'bad' : 'warn',
        weight: Math.abs(r.calc.net) + (days < 0 ? 4e8 : 0),
      });
    }
    const overdueAp = (await this.ap.openItems(c.rootId)).filter(
      (i) => i.bill.dueDate < today && i.bill.status !== 'On Hold',
    );
    if (overdueAp.length) {
      const amt = r2(overdueAp.reduce((a, i) => a + i.openBase, 0));
      items.push({
        issue: `${overdueAp.length} vendor bill${overdueAp.length === 1 ? ' is' : 's are'} overdue`,
        impact: `Oldest due ${mdy(overdueAp[0].bill.dueDate)} · ${overdueAp[0].bill.vendorName}.`,
        amt: this.m(c, amt),
        due: md(overdueAp[0].bill.dueDate),
        owner: 'Finance team',
        al: 'Review Payables',
        a: 'goseg:ap|Overdue',
        sev: 'bad',
        weight: amt,
      });
    }
    if (x.cv.run && x.cv.run.status !== 'Hard Closed') {
      const open = x.cv.tasks.filter(
        (t) => t.status !== 'Done' && t.status !== 'N/A',
      );
      if (open.length)
        items.push({
          issue: `${monthLabel(x.cp.year, x.cp.month)} close has ${open.length} incomplete control${open.length === 1 ? '' : 's'}`,
          impact: `${open
            .slice(0, 4)
            .map((t) => t.task.title.toLowerCase())
            .join(', ')} need attention before final approval.`,
          amt: '',
          due: md(x.target),
          owner: 'Finance team',
          al: 'Open Close',
          a: 'go:close',
          sev: 'warn',
          weight: open.length * 100,
        });
    }
    items.sort((a, b) =>
      a.sev === b.sev ? b.weight - a.weight : a.sev === 'bad' ? -1 : 1,
    );
    return items.map((a) => ({
      issue: a.issue,
      impact: a.impact,
      amt: a.amt,
      hasAmt: !!a.amt,
      due: a.due,
      owner: a.owner,
      al: a.al,
      a: a.a,
      dot: a.sev === 'bad' ? '#B42318' : '#F79009',
      sev: a.sev === 'bad' ? 'High' : 'Medium',
    }));
  }

  /** The nightly control checks, computed now (the job stores the same result at 02:00). */
  async health(
    c: Ctx,
    cf?: Awaited<ReturnType<FinanceViewsService['controlFigures']>>,
  ) {
    cf = cf ?? (await this.controlFigures(c));
    const H = (
      l: string,
      v: string,
      s: 'ok' | 'warn' | 'fail',
      al = '',
      a = '',
    ) => {
      const map = {
        ok: ['#E8F7EE', '#0E8442', 'OK', 'M20 6 9 17l-5-5'],
        warn: ['#FEF6E7', '#B54708', 'Review', 'M12 8v4M12 16h.01'],
        fail: ['#FEF3F2', '#B42318', 'Mismatch', 'M18 6 6 18M6 6l12 12'],
      }[s];
      return {
        l,
        v,
        bg: map[0],
        fg: map[1],
        word: map[2],
        ip: map[3],
        al,
        a,
        hasA: !!al,
        s,
      };
    };
    const tot = await this.prisma.finJournalLine.aggregate({
      where: { businessId: c.rootId, postedAt: { not: null } },
      _sum: { debit: true, credit: true },
    });
    const dr = r2(num(tot._sum.debit));
    const cr = r2(num(tot._sum.credit));
    const rows = [
      H(
        'General ledger balanced',
        dr === cr
          ? `Debits = credits · ${this.m(c, dr)}`
          : `Debits ${this.m(c, dr)} ≠ credits ${this.m(c, cr)}`,
        dr === cr ? 'ok' : 'fail',
        dr === cr ? '' : 'Investigate',
        'go:gl',
      ),
    ];
    const arD = r2(cf.arCtl - cf.arSub);
    rows.push(
      H(
        'A/R control reconciled',
        arD
          ? `${c.byKey.get('ar')!.code} differs by ${this.m(c, arD)}`
          : `${c.byKey.get('ar')!.code} = subledger · ${this.m(c, cf.arCtl)}`,
        arD ? 'fail' : 'ok',
        arD ? 'Investigate' : '',
        'go:ar',
      ),
    );
    const apD = r2(cf.apCtl - cf.apSub);
    rows.push(
      H(
        'A/P control reconciled',
        apD
          ? `${c.byKey.get('ap')!.code} differs by ${this.m(c, apD)}`
          : `${c.byKey.get('ap')!.code} = subledger · ${this.m(c, cf.apCtl)}`,
        apD ? 'fail' : 'ok',
        apD ? 'Investigate' : '',
        'openRec:ap|AP-DIFF',
      ),
    );
    const banks = (await this.banking.list(c.rootId)).filter((b) => b.active);
    const today = dayOf(new Date());
    const lastEnd = monthEnd(
      today.getUTCMonth() === 0
        ? today.getUTCFullYear() - 1
        : today.getUTCFullYear(),
      today.getUTCMonth() === 0 ? 12 : today.getUTCMonth(),
    );
    let recOk = 0;
    for (const b of banks)
      if (
        await this.prisma.finReconciliation.findFirst({
          where: {
            businessId: c.rootId,
            bankAccountId: b.id,
            status: 'Locked',
            periodEnd: { gte: lastEnd },
          },
        })
      )
        recOk += 1;
    rows.push(
      !banks.length
        ? H(
            'Bank accounts reconciled',
            'No bank or cash accounts set up in Finance',
            'warn',
            'Add Account',
            'go:bankacc',
          )
        : H(
            'Bank accounts reconciled',
            `${recOk} of ${banks.length} reconciled to ${mdy(lastEnd)}`,
            recOk === banks.length ? 'ok' : 'fail',
            recOk === banks.length ? '' : 'Reconcile',
            'go:recon',
          ),
    );
    const assets = await this.prisma.finAsset.findMany({
      where: { businessId: c.rootId, status: { not: 'Disposed' } },
    });
    const acc = await this.assets.accumulated(c.rootId);
    const reg = r2(
      assets.reduce((s, a) => s + num(a.cost) - (acc.get(a.id) ?? 0), 0),
    );
    const gl = r2(
      this.ledger.bal(cf.all, c.byKey.get('fa_cost')!) +
        this.ledger.bal(cf.all, c.byKey.get('fa_accum')!),
    );
    rows.push(
      H(
        'Fixed assets reconciled',
        reg === gl
          ? `Register NBV = GL · ${this.m(c, gl)}`
          : `Register ${this.m(c, reg)} ≠ GL ${this.m(c, gl)} — a bill posted to ${c.byKey.get('fa_cost')!.code} may need capitalizing`,
        reg === gl ? 'ok' : 'fail',
        reg === gl ? '' : 'Open',
        'go:fa',
      ),
    );
    const tk = monthKey(today);
    const pk =
      tk.month === 1
        ? { year: tk.year - 1, month: 12 }
        : { year: tk.year, month: tk.month - 1 };
    const pp = await this.ctx.period(c.rootId, pk.year, pk.month);
    // Last month is only overdue for locking once your close policy's target day has passed.
    const closeTarget = FinanceCloseService.closeDue(
      await this.ctx.config(c.rootId),
      pk.year,
      pk.month,
    );
    const cpp = await this.ctx.period(c.rootId, tk.year, tk.month);
    const word = (s: string) =>
      s === 'locked' ? 'locked' : s === 'soft' ? 'soft-closed' : 'open';
    rows.push(
      H(
        'Periods',
        `${monthLabel(pk.year, pk.month)} ${word(pp.status)} · ${monthLabel(tk.year, tk.month)} ${word(cpp.status)}${pp.status === 'locked' ? '' : ` · close target ${md(closeTarget)}`}`,
        pp.status === 'locked' || today <= closeTarget ? 'ok' : 'warn',
        pp.status === 'locked' ? '' : 'Close',
        'go:close',
      ),
    );
    const susp = this.ledger.bal(cf.all, c.byKey.get('suspense')!);
    rows.push(
      H(
        'Suspense balance',
        susp
          ? `${this.m(c, susp)} waiting to be reclassified`
          : 'Nothing in suspense',
        susp ? 'warn' : 'ok',
        susp ? 'Open' : '',
        `drill:${c.byKey.get('suspense')!.code}`,
      ),
    );
    const ub = await this.prisma.finBill.count({
      where: {
        businessId: c.rootId,
        status: { in: ['Draft', 'Review Required', 'Approved'] },
      },
    });
    const uj = await this.prisma.finJournal.count({
      where: {
        businessId: c.rootId,
        sourceType: null,
        status: { in: MANUAL_OPEN },
      },
    });
    rows.push(
      H(
        'Unposted documents',
        `${ub} bill${ub === 1 ? '' : 's'} · ${uj} journal${uj === 1 ? '' : 's'}`,
        ub || uj ? 'warn' : 'ok',
        ub || uj ? 'View' : '',
        'go:journals',
      ),
    );
    const last = await this.prisma.finHealthRun.findFirst({
      where: { businessId: c.rootId },
      orderBy: { createdAt: 'desc' },
    });
    return { rows, at: last?.createdAt ?? null };
  }

  /** Rules-based findings with the evidence behind each; dismissing hides a finding until its numbers change. */
  private async brief(
    c: Ctx,
    cf: Awaited<ReturnType<FinanceViewsService['controlFigures']>>,
    cv: Awaited<ReturnType<FinanceCloseService['view']>>,
  ) {
    const out: {
      key: string;
      finding: string;
      why: string;
      sources: string;
      conf: string;
      impact: string;
      al: string;
      a: string;
      appr: string;
    }[] = [];
    const over60 = cf.items.filter((i) => i.balance > 0 && i.daysPastDue > 60);
    if (over60.length) {
      const amt = r2(over60.reduce((a, i) => a + i.balanceBase, 0));
      const top = [...over60]
        .sort((a, b) => b.balanceBase - a.balanceBase)
        .slice(0, 2);
      out.push({
        key: `ar60:${amt}`,
        finding: `Receivables over 60 days total ${this.m(c, amt)}`,
        why:
          top
            .map(
              (i) =>
                `${i.customer} (${this.m(c, i.balanceBase)}, ${i.daysPastDue} days${i.dispute ? ', disputed' : ''})`,
            )
            .join(' and ') +
          (over60.length > 2 ? ` and ${over60.length - 2} more.` : '.'),
        sources:
          top
            .map((i) => (i.orderNo ? `Order #${i.orderNo}` : 'Opening balance'))
            .join(' · ') + ' · A/R subledger',
        conf: 'Certain · computed from posted records',
        impact: 'No accounting impact — collection risk only.',
        al: 'Review Overdue',
        a: 'goseg:ar|Overdue',
        appr: 'No approval needed',
      });
    }
    const sugg = await this.prisma.finBankLine.findMany({
      where: {
        businessId: c.rootId,
        status: 'Suggested',
        confidence: { gte: 90 },
      },
      orderBy: { confidence: 'desc' },
      take: 20,
    });
    if (sugg.length) {
      const confs = sugg.map((s) => s.confidence ?? 0);
      out.push({
        key: `sugg:${sugg.map((s) => s.id).join(',')}`,
        finding: `${sugg.length} bank transaction${sugg.length === 1 ? ' appears' : 's appear'} to match existing records`,
        why: `Amount, date and payee agree within tolerance for ${sugg
          .slice(0, 2)
          .map(
            (s) =>
              (s.suggestion as unknown as Suggestion | null)?.label ??
              s.description,
          )
          .join(' and ')}${sugg.length > 2 ? '…' : '.'}`,
        sources: sugg
          .slice(0, 3)
          .map((s) => s.description)
          .join(' · '),
        conf: `High · ${Math.min(...confs)}${Math.min(...confs) === Math.max(...confs) ? '' : `–${Math.max(...confs)}`}%`,
        impact:
          'Matching links the bank line only — it never marks anything paid.',
        al: 'Review Matches',
        a: 'goseg:feeds|Suggested',
        appr: 'You confirm each match',
      });
    }
    if (cv.run && cv.run.status !== 'Hard Closed') {
      const blocked = cv.tasks.filter((t) => t.status === 'Blocked');
      if (blocked.length)
        out.push({
          key: `close:${blocked.map((b) => b.exception).join('|')}`,
          finding: `The ${monthLabel(cv.run.year, cv.run.month)} close can’t finish while ${blocked.length} control${blocked.length === 1 ? ' is' : 's are'} blocked`,
          why: blocked[0].exception,
          sources: blocked
            .map((b) => `${b.task.key} ${b.task.title}`)
            .slice(0, 3)
            .join(' · '),
          conf: 'Certain · rule-based',
          impact: 'Final approval and the period lock wait on these.',
          al: 'Open Close',
          a: 'go:close',
          appr: 'Adjustments go through journal approval',
        });
    }
    const susp = this.ledger.bal(cf.all, c.byKey.get('suspense')!);
    if (susp)
      out.push({
        key: `susp:${susp}`,
        finding: `${this.m(c, susp)} is sitting in Suspense`,
        why: 'Cash register cash-in / cash-out movements record no counter-account, so they post to Suspense until reclassified.',
        sources: `Account ${c.byKey.get('suspense')!.code} · cash register movements`,
        conf: 'Certain · rule-based',
        impact:
          'Reclassifying moves the amount to the right expense, income or owner account.',
        al: 'Open Ledger',
        a: `drill:${c.byKey.get('suspense')!.code}`,
        appr: 'Reclass journal follows the approval thresholds',
      });
    const budget = await this.budgets.activeFor(c.rootId, c.range);
    if (budget) {
      const rows = (
        await this.budgets.bva(c.rootId, budget.id, c.range, c.branchId)
      )
        .filter((r) => r.material && !r.favorable)
        .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
      if (rows[0]) {
        const r = rows[0];
        out.push({
          key: `bva:${budget.id}:${r.account.id}:${r.variance}`,
          finding: `${r.account.name} is ${Math.abs(r.pct).toFixed(0)}% ${r.variance > 0 ? 'above' : 'below'} the budget`,
          why: `Actual ${this.m(c, r.actual)} vs budget ${this.m(c, r.budget)} (${budget.name} v${budget.version}) for ${c.range.label}.`,
          sources: `Account ${r.account.code} · ${budget.name}`,
          conf: 'Certain · rule-based',
          impact: r.explanation
            ? `Explained: ${r.explanation}`
            : 'Material variance — an explanation is needed.',
          al: 'Open Variance',
          a: 'go:budgets',
          appr: 'No approval needed',
        });
      }
    }
    const dups = await this.prisma.finBill.findMany({
      where: { businessId: c.rootId, status: 'Review Required' },
      select: { number: true, vendorName: true, matchDetail: true },
      take: 5,
    });
    if (dups.length)
      out.push({
        key: `dup:${dups.map((d) => d.number).join(',')}`,
        finding: `${dups.length} bill${dups.length === 1 ? ' needs' : 's need'} a duplicate or match review`,
        why: dups.map((d) => `${d.number} (${d.vendorName})`).join(', '),
        sources: 'Bills · vendor invoice number check · three-way match',
        conf: 'Certain · exact invoice number / quantity rules',
        impact: 'Approving a duplicate would double-count A/P.',
        al: 'Review Bills',
        a: 'goseg:bills|Review Required',
        appr: 'You decide on each bill',
      });
    const dismissed = new Set(
      (
        await this.prisma.finDismissal.findMany({
          where: { businessId: c.rootId },
        })
      ).map((d) => d.key),
    );
    return out.filter((b) => !dismissed.has(b.key)).slice(0, 4);
  }

  async dismiss(actor: FinActor, key: string) {
    await this.prisma.finDismissal.upsert({
      where: {
        businessId_key: { businessId: actor.rootId, key: key.slice(0, 120) },
      },
      create: {
        businessId: actor.rootId,
        key: key.slice(0, 120),
        dismissedById: actor.userId,
      },
      update: { dismissedById: actor.userId },
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'brief.dismissed',
      'brief',
      key.slice(0, 60),
    );
  }

  // ── books ────────────────────────────────────────────────────────────────

  async coa(c: Ctx) {
    const t = await this.ledger.totals(c.rootId, c.branchId, null, c.range.to);
    const roll = this.ledger.rollup(c.accounts, t);
    const codes = await this.prisma.finTaxCode.findMany({
      where: { businessId: c.rootId, active: true },
    });
    const depth = (a: FinAccount) => {
      let d = 0;
      let p = a.parentId ? c.byId.get(a.parentId) : null;
      while (p && d < 6) {
        d += 1;
        p = p.parentId ? c.byId.get(p.parentId) : null;
      }
      return d;
    };
    const active = c.accounts.filter((a) => !a.isHeader && a.active);
    const typeSeg: Record<string, string> = {
      asset: 'Assets',
      liability: 'Liabilities',
      equity: 'Equity',
      revenue: 'Revenue',
    };
    const order = [...c.accounts].sort((a, b) => a.code.localeCompare(b.code));
    return {
      kpis: [
        kpi({
          label: 'Active accounts',
          value: String(active.length),
          meta: c.entity,
          def: 'Accounts that can receive postings.',
          ic: 'coa',
        }),
        kpi({
          label: 'Control accounts',
          value: String(c.accounts.filter((a) => a.control).length),
          meta: 'Protected',
          def: 'Fed by subledgers. Changes need Owner / Controller approval.',
          ic: 'close',
        }),
        kpi({
          label: 'Reconcilable',
          value: String(c.accounts.filter((a) => a.reconcilable).length),
          meta: 'Bank, cash & clearing',
          def: 'Accounts reconciled against statements.',
          ic: 'recon',
        }),
        kpi({
          label: 'Inactive',
          value: String(c.accounts.filter((a) => !a.active).length),
          meta: 'History kept',
          def: 'Deactivated accounts keep all history. Nothing is deleted.',
          ic: 'coa',
          ...toneGray,
        }),
      ],
      table: {
        title: 'Account tree',
        count: `${c.accounts.length} accounts`,
        cols: [
          ['Code'],
          ['Account name'],
          ['Type'],
          ['Subtype'],
          ['Currency'],
          ['Tax mapping'],
          ['Reconciliation'],
          ['Balance', 1],
          ['Status'],
          ['', 1],
        ],
        grid: '70px minmax(200px,2fr) 110px 130px 70px 130px 110px 120px 100px 60px',
        minW: 1180,
        segs: [
          'All',
          'Assets',
          'Liabilities',
          'Equity',
          'Revenue',
          'Expenses',
          'Control',
        ],
        filters: [['Entity', [c.entity]]],
        rows: order.map((a) => {
          const h = a.isHeader;
          const tax = codes
            .filter((x) => x.accountId === a.id)
            .map((x) => x.code)
            .join(', ');
          const st = !a.active ? 'Inactive' : h ? 'Header' : 'Active';
          return {
            id: a.id,
            seg: [
              typeSeg[a.type] ?? 'Expenses',
              ...(a.control ? ['Control'] : []),
            ],
            text: `${a.code} ${a.name} ${ACCOUNT_TYPES[a.type]} ${a.subtype}`,
            bg: h ? '#FAFBFC' : '#fff',
            cells: [
              B(a.code, { color: h ? '#0F172A' : '#344054' }),
              T(a.name, {
                fw: h ? 800 : 600,
                color: '#101828',
                pl: depth(a) * 18,
                sub: a.control
                  ? 'Control account · restricted edits'
                  : a.systemKey
                    ? 'Used by automatic postings'
                    : '',
              }),
              T(ACCOUNT_TYPES[a.type]),
              T(a.subtype, { color: '#667085' }),
              T(a.currency ?? c.base),
              T(tax ? `Tax code ${tax}` : '—', { color: '#667085' }),
              T(a.reconcilable ? 'Yes' : '—'),
              M(h ? (roll.get(a.id) ?? 0) : this.ledger.bal(t, a), c.base, {
                fw: h ? 800 : 600,
              }),
              S(st),
              A(),
            ],
          };
        }),
      } as Table,
    };
  }

  async glLines(c: Ctx, q: ScopeQuery, take = 300) {
    const where = {
      businessId: c.rootId,
      postedAt: { not: null },
      accountId: q.account ? q.account : { not: null },
      date: { gte: c.range.from, lte: c.range.to },
      ...(c.branchId ? { branchId: c.branchId } : {}),
      ...(q.source
        ? {
            journal:
              q.source === 'manual'
                ? { sourceType: null }
                : { sourceType: q.source },
          }
        : {}),
      ...(q.q
        ? {
            OR: [
              { description: { contains: q.q } },
              { journal: { number: { contains: q.q } } },
              { journal: { sourceLabel: { contains: q.q } } },
            ],
          }
        : {}),
    };
    const [rows, count] = await Promise.all([
      this.prisma.finJournalLine.findMany({
        where,
        include: {
          journal: {
            select: {
              id: true,
              number: true,
              sourceType: true,
              sourceLabel: true,
              reference: true,
              memo: true,
            },
          },
        },
        orderBy: [{ date: 'desc' }, { journalId: 'desc' }, { lineNo: 'asc' }],
        take,
      }),
      this.prisma.finJournalLine.count({ where }),
    ]);
    return { rows, count };
  }

  async gl(c: Ctx, q: ScopeQuery) {
    const agg = await this.prisma.finJournalLine.aggregate({
      where: {
        businessId: c.rootId,
        postedAt: { not: null },
        date: { gte: c.range.from, lte: c.range.to },
        ...(c.branchId ? { branchId: c.branchId } : {}),
      },
      _sum: { debit: true, credit: true },
      _count: true,
    });
    const journals = await this.prisma.finJournalLine.groupBy({
      by: ['journalId'],
      where: {
        businessId: c.rootId,
        postedAt: { not: null },
        date: { gte: c.range.from, lte: c.range.to },
        ...(c.branchId ? { branchId: c.branchId } : {}),
      },
    });
    const used = await this.prisma.finJournalLine.groupBy({
      by: ['accountId'],
      where: {
        businessId: c.rootId,
        postedAt: { not: null },
        date: { gte: c.range.from, lte: c.range.to },
        ...(c.branchId ? { branchId: c.branchId } : {}),
      },
    });
    const dr = r2(num(agg._sum.debit));
    const cr = r2(num(agg._sum.credit));
    const { rows, count } = await this.glLines(c, q);
    const mods = [
      ...new Set(
        rows.map((r) =>
          r.journal.sourceType
            ? (SOURCE_MODULE[r.journal.sourceType] ?? r.journal.sourceType)
            : 'Manual',
        ),
      ),
    ];
    const segs = [
      'All',
      ...[
        'Orders',
        'Payments',
        'Customer credit',
        'Returns',
        'Inventory',
        'Expenses',
        'Bills',
        'Bill payments',
        'Fixed Assets',
        'Bank feeds',
        'Manual',
      ].filter((m) => mods.includes(m)),
    ];
    return {
      kpis: [
        kpi({
          label: 'Period debits',
          value: this.m(c, dr),
          def: `All posted debit lines in ${c.range.label}.`,
          ic: 'gl',
        }),
        kpi({
          label: 'Period credits',
          value: this.m(c, cr),
          def: `All posted credit lines in ${c.range.label}.`,
          ic: 'gl',
        }),
        kpi({
          label: 'Net movement',
          value: this.m(c, r2(dr - cr)),
          state: dr === cr ? 'Balanced' : 'Out of Balance',
          def: 'Debits minus credits across all accounts. Must be zero.',
          ic: 'recon',
        }),
        kpi({
          label: 'Entries',
          value: agg._count.toLocaleString('en-US'),
          meta: `${journals.length.toLocaleString('en-US')} journals`,
          def: 'Posted journal lines this period.',
          ic: 'journals',
        }),
        kpi({
          label: 'Accounts used',
          value: String(used.length),
          def: 'Accounts with at least one posting this period.',
          ic: 'coa',
        }),
      ],
      notices: [
        notice(
          'info',
          'Posted entries are read-only',
          'Every line here is committed and immutable. To correct one, open its journal and create a reversal or adjustment — the original stays in history.',
        ),
      ],
      table: {
        title: 'Posted ledger lines',
        count: `Showing ${rows.length.toLocaleString('en-US')} of ${count.toLocaleString('en-US')}`,
        cols: [
          ['Posting date'],
          ['Journal #'],
          ['Account'],
          ['Description'],
          ['Debit', 1],
          ['Credit', 1],
          ['Currency'],
          ['Branch'],
          ['Source'],
          ['', 1],
        ],
        grid: '90px 130px minmax(170px,1.3fr) minmax(200px,1.6fr) 110px 110px 70px 100px 150px 50px',
        minW: 1260,
        segs,
        filters: [],
        moreFilters: ['Journal #', 'Branch', 'Currency', 'Min amount'],
        rows: rows.map((g) => {
          const mod = g.journal.sourceType
            ? (SOURCE_MODULE[g.journal.sourceType] ?? g.journal.sourceType)
            : 'Manual';
          const d = c.txn ? num(g.txnDebit) : num(g.debit);
          const k = c.txn ? num(g.txnCredit) : num(g.credit);
          const cur = c.txn ? g.currency : c.base;
          return {
            id: g.id,
            seg: [mod],
            text: `${g.journal.number} ${this.acctLabel(c, g.accountId)} ${g.description ?? ''} ${mod} ${g.journal.sourceLabel ?? ''}`,
            f: {
              'Journal #': g.journal.number,
              Branch: this.branchName(c, g.branchId),
              Currency: g.currency,
              'Min amount': String(Math.max(d, k)),
            },
            cells: [
              T(md(g.date)),
              B(g.journal.number, { color: '#0E8442' }),
              T(this.acctLabel(c, g.accountId), { fw: 600, color: '#101828' }),
              T(g.description ?? g.journal.memo ?? '', { color: '#475467' }),
              M(d || null, cur),
              M(k || null, cur),
              T(g.currency),
              T(this.branchName(c, g.branchId), { color: '#667085' }),
              T(mod, {
                sub: g.journal.sourceLabel ?? g.journal.reference ?? '',
              }),
              A(),
            ],
          };
        }),
      } as Table,
      glFilters: {
        accounts: [...new Set(used.map((u) => u.accountId).filter(Boolean))]
          .map((id) => ({ id, l: this.acctLabel(c, id) }))
          .sort((a, b) => a.l.localeCompare(b.l)),
        sources: Object.entries(SOURCE_MODULE)
          .filter(([k]) => mods.includes(SOURCE_MODULE[k]))
          .map(([k, l]) => ({ k, l }))
          .concat([{ k: 'manual', l: 'Manual' }]),
      },
    };
  }

  private journalSegStatus(j: FinJournal) {
    return j.status === 'Voided' ? 'Voided' : j.status;
  }

  async journalsScreen(c: Ctx) {
    const cfg = await this.ctx.config(c.rootId);
    const where = {
      businessId: c.rootId,
      date: { gte: c.range.from, lte: c.range.to },
      ...(c.branchId
        ? { OR: [{ branchId: c.branchId }, { branchId: null }] }
        : {}),
    };
    const counts = await this.prisma.finJournal.groupBy({
      by: ['status'],
      where,
      _count: true,
    });
    const cnt = (s: string) => counts.find((x) => x.status === s)?._count ?? 0;
    // Open manual journals from any period stay visible until resolved.
    const [open, recent, total] = await Promise.all([
      this.prisma.finJournal.findMany({
        where: {
          businessId: c.rootId,
          sourceType: null,
          status: { in: MANUAL_OPEN },
        },
        include: { lines: true },
        orderBy: { date: 'desc' },
      }),
      this.prisma.finJournal.findMany({
        where: { ...where, status: { notIn: MANUAL_OPEN } },
        include: { lines: true },
        orderBy: [{ date: 'desc' }, { number: 'desc' }],
        take: 300,
      }),
      this.prisma.finJournal.count({ where }),
    ]);
    const js = [
      ...open,
      ...recent.filter((r) => !open.some((o) => o.id === r.id)),
    ];
    const names = await this.ctx.userNames(
      js.flatMap((j) => [j.preparedById, j.approvedById]),
    );
    const pend = await this.prisma.finApproval.findMany({
      where: {
        businessId: c.rootId,
        subjectType: 'journal',
        status: 'Pending',
        subjectId: { in: js.map((j) => j.id) },
      },
    });
    const pendBy = new Map(pend.map((p) => [p.subjectId, p]));
    const defs: Record<string, string> = {
      Draft: 'Not validated or submitted yet.',
      'Approval Required': 'Waiting on an approver.',
      'Ready to Post': 'Approved and ready to commit.',
      Posted: 'Committed to the ledger.',
      Reversed: 'Cancelled by a reversal journal.',
      Failed: 'Posting was attempted and nothing committed.',
    };
    const ics: Record<string, string> = {
      Draft: 'journals',
      'Approval Required': 'close',
      'Ready to Post': 'recon',
      Posted: 'gl',
      Reversed: 'journals',
      Failed: 'alert',
    };
    const th = cfg.thresholds;
    return {
      kpis: Object.keys(defs).map((s) =>
        kpi({
          label: s,
          value: String(
            s === 'Draft' ? cnt('Draft') + cnt('Pending Review') : cnt(s),
          ),
          meta: c.range.label,
          def: defs[s],
          seg: s,
          ic: ics[s],
          ...(s === 'Failed' ? toneRed : {}),
        }),
      ),
      flow: flow(
        'How a journal gets posted',
        [
          'Draft',
          'Validate',
          'Approval if required',
          'Approved',
          'Post',
          'Posted',
        ],
        -1,
        `Journals ${this.m(c, th.journalDirect, 0)} and above need Finance Manager approval; above ${this.m(c, th.journalOwner, 0)} need Owner / Controller.${cfg.sod.sod1 ? ' You can’t approve a journal you prepared.' : ''}`,
      ),
      table: {
        title: 'Journals',
        count: `${js.length} shown${total > js.length ? ` of ${total.toLocaleString('en-US')}` : ''} · ${c.range.label}`,
        cols: [
          ['Journal #'],
          ['Date'],
          ['Type'],
          ['Memo'],
          ['Debit', 1],
          ['Credit', 1],
          ['Source'],
          ['Prepared by'],
          ['Approver'],
          ['Status'],
          ['', 1],
        ],
        grid: '130px 70px 150px minmax(200px,2fr) 100px 100px 130px 110px 110px 130px 50px',
        minW: 1330,
        segs: [
          'All',
          'Draft',
          'Pending Review',
          'Approval Required',
          'Ready to Post',
          'Posted',
          'Reversed',
          'Failed',
        ],
        filters: [],
        rows: js.map((j) => {
          const dr = r2(j.lines.reduce((a, l) => a + num(l.debit), 0));
          const cr = r2(j.lines.reduce((a, l) => a + num(l.credit), 0));
          const unb = dr !== cr;
          const s = this.journalSegStatus(j);
          const typeL = j.sourceType
            ? `System · ${SOURCE_MODULE[j.sourceType] ?? j.sourceType}`
            : j.type === 'Reversal'
              ? 'Reversal'
              : `Manual · ${j.type}`;
          const p = pendBy.get(j.id);
          return {
            id: j.id,
            seg: [s],
            text: `${j.number} ${j.memo ?? ''} ${j.reference ?? ''} ${typeL} ${names.get(j.preparedById ?? '') ?? ''}`,
            cells: [
              B(j.number, { color: '#0E8442', sub: `v${j.version}` }),
              T(md(j.date)),
              T(typeL, { color: '#475467' }),
              T(j.memo ?? j.sourceLabel ?? '', {
                fw: 600,
                color: '#101828',
                sub: j.reference ?? '',
              }),
              M(dr, c.base),
              M(cr, c.base, {
                sub: unb ? `Off by ${this.m(c, Math.abs(r2(dr - cr)))}` : '',
              }),
              T(
                j.sourceType
                  ? (SOURCE_MODULE[j.sourceType] ?? j.sourceType)
                  : j.reversalOfId
                    ? 'Reversal'
                    : 'Manual',
                { color: '#667085' },
              ),
              T(j.preparedById ? (names.get(j.preparedById) ?? '—') : 'System'),
              T(
                j.approvedById
                  ? (names.get(j.approvedById) ?? '—')
                  : p
                    ? p.approverRole.replace('/', ' / ')
                    : j.sourceType
                      ? 'Auto-posted'
                      : '—',
                { color: '#667085' },
              ),
              S(s, unb && s === 'Draft' ? 'Out of balance' : ''),
              A(),
            ],
          };
        }),
      } as Table,
    };
  }

  // ── banking ──────────────────────────────────────────────────────────────

  private async feedHealth(
    rootId: string,
    b: {
      kind: string;
      payoutProvider: string | null;
      lastImportAt: Date | null;
      branchId: string | null;
    },
  ) {
    if (b.kind === 'cash')
      return {
        health: 'Manual',
        sync: b.lastImportAt
          ? `Counted ${ago(b.lastImportAt)}`
          : 'Counted by hand',
      };
    if (b.payoutProvider) {
      const ids = (await this.ctx.branches(rootId)).map((x) => x.id);
      const integ = await this.prisma.integration.findFirst({
        where: {
          businessId: b.branchId ? b.branchId : { in: ids },
          provider: b.payoutProvider as never,
        },
      });
      if (!integ || integ.status === 'not_connected')
        return {
          health: 'Not connected',
          sync: `${b.payoutProvider} isn’t connected in Integrations`,
        };
      if (integ.status === 'needs_attention')
        return {
          health: 'Reauthorize',
          sync: `${b.payoutProvider} needs attention in Integrations`,
        };
      return {
        health: 'Healthy',
        sync: `Payouts synced ${ago(integ.lastSyncAt)}`,
      };
    }
    if (!b.lastImportAt)
      return { health: 'Never imported', sync: 'No statement imported yet' };
    return {
      health:
        Date.now() - b.lastImportAt.getTime() > 7 * 86_400_000
          ? 'Stale'
          : 'Healthy',
      sync: `Imported ${ago(b.lastImportAt)}`,
    };
  }

  async bankacc(c: Ctx) {
    const banks = (await this.banking.list(c.rootId)).filter(
      (b) => !c.branchId || !b.branchId || b.branchId === c.branchId,
    );
    const cards: Record<string, string>[] = [];
    let total = 0;
    let needs = 0;
    let issues = 0;
    let stale = 0;
    for (const b of banks) {
      const asAt = b.statementDate ?? undefined;
      const book = await this.banking.bookBalance(c.rootId, b, asAt);
      const bookNow = await this.banking.bookBalance(c.rootId, b);
      total += bookNow.base;
      const last = await this.prisma.finReconciliation.findFirst({
        where: { businessId: c.rootId, bankAccountId: b.id },
        orderBy: { periodEnd: 'desc' },
      });
      const stmt = b.statementBalance != null ? num(b.statementBalance) : null;
      const diff = stmt == null ? null : r2(stmt - book.own);
      if (diff) needs += 1;
      const fh = await this.feedHealth(c.rootId, b);
      if (
        ['Not connected', 'Reauthorize', 'Never imported', 'Stale'].includes(
          fh.health,
        )
      )
        issues += 1;
      if (fh.health === 'Stale' || fh.health === 'Never imported') stale += 1;
      const rs = last
        ? last.status === 'Locked'
          ? 'Reconciled'
          : last.status
        : 'Not Reconciled';
      const c1 = chip(rs);
      const c2 = chip(fh.health);
      const gl = c.byId.get(b.glAccountId);
      cards.push({
        id: b.id,
        name: b.name,
        inst:
          b.institution ??
          (b.kind === 'cash'
            ? 'Cash · counted'
            : b.kind === 'clearing'
              ? 'Clearing'
              : 'Bank'),
        mask: b.mask ? `••${b.mask}` : '—',
        cur: b.currency,
        gl: gl?.code ?? '—',
        stmt: stmt == null ? 'No statement' : money(stmt, b.currency),
        book: money(book.own, b.currency),
        diff:
          stmt == null
            ? 'Import a statement to compare'
            : diff === 0
              ? 'No difference'
              : `${money(diff, b.currency)} difference`,
        dfg: stmt == null ? '#98A2B3' : diff === 0 ? '#0E8442' : '#B42318',
        sync: fh.sync,
        rs,
        rsBg: c1.bg,
        rsFg: c1.fg,
        health: fh.health,
        hBg: c2.bg,
        hFg: c2.fg,
      });
    }
    return {
      kpis: [
        kpi({
          label: 'Total book balance',
          value: this.m(c, r2(total), 0),
          state: stale ? 'Partial' : '',
          def: 'Posted ledger balance of all bank and cash accounts set up here.',
          adv: stale
            ? `${stale} account${stale === 1 ? ' has' : 's have'} no recent statement.`
            : '',
          ic: 'cash',
        }),
        kpi({
          label: 'Accounts',
          value: String(banks.length),
          meta: `${banks.filter((b) => b.kind !== 'cash').length} bank · ${banks.filter((b) => b.kind === 'cash').length} cash`,
          def: 'Accounts linked to a GL account.',
          ic: 'bankacc',
        }),
        kpi({
          label: 'Needs reconciliation',
          value: String(needs),
          def: 'Accounts whose last statement balance and book balance differ.',
          go: 'recon',
          ic: 'recon',
          ...toneAmber,
        }),
        kpi({
          label: 'Connection issues',
          value: String(issues),
          meta: issues ? 'See cards below' : '',
          def: 'Payout feeds not connected or needing attention, and statements never imported or older than 7 days.',
          ic: 'alert',
          ...toneRed,
        }),
      ],
      notices: [
        notice(
          'info',
          'Statements are imported here; payouts sync from Integrations',
          'Noxtill doesn’t connect directly to banks. Import a CSV or OFX statement for each account, and connect Stripe, Square or PayPal in Integrations to bring payouts in automatically. Finance never sees credentials.',
          'Open Integrations',
          'link:/integrations',
        ),
      ],
      bankCards: cards,
      emptyBanks: !banks.length,
    };
  }

  async feeds(c: Ctx, q: ScopeQuery) {
    const banks = await this.banking.list(c.rootId);
    const bankId = q.bank && banks.some((b) => b.id === q.bank) ? q.bank : null;
    const where = {
      businessId: c.rootId,
      ...(bankId ? { bankAccountId: bankId } : {}),
    };
    const counts = await this.prisma.finBankLine.groupBy({
      by: ['status'],
      where,
      _count: true,
    });
    const cnt = (s: string) => counts.find((x) => x.status === s)?._count ?? 0;
    const high = await this.prisma.finBankLine.count({
      where: {
        ...where,
        status: { in: ['Suggested', 'Needs Review', 'New'] },
        confidence: { gte: 90 },
      },
    });
    const matchedPeriod = await this.prisma.finBankLine.count({
      where: {
        ...where,
        status: 'Matched',
        date: { gte: c.range.from, lte: c.range.to },
      },
    });
    const [open, done] = await Promise.all([
      this.prisma.finBankLine.findMany({
        where: {
          ...where,
          status: { in: ['New', 'Suggested', 'Needs Review'] },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 500,
      }),
      this.prisma.finBankLine.findMany({
        where: { ...where, status: { in: ['Matched', 'Excluded'] } },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 200,
      }),
    ]);
    const lines = [...open, ...done];
    const bName = new Map(
      banks.map((b) => [b.id, `${b.name}${b.mask ? ` ••${b.mask}` : ''}`]),
    );
    const bCur = new Map(banks.map((b) => [b.id, b.currency]));
    const total = counts.reduce((a, x) => a + x._count, 0);
    return {
      kpis: [
        kpi({
          label: 'New',
          value: String(cnt('New')),
          def: 'Imported, no likely record found yet.',
          seg: 'New',
          ic: 'feeds',
        }),
        kpi({
          label: 'Suggested matches',
          value: String(cnt('Suggested')),
          def: 'A likely Noxtill record was found. Not applied until you confirm.',
          seg: 'Suggested',
          ic: 'spark',
        }),
        kpi({
          label: 'High confidence',
          value: String(high),
          def: '90%+ on amount, date, payee and reference.',
          ic: 'spark',
        }),
        kpi({
          label: 'Needs review',
          value: String(cnt('Needs Review')),
          def: 'Weak match, amounts differ, or the record isn’t ready yet.',
          seg: 'Needs Review',
          ic: 'alert',
          ...toneAmber,
        }),
        kpi({
          label: 'Matched',
          value: String(matchedPeriod),
          meta: c.range.label,
          def: 'Confirmed against a ledger record.',
          seg: 'Matched',
          ic: 'recon',
        }),
        kpi({
          label: 'Excluded',
          value: String(cnt('Excluded')),
          def: 'Excluded with a recorded reason.',
          seg: 'Excluded',
          ic: 'feeds',
          ...toneGray,
        }),
      ],
      notices: [
        notice(
          'warn',
          'A match is not a payment',
          'Matching links a bank line to ledger entries — it never marks a sale or bill as paid. Payments are recorded where they happen: at checkout, in Customer credit, or with Record Payment on a bill.',
        ),
      ],
      table: {
        title: 'Bank transactions',
        count: `Showing ${lines.length} of ${total}${bankId ? ` · ${bName.get(bankId)}` : ''}`,
        cols: [
          ['Date'],
          ['Description'],
          ['Amount', 1],
          ['Suggested match'],
          ['Confidence', 1],
          ['Category'],
          ['Status'],
          ['', 1],
        ],
        grid: '70px minmax(170px,1.3fr) 110px minmax(220px,1.8fr) 90px 150px 120px 70px',
        minW: 1080,
        segs: [
          'All',
          'New',
          'Suggested',
          'Needs Review',
          'Matched',
          'Excluded',
        ],
        filters: [],
        rows: lines.map((f) => {
          const sg = f.suggestion as unknown as Suggestion | null;
          const amt = num(f.amount);
          const conf = f.confidence ?? 0;
          const cat = sg?.accountId
            ? (c.byId.get(sg.accountId)?.name ?? '—')
            : sg?.kind === 'journal'
              ? 'Existing ledger record'
              : sg?.kind === 'bill'
                ? 'Accounts Payable'
                : 'Uncategorized';
          return {
            id: f.id,
            seg: [f.status],
            text: `${f.description} ${f.reference ?? ''} ${sg?.label ?? ''} ${f.status}`,
            cells: [
              T(md(f.date)),
              T(f.description, {
                fw: 700,
                color: '#101828',
                sub: bName.get(f.bankAccountId) ?? '',
              }),
              M(amt, bCur.get(f.bankAccountId) ?? c.base, {
                color: amt > 0 ? '#0E8442' : '#101828',
                sub: amt > 0 ? 'Money in' : 'Money out',
              }),
              T(
                f.status === 'Excluded'
                  ? `Excluded — ${f.excludeReason ?? ''}`
                  : sg?.label || 'No match found',
                { color: sg ? '#344054' : '#98A2B3' },
              ),
              T(conf ? `${conf}%` : '—', {
                r: 1,
                fw: 700,
                color:
                  conf >= 90 ? '#0E8442' : conf >= 70 ? '#B54708' : '#B42318',
                sub:
                  conf >= 90
                    ? 'High'
                    : conf >= 70
                      ? 'Medium'
                      : conf
                        ? 'Low'
                        : '',
              }),
              T(cat, { color: '#667085' }),
              S(f.status),
              A(
                f.status === 'Matched' || f.status === 'Excluded'
                  ? 'View ›'
                  : 'Review ›',
              ),
            ],
          };
        }),
      } as Table,
      feedFilter: {
        banks: banks.map((b) => ({ id: b.id, l: bName.get(b.id) })),
        bankId,
      },
    };
  }

  async reconScreen(c: Ctx) {
    const banks = await this.banking.list(c.rootId);
    const recs = await this.prisma.finReconciliation.findMany({
      where: { businessId: c.rootId },
      orderBy: [{ periodEnd: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    const names = await this.ctx.userNames(recs.map((r) => r.preparedById));
    const rows: Table['rows'] = [];
    let openDiff = 0;
    let inProgress = 0;
    const today = dayOf(new Date());
    const lastEnd = monthEnd(
      today.getUTCMonth() === 0
        ? today.getUTCFullYear() - 1
        : today.getUTCFullYear(),
      today.getUTCMonth() === 0 ? 12 : today.getUTCMonth(),
    );
    const lockedAccts = new Set(
      recs
        .filter((r) => r.status === 'Locked' && r.periodEnd >= lastEnd)
        .map((r) => r.bankAccountId),
    );
    for (const r of recs) {
      const b = banks.find((x) => x.id === r.bankAccountId);
      if (!b) continue;
      const open = r.status !== 'Locked';
      let diff = 0;
      let book = num(r.bookBalance);
      if (open) {
        const w = await this.banking.workspace(c.rootId, r.id);
        diff = w.diff;
        book = w.opening + w.cleared + w.explained;
        openDiff += Math.abs(diff);
        inProgress += 1;
      }
      const prev = recs.find(
        (x) =>
          x.bankAccountId === r.bankAccountId &&
          x.status === 'Locked' &&
          x.periodEnd < r.periodEnd,
      );
      rows.push({
        id: r.id,
        seg: [open ? 'In Progress' : 'Locked'],
        text: `${b.name} ${r.status}`,
        cells: [
          B(`${b.name}${b.mask ? ` ••${b.mask}` : ''}`),
          T(
            prev
              ? `${md(new Date(prev.periodEnd.getTime() + 86_400_000))} – ${mdy(r.periodEnd)}`
              : `To ${mdy(r.periodEnd)}`,
          ),
          M(num(r.statementBalance), b.currency),
          M(book, b.currency),
          M(diff, b.currency, {
            color: diff === 0 ? '#0E8442' : '#B42318',
            fw: 800,
          }),
          T(names.get(r.preparedById ?? '') ?? '—'),
          S(r.status === 'Review Required' ? 'Approval Required' : r.status),
          A(open ? 'Work ›' : 'View ›'),
        ],
      });
    }
    return {
      kpis: [
        kpi({
          label: 'Accounts to reconcile',
          value: String(
            banks.filter((b) => b.active && !lockedAccts.has(b.id)).length,
          ),
          meta: `to ${mdy(lastEnd)}`,
          def: 'Active accounts without a locked reconciliation to last month end.',
          ic: 'recon',
        }),
        kpi({
          label: 'Reconciled & locked',
          value: String(lockedAccts.size),
          meta: `of ${banks.filter((b) => b.active).length} accounts`,
          def: 'Completed and locked. Reopening needs an Owner / Controller.',
          ic: 'close',
        }),
        kpi({
          label: 'Open difference',
          value: this.m(c, r2(openDiff)),
          state: inProgress
            ? openDiff === 0
              ? 'Balanced'
              : 'Not Reconciled'
            : '',
          def: 'Statement balance minus cleared book balance, across reconciliations in progress.',
          ic: 'alert',
          ...(openDiff ? toneRed : {}),
        }),
      ],
      table: {
        title: 'Reconciliations',
        count: `${rows.length} reconciliation${rows.length === 1 ? '' : 's'} · ${banks.length} account${banks.length === 1 ? '' : 's'}`,
        cols: [
          ['Account'],
          ['Statement period'],
          ['Statement balance', 1],
          ['Book balance', 1],
          ['Difference', 1],
          ['Preparer'],
          ['Status'],
          ['', 1],
        ],
        grid: 'minmax(170px,1.4fr) 170px 130px 130px 110px 110px 150px 70px',
        minW: 1040,
        segs: ['All', 'In Progress', 'Locked'],
        filters: [],
        rows,
      } as Table,
    };
  }

  // ── receivables & payables ───────────────────────────────────────────────

  async arScreen(c: Ctx) {
    const all = (await this.ar.items(c.rootId)).filter(
      (i) => !c.branchId || i.branchId === c.branchId,
    );
    const items = all.filter((i) => i.balance !== 0);
    const total = r2(items.reduce((s, i) => s + i.balanceBase, 0));
    const colors: Record<string, string> = {
      Current: '#12A150',
      '1–30': '#F7B955',
      '31–60': '#F79009',
      '61–90': '#E0561B',
      '90+': '#B42318',
    };
    const bucket = (b: string) =>
      r2(
        items
          .filter((i) => i.bucket === b && i.balance > 0)
          .reduce((s, i) => s + i.balanceBase, 0),
      );
    const disputed = items.filter((i) => i.dispute && i.balance > 0);
    const positive = items.filter((i) => i.balance > 0);
    const posTotal = r2(positive.reduce((s, i) => s + i.balanceBase, 0));
    const cfg = await this.ctx.config(c.rootId);
    return {
      kpis: [
        kpi({
          label: 'Total receivable',
          value: this.m(c, total, 0),
          def: 'Open posted balances owed by customers (credit balances net off).',
          adv: `Control ${c.byKey.get('ar')!.code} · ${items.length} open items`,
          ic: 'ar',
        }),
        ...BUCKETS.map((b) =>
          kpi({
            label: b === 'Current' ? 'Current' : `${b} days`,
            value: this.m(c, bucket(b), 0),
            def:
              b === 'Current'
                ? cfg.arTermsDays
                  ? `Within ${cfg.arTermsDays}-day terms.`
                  : 'Due on the day of sale (no terms set).'
                : 'Days past due date.',
            seg: b === 'Current' ? 'Current' : 'Overdue',
            ic: 'ar',
            ...(b === 'Current' ? {} : toneAmber),
          }),
        ),
        kpi({
          label: 'Disputed',
          value: this.m(
            c,
            r2(disputed.reduce((s, i) => s + i.balanceBase, 0)),
            0,
          ),
          meta: `${new Set(disputed.map((d) => d.customerId)).size} customer${disputed.length === 1 ? '' : 's'}`,
          def: 'Flagged as disputed — excluded from collections.',
          seg: 'Disputed',
          ic: 'alert',
          ...toneRed,
        }),
      ],
      aging: BUCKETS.map((b) => ({
        l: b,
        v: this.m(c, bucket(b), 0),
        w: posTotal ? `${((bucket(b) / posTotal) * 100).toFixed(2)}%` : '0%',
        c: colors[b],
      })),
      agingTitle: `Aging of ${this.m(c, posTotal, 0)} receivable`,
      notices: [
        notice(
          'info',
          'Sales live in Orders, payments where they were taken',
          `This is the accounting balance behind each sale. Open the source to change a sale or record a payment. Noxtill sales carry no due date, so they’re due ${cfg.arTermsDays ? `${cfg.arTermsDays} days after the sale` : 'on the day of sale'} (Settings › Tax & bank mapping).`,
        ),
      ],
      table: {
        title: 'Open receivables',
        count: `${items.length} open item${items.length === 1 ? '' : 's'}`,
        cols: [
          ['Customer'],
          ['Invoice'],
          ['Posted'],
          ['Due'],
          ['Original', 1],
          ['Paid', 1],
          ['Balance', 1],
          ['Aging'],
          ['Status'],
          ['', 1],
        ],
        grid: 'minmax(160px,1.4fr) 100px 70px 70px 100px 90px 110px 80px 110px 50px',
        minW: 1020,
        segs: ['All', 'Overdue', 'Current', 'Disputed'],
        filters:
          c.branches.length > 1 && !c.branchId
            ? [['Branch', ['All branches', ...c.branches.map((b) => b.name)]]]
            : [],
        rows: items.map((i) => {
          const st = i.dispute
            ? 'Disputed'
            : i.balance > 0 && i.daysPastDue > 0
              ? 'Overdue'
              : 'Current';
          return {
            id: i.id,
            seg: [st, ...(i.dispute && i.daysPastDue > 0 ? ['Overdue'] : [])],
            text: `${i.customer} ${i.orderNo ?? ''} ${st}`,
            f: { Branch: this.branchName(c, i.branchId) },
            cells: [
              B(i.customer, {
                sub: i.dispute ?? (i.balance < 0 ? 'Credit balance' : ''),
              }),
              T(
                i.orderNo
                  ? `Order #${i.orderNo}`
                  : i.id.startsWith('adv:')
                    ? 'Unapplied'
                    : 'Opening',
                { color: '#0E8442', fw: 700 },
              ),
              T(md(i.date)),
              T(md(i.due)),
              M(i.original, i.currency),
              M(i.paid, i.currency, { color: '#667085' }),
              M(i.balance, i.currency, { fw: 800 }),
              T(i.balance > 0 ? i.bucket : '—', {
                fw: 700,
                color: i.bucket === 'Current' ? '#0E8442' : '#B54708',
              }),
              S(st),
              A(),
            ],
          };
        }),
      } as Table,
    };
  }

  async apScreen(c: Ctx) {
    const items = (await this.ap.openItems(c.rootId)).filter(
      (i) => !c.branchId || !i.bill.branchId || i.bill.branchId === c.branchId,
    );
    const today = dayOf(new Date());
    const week = new Date(today.getTime() + 7 * 86_400_000);
    const sum = (f: (i: (typeof items)[number]) => boolean) =>
      r2(items.filter(f).reduce((s, i) => s + i.openBase, 0));
    const total = sum(() => true);
    const ctl = this.ledger.bal(
      await this.ledger.totals(c.rootId, null, null, FAR_FUTURE),
      c.byKey.get('ap')!,
    );
    const allSub = r2(
      (await this.ap.openItems(c.rootId)).reduce((s, i) => s + i.openBase, 0),
    );
    const diff = r2(ctl - allSub);
    const overdue = (i: (typeof items)[number]) =>
      i.bill.dueDate < today && i.bill.status !== 'On Hold';
    const dueWeek = (i: (typeof items)[number]) =>
      i.bill.dueDate >= today &&
      i.bill.dueDate <= week &&
      i.bill.status !== 'On Hold';
    const label = (i: (typeof items)[number]) => {
      const d = Math.round(
        (i.bill.dueDate.getTime() - today.getTime()) / 86_400_000,
      );
      return d < 0
        ? `${-d} day${d === -1 ? '' : 's'} overdue`
        : d === 0
          ? 'Due today'
          : d <= 7
            ? `Due in ${d} day${d === 1 ? '' : 's'}`
            : 'Current';
    };
    const notices: Notice[] = [];
    if (diff)
      notices.push(
        notice(
          'bad',
          `A/P control account differs by ${this.m(c, Math.abs(diff))}`,
          `Subledger ${this.m(c, allSub)} vs GL ${c.byKey.get('ap')!.code} ${this.m(c, ctl)}. Most likely a manual journal posted directly to the control account. This blocks the A/P close control.`,
          'Investigate',
          'openRec:ap|AP-DIFF',
        ),
      );
    return {
      kpis: [
        kpi({
          label: 'Total payable',
          value: this.m(c, total, 0),
          state: diff ? 'Mismatch' : '',
          def: 'Open posted bills less recorded payments.',
          adv: `Subledger ${this.m(c, allSub)} · control ${c.byKey.get('ap')!.code} ${this.m(c, ctl)}`,
          ic: 'ap',
        }),
        kpi({
          label: 'Due this week',
          value: this.m(c, sum(dueWeek), 0),
          meta: `${md(today)} – ${md(week)}`,
          seg: 'Due this week',
          def: 'Bills due in the next 7 days.',
          ic: 'ap',
          ...toneAmber,
        }),
        kpi({
          label: 'Overdue',
          value: this.m(c, sum(overdue), 0),
          meta: `${items.filter(overdue).length} bill${items.filter(overdue).length === 1 ? '' : 's'}`,
          seg: 'Overdue',
          def: 'Past due date and unpaid.',
          ic: 'alert',
          ...toneRed,
        }),
        kpi({
          label: 'On hold',
          value: this.m(
            c,
            sum((i) => i.bill.status === 'On Hold'),
            0,
          ),
          meta: `${items.filter((i) => i.bill.status === 'On Hold').length} bill${items.filter((i) => i.bill.status === 'On Hold').length === 1 ? '' : 's'}`,
          seg: 'On Hold',
          def: 'Held for an accounting reason — not to be paid yet.',
          ic: 'close',
        }),
        kpi({
          label: 'Approved for payment',
          value: this.m(
            c,
            sum((i) => i.bill.status === 'Approved for Payment'),
            0,
          ),
          meta: `${items.filter((i) => i.bill.status === 'Approved for Payment').length} bills`,
          seg: 'Approved for Payment',
          def: 'Cleared to pay. Record the payment once it’s made.',
          ic: 'recon',
        }),
      ],
      notices,
      flow: flow(
        'Paying a bill — nothing is marked paid until the payment is recorded',
        [
          'Approved bill',
          'Posted to A/P',
          'Approve for payment',
          'Pay from your bank',
          'Record payment',
          'A/P settled',
          'Bank match & reconcile',
        ],
        2,
      ),
      table: {
        title: 'Open payables',
        count: `${items.length} open bill${items.length === 1 ? '' : 's'}`,
        cols: [
          ['Vendor'],
          ['Bill'],
          ['Posted'],
          ['Due'],
          ['Original', 1],
          ['Balance', 1],
          ['Aging'],
          ['Hold'],
          ['Status'],
          ['', 1],
        ],
        grid: 'minmax(160px,1.4fr) 100px 70px 70px 100px 110px 120px minmax(140px,1fr) 160px 50px',
        minW: 1160,
        segs: [
          'All',
          'Due this week',
          'Overdue',
          'On Hold',
          'Approved for Payment',
          'Partially Paid',
        ],
        filters: [],
        rows: items.map((i) => {
          const st = overdue(i) ? 'Overdue' : i.bill.status;
          return {
            id: i.bill.id,
            seg: [
              st,
              i.bill.status,
              ...(dueWeek(i) || overdue(i) ? ['Due this week'] : []),
            ],
            text: `${i.bill.vendorName} ${i.bill.number} ${i.bill.vendorInvoiceNo ?? ''} ${st}`,
            cells: [
              B(i.bill.vendorName),
              T(i.bill.number, { color: '#0E8442', fw: 700 }),
              T(md(i.bill.billDate)),
              T(md(i.bill.dueDate)),
              M(num(i.bill.total), i.bill.currency),
              M(i.open, i.bill.currency, { fw: 800 }),
              T(label(i), {
                fw: 700,
                color: st === 'Overdue' ? '#B42318' : '#475467',
              }),
              T(i.bill.holdReason ?? '—', {
                color: i.bill.holdReason ? '#B54708' : '#98A2B3',
              }),
              S(st),
              A(),
            ],
          };
        }),
      } as Table,
    };
  }

  billApprovalLabel(
    b: { status: string; approvedById: string | null },
    pending: boolean,
  ) {
    if (b.status === 'Rejected') return 'Rejected';
    if (pending) return 'Approval Required';
    if (b.approvedById) return 'Approved';
    return 'Not submitted';
  }
  billMatchLabel(b: {
    matchStatus: string;
    matchDetail: unknown;
    status: string;
  }) {
    const d = (b.matchDetail ?? {}) as {
      duplicateOf?: string[];
      rows?: { result: string }[];
      reviewedBy?: string;
    };
    if (d.duplicateOf?.length && b.status === 'Review Required')
      return 'Possible Duplicate';
    if (b.matchStatus === 'Matched') return '3-Way Matched';
    if (b.matchStatus === 'Variance')
      return (
        d.rows?.find((r) => r.result !== 'Match')?.result ?? 'Qty Exception'
      );
    return 'No PO';
  }

  async billsScreen(c: Ctx) {
    const bills = await this.prisma.finBill.findMany({
      where: {
        businessId: c.rootId,
        status: { not: 'Voided' },
        ...(c.branchId
          ? { OR: [{ branchId: c.branchId }, { branchId: null }] }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 400,
    });
    const pend = new Set(
      (
        await this.prisma.finApproval.findMany({
          where: {
            businessId: c.rootId,
            subjectType: 'bill',
            status: 'Pending',
          },
        })
      ).map((p) => p.subjectId),
    );
    const posted = bills.filter(
      (b) =>
        b.postedAt &&
        b.postedAt >= c.range.from &&
        b.postedAt <= new Date(c.range.to.getTime() + 86_399_999),
    );
    const need = bills.filter((b) => pend.has(b.id));
    const pos = await this.prisma.purchaseOrder.findMany({
      where: {
        id: {
          in: bills.map((b) => b.purchaseOrderId).filter(Boolean) as string[],
        },
      },
      select: { id: true },
    });
    const poRef = new Map(
      pos.map((p) => [p.id, `PO-${p.id.slice(0, 6).toUpperCase()}`]),
    );
    return {
      kpis: [
        kpi({
          label: 'Needs approval',
          value: String(need.length),
          meta: this.m(
            c,
            r2(need.reduce((a, b) => a + num(b.total) * num(b.fxRate), 0)),
            0,
          ),
          seg: 'Approval Required',
          def: 'Bills waiting for an approver before they can post.',
          ic: 'close',
          ...toneViolet,
        }),
        kpi({
          label: 'Review required',
          value: String(
            bills.filter((b) => b.status === 'Review Required').length,
          ),
          seg: 'Review Required',
          def: 'Possible duplicates or three-way match exceptions a person must check.',
          ic: 'alert',
          ...toneAmber,
        }),
        kpi({
          label: 'Posted this period',
          value: String(posted.length),
          meta: this.m(
            c,
            r2(posted.reduce((a, b) => a + num(b.total) * num(b.fxRate), 0)),
            0,
          ),
          def: `Bills posted to A/P in ${c.range.label}.`,
          ic: 'gl',
        }),
        kpi({
          label: 'Payment pending',
          value: String(
            bills.filter((b) => b.status === 'Approved for Payment').length,
          ),
          seg: 'Approved for Payment',
          def: 'Approved for payment — record the payment once it’s made.',
          ic: 'ap',
        }),
      ],
      flow: flow(
        'Scanned bills are reviewed before anything posts',
        [
          'Upload',
          'Extract',
          'Confidence check',
          'Review fields',
          'Correct',
          'Map accounts',
          'Save draft bill',
        ],
        -1,
        'Photo Digitizer output is never posted automatically. Duplicate vendor invoice numbers are flagged before approval.',
      ),
      table: {
        title: 'Vendor bills',
        count: `${bills.length} shown`,
        cols: [
          ['Bill #'],
          ['Vendor'],
          ['Bill date'],
          ['Due'],
          ['PO'],
          ['Amount', 1],
          ['Match'],
          ['Approval'],
          ['Accounting'],
          ['', 1],
        ],
        grid: '100px minmax(170px,1.4fr) 80px 70px 80px 110px 140px 150px 140px 50px',
        minW: 1170,
        segs: [
          'All',
          'Review Required',
          'Approval Required',
          'Posted',
          'Approved for Payment',
          'Paid',
        ],
        filters: [],
        rows: bills.map((b) => {
          const ap = this.billApprovalLabel(b, pend.has(b.id));
          return {
            id: b.id,
            seg: [b.status, ap],
            text: `${b.number} ${b.vendorName} ${b.vendorInvoiceNo ?? ''} ${b.status}`,
            cells: [
              B(b.number, { color: '#0E8442' }),
              B(b.vendorName, {
                sub: `Vendor inv ${b.vendorInvoiceNo ?? '—'} · ${b.intake}`,
              }),
              T(md(b.billDate)),
              T(md(b.dueDate)),
              T(
                b.purchaseOrderId
                  ? (poRef.get(b.purchaseOrderId) ?? 'PO')
                  : '—',
                { color: '#667085' },
              ),
              M(num(b.total), b.currency),
              S(this.billMatchLabel(b)),
              S(ap),
              S(b.status),
              A(),
            ],
          };
        }),
      } as Table,
    };
  }

  // ── compliance & assets ──────────────────────────────────────────────────

  async taxScreen(c: Ctx) {
    const rets = (await this.tax.list(c.rootId)).filter(
      (r) => !c.branchId || r.ret.jurisdiction === c.branchId,
    );
    const open = rets.filter((r) => r.status !== 'Filed');
    const today = dayOf(new Date());
    const next = [...open].sort(
      (a, b) => a.ret.dueOn.getTime() - b.ret.dueOn.getTime(),
    )[0];
    const overdue = open.filter((r) => r.ret.dueOn < today);
    const focus = next ?? rets[0];
    const notices: Notice[] = [
      notice(
        'info',
        'Tax rates are set in Settings › Taxes',
        'Finance calculates from posted entries and reconciles the tax accounts; it never invents tax treatment. Each branch files with its own rate and filing day.',
        'Open Tax Settings',
        'link:/settings?category=money',
      ),
    ];
    return {
      kpis: [
        kpi({
          label: 'Collected tax',
          value: this.m(c, r2(open.reduce((s, r) => s + r.calc.output, 0)), 0),
          meta: 'Returns not yet filed',
          def: 'Output tax on posted sales.',
          ic: 'taxes',
        }),
        kpi({
          label: 'Input / recoverable',
          value: this.m(c, r2(open.reduce((s, r) => s + r.calc.input, 0)), 0),
          meta: 'Returns not yet filed',
          def: 'Tax on posted bills you can reclaim.',
          ic: 'taxes',
        }),
        kpi({
          label: 'Net liability',
          value: this.m(c, r2(open.reduce((s, r) => s + r.calc.net, 0)), 0),
          state: open.length ? 'Estimated' : '',
          def: 'Collected minus recoverable across open returns.',
          ic: 'taxes',
        }),
        kpi({
          label: 'Upcoming filing',
          value: next ? md(next.ret.dueOn) : '—',
          meta: next
            ? `${next.taxType} · ${Math.round((next.ret.dueOn.getTime() - today.getTime()) / 86_400_000)} days`
            : 'Nothing due',
          def: 'Next return due.',
          ic: 'close',
          ...toneAmber,
        }),
        kpi({
          label: 'Overdue filings',
          value: String(overdue.length),
          def: 'Returns past their due date without filing evidence.',
          ic: 'close',
          ...(overdue.length ? toneRed : {}),
        }),
        kpi({
          label: 'Exceptions',
          value: String(focus?.calc.exceptions.length ?? 0),
          meta: focus
            ? `${focus.taxType} · ${monthLabel(focus.ret.periodStart.getUTCFullYear(), focus.ret.periodStart.getUTCMonth() + 1)}`
            : '',
          def: 'Lines with missing tax codes, manual journals to tax accounts, or sales with no rate.',
          ic: 'alert',
          ...toneRed,
        }),
      ],
      flow: focus
        ? flow(
            `${focus.taxType} · ${monthLabel(focus.ret.periodStart.getUTCFullYear(), focus.ret.periodStart.getUTCMonth() + 1)} — filing progress`,
            TAX_STEPS,
            TAX_STEP_AT[focus.status] ?? 1,
            'A return is marked Filed only after a filing confirmation reference is recorded.',
          )
        : null,
      notices,
      table: {
        title: 'Tax returns',
        count: `${rets.length} period${rets.length === 1 ? '' : 's'}`,
        cols: [
          ['Jurisdiction'],
          ['Tax type'],
          ['Period'],
          ['Taxable base', 1],
          ['Output', 1],
          ['Input', 1],
          ['Net', 1],
          ['Due'],
          ['Status'],
          ['', 1],
        ],
        grid: 'minmax(150px,1.2fr) 130px 150px 110px 100px 100px 100px 60px 140px 50px',
        minW: 1140,
        segs: [
          'All',
          'Review Required',
          'Open',
          'Calculated',
          'Approval Required',
          'Locked',
          'Filed',
        ],
        filters: [],
        rows: rets.map((r) => ({
          id: r.ret.id,
          seg: [r.status],
          text: `${r.jurisdiction} ${r.taxType} ${r.status}`,
          cells: [
            B(r.jurisdiction),
            T(r.taxType),
            T(
              monthLabel(
                r.ret.periodStart.getUTCFullYear(),
                r.ret.periodStart.getUTCMonth() + 1,
              ),
            ),
            M(r.calc.base, c.base),
            M(r.calc.output, c.base),
            M(r.calc.input, c.base),
            M(r.calc.net, c.base, { fw: 800 }),
            T(md(r.ret.dueOn)),
            S(
              r.status,
              r.changed
                ? `Changed ${this.m(c, r.drift)} since ${r.status === 'Approval Required' ? 'submission' : 'lock'}`
                : '',
            ),
            A(),
          ],
        })),
      } as Table,
    };
  }

  async faScreen(c: Ctx) {
    const all = await this.ledger.totals(c.rootId, null, null, FAR_FUTURE);
    const cost = this.ledger.bal(all, c.byKey.get('fa_cost')!);
    const accum = -this.ledger.bal(all, c.byKey.get('fa_accum')!);
    const assets = await this.prisma.finAsset.findMany({
      where: { businessId: c.rootId },
      orderBy: { number: 'asc' },
    });
    const acc = await this.assets.accumulated(c.rootId);
    const reg = r2(
      assets
        .filter((a) => a.status !== 'Disposed')
        .reduce((s, a) => s + num(a.cost) - (acc.get(a.id) ?? 0), 0),
    );
    const end = monthKey(c.range.to);
    const pv = await this.assets.preview(c.rootId, end.year, end.month);
    const runJ = pv.run
      ? await this.prisma.finJournal.findUnique({
          where: { id: pv.run.journalId },
        })
      : null;
    const pending = await this.assets.pendingCapitalization(c.rootId);
    const fyStart = c.range.fyStart;
    const disposals = assets.filter(
      (a) => a.disposedOn && a.disposedOn >= fyStart,
    );
    const monthName = monthLabel(end.year, end.month);
    return {
      kpis: [
        kpi({
          label: 'Asset cost',
          value: this.m(c, cost, 0),
          def: `Capitalized cost in ${c.byKey.get('fa_cost')!.code}.`,
          ic: 'fa',
        }),
        kpi({
          label: 'Net book value',
          value: this.m(c, r2(cost - accum), 0),
          state: reg === r2(cost - accum) ? 'Balanced' : 'Mismatch',
          def:
            reg === r2(cost - accum)
              ? 'Cost less accumulated depreciation. Agrees to the register.'
              : `Register NBV ${this.m(c, reg)} differs from GL.`,
          ic: 'fa',
        }),
        kpi({
          label: 'Accumulated depreciation',
          value: this.m(c, accum, 0),
          def: `Balance of ${c.byKey.get('fa_accum')!.code}.`,
          ic: 'fa',
        }),
        kpi({
          label: `${MONTHS[end.month - 1].slice(0, 3)} depreciation`,
          value: this.m(c, pv.run ? pv.run.total : pv.total, 0),
          state: pv.run ? 'Posted' : pv.total ? 'Due' : '',
          meta: runJ
            ? runJ.number
            : (pv.blocked ?? (pv.total ? 'Not run yet' : 'Nothing due')),
          def: pv.run
            ? `Posted ${mdy(runJ?.postedAt ?? null)}.`
            : 'Run once the month is over (or let the monthly job post it).',
          ic: 'gl',
        }),
        kpi({
          label: 'Pending capitalization',
          value: String(pending.length),
          meta: this.m(c, r2(pending.reduce((s, p) => s + p.amount, 0)), 0),
          seg: 'Pending',
          def: 'Bill lines posted to Fixed Assets — Cost with no asset record yet.',
          ic: 'alert',
          ...toneAmber,
        }),
        kpi({
          label: 'Disposals',
          value: String(disposals.length),
          meta: `FY from ${md(fyStart)}`,
          def: 'Assets derecognized this financial year.',
          ic: 'fa',
        }),
      ],
      notices: [
        notice(
          'info',
          'Finance keeps the asset register',
          'Noxtill has no separate physical-asset module, so the register lives here: cost, location, depreciation and disposal. Bills posted to Fixed Assets — Cost show up as pending capitalization.',
        ),
      ],
      depr: {
        title: `${monthName} depreciation`,
        rows: pv.rows.map((r) => ({
          a: r.asset.name,
          open: this.m(c, r.open),
          dep: this.m(c, r.dep),
          close: this.m(c, r.close),
          m:
            r.asset.method === 'declining'
              ? 'Declining balance'
              : 'Straight-line',
        })),
        total: this.m(c, pv.run ? pv.run.total : pv.total),
        status: pv.run ? 'Posted' : pv.total ? 'Not run' : 'Nothing due',
        je: runJ?.number ?? '',
        blocked: pv.blocked,
        canRun: !pv.run && !!pv.rows.length && !pv.blocked && c.actor.manage,
        period: c.range.key,
      },
      pending,
      table: {
        title: 'Asset book',
        count: `${assets.length} asset${assets.length === 1 ? '' : 's'}`,
        cols: [
          ['Asset'],
          ['Class'],
          ['Capitalized'],
          ['Cost', 1],
          ['Salvage', 1],
          ['Method'],
          ['Life'],
          ['Acc. depreciation', 1],
          ['NBV', 1],
          ['Status'],
          ['', 1],
        ],
        grid: 'minmax(170px,1.4fr) 140px 90px 100px 80px 110px 60px 120px 110px 140px 50px',
        minW: 1220,
        segs: ['All', 'Active', 'Fully Depreciated', 'Disposed', 'Pending'],
        filters: [],
        rows: [
          ...assets.map((a) => {
            const ad = acc.get(a.id) ?? 0;
            return {
              id: a.id,
              seg: [a.status],
              text: `${a.number} ${a.name} ${a.category} ${a.status}`,
              cells: [
                B(a.name, {
                  sub: `${a.number}${a.location ? ` · ${a.location}` : ''}`,
                }),
                T(a.category, { color: '#475467' }),
                T(
                  `${MONTHS[a.inServiceOn.getUTCMonth()].slice(0, 3)} ${a.inServiceOn.getUTCFullYear()}`,
                ),
                M(num(a.cost), c.base),
                M(num(a.salvage), c.base, { color: '#667085' }),
                T(a.method === 'declining' ? 'Declining' : 'Straight-line'),
                T(`${a.lifeMonths} mo`),
                M(ad, c.base),
                M(a.status === 'Disposed' ? 0 : r2(num(a.cost) - ad), c.base, {
                  fw: 800,
                }),
                S(a.status),
                A(),
              ],
            };
          }),
          ...pending.map((p) => ({
            id: `pending:${p.billId}`,
            seg: ['Pending'],
            text: `${p.bill} ${p.vendor} ${p.description}`,
            cells: [
              B(p.description, { sub: `From ${p.bill} · ${p.vendor}` }),
              T('—', { color: '#475467' }),
              T('—'),
              M(p.amount, c.base),
              M(null, c.base),
              T('—'),
              T('—'),
              M(null, c.base),
              M(null, c.base),
              S('Pending Review'),
              A('Capitalize ›'),
            ],
          })),
        ],
      } as Table,
    };
  }

  // ── planning ─────────────────────────────────────────────────────────────

  async budgetScreen(c: Ctx, q: ScopeQuery) {
    const cfg = await this.ctx.config(c.rootId);
    const fyStart = c.range.fyStart;
    const fy =
      this.ledger.fyStartMonth(cfg) === 1
        ? fyStart.getUTCFullYear()
        : fyStart.getUTCFullYear() + 1;
    const list = (await this.budgets.list(c.rootId)).filter(
      (b) => b.fiscalYear >= fy - 1,
    );
    const active = await this.budgets.activeFor(c.rootId, c.range);
    const sel =
      list.find((b) => b.id === q.bver) ??
      (active ? list.find((b) => b.id === active.id) : null) ??
      list[0] ??
      null;
    const rows = sel
      ? await this.budgets.bva(c.rootId, sel.id, c.range, c.branchId)
      : [];
    const budget = r2(rows.reduce((s, r) => s + r.budget, 0));
    const actual = r2(rows.reduce((s, r) => s + r.actual, 0));
    const material = rows.filter((r) => r.material);
    return {
      versions: list.map((b) => {
        const s = b.status === 'Approved' ? 'Approved · Active' : b.status;
        const ch = chip(s);
        const on = sel?.id === b.id;
        return {
          id: b.id,
          l: `${b.name} · v${b.version}`,
          s,
          sub: `FY${b.fiscalYear} · ${b._count.lines} lines`,
          bg: ch.bg,
          fg: ch.fg,
          bd: on ? '#12A150' : '#E6EAF0',
          bw: on ? '2px' : '1px',
          sh: on ? '0 0 0 3px rgba(18,161,80,.12)' : 'none',
        };
      }),
      selectedBudget: sel
        ? {
            id: sel.id,
            name: sel.name,
            version: sel.version,
            status: sel.status,
            fiscalYear: sel.fiscalYear,
          }
        : null,
      kpis: sel
        ? [
            kpi({
              label: `Budget (${c.range.label})`,
              value: this.m(c, budget, 0),
              meta: `${sel.name} v${sel.version}`,
              def: 'Budget across P&L accounts for the period (revenue and costs added together).',
              ic: 'budgets',
            }),
            kpi({
              label: `Actual (${c.range.label})`,
              value: this.m(c, actual, 0),
              meta: 'Posted ledger',
              def: 'Posted actuals for the same accounts.',
              ic: 'gl',
            }),
            kpi({
              label: 'Material variances',
              value: String(material.length),
              seg: 'Material',
              def: `Over ${cfg.materialPct}% and over ${this.m(c, cfg.materialAmt, 0)} — need an explanation.`,
              ic: 'alert',
              ...toneAmber,
            }),
          ]
        : [],
      notices: [
        notice(
          'info',
          'Approved budgets can’t be overwritten',
          'Changes to an approved version create a new revision. Approving a revision locks the version it replaces.',
        ),
      ],
      emptyBudgets: !list.length,
      table: sel
        ? ({
            title: `Budget vs actual · ${c.range.label}`,
            count: `${rows.length} line${rows.length === 1 ? '' : 's'}`,
            cols: [
              ['Account'],
              ['Department'],
              ['Branch'],
              ['Explanation'],
              ['Budget', 1],
              ['Actual', 1],
              ['Variance', 1],
              ['Var %', 1],
              ['Status'],
              ['', 1],
            ],
            grid: 'minmax(190px,1.5fr) 110px 100px 140px 110px 110px 110px 70px 130px 50px',
            minW: 1180,
            segs: ['All', 'Material', 'Favorable', 'Unfavorable'],
            filters: [],
            rows: rows.map((r) => {
              const s =
                r.variance === 0
                  ? 'On Budget'
                  : r.favorable
                    ? 'Favorable'
                    : 'Unfavorable';
              return {
                id: `${sel.id}|${r.account.id}`,
                seg: [s, ...(r.material ? ['Material'] : [])],
                text: `${r.account.code} ${r.account.name} ${s}`,
                cells: [
                  B(`${r.account.code} ${r.account.name}`, {
                    sub:
                      r.material && !r.explanation
                        ? 'Material — explanation needed'
                        : '',
                  }),
                  T(r.department ?? 'All'),
                  T(this.branchName(c, sel.branchId)),
                  T(r.explanation ?? '—', {
                    color: r.explanation ? '#344054' : '#98A2B3',
                  }),
                  M(r.budget, c.base),
                  M(r.actual, c.base),
                  T(`${r.variance > 0 ? '+' : ''}${this.m(c, r.variance)}`, {
                    r: 1,
                    fw: 700,
                    color: s === 'Unfavorable' ? '#B42318' : '#0E8442',
                  }),
                  T(`${r.pct > 0 ? '+' : ''}${r.pct.toFixed(1)}%`, {
                    r: 1,
                    fw: 700,
                    color: s === 'Unfavorable' ? '#B42318' : '#0E8442',
                  }),
                  S(s),
                  A(),
                ],
              };
            }),
          } as Table)
        : null,
    };
  }

  // ── reporting ────────────────────────────────────────────────────────────

  async statements(c: Ctx, q: ScopeQuery) {
    const type = ['pl', 'bs', 'cf', 'tb'].includes(q.stmt ?? '')
      ? (q.stmt as 'pl' | 'bs' | 'cf' | 'tb')
      : 'pl';
    const cmp = q.cmp !== '0';
    const scope = { rootId: c.rootId, branchId: c.branchId, range: c.range };
    const m = (n: number | null) => (n == null ? '' : this.m(c, n));
    const ch = (a: number | null, b: number | null) =>
      a == null || b == null
        ? ''
        : r2(a - b) === 0
          ? '—'
          : `${a - b > 0 ? '+' : ''}${this.m(c, r2(a - b))}`;
    type R = {
      kind: string;
      l: string;
      a: string;
      b: string;
      c: string;
      code: string;
    };
    let rows: R[] = [];
    let integrity: { ta: string; tle: string; d: string } | null = null;
    let check = '';
    let heads = ['', '', ''];
    if (type === 'pl') {
      const p = await this.ledger.pnl(scope, c.accounts, cmp);
      rows = p.rows.map((r) => ({
        kind: r.kind,
        l: r.l,
        a: m(r.a),
        b: m(r.b),
        c: ch(r.a, r.b),
        code: r.code,
      }));
      heads = [c.range.label, c.range.prior.label, 'Change'];
    } else if (type === 'bs') {
      const b = await this.ledger.balanceSheet(scope, c.accounts, cmp);
      rows = b.rows.map((r) => ({
        kind: r.kind,
        l: r.l,
        a: m(r.a),
        b: m(r.b),
        c: ch(r.a, r.b),
        code: r.code,
      }));
      heads = [b.asAt, b.priorAsAt, 'Change'];
      if (!b.balanced)
        integrity = {
          ta: this.m(c, b.assets),
          tle: this.m(c, r2(b.liabilities + b.equity)),
          d: this.m(c, r2(b.assets - b.liabilities - b.equity)),
        };
      else
        check = `Assets ${this.m(c, b.assets)} = Liabilities ${this.m(c, b.liabilities)} + Equity ${this.m(c, b.equity)}`;
    } else if (type === 'cf') {
      const f = await this.ledger.cashFlow(scope, c.accounts);
      rows = f.rows.map((r) => ({
        kind: r.kind,
        l: r.l,
        a: m(r.a),
        b: '',
        c: '',
        code: r.code,
      }));
      heads = [c.range.label, '', ''];
      check = f.ties
        ? `Opening cash ${this.m(c, f.cashOpen)} + net change ${this.m(c, f.net)} = closing cash ${this.m(c, f.cashClose)}`
        : '';
      if (!f.ties)
        integrity = {
          ta: this.m(c, f.cashClose),
          tle: this.m(c, r2(f.cashOpen + f.net)),
          d: this.m(c, r2(f.cashClose - f.cashOpen - f.net)),
        };
    } else {
      const tb = await this.ledger.trialBalance(scope, c.accounts);
      rows = tb.rows.map((r) => ({
        kind: 'line',
        l: `${r.code}  ${r.name}`,
        a: r.dr ? this.m(c, r.dr) : '',
        b: r.cr ? this.m(c, r.cr) : '',
        c: '',
        code: r.code,
      }));
      rows.push({
        kind: 'grand',
        l: 'Totals',
        a: this.m(c, tb.dr),
        b: this.m(c, tb.cr),
        c: '',
        code: '',
      });
      heads = ['Debit', 'Credit', ''];
      if (tb.dr === tb.cr)
        check = `Debits ${this.m(c, tb.dr)} = Credits ${this.m(c, tb.cr)}`;
      else
        integrity = {
          ta: this.m(c, tb.dr),
          tle: this.m(c, tb.cr),
          d: this.m(c, r2(tb.dr - tb.cr)),
        };
    }
    const styl = (k: string) =>
      ({
        head: {
          fw: 800,
          fs: '11px',
          col: '#667085',
          tt: 'uppercase',
          bt: 'none',
          bg: 'transparent',
          pt: '16px',
          pl: '0px',
        },
        line: {
          fw: 500,
          fs: '13px',
          col: '#344054',
          tt: 'none',
          bt: '1px solid #F2F4F7',
          bg: 'transparent',
          pt: '9px',
          pl: '14px',
        },
        total: {
          fw: 800,
          fs: '13px',
          col: '#101828',
          tt: 'none',
          bt: '1px solid #D0D5DD',
          bg: '#FAFBFC',
          pt: '10px',
          pl: '0px',
        },
        grand: {
          fw: 800,
          fs: '14.5px',
          col: '#0F172A',
          tt: 'none',
          bt: '2px solid #0A1B2A',
          bg: '#F7FCF9',
          pt: '12px',
          pl: '0px',
        },
      })[k]!;
    const titles = {
      pl: 'Profit & Loss',
      bs: 'Balance Sheet',
      cf: 'Cash Flow Statement',
      tb: 'Trial Balance',
    };
    const open = c.periodStatus !== 'locked';
    const basis = {
      pl: 'Posted ledger only · accrual basis · drafts, approvals and unposted bills excluded',
      bs: `As at ${mdy(c.range.to)} · posted ledger${open ? ' · period open (figures can still change)' : ' · period locked'}`,
      cf: 'Indirect method from posted ledger movements. Not the operational cash forecast in Profit Analytics.',
      tb: `Supporting accounting view · all accounts with a balance · ${mdy(c.range.to)}`,
    };
    const showCmp = type !== 'cf' && (type === 'tb' || cmp);
    return {
      stmt: {
        type,
        tabs: [
          ['pl', 'Profit & Loss'],
          ['bs', 'Balance Sheet'],
          ['cf', 'Cash Flow'],
          ['tb', 'Trial Balance'],
        ].map(([k, l]) => ({
          k,
          l,
          bg: k === type ? '#fff' : 'transparent',
          fg: k === type ? '#0F172A' : '#475467',
          sh: k === type ? '0 1px 3px rgba(16,24,40,.12)' : 'none',
        })),
        rows: rows.map((r, i) => ({
          ...r,
          ...styl(r.kind),
          i: String(i),
          drill: r.kind === 'line' && !!r.code,
          cur: r.kind === 'line' && r.code ? 'pointer' : 'default',
        })),
        title: titles[type],
        sub: `${c.entity}${c.branchId ? ` · ${this.branchName(c, c.branchId)}` : c.branches.length > 1 ? ' · all branches' : ''} · ${c.base}`,
        basis: basis[type],
        hA: heads[0],
        hB: heads[1],
        hC: heads[2],
        showB: showCmp,
        showC: showCmp && type !== 'tb',
        integrity,
        ok: !integrity,
        grid: showCmp
          ? type === 'tb'
            ? 'minmax(0,1fr) 140px 140px'
            : 'minmax(0,1fr) 130px 130px 120px'
          : 'minmax(0,1fr) 140px',
        check,
        cmp,
      },
    };
  }

  async closeScreen(c: Ctx) {
    const end = monthKey(c.range.to);
    const isMonth = /^\d{4}-\d{2}$/.test(c.range.key);
    const tk = monthKey(dayOf(new Date()));
    // Closing is for a finished month: the current month (the default scope) means "the one to close now".
    const isCurrent = end.year === tk.year && end.month === tk.month;
    const cp =
      isMonth && !isCurrent ? end : await this.close.currentPeriod(c.rootId);
    const v = await this.close.view(c.rootId, cp.year, cp.month);
    const cfg = await this.ctx.config(c.rootId);
    const target = FinanceCloseService.closeDue(cfg, cp.year, cp.month);
    const per = await this.ctx.period(c.rootId, cp.year, cp.month);
    const locked = per.status === 'locked';
    const names = await this.ctx.userNames([
      v.run?.startedById,
      v.run?.approvedById,
      ...v.tasks.map((t) => t.task.ownerUserId),
    ]);
    const tasks = v.run
      ? v.tasks
      : CLOSE_TEMPLATE.map(([key, title, area], i) => ({
          task: {
            id: `tpl:${key}`,
            key,
            title,
            area,
            ownerUserId: null,
            dueOn: target,
            status: 'Not Started',
            attachments: [],
            notes: null,
            sortOrder: i,
          } as never,
          status: v.checks[key]?.na ? 'N/A' : 'Not Started',
          exception: v.checks[key]?.exception ?? '',
          na: v.checks[key]?.na ?? null,
          go: v.checks[key]?.go ?? '',
        }));
    const done = tasks.filter(
      (t) => t.status === 'Done' || t.status === 'N/A',
    ).length;
    const pct = Math.round((done / tasks.length) * 100);
    const openT = tasks.filter(
      (t) => t.status !== 'Done' && t.status !== 'N/A',
    );
    const status = locked
      ? 'Locked'
      : v.run
        ? v.run.status === 'Reopened'
          ? 'Reopened'
          : 'In Progress'
        : 'Not Started';
    const sc = chip(status);
    const canFinal = !!v.run && openT.length === 0 && !locked && c.actor.admin;
    const at = locked
      ? 7
      : !v.run
        ? 0
        : openT.length === 0
          ? 5
          : openT.length <= 2
            ? 3
            : 2;
    const periods = await this.close.periods(c.rootId);
    const pNames = await this.ctx.userNames(periods.map((p) => p.lockedById));
    return {
      closeInfo: {
        period: monthLabel(cp.year, cp.month),
        periodKey: `${cp.year}-${String(cp.month).padStart(2, '0')}`,
        runId: v.run?.id ?? null,
        pct: `${pct}%`,
        w: `${pct}%`,
        done,
        total: tasks.length,
        target: mdy(target),
        owner: v.run ? (names.get(v.run.startedById ?? '') ?? '—') : '—',
        status,
        sBg: sc.bg,
        sFg: sc.fg,
        canFinal,
        started: !!v.run,
        fwhy: locked
          ? 'Period locked'
          : !v.run
            ? 'Start the close first.'
            : !c.actor.admin
              ? 'Needs an Owner / Controller.'
              : canFinal
                ? cfg.sod.sod4 && v.run.startedById === c.actor.userId
                  ? 'You started this close — another Owner / Controller must approve (segregation of duties).'
                  : 'You approve as Owner / Controller.'
                : 'Available when all controls are complete.',
      },
      blockers: openT
        .filter((t) => t.exception)
        .map((t) => ({
          l: t.task.title,
          d: t.exception,
          a: t.go === 'cutoff' || !t.go ? 'go:close' : `go:${t.go}`,
          al: 'Open',
        })),
      flow: flow(
        'Close flow',
        [
          'Start',
          'Assign controls',
          'Resolve exceptions',
          'Post adjustments',
          'Reconcile subledgers',
          'Review statements',
          'Final approval',
          'Lock period',
          'Archive evidence',
        ],
        at,
      ),
      cutoff: await this.close.cutoff(c.rootId, cp.year, cp.month),
      periods: periods.map((p) => {
        const s =
          p.status === 'locked'
            ? 'Locked'
            : p.status === 'soft'
              ? 'Soft Close'
              : 'Open';
        const ch = chip(s);
        return {
          id: `${p.year}-${String(p.month).padStart(2, '0')}`,
          l: monthLabel(p.year, p.month),
          s,
          d:
            p.status === 'locked'
              ? `Locked ${md(p.lockedAt)} by ${pNames.get(p.lockedById ?? '') ?? '—'}`
              : p.status === 'soft'
                ? 'Soft-closed — Owner / Controller posts only'
                : (p.note ?? 'Open for posting'),
          bg: ch.bg,
          fg: ch.fg,
          canReopen: p.status === 'locked',
        };
      }),
      table: {
        title: 'Close checklist',
        count: `${done} of ${tasks.length} complete`,
        cols: [
          ['Task'],
          ['Owner'],
          ['Due'],
          ['Status'],
          ['Evidence'],
          ['Exceptions'],
          ['', 1],
        ],
        grid: 'minmax(190px,1.3fr) 110px 60px 120px minmax(180px,1.3fr) minmax(180px,1.3fr) 70px',
        minW: 1040,
        segs: ['All', 'Open', 'Done'],
        filters: [],
        rows: tasks.map((t) => {
          const ev = (
            Array.isArray(t.task.attachments) ? t.task.attachments : []
          ) as { name: string }[];
          const evT = t.na
            ? t.na
            : ev.length
              ? ev.map((e) => e.name).join(', ')
              : (t.task.notes ?? '');
          return {
            id: t.task.id,
            seg: [t.status === 'Done' || t.status === 'N/A' ? 'Done' : 'Open'],
            text: `${t.task.key} ${t.task.title} ${t.status}`,
            cells: [
              B(t.task.title, { sub: t.task.key }),
              T(
                t.task.ownerUserId
                  ? (names.get(t.task.ownerUserId) ?? '—')
                  : '—',
              ),
              T(md(t.task.dueOn)),
              S(t.status),
              T(evT || '—', { color: evT ? '#344054' : '#98A2B3' }),
              T(
                t.status === 'Done' || t.status === 'N/A'
                  ? '—'
                  : t.exception || '—',
                {
                  color:
                    t.exception && t.status !== 'Done' ? '#B42318' : '#98A2B3',
                  fw: t.exception ? 600 : 500,
                },
              ),
              A(v.run ? 'Open ›' : ''),
            ],
          };
        }),
      } as Table,
    };
  }

  // ── configure ────────────────────────────────────────────────────────────

  async settingsScreen(c: Ctx) {
    const cfg = await this.ctx.config(c.rootId);
    const s = await this.ctx.settingsRow(c.rootId);
    const biz = await this.ctx.business(c.rootId);
    const sel = (
      k: string,
      l: string,
      opts: string[],
      val: string,
      d = '',
    ) => ({
      k,
      l,
      d,
      kind: 'select',
      isSel: true,
      isTog: false,
      isStatic: false,
      opts,
      val,
    });
    const tog = (
      k: string,
      l: string,
      on: boolean,
      d = '',
      locked = false,
    ) => ({
      k,
      l,
      d,
      kind: 'toggle',
      isSel: false,
      isTog: true,
      isStatic: false,
      on,
      locked,
      tbg: on ? '#12A150' : '#D0D5DD',
      tx: on ? '18px' : '2px',
      word: on ? 'On' : 'Off',
    });
    const stat = (l: string, val: string, d = '', a = '', al = '') => ({
      l,
      val,
      d,
      isSel: false,
      isTog: false,
      isStatic: true,
      a,
      al,
    });
    const tk = monthKey(dayOf(new Date()));
    const lockedP = await this.prisma.finPeriod.findFirst({
      where: { businessId: c.rootId, status: 'locked' },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
    const hasPostings =
      (await this.prisma.finJournalLine.count({
        where: { businessId: c.rootId, postedAt: { not: null } },
      })) > 0;
    const codes = await this.prisma.finTaxCode.findMany({
      where: { businessId: c.rootId },
      orderBy: { code: 'asc' },
    });
    const banks = await this.banking.list(c.rootId);
    const cats = await this.prisma.expense.findMany({
      where: { businessId: { in: c.branches.map((b) => b.id) } },
      distinct: ['category'],
      select: { category: true },
    });
    const paidOpts = c.accounts
      .filter(
        (a) =>
          !a.isHeader &&
          a.active &&
          (a.type === 'asset' || a.type === 'liability'),
      )
      .map((a) => `${a.code} ${a.name}`);
    const fx = await this.fx.rates(c.rootId);
    const needed = await this.fx.needed(c.rootId);
    const ctl = c.accounts.filter((a) => a.control);
    const nextJe = `JE-${tk.year}-${String(s.journalSeq + 1).padStart(5, '0')}`;
    const nextBill = `BILL-${String(s.billSeq + 1).padStart(4, '0')}`;
    const sections = [
      {
        id: 'profile',
        t: 'Accounting profile',
        d: `Base settings for ${c.entity}.`,
        rows: [
          stat(
            'Base currency',
            `${biz.currency}`,
            hasPostings
              ? 'Locked after first posting'
              : 'Set in Settings › Business profile',
          ),
          sel('fyStart', 'Financial year starts', MONTHS, cfg.profile.fyStart),
          stat(
            'Accounting method',
            'Accrual',
            'Cash-basis reporting isn’t available in Noxtill',
          ),
          sel(
            'branchMode',
            'Branch on journal lines',
            ['Optional', 'Require branch on every line'],
            cfg.profile.branchMode,
          ),
          stat('Rounding', 'Round per line (2 dp)'),
          stat('Timezone', biz.timezone, 'Set in Settings › Business profile'),
        ],
      },
      {
        id: 'periods',
        t: 'Fiscal calendar & periods',
        d: `Monthly periods · FY starts ${cfg.profile.fyStart}.`,
        rows: [
          stat('Current period', monthLabel(tk.year, tk.month)),
          stat(
            'Lock date',
            lockedP
              ? mdy(monthEnd(lockedP.year, lockedP.month))
              : 'No period locked yet',
            'No normal postings on or before this date',
          ),
          tog(
            'softClose',
            `Soft close a month ${cfg.posting.softCloseDays} days after it ends`,
            cfg.posting.softClose,
            'Only an Owner / Controller can post manually to a soft-closed month',
          ),
        ],
      },
      {
        id: 'posting',
        t: 'Posting controls',
        d: '',
        rows: [
          tog(
            'blockUnbal',
            'Block unbalanced journals',
            true,
            'Always on — cannot be disabled',
            true,
          ),
          tog(
            'reqDept',
            'Require department on expense lines',
            cfg.posting.reqDept,
            cfg.departments.length
              ? `${cfg.departments.length} departments`
              : 'Add departments below first',
          ),
          tog(
            'dupBill',
            'Warn on duplicate vendor invoice numbers',
            cfg.posting.dupBill,
          ),
          tog(
            'autoRev',
            'Auto-reverse accruals on the 1st of next period',
            cfg.posting.autoRev,
          ),
        ],
      },
      {
        id: 'numbering',
        t: 'Numbering & journal types',
        d: '',
        rows: [
          stat('Journal numbers', `JE-{YYYY}-{#####} · next ${nextJe}`),
          stat('Bill numbers', `BILL-{####} · next ${nextBill}`),
          stat(
            'Journal types',
            'Manual · Accrual · Adjustment · Prepayment · Reclass · Reversal · System',
          ),
        ],
      },
      {
        id: 'dims',
        t: 'Account dimensions',
        d: 'Dimensions reference real records — they never copy master data.',
        rows: [
          stat(
            'Branch',
            `${c.branches.length} value${c.branches.length === 1 ? '' : 's'} · from Branches`,
          ),
          stat(
            'Department',
            cfg.departments.length
              ? cfg.departments.join(', ')
              : 'None defined',
            '',
            'editDepartments',
            'Edit',
          ),
          stat(
            'Customer / supplier',
            'On receivable and payable lines automatically',
          ),
        ],
      },
      {
        id: 'controls',
        t: 'Control accounts',
        d: 'Changes need Owner / Controller approval.',
        rows: ctl.map((a) =>
          stat(
            CONTROL_LABEL[a.control!] ?? a.control!,
            `${a.code} ${a.name} · locked`,
          ),
        ),
      },
      {
        id: 'mapping',
        t: 'Tax & bank mapping',
        d: '',
        rows: [
          ...codes.map((x) =>
            stat(
              `${x.kind === 'output' ? 'Output' : 'Input'} tax · ${x.code}`,
              `${x.name} ${num(x.rate)}% → ${this.acctLabel(c, x.accountId)}`,
              x.active ? '' : 'Inactive',
              'editTaxCode:' + x.code,
              'Edit',
            ),
          ),
          ...banks.map((b) =>
            stat(
              `${b.name}${b.mask ? ` ••${b.mask}` : ''}`,
              this.acctLabel(c, b.glAccountId),
            ),
          ),
          stat(
            'Card & online payments',
            `${this.acctLabel(c, c.byKey.get('clearing')!.id)} (until the payout lands in the bank)`,
          ),
          sel(
            'expensePaidFrom',
            'Expenses are paid from',
            paidOpts,
            `${cfg.expensePaidFrom} ${c.accounts.find((a) => a.code === cfg.expensePaidFrom)?.name ?? ''}`.trim(),
            'Noxtill expenses don’t record how they were paid',
          ),
          stat(
            'Expense categories',
            `${Object.keys(cfg.expenseMap).length} of ${cats.length} mapped by hand; the rest by keyword`,
            '',
            'editExpenseMap',
            'Edit',
          ),
          sel(
            'arTermsDays',
            'Customer payment terms',
            ['0', '7', '14', '30', '45', '60'].map((d) =>
              d === '0' ? 'Due on sale' : `${d} days`,
            ),
            cfg.arTermsDays ? `${cfg.arTermsDays} days` : 'Due on sale',
            'Sales carry no due date of their own',
          ),
        ],
      },
      {
        id: 'fx',
        t: 'Exchange rates',
        d: needed.length
          ? `Needed for ${needed.join(', ')}. Rates are entered by hand — Noxtill has no rate feed.`
          : 'All branches and accounts use the base currency.',
        rows: [
          // Needed currencies first, then any other currency a rate was entered for (e.g. foreign bills).
          ...[
            ...needed,
            ...[...new Set(fx.map((x) => x.currency))].filter(
              (cur) => !needed.includes(cur),
            ),
          ].map((cur) => {
            const r = fx.find((x) => x.currency === cur);
            return stat(
              `${cur} → ${c.base}`,
              r ? `${num(r.rate)} from ${mdy(r.effectiveOn)}` : 'No rate yet',
              r ? '' : 'Postings in this currency wait for a rate',
            );
          }),
          stat('Add or update a rate', '', '', 'addRate', 'Add Rate'),
        ],
      },
      {
        id: 'closepol',
        t: 'Close policies',
        d: '',
        rows: [
          tog(
            'reqEvidence',
            'Require evidence on every checklist item',
            cfg.close.reqEvidence,
          ),
          tog(
            'lockAfter',
            'Lock period automatically after final approval',
            cfg.close.lockAfter,
          ),
          sel(
            'closeDay',
            'Target close day',
            ['3rd business day', '5th business day', '10th business day'],
            cfg.close.closeDay,
          ),
        ],
      },
    ];
    const th = cfg.thresholds;
    const grants = await this.prisma.finAccessGrant.findMany({
      where: { businessId: c.rootId },
      orderBy: { createdAt: 'desc' },
    });
    const people = grants.map((g) => {
      const br = (g.branches as string[]) ?? [];
      const s2 =
        g.status === 'Active' &&
        g.expiresOn.getTime() - Date.now() < 31 * 86_400_000
          ? 'Temporary'
          : g.status;
      const ch = chip(s2);
      return {
        id: g.id,
        n: g.name,
        f: g.firm ?? g.email,
        sc: `${c.entity} · ${br.length ? br.map((b) => this.branchName(c, b)).join(', ') : 'all branches'}`,
        p:
          {
            'Read only': 'Read · Export',
            Prepare: 'Read · Create Draft · Reconcile · Export',
            Approve: 'Read · Draft · Approve · Post',
          }[g.permission] ?? g.permission,
        e: `Expires ${mdy(g.expiresOn)}`,
        s: s2,
        bg: ch.bg,
        fg: ch.fg,
        canRevoke: ['Active', 'Invited'].includes(g.status) && c.actor.admin,
      };
    });
    const groupIds = c.branches.map((b) => b.id);
    const owners = await this.prisma.businessUser.findMany({
      where: {
        businessId: { in: groupIds },
        active: true,
        role: { in: ['owner', 'manager'] },
      },
      include: { user: { select: { name: true } } },
      distinct: ['userId'],
    });
    for (const o of owners) {
      if (grants.some((g) => g.userId === o.userId)) continue;
      const ch = chip('Active');
      people.push({
        id: o.id,
        n: o.user.name,
        f: 'Internal',
        sc: 'All branches',
        p:
          o.role === 'owner'
            ? 'Read · Draft · Approve · Post · Close Period'
            : 'Read · Draft · Approve · Post',
        e: 'No expiry',
        s: 'Active',
        bg: ch.bg,
        fg: ch.fg,
        canRevoke: false,
      });
    }
    return {
      settings: {
        version: s.version,
        sections,
        th: [
          [
            `Manual journal under ${this.m(c, th.journalDirect, 0)}`,
            'Preparer may post directly',
          ],
          [
            `Manual journal ${this.m(c, th.journalDirect, 0)} – ${this.m(c, th.journalOwner, 0)}`,
            'Finance Manager approval',
          ],
          [
            `Manual journal above ${this.m(c, th.journalOwner, 0)}`,
            'Owner / Controller approval',
          ],
          [
            `Vendor bill above ${this.m(c, th.billOwner, 0)}`,
            'Owner / Controller approval',
          ],
          ['Period reopen', 'Owner / Controller'],
          ['Control account change', 'Owner / Controller'],
        ].map(([a, b]) => ({ a, b })),
        sod: [
          tog(
            'sod1',
            'Preparer cannot approve or review their own journal',
            cfg.sod.sod1,
          ),
          tog(
            'sod2',
            `Bill creator cannot approve bills above ${this.m(c, th.billOwner, 0)}`,
            cfg.sod.sod2,
          ),
          tog(
            'sod3',
            'Reconciliation needs an independent approver',
            cfg.sod.sod3,
          ),
          tog(
            'sod4',
            'Close final approver must differ from the person who started it',
            cfg.sod.sod4,
          ),
        ],
        people,
        nav: [
          'Accounting profile',
          'Fiscal calendar & periods',
          'Posting controls',
          'Numbering & journal types',
          'Account dimensions',
          'Control accounts',
          'Tax & bank mapping',
          'Exchange rates',
          'Close policies',
          'Approval thresholds',
          'Accountant access',
          'Segregation of duties',
        ],
        expenseCategories: cats.map((x) => x.category),
        expenseMap: cfg.expenseMap,
        canEdit: c.actor.admin,
        isOwner: c.actor.role === 'Owner',
      },
    };
  }

  /** Accounts as statement-drill helper (shared with records). */
  natural = natural;
}
