import { HttpStatus, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { OrderStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LocaleService } from '../common/localization/locale.service';
import { AppException } from '../common/filters/app.exception';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { CommissionsService } from '../staff/commissions.service';
import { CreditService } from '../credit/credit.service';
import {
  ReportKind,
  REPORT_LABELS,
  monthBounds,
  monthLabel,
  previousMonth,
  round2,
} from './reports.types';
import type {
  ReportData,
  ReportKpi,
  ReportRow,
  ReportValidation,
} from './report-data.types';

export interface BusinessInfo {
  name: string;
  currency: string;
  locale: string;
  timezone: string;
  taxLabel: string;
  phone: string | null;
  address: string | null;
}

export interface BuildContext {
  /** The active (branch-aware) business — every query below is scoped to it explicitly. */
  businessId: string;
  month: string;
  business: BusinessInfo;
  role: Role;
  businessUserId?: string;
}

interface OrderFigures {
  orders: number;
  total: number;
  subtotal: number;
  discount: number;
  tax: number;
  cogs: number;
}

const MAX_TABLE_ROWS = 500;

/**
 * Computes every report as structured data (see `report-data.types.ts`). Every query here carries
 * an explicit `businessId` and uses the raw `PrismaService`: a scheduled run happens in a
 * background job with no request-bound tenant, and the tenant-scoping extension deliberately
 * leaves queries unscoped in that situation — relying on it would aggregate every business's
 * orders into one business's report. The two collaborating services that still read the tenant
 * from context (commissions, credit recovery) are called inside `withTenant()`.
 */
@Injectable()
export class ReportBuildersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locale: LocaleService,
    private readonly cls: ClsService,
    private readonly commissions: CommissionsService,
    private readonly credit: CreditService,
  ) {}

  /** Runs `fn` with the tenant bound in CLS, whether or not a request already did. */
  private withTenant<T>(businessId: string, fn: () => Promise<T>): Promise<T> {
    return this.cls.run(async () => {
      this.cls.set(CLS_KEY_BUSINESS_ID, businessId);
      return fn();
    });
  }

  async build(kind: ReportKind, ctx: BuildContext): Promise<ReportData> {
    switch (kind) {
      case 'monthly':
        return this.buildMonthly(ctx);
      case 'pnl':
        return this.buildPnl(ctx);
      case 'sales':
        return this.buildSales(ctx);
      case 'product_performance':
        return this.buildProductPerformance(ctx);
      case 'staff':
        return this.buildStaff(ctx);
      case 'reviews':
        return this.buildReviews(ctx);
      case 'inventory':
        return this.buildInventory(ctx);
      case 'credit_recovery':
        return this.buildCreditRecovery(ctx);
      case 'tax':
        return this.buildTax(ctx);
      case 'marketing':
        return this.buildMarketing(ctx);
    }
  }

  // ---------------------------------------------------------------- shared helpers

  private money(value: number, ctx: BuildContext): string {
    return this.locale.formatCurrency(value, ctx.business);
  }

  private signedMoney(value: number, ctx: BuildContext): string {
    return `${value < 0 ? '− ' : ''}${this.money(Math.abs(value), ctx)}`;
  }

  private pctText(value: number): string {
    return `${round2(value).toFixed(1)}%`;
  }

  /** A real change-vs-previous-period label, or nothing when there is no previous figure to compare to. */
  private delta(
    current: number,
    previous: number | undefined,
    upIsGood = true,
  ): Pick<ReportKpi, 'delta' | 'deltaDir' | 'upIsGood'> {
    if (previous === undefined || previous === null) return {};
    if (previous === 0) {
      return current === 0
        ? { delta: 'no change', deltaDir: 'flat', upIsGood }
        : {};
    }
    const change = ((current - previous) / Math.abs(previous)) * 100;
    if (Math.abs(change) < 0.05) {
      return { delta: 'no change', deltaDir: 'flat', upIsGood };
    }
    return {
      delta: `${change > 0 ? '+' : '−'}${Math.abs(change).toFixed(1)}% vs previous`,
      deltaDir: change > 0 ? 'up' : 'down',
      upIsGood,
    };
  }

  private async orderFigures(
    businessId: string,
    start: Date,
    end: Date,
    staffUserId?: string,
  ): Promise<OrderFigures> {
    const agg = await this.prisma.order.aggregate({
      where: {
        businessId,
        status: OrderStatus.completed,
        isQuotation: false,
        createdAt: { gte: start, lt: end },
        ...(staffUserId ? { staffUserId } : {}),
      },
      _sum: { total: true, subtotal: true, discount: true, tax: true, cogs: true },
      _count: true,
    });
    return {
      orders: agg._count,
      total: round2(Number(agg._sum.total ?? 0)),
      subtotal: round2(Number(agg._sum.subtotal ?? 0)),
      discount: round2(Number(agg._sum.discount ?? 0)),
      tax: round2(Number(agg._sum.tax ?? 0)),
      cogs: round2(Number(agg._sum.cogs ?? 0)),
    };
  }

  private async expensesTotal(
    businessId: string,
    start: Date,
    end: Date,
  ): Promise<number> {
    const agg = await this.prisma.expense.aggregate({
      where: { businessId, incurredOn: { gte: start, lt: end } },
      _sum: { amount: true },
    });
    return round2(Number(agg._sum.amount ?? 0));
  }

  /** Revenue split into the month's calendar weeks (days 1-7 = W1, 8-14 = W2 ...). */
  private async weeklyRevenue(
    businessId: string,
    start: Date,
    end: Date,
  ): Promise<{ label: string; value: number }[]> {
    const rows = await this.prisma.$queryRaw<
      { wk: bigint; total: string }[]
    >`
      SELECT FLOOR((DAY(created_at) - 1) / 7) + 1 AS wk, SUM(total) AS total
      FROM orders
      WHERE business_id = ${businessId} AND status = 'completed' AND is_quotation = false
        AND created_at >= ${start} AND created_at < ${end}
      GROUP BY wk
      ORDER BY wk
    `;
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    const weeks = Math.ceil(days / 7);
    const byWeek = new Map(rows.map((r) => [Number(r.wk), Number(r.total)]));
    return Array.from({ length: weeks }, (_, i) => ({
      label: `W${i + 1}`,
      value: round2(byWeek.get(i + 1) ?? 0),
    }));
  }

  /**
   * Real cross-checks between two independently stored views of the same money: an order's header
   * (`subtotal`, `discount`, `tax`, `total`) and its line items. Every order is written by
   * `computeOrderTotals`, so `total = subtotal − discount + tax` (tax already inside the prices on
   * tax-inclusive orders, so nothing is added there), `subtotal = Σ line price × qty`
   * and `cogs = Σ line cost × qty` must hold; a difference means a real inconsistency, which is
   * reported with the number of affected orders instead of being silently corrected.
   */
  private async reconcileOrders(
    ctx: BuildContext,
    start: Date,
    end: Date,
    figures: OrderFigures,
  ): Promise<ReportValidation> {
    const [lines, header, badRows, noCost] = await Promise.all([
      this.prisma.$queryRaw<{ subtotal: string; cogs: string; n: bigint }[]>`
        SELECT COALESCE(SUM(oi.price * oi.qty), 0) AS subtotal,
               COALESCE(SUM(oi.cost * oi.qty), 0) AS cogs, COUNT(*) AS n
        FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.business_id = ${ctx.businessId} AND o.status = 'completed' AND o.is_quotation = false
          AND o.created_at >= ${start} AND o.created_at < ${end}
      `,
      this.prisma.$queryRaw<{ recomputed: string }[]>`
        SELECT COALESCE(SUM(subtotal - discount + IF(tax_inclusive, 0, tax)), 0) AS recomputed
        FROM orders
        WHERE business_id = ${ctx.businessId} AND status = 'completed' AND is_quotation = false
          AND created_at >= ${start} AND created_at < ${end}
      `,
      this.prisma.$queryRaw<{ bad: bigint }[]>`
        SELECT COUNT(*) AS bad FROM orders
        WHERE business_id = ${ctx.businessId} AND status = 'completed' AND is_quotation = false
          AND created_at >= ${start} AND created_at < ${end}
          AND ABS(subtotal - discount + IF(tax_inclusive, 0, tax) - total) > 0.01
      `,
      this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(DISTINCT oi.product_id) AS n
        FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.business_id = ${ctx.businessId} AND o.status = 'completed' AND o.is_quotation = false
          AND o.created_at >= ${start} AND o.created_at < ${end}
          AND oi.cost = 0 AND oi.product_id IS NOT NULL
      `,
    ]);

    const lineSubtotal = round2(Number(lines[0]?.subtotal ?? 0));
    const lineCogs = round2(Number(lines[0]?.cogs ?? 0));
    const recomputedTotal = round2(Number(header[0]?.recomputed ?? 0));
    const badOrders = Number(badRows[0]?.bad ?? 0);
    const productsNoCost = Number(noCost[0]?.n ?? 0);

    const totalDiff = round2(figures.total - recomputedTotal);
    const subtotalDiff = round2(figures.subtotal - lineSubtotal);
    const cogsDiff = round2(figures.cogs - lineCogs);
    const consistent =
      Math.abs(totalDiff) <= 0.01 &&
      Math.abs(subtotalDiff) <= 0.01 &&
      Math.abs(cogsDiff) <= 0.01 &&
      badOrders === 0;

    const exclusions: string[] = [];
    if (productsNoCost > 0) {
      exclusions.push(
        `${productsNoCost} product${productsNoCost === 1 ? '' : 's'} sold with no cost recorded — counted as zero cost, so gross profit is overstated for them`,
      );
    }

    const checks: ReportRow[] = [
      {
        label: 'Report total (Σ order totals)',
        value: this.money(figures.total, ctx),
      },
      {
        label: 'Recomputed (Σ subtotal − discount, plus tax on tax-exclusive orders)',
        value: this.money(recomputedTotal, ctx),
      },
      {
        label: 'Difference',
        value:
          Math.abs(totalDiff) <= 0.01
            ? `${this.money(0, ctx)} · reconciled`
            : this.signedMoney(totalDiff, ctx),
        tone: Math.abs(totalDiff) <= 0.01 ? 'pos' : 'neg',
      },
      {
        label: 'Order subtotals vs their line items',
        value:
          Math.abs(subtotalDiff) <= 0.01
            ? 'Match'
            : `Differ by ${this.signedMoney(subtotalDiff, ctx)}`,
        tone: Math.abs(subtotalDiff) <= 0.01 ? 'pos' : 'neg',
      },
      {
        label: 'Order cost vs line item costs',
        value:
          Math.abs(cogsDiff) <= 0.01
            ? 'Match'
            : `Differ by ${this.signedMoney(cogsDiff, ctx)}`,
        tone: Math.abs(cogsDiff) <= 0.01 ? 'pos' : 'neg',
      },
      {
        label: 'Orders whose total does not match their subtotal, discount and tax',
        value: String(badOrders),
        tone: badOrders === 0 ? 'pos' : 'neg',
      },
      {
        label: 'Excluded records',
        value: exclusions.length ? exclusions.join('; ') : 'None',
        tone: exclusions.length ? 'neg' : 'pos',
      },
    ];

    return {
      status: !consistent ? 'critical' : exclusions.length ? 'warning' : 'reconciled',
      checks,
      exclusions,
      reportTotal: this.money(figures.total, ctx),
      sourceTotal: this.money(recomputedTotal, ctx),
      difference: this.signedMoney(totalDiff, ctx),
    };
  }

  private baseConfig(ctx: BuildContext, extra: ReportRow[] = []): ReportRow[] {
    return [
      { label: 'Period', value: monthLabel(ctx.month) },
      { label: 'Timezone', value: ctx.business.timezone },
      { label: 'Branch scope', value: ctx.business.name },
      { label: 'Currency', value: ctx.business.currency },
      ...extra,
    ];
  }

  private percentChange(current: number, previous: number): string {
    if (previous === 0) return current === 0 ? '0.0%' : 'n/a';
    const c = ((current - previous) / Math.abs(previous)) * 100;
    return `${c >= 0 ? '+' : '−'}${Math.abs(c).toFixed(1)}%`;
  }

  // ---------------------------------------------------------------- monthly

  private async buildMonthly(ctx: BuildContext): Promise<ReportData> {
    const { start, end } = monthBounds(ctx.month);
    const prev = monthBounds(previousMonth(ctx.month));

    const [cur, prevFig, expenses, prevExpenses, bars, reviews, newCustomers, owed] =
      await Promise.all([
        this.orderFigures(ctx.businessId, start, end),
        this.orderFigures(ctx.businessId, prev.start, prev.end),
        this.expensesTotal(ctx.businessId, start, end),
        this.expensesTotal(ctx.businessId, prev.start, prev.end),
        this.weeklyRevenue(ctx.businessId, start, end),
        this.prisma.externalReview.aggregate({
          where: { businessId: ctx.businessId, createdAt: { gte: start, lt: end } },
          _avg: { stars: true },
          _count: true,
        }),
        this.prisma.customer.count({
          where: { businessId: ctx.businessId, createdAt: { gte: start, lt: end } },
        }),
        this.prisma.$queryRaw<{ total: string | null }[]>`
          SELECT SUM(balance) AS total FROM v_credit_balances
          WHERE business_id = ${ctx.businessId} AND balance > 0
        `,
      ]);

    const gross = round2(cur.total - cur.cogs);
    const prevGross = round2(prevFig.total - prevFig.cogs);
    const net = round2(gross - expenses);
    const prevNet = round2(prevGross - prevExpenses);
    const aov = cur.orders > 0 ? round2(cur.total / cur.orders) : 0;
    const outstanding = round2(Number(owed[0]?.total ?? 0));
    const avgRating = reviews._avg.stars ? round2(Number(reviews._avg.stars)) : null;
    const validation = await this.reconcileOrders(ctx, start, end, cur);

    const summary =
      cur.orders === 0
        ? `No completed orders were recorded in ${monthLabel(ctx.month)}.`
        : `Revenue was ${this.money(cur.total, ctx)} from ${cur.orders} completed orders (${this.percentChange(cur.total, prevFig.total)} vs the previous month), with gross profit of ${this.money(gross, ctx)} and net profit of ${this.money(net, ctx)} after ${this.money(expenses, ctx)} of recorded expenses. ${outstanding > 0 ? `${this.money(outstanding, ctx)} is currently outstanding on credit and is not counted as cash collected.` : 'No customer credit is currently outstanding.'}`;

    return {
      kind: 'monthly',
      title: REPORT_LABELS.monthly,
      period: ctx.month,
      periodLabel: monthLabel(ctx.month),
      currency: ctx.business.currency,
      summary,
      kpis: [
        { label: 'Revenue', display: this.money(cur.total, ctx), ...this.delta(cur.total, prevFig.total) },
        { label: 'Gross profit', display: this.money(gross, ctx), ...this.delta(gross, prevGross) },
        { label: 'Net profit', display: this.money(net, ctx), ...this.delta(net, prevNet) },
        { label: 'Orders', display: String(cur.orders), ...this.delta(cur.orders, prevFig.orders) },
      ],
      bars: { title: 'Revenue by week', bars: bars },
      metrics: {
        revenue: cur.total, cogs: cur.cogs, grossProfit: gross, expenses,
        netProfit: net, orders: cur.orders, averageOrderValue: aov,
        outstandingCredit: outstanding, newCustomers,
        reviews: reviews._count, discounts: cur.discount,
      },
      metricRows: [
        { label: 'Revenue', value: this.money(cur.total, ctx), tone: 'pos' },
        { label: 'Cost of goods', value: `− ${this.money(cur.cogs, ctx)}`, tone: 'neg' },
        { label: 'Gross profit', value: this.money(gross, ctx), tone: 'pos' },
        { label: 'Operating expenses', value: `− ${this.money(expenses, ctx)}`, tone: 'neg' },
        { label: 'Net profit', value: this.money(net, ctx), tone: net >= 0 ? 'pos' : 'neg' },
        { label: 'Gross margin', value: cur.total > 0 ? this.pctText((gross / cur.total) * 100) : 'n/a' },
        { label: 'Net margin', value: cur.total > 0 ? this.pctText((net / cur.total) * 100) : 'n/a' },
        { label: 'Orders', value: String(cur.orders) },
        { label: 'Average order value', value: this.money(aov, ctx) },
        { label: 'Discounts given', value: this.money(cur.discount, ctx) },
        { label: 'New customers', value: String(newCustomers) },
        { label: 'Average rating', value: avgRating === null ? 'No reviews' : `${avgRating} (${reviews._count})` },
        { label: 'Outstanding credit', value: this.money(outstanding, ctx), tone: outstanding > 0 ? 'neg' : 'neutral' },
      ],
      configuration: this.baseConfig(ctx, [
        { label: 'Metrics', value: 'Revenue, cost of goods, gross and net profit, expenses, orders, credit, reviews' },
        { label: 'Filters', value: 'Completed, non-quotation orders only' },
        { label: 'Comparison', value: 'Previous calendar month' },
      ]),
      lineage: this.revenueLineage(ctx, cur),
      footnotes: this.revenueFootnotes(ctx, outstanding),
      sources: [
        { module: 'Fast Sale & Orders', records: cur.orders },
        { module: 'Expenses', records: await this.prisma.expense.count({ where: { businessId: ctx.businessId, incurredOn: { gte: start, lt: end } } }) },
        { module: 'Customers', records: newCustomers },
        { module: 'Reviews', records: reviews._count },
      ],
      recordsCount: cur.orders,
      validation,
      formats: ['PDF'],
    };
  }

  private revenueLineage(ctx: BuildContext, cur: OrderFigures): ReportRow[] {
    return [
      { label: 'Figure', value: `Revenue ${this.money(cur.total, ctx)}` },
      { label: 'Source', value: 'Sales transactions · Fast Sale and Orders', link: true },
      { label: 'Filter', value: `${monthLabel(ctx.month)} · ${ctx.business.name}`, link: true },
      { label: 'Included', value: 'Completed, non-quotation orders', link: true },
      { label: 'Excluded', value: 'Drafts, pending, cancelled and quotations', link: true },
      { label: 'Calculation', value: 'Sum of order totals (subtotal − discount, plus tax unless the prices already include it)' },
      { label: 'Discounts inside that total', value: this.money(cur.discount, ctx) },
      { label: 'Result', value: this.money(cur.total, ctx), tone: 'pos' },
    ];
  }

  private revenueFootnotes(ctx: BuildContext, outstanding: number): string[] {
    return [
      `Period ${monthLabel(ctx.month)}, ${ctx.business.timezone}. Comparison period is the previous calendar month.`,
      'Revenue is the sum of completed order totals (after discounts, including tax) and is recognised at the sale, not on collection. Approved returns are shown separately, not netted off.',
      outstanding > 0
        ? `${this.money(outstanding, ctx)} of customer credit is outstanding and is never counted as cash collected.`
        : 'No customer credit is outstanding.',
      'Gross profit uses the cost recorded against each item at the time of sale, so a later cost change does not alter past profit.',
      'All figures are actual. This report contains no forecast, estimate or simulated value.',
    ];
  }

  // ---------------------------------------------------------------- profit & loss

  private async buildPnl(ctx: BuildContext): Promise<ReportData> {
    const { start, end } = monthBounds(ctx.month);
    const prev = monthBounds(previousMonth(ctx.month));

    const [cur, prevFig, byCategory, prevExpenses, bars] = await Promise.all([
      this.orderFigures(ctx.businessId, start, end),
      this.orderFigures(ctx.businessId, prev.start, prev.end),
      this.prisma.expense.groupBy({
        by: ['category'],
        where: { businessId: ctx.businessId, incurredOn: { gte: start, lt: end } },
        _sum: { amount: true },
        _count: true,
        orderBy: { _sum: { amount: 'desc' } },
      }),
      this.expensesTotal(ctx.businessId, prev.start, prev.end),
      this.weeklyRevenue(ctx.businessId, start, end),
    ]);

    const expenses = round2(byCategory.reduce((s, r) => s + Number(r._sum.amount ?? 0), 0));
    const expenseCount = byCategory.reduce((s, r) => s + r._count, 0);
    const gross = round2(cur.total - cur.cogs);
    const net = round2(gross - expenses);
    const prevGross = round2(prevFig.total - prevFig.cogs);
    const prevNet = round2(prevGross - prevExpenses);
    const grossMargin = cur.total > 0 ? (gross / cur.total) * 100 : 0;
    const netMargin = cur.total > 0 ? (net / cur.total) * 100 : 0;
    const prevGrossMargin = prevFig.total > 0 ? (prevGross / prevFig.total) * 100 : 0;
    const validation = await this.reconcileOrders(ctx, start, end, cur);

    // Expense rows must add up to the expense total shown on the P&L — a real check.
    const expenseTotalDirect = await this.expensesTotal(ctx.businessId, start, end);
    const expenseDiff = round2(expenses - expenseTotalDirect);
    validation.checks.push({
      label: 'Expense categories vs total expenses',
      value: Math.abs(expenseDiff) <= 0.01 ? 'Match' : `Differ by ${this.signedMoney(expenseDiff, ctx)}`,
      tone: Math.abs(expenseDiff) <= 0.01 ? 'pos' : 'neg',
    });
    if (Math.abs(expenseDiff) > 0.01) validation.status = 'critical';

    const summary =
      cur.orders === 0 && expenses === 0
        ? `Nothing was recorded in ${monthLabel(ctx.month)}: no completed orders and no expenses.`
        : `Net profit was ${this.money(net, ctx)} at a ${this.pctText(netMargin)} margin on revenue of ${this.money(cur.total, ctx)}. Gross margin was ${this.pctText(grossMargin)} (${round2(grossMargin - prevGrossMargin) >= 0 ? 'up' : 'down'} ${Math.abs(round2(grossMargin - prevGrossMargin)).toFixed(1)} points on the previous month). Expenses were ${this.money(expenses, ctx)} across ${expenseCount} entries.`;

    return {
      kind: 'pnl',
      title: REPORT_LABELS.pnl,
      period: ctx.month,
      periodLabel: monthLabel(ctx.month),
      currency: ctx.business.currency,
      summary,
      kpis: [
        { label: 'Revenue', display: this.money(cur.total, ctx), ...this.delta(cur.total, prevFig.total) },
        { label: 'Gross profit', display: this.money(gross, ctx), ...this.delta(gross, prevGross) },
        { label: 'Net profit', display: this.money(net, ctx), ...this.delta(net, prevNet) },
        { label: 'Net margin', display: this.pctText(netMargin) },
      ],
      bars: { title: 'Revenue by week', bars },
      table: {
        title: 'Operating expenses by category',
        columns: [
          { key: 'category', label: 'Category', align: 'left' },
          { key: 'entries', label: 'Entries', align: 'right' },
          { key: 'amount', label: 'Amount', align: 'right' },
          { key: 'share', label: 'Share', align: 'right' },
        ],
        rows: byCategory.map((r) => {
          const amount = Number(r._sum.amount ?? 0);
          return {
            category: r.category,
            entries: String(r._count),
            amount: this.money(amount, ctx),
            share: expenses > 0 ? this.pctText((amount / expenses) * 100) : '—',
          };
        }),
        emptyText: 'No expenses were recorded in this period.',
      },
      metrics: {
        revenue: cur.total, cogs: cur.cogs, grossProfit: gross, expenses, netProfit: net,
        grossMargin: round2(grossMargin), netMargin: round2(netMargin), orders: cur.orders,
      },
      metricRows: [
        { label: 'Revenue', value: this.money(cur.total, ctx), tone: 'pos' },
        { label: 'Cost of goods', value: `− ${this.money(cur.cogs, ctx)}`, tone: 'neg' },
        { label: 'Gross profit', value: this.money(gross, ctx), tone: 'pos' },
        { label: 'Operating expenses', value: `− ${this.money(expenses, ctx)}`, tone: 'neg' },
        { label: 'Net profit', value: this.money(net, ctx), tone: net >= 0 ? 'pos' : 'neg' },
        { label: 'Gross margin', value: this.pctText(grossMargin) },
        { label: 'Net margin', value: this.pctText(netMargin) },
      ],
      configuration: this.baseConfig(ctx, [
        { label: 'Metrics', value: 'Revenue, cost of goods, gross profit, expenses, net profit, margin' },
        { label: 'Grouping', value: 'Expenses by category' },
        { label: 'Comparison', value: 'Previous calendar month' },
      ]),
      lineage: this.revenueLineage(ctx, cur),
      footnotes: [
        ...this.revenueFootnotes(ctx, 0).filter((f) => !f.startsWith('No customer credit') && !f.includes('customer credit is outstanding')),
        'Operating expenses are the expenses recorded with an incurred date inside the period.',
      ],
      sources: [
        { module: 'Fast Sale & Orders', records: cur.orders },
        { module: 'Expenses', records: expenseCount },
      ],
      recordsCount: cur.orders + expenseCount,
      validation,
      formats: ['PDF'],
    };
  }

  // ---------------------------------------------------------------- sales

  private async buildSales(ctx: BuildContext): Promise<ReportData> {
    const { start, end } = monthBounds(ctx.month);
    const prev = monthBounds(previousMonth(ctx.month));
    const ownOnly = ctx.role === Role.staff ? ctx.businessUserId : undefined;
    if (ctx.role === Role.staff && !ownOnly) {
      throw new AppException('REPORT_FORBIDDEN', 'Your staff profile could not be found for this business.', HttpStatus.FORBIDDEN);
    }

    const [cur, prevFig, orders, bars] = await Promise.all([
      this.orderFigures(ctx.businessId, start, end, ownOnly),
      this.orderFigures(ctx.businessId, prev.start, prev.end, ownOnly),
      this.prisma.order.findMany({
        where: {
          businessId: ctx.businessId, status: OrderStatus.completed, isQuotation: false,
          createdAt: { gte: start, lt: end }, ...(ownOnly ? { staffUserId: ownOnly } : {}),
        },
        include: { customer: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
        take: MAX_TABLE_ROWS,
      }),
      this.weeklyRevenue(ctx.businessId, start, end),
    ]);

    const aov = cur.orders > 0 ? round2(cur.total / cur.orders) : 0;
    const validation = await this.reconcileOrders(ctx, start, end, cur);
    const truncated = cur.orders > MAX_TABLE_ROWS;

    return {
      kind: 'sales',
      title: REPORT_LABELS.sales,
      period: ctx.month,
      periodLabel: monthLabel(ctx.month),
      currency: ctx.business.currency,
      summary:
        cur.orders === 0
          ? `No completed orders were recorded in ${monthLabel(ctx.month)}${ownOnly ? ' for your account' : ''}.`
          : `${cur.orders} completed orders produced ${this.money(cur.total, ctx)} (${this.percentChange(cur.total, prevFig.total)} vs the previous month), an average of ${this.money(aov, ctx)} per order, with ${this.money(cur.discount, ctx)} given in discounts.${ownOnly ? ' This report covers only the orders you rang up.' : ''}`,
      kpis: [
        { label: 'Orders', display: String(cur.orders), ...this.delta(cur.orders, prevFig.orders) },
        { label: 'Revenue', display: this.money(cur.total, ctx), ...this.delta(cur.total, prevFig.total) },
        { label: 'Average order value', display: this.money(aov, ctx), ...this.delta(aov, prevFig.orders > 0 ? prevFig.total / prevFig.orders : undefined) },
        { label: 'Discounts given', display: this.money(cur.discount, ctx), ...this.delta(cur.discount, prevFig.discount, false) },
      ],
      bars: { title: 'Revenue by week', bars },
      table: {
        title: truncated ? `Orders (first ${MAX_TABLE_ROWS} of ${cur.orders})` : 'Orders',
        columns: [
          { key: 'order', label: 'Order', align: 'left' },
          { key: 'date', label: 'Date', align: 'left' },
          { key: 'customer', label: 'Customer', align: 'left' },
          { key: 'total', label: 'Total', align: 'right' },
        ],
        rows: orders.map((o) => ({
          order: `#${o.orderNo}`,
          date: this.locale.formatDate(o.createdAt, ctx.business),
          customer: o.customer?.name ?? 'Walk-in',
          total: this.money(Number(o.total), ctx),
        })),
        emptyText: 'No orders in this period.',
      },
      metrics: { revenue: cur.total, orders: cur.orders, averageOrderValue: aov, discounts: cur.discount, tax: cur.tax },
      metricRows: [
        { label: 'Orders', value: String(cur.orders) },
        { label: 'Revenue', value: this.money(cur.total, ctx), tone: 'pos' },
        { label: 'Average order value', value: this.money(aov, ctx) },
        { label: 'Discounts given', value: this.money(cur.discount, ctx) },
        { label: 'Tax included in revenue', value: this.money(cur.tax, ctx) },
      ],
      configuration: this.baseConfig(ctx, [
        { label: 'Filters', value: ownOnly ? 'Completed orders rung up by you' : 'Completed, non-quotation orders' },
        { label: 'Sorting', value: 'Oldest first' },
        { label: 'Comparison', value: 'Previous calendar month' },
      ]),
      lineage: this.revenueLineage(ctx, cur),
      footnotes: [
        ...this.revenueFootnotes(ctx, 0).filter((f) => !f.includes('credit')),
        ...(truncated ? [`The table lists the first ${MAX_TABLE_ROWS} orders; the totals above include all ${cur.orders}.`] : []),
      ],
      sources: [{ module: 'Fast Sale & Orders', records: cur.orders }],
      recordsCount: cur.orders,
      validation,
      formats: ['PDF'],
    };
  }

  // ---------------------------------------------------------------- product performance

  private async buildProductPerformance(ctx: BuildContext): Promise<ReportData> {
    const { start, end } = monthBounds(ctx.month);
    const rows = await this.prisma.$queryRaw<
      { product_id: string | null; name: string; units: bigint; revenue: string; cost: string }[]
    >`
      SELECT oi.product_id, oi.name, SUM(oi.qty) AS units,
             SUM(oi.price * oi.qty) AS revenue, SUM(oi.cost * oi.qty) AS cost
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.business_id = ${ctx.businessId} AND o.status = 'completed' AND o.is_quotation = false
        AND o.created_at >= ${start} AND o.created_at < ${end}
      GROUP BY oi.product_id, oi.name
      ORDER BY (SUM(oi.price * oi.qty) - SUM(oi.cost * oi.qty)) DESC
    `;
    const cur = await this.orderFigures(ctx.businessId, start, end);

    const products = rows.map((r) => {
      const revenue = Number(r.revenue);
      const cost = Number(r.cost);
      return { name: r.name, units: Number(r.units), revenue, cost, profit: round2(revenue - cost), noCost: cost === 0 };
    });
    const top = products.slice(0, 20);
    const totalRevenue = round2(products.reduce((s, p) => s + p.revenue, 0));
    const totalProfit = round2(products.reduce((s, p) => s + p.profit, 0));
    const noCost = products.filter((p) => p.noCost);
    const validation = await this.reconcileOrders(ctx, start, end, cur);
    // Independent check: Σ per-product line revenue must equal Σ order subtotals.
    const subDiff = round2(cur.subtotal - totalRevenue);
    validation.checks.push({
      label: 'Product revenue vs order subtotals',
      value: Math.abs(subDiff) <= 0.01 ? 'Match' : `Differ by ${this.signedMoney(subDiff, ctx)}`,
      tone: Math.abs(subDiff) <= 0.01 ? 'pos' : 'neg',
    });
    if (Math.abs(subDiff) > 0.01) validation.status = 'critical';

    const best = top[0];
    return {
      kind: 'product_performance',
      title: REPORT_LABELS.product_performance,
      period: ctx.month,
      periodLabel: monthLabel(ctx.month),
      currency: ctx.business.currency,
      summary:
        products.length === 0
          ? `No products were sold in ${monthLabel(ctx.month)}.`
          : `${products.length} products sold, producing ${this.money(totalRevenue, ctx)} of line revenue and ${this.money(totalProfit, ctx)} of gross profit. ${best.name} led on gross profit with ${this.money(best.profit, ctx)}. ${noCost.length > 0 ? `${noCost.length} product${noCost.length === 1 ? ' has' : 's have'} no cost recorded, so ${noCost.length === 1 ? 'its' : 'their'} margin is not shown.` : 'Every product sold has a cost recorded.'}`,
      kpis: [
        { label: 'Products sold', display: String(products.length) },
        { label: 'Line revenue', display: this.money(totalRevenue, ctx) },
        { label: 'Gross profit', display: this.money(totalProfit, ctx) },
        { label: 'Top product', display: best ? best.name : '—' },
      ],
      table: {
        title: 'Top products by gross profit',
        columns: [
          { key: 'name', label: 'Product', align: 'left' },
          { key: 'units', label: 'Units', align: 'right' },
          { key: 'revenue', label: 'Revenue', align: 'right' },
          { key: 'profit', label: 'Gross profit', align: 'right' },
          { key: 'margin', label: 'Margin', align: 'right' },
        ],
        rows: top.map((p) => ({
          name: p.name,
          units: String(p.units),
          revenue: this.money(p.revenue, ctx),
          profit: p.noCost ? '—' : this.money(p.profit, ctx),
          margin: p.noCost || p.revenue === 0 ? '—' : this.pctText((p.profit / p.revenue) * 100),
        })),
        emptyText: 'No products were sold in this period.',
      },
      metrics: { productsSold: products.length, revenue: totalRevenue, grossProfit: totalProfit, productsWithoutCost: noCost.length },
      metricRows: [
        { label: 'Products sold', value: String(products.length) },
        { label: 'Line revenue', value: this.money(totalRevenue, ctx), tone: 'pos' },
        { label: 'Line cost', value: `− ${this.money(round2(totalRevenue - totalProfit), ctx)}`, tone: 'neg' },
        { label: 'Gross profit', value: this.money(totalProfit, ctx), tone: 'pos' },
        { label: 'Products with no cost recorded', value: String(noCost.length), tone: noCost.length ? 'neg' : 'pos' },
      ],
      configuration: this.baseConfig(ctx, [
        { label: 'Grouping', value: 'By product' },
        { label: 'Sorting', value: 'Gross profit, descending' },
        { label: 'Limit', value: 'Top 20' },
      ]),
      lineage: [
        { label: 'Figure', value: `Gross profit ${this.money(totalProfit, ctx)}` },
        { label: 'Source', value: 'Order lines · Fast Sale and Orders', link: true },
        { label: 'Filter', value: `${monthLabel(ctx.month)} · ${ctx.business.name}`, link: true },
        { label: 'Calculation', value: 'Σ (price − cost recorded at sale) × quantity, per product' },
        { label: 'Result', value: this.money(totalProfit, ctx), tone: 'pos' },
      ],
      footnotes: [
        `Period ${monthLabel(ctx.month)}, ${ctx.business.timezone}.`,
        'Line revenue is before order-level discounts and tax, so it differs from the revenue shown in the Sales report.',
        'Gross profit uses the cost recorded against each item at the time of sale.',
        'A product with no cost recorded shows no margin rather than a 100% margin.',
        'All figures are actual. This report contains no forecast, estimate or simulated value.',
      ],
      sources: [{ module: 'Fast Sale & Orders', records: cur.orders }, { module: 'Products', records: products.length }],
      recordsCount: cur.orders,
      validation,
      formats: ['PDF'],
    };
  }

  // ---------------------------------------------------------------- staff

  private async buildStaff(ctx: BuildContext): Promise<ReportData> {
    if (ctx.role === Role.staff) {
      throw new AppException('REPORT_FORBIDDEN', 'Staff performance reports are only available to owners and managers.', HttpStatus.FORBIDDEN);
    }
    const { start, end } = monthBounds(ctx.month);
    const [report, cur] = await Promise.all([
      this.withTenant(ctx.businessId, () => this.commissions.report(ctx.month)),
      this.orderFigures(ctx.businessId, start, end),
    ]);

    const attributed = round2(report.reduce((s, r) => s + r.totalSales, 0));
    const commission = round2(report.reduce((s, r) => s + r.commission, 0));
    const unattributed = round2(cur.total - attributed);
    const diffOk = unattributed >= -0.01;

    return {
      kind: 'staff',
      title: REPORT_LABELS.staff,
      period: ctx.month,
      periodLabel: monthLabel(ctx.month),
      currency: ctx.business.currency,
      summary:
        report.length === 0
          ? 'No staff or manager accounts exist for this business.'
          : `${report.length} team members rang up ${this.money(attributed, ctx)} of ${this.money(cur.total, ctx)} total revenue; ${this.money(Math.max(unattributed, 0), ctx)} was not attributed to anyone. Commission owed for the month is ${this.money(commission, ctx)}. Each person's figures are shown side by side — no single ranking is produced.`,
      kpis: [
        { label: 'Team members', display: String(report.length) },
        { label: 'Sales attributed', display: this.money(attributed, ctx) },
        { label: 'Commission owed', display: this.money(commission, ctx) },
        { label: 'Not attributed', display: this.money(Math.max(unattributed, 0), ctx) },
      ],
      table: {
        title: 'Sales and commission per team member',
        columns: [
          { key: 'name', label: 'Name', align: 'left' },
          { key: 'role', label: 'Role', align: 'left' },
          { key: 'rule', label: 'Commission rule', align: 'left' },
          { key: 'sales', label: 'Sales', align: 'right' },
          { key: 'commission', label: 'Commission', align: 'right' },
          { key: 'paid', label: 'Paid', align: 'center' },
        ],
        rows: report.map((r) => ({
          name: r.name, role: r.role, rule: r.ruleLabel,
          sales: this.money(r.totalSales, ctx), commission: this.money(r.commission, ctx),
          paid: r.paid ? 'Yes' : 'No',
        })),
        emptyText: 'No staff found.',
      },
      metrics: { teamMembers: report.length, salesAttributed: attributed, commission, unattributed: Math.max(unattributed, 0), revenue: cur.total },
      metricRows: [
        { label: 'Team members', value: String(report.length) },
        { label: 'Sales attributed to staff', value: this.money(attributed, ctx), tone: 'pos' },
        { label: 'Sales not attributed', value: this.money(Math.max(unattributed, 0), ctx) },
        { label: 'Total revenue', value: this.money(cur.total, ctx) },
        { label: 'Commission owed', value: this.money(commission, ctx) },
      ],
      configuration: this.baseConfig(ctx, [
        { label: 'Grouping', value: 'By team member (managers and staff)' },
        { label: 'Commission', value: "Each person's own rule" },
      ]),
      lineage: [
        { label: 'Figure', value: `Sales attributed ${this.money(attributed, ctx)}` },
        { label: 'Source', value: 'Orders by the staff member who rang them up', link: true },
        { label: 'Filter', value: `${monthLabel(ctx.month)} · ${ctx.business.name}`, link: true },
        { label: 'Calculation', value: 'Σ order totals per staff member; commission by their rule' },
        { label: 'Result', value: this.money(attributed, ctx), tone: 'pos' },
      ],
      footnotes: [
        `Period ${monthLabel(ctx.month)}, ${ctx.business.timezone}.`,
        'Owner sales are not attributed to a commissioned team member, which is why attributed sales can be lower than total revenue.',
        'Hours worked, service mix and walk-in share differ between people, so no single ranking is produced.',
        'All figures are actual. This report contains no forecast, estimate or simulated value.',
      ],
      sources: [{ module: 'Staff', records: report.length }, { module: 'Fast Sale & Orders', records: cur.orders }],
      recordsCount: report.length,
      validation: {
        status: diffOk ? 'reconciled' : 'critical',
        checks: [
          { label: 'Sales attributed to staff', value: this.money(attributed, ctx) },
          { label: 'Total revenue for the period', value: this.money(cur.total, ctx) },
          { label: 'Attributed never exceeds total', value: diffOk ? 'Yes' : 'No — attribution exceeds revenue', tone: diffOk ? 'pos' : 'neg' },
        ],
        exclusions: [],
        reportTotal: this.money(attributed, ctx),
        sourceTotal: this.money(cur.total, ctx),
        difference: this.signedMoney(round2(attributed - cur.total), ctx),
      },
      formats: ['PDF'],
    };
  }

  // ---------------------------------------------------------------- reviews

  private async buildReviews(ctx: BuildContext): Promise<ReportData> {
    const { start, end } = monthBounds(ctx.month);
    const prev = monthBounds(previousMonth(ctx.month));
    const where = { businessId: ctx.businessId, createdAt: { gte: start, lt: end } };
    const [agg, prevAgg, byStars, requests, responded, unanswered, negatives] = await Promise.all([
      this.prisma.externalReview.aggregate({ where, _avg: { stars: true }, _count: true }),
      this.prisma.externalReview.aggregate({
        where: { businessId: ctx.businessId, createdAt: { gte: prev.start, lt: prev.end } },
        _avg: { stars: true }, _count: true,
      }),
      this.prisma.externalReview.groupBy({ by: ['stars'], where, _count: true, orderBy: { stars: 'desc' } }),
      this.prisma.reviewRequest.count({ where }),
      this.prisma.reviewRequest.count({ where: { ...where, respondedAt: { not: null } } }),
      this.prisma.externalReview.count({ where: { ...where, repliedAt: null } }),
      this.prisma.externalReview.count({ where: { ...where, stars: { lte: 3 } } }),
    ]);

    const avg = agg._avg.stars ? round2(Number(agg._avg.stars)) : null;
    const prevAvg = prevAgg._avg.stars ? round2(Number(prevAgg._avg.stars)) : null;
    const rate = requests > 0 ? round2((responded / requests) * 100) : 0;
    const starTotal = byStars.reduce((s, r) => s + r._count, 0);
    const distOk = starTotal === agg._count;

    return {
      kind: 'reviews',
      title: REPORT_LABELS.reviews,
      period: ctx.month,
      periodLabel: monthLabel(ctx.month),
      currency: ctx.business.currency,
      summary:
        agg._count === 0
          ? `No public reviews were received in ${monthLabel(ctx.month)}. ${requests} review requests were sent and ${responded} were answered.`
          : `${agg._count} reviews averaged ${avg} stars${prevAvg !== null ? ` (${prevAvg} in the previous month)` : ''}. ${negatives} were 3 stars or below and ${unanswered} have not been replied to. ${responded} of ${requests} review requests were answered (${rate}%).`,
      kpis: [
        { label: 'Average rating', display: avg === null ? '—' : String(avg), ...(avg !== null && prevAvg !== null ? this.delta(avg, prevAvg) : {}) },
        { label: 'Reviews received', display: String(agg._count), ...this.delta(agg._count, prevAgg._count) },
        { label: 'Not yet replied to', display: String(unanswered), ...{ upIsGood: false } },
        { label: 'Request response rate', display: `${rate}%` },
      ],
      bars: {
        title: 'Reviews by star rating',
        bars: [5, 4, 3, 2, 1].map((s) => ({ label: `${s}★`, value: byStars.find((r) => r.stars === s)?._count ?? 0 })),
      },
      metrics: { averageRating: avg ?? 0, reviews: agg._count, unanswered, requestsSent: requests, requestsAnswered: responded, negative: negatives },
      metricRows: [
        { label: 'Reviews received', value: String(agg._count) },
        { label: 'Average rating', value: avg === null ? 'No reviews' : String(avg) },
        { label: '3 stars or below', value: String(negatives), tone: negatives ? 'neg' : 'pos' },
        { label: 'Not yet replied to', value: String(unanswered), tone: unanswered ? 'neg' : 'pos' },
        { label: 'Review requests sent', value: String(requests) },
        { label: 'Requests answered', value: `${responded} (${rate}%)` },
      ],
      configuration: this.baseConfig(ctx, [{ label: 'Source', value: 'Public reviews imported from connected platforms' }]),
      lineage: [
        { label: 'Figure', value: `Average rating ${avg ?? '—'}` },
        { label: 'Source', value: 'Reviews · connected platforms', link: true },
        { label: 'Filter', value: `Received ${monthLabel(ctx.month)}`, link: true },
        { label: 'Calculation', value: 'Mean of star ratings' },
        { label: 'Result', value: avg === null ? 'No reviews' : String(avg), tone: 'pos' },
      ],
      footnotes: [
        `Period ${monthLabel(ctx.month)}. Reviews are counted by the date they were received.`,
        'Private feedback left through the rating page is not a public review and is not counted here.',
        'All figures are actual. This report contains no forecast, estimate or simulated value.',
      ],
      sources: [{ module: 'Reviews', records: agg._count }, { module: 'Review requests', records: requests }],
      recordsCount: agg._count + requests,
      validation: {
        status: distOk ? 'reconciled' : 'critical',
        checks: [
          { label: 'Star split adds up to reviews received', value: `${starTotal} of ${agg._count}`, tone: distOk ? 'pos' : 'neg' },
          { label: 'Answered requests never exceed sent', value: responded <= requests ? 'Yes' : 'No', tone: responded <= requests ? 'pos' : 'neg' },
        ],
        exclusions: [],
        reportTotal: String(agg._count),
        sourceTotal: String(starTotal),
        difference: String(agg._count - starTotal),
      },
      formats: ['PDF'],
    };
  }

  // ---------------------------------------------------------------- inventory

  private async buildInventory(ctx: BuildContext): Promise<ReportData> {
    const { start, end } = monthBounds(ctx.month);
    const products = await this.prisma.product.findMany({
      where: { businessId: ctx.businessId, active: true, kind: 'product' },
      select: { id: true, name: true, stockQty: true, costPrice: true, sellingPrice: true, lowStockThreshold: true },
    });
    const sold = await this.prisma.$queryRaw<{ product_id: string; units: bigint }[]>`
      SELECT oi.product_id, SUM(oi.qty) AS units
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.business_id = ${ctx.businessId} AND o.status = 'completed' AND o.is_quotation = false
        AND o.created_at >= ${start} AND o.created_at < ${end} AND oi.product_id IS NOT NULL
      GROUP BY oi.product_id
    `;
    const soldById = new Map(sold.map((s) => [s.product_id, Number(s.units)]));

    const priced = products.filter((p) => Number(p.costPrice) > 0);
    const noCost = products.filter((p) => Number(p.costPrice) <= 0);
    const valueAtCost = round2(priced.reduce((s, p) => s + Math.max(p.stockQty, 0) * Number(p.costPrice), 0));
    const retailValue = round2(products.reduce((s, p) => s + Math.max(p.stockQty, 0) * Number(p.sellingPrice), 0));
    const out = products.filter((p) => p.stockQty <= 0);
    const low = products.filter((p) => p.stockQty > 0 && p.stockQty <= p.lowStockThreshold);
    const units = products.reduce((s, p) => s + Math.max(p.stockQty, 0), 0);
    const fast = [...products].map((p) => ({ p, sold: soldById.get(p.id) ?? 0 })).filter((x) => x.sold > 0).sort((a, b) => b.sold - a.sold).slice(0, 3);
    const slow = products.filter((p) => p.stockQty > 0 && !soldById.has(p.id)).length;

    // Independent recomputation of the same value straight in SQL.
    const sqlValue = await this.prisma.$queryRaw<{ v: string | null }[]>`
      SELECT SUM(stock_qty * cost_price) AS v FROM products
      WHERE business_id = ${ctx.businessId} AND active = true AND kind = 'product' AND cost_price > 0 AND stock_qty > 0
    `;
    const sqlTotal = round2(Number(sqlValue[0]?.v ?? 0));
    const diff = round2(valueAtCost - sqlTotal);
    const exclusions = noCost.length > 0 ? [`${noCost.length} product${noCost.length === 1 ? ' has' : 's have'} no cost price recorded and ${noCost.length === 1 ? 'is' : 'are'} excluded from inventory value rather than counted as free`] : [];

    const attention = [...out, ...low].sort((a, b) => a.stockQty - b.stockQty).slice(0, 40);

    return {
      kind: 'inventory',
      title: REPORT_LABELS.inventory,
      period: ctx.month,
      periodLabel: monthLabel(ctx.month),
      currency: ctx.business.currency,
      summary:
        products.length === 0
          ? 'No active stocked products exist for this business.'
          : `${products.length} stocked products hold ${units.toLocaleString('en-US')} units worth ${this.money(valueAtCost, ctx)} at cost. ${low.length} are below their reorder point and ${out.length} are out of stock. ${noCost.length > 0 ? `${noCost.length} have no cost price, so they are excluded from that value.` : 'Every product has a cost price recorded.'} Stock levels are as of the moment this report was generated.`,
      kpis: [
        { label: 'Inventory value (cost)', display: this.money(valueAtCost, ctx) },
        { label: 'Units on hand', display: units.toLocaleString('en-US') },
        { label: 'Low stock', display: String(low.length), upIsGood: false },
        { label: 'Out of stock', display: String(out.length), upIsGood: false },
      ],
      table: {
        title: 'Products needing attention',
        columns: [
          { key: 'name', label: 'Product', align: 'left' },
          { key: 'stock', label: 'On hand', align: 'right' },
          { key: 'threshold', label: 'Reorder point', align: 'right' },
          { key: 'sold', label: `Sold in ${monthLabel(ctx.month).split(' ').slice(-2).join(' ')}`, align: 'right' },
          { key: 'status', label: 'Status', align: 'left' },
        ],
        rows: attention.map((p) => ({
          name: p.name, stock: String(p.stockQty), threshold: String(p.lowStockThreshold),
          sold: String(soldById.get(p.id) ?? 0), status: p.stockQty <= 0 ? 'Out of stock' : 'Low stock',
        })),
        emptyText: 'No product is low or out of stock.',
      },
      metrics: { inventoryValue: valueAtCost, retailValue, units, lowStock: low.length, outOfStock: out.length, productsWithoutCost: noCost.length, products: products.length, slowMovers: slow },
      metricRows: [
        { label: 'Stocked products', value: String(products.length) },
        { label: 'Units on hand', value: units.toLocaleString('en-US') },
        { label: 'Inventory value at cost', value: this.money(valueAtCost, ctx), tone: 'pos' },
        { label: 'Inventory value at selling price', value: this.money(retailValue, ctx) },
        { label: 'Below reorder point', value: String(low.length), tone: low.length ? 'neg' : 'pos' },
        { label: 'Out of stock', value: String(out.length), tone: out.length ? 'neg' : 'pos' },
        { label: 'No cost price recorded', value: String(noCost.length), tone: noCost.length ? 'neg' : 'pos' },
        { label: 'In stock, not sold this month', value: String(slow) },
        { label: 'Fastest movers', value: fast.length ? fast.map((f) => `${f.p.name} (${f.sold})`).join(', ') : 'No sales this month' },
      ],
      configuration: this.baseConfig(ctx, [
        { label: 'Scope', value: 'Active products that track stock' },
        { label: 'Stock as of', value: 'The moment of generation, not month end' },
      ]),
      lineage: [
        { label: 'Figure', value: `Inventory value ${this.money(valueAtCost, ctx)}` },
        { label: 'Source', value: 'Products · stock on hand and cost price', link: true },
        { label: 'Filter', value: 'Active products with a cost price and stock above zero', link: true },
        { label: 'Calculation', value: 'Σ stock on hand × cost price' },
        { label: 'Excluded', value: `${noCost.length} products with no cost price`, link: true },
        { label: 'Result', value: this.money(valueAtCost, ctx), tone: 'pos' },
      ],
      footnotes: [
        'Stock quantities are as of the moment this report was generated; movement figures cover the selected month.',
        'Inventory value uses each product’s current cost price.',
        'A product with no cost price is listed as excluded rather than valued at zero.',
        'All figures are actual. This report contains no forecast, estimate or simulated value.',
      ],
      sources: [{ module: 'Inventory', records: products.length }, { module: 'Fast Sale & Orders', records: sold.length }],
      recordsCount: products.length,
      validation: {
        status: Math.abs(diff) > 0.01 ? 'critical' : exclusions.length ? 'warning' : 'reconciled',
        checks: [
          { label: 'Inventory value (report)', value: this.money(valueAtCost, ctx) },
          { label: 'Inventory value (recomputed in the database)', value: this.money(sqlTotal, ctx) },
          { label: 'Difference', value: Math.abs(diff) <= 0.01 ? `${this.money(0, ctx)} · reconciled` : this.signedMoney(diff, ctx), tone: Math.abs(diff) <= 0.01 ? 'pos' : 'neg' },
          { label: 'Excluded records', value: exclusions.length ? exclusions.join('; ') : 'None', tone: exclusions.length ? 'neg' : 'pos' },
        ],
        exclusions,
        reportTotal: this.money(valueAtCost, ctx),
        sourceTotal: this.money(sqlTotal, ctx),
        difference: this.signedMoney(diff, ctx),
      },
      formats: ['PDF'],
    };
  }

  // ---------------------------------------------------------------- credit recovery

  private async buildCreditRecovery(ctx: BuildContext): Promise<ReportData> {
    if (ctx.role !== Role.owner) {
      throw new AppException('REPORT_FORBIDDEN', 'Credit recovery reports are only available to the business owner.', HttpStatus.FORBIDDEN);
    }
    const recovery = await this.withTenant(ctx.businessId, () => this.credit.recoveryReport(6));
    const debtors = await this.prisma.$queryRaw<{ balance: string; days: bigint }[]>`
      SELECT balance, days_outstanding AS days FROM v_credit_balances
      WHERE business_id = ${ctx.businessId} AND balance > 0
    `;
    const buckets = [
      { label: '0–30 days', from: 0, to: 30 },
      { label: '31–60 days', from: 31, to: 60 },
      { label: '61–90 days', from: 61, to: 90 },
      { label: 'Over 90 days', from: 91, to: Infinity },
    ].map((b) => {
      const rows = debtors.filter((d) => Number(d.days) >= b.from && Number(d.days) <= b.to);
      return { ...b, count: rows.length, amount: round2(rows.reduce((s, d) => s + Number(d.balance), 0)) };
    });
    const outstanding = round2(debtors.reduce((s, d) => s + Number(d.balance), 0));
    const bucketSum = round2(buckets.reduce((s, b) => s + b.amount, 0));
    const pastTerms = round2(buckets.filter((b) => b.from > 30).reduce((s, b) => s + b.amount, 0));
    const diff = round2(outstanding - bucketSum);
    const oldest = debtors.reduce((m, d) => Math.max(m, Number(d.days)), 0);

    return {
      kind: 'credit_recovery',
      title: REPORT_LABELS.credit_recovery,
      period: ctx.month,
      periodLabel: `Trailing ${recovery.months} months to ${monthLabel(ctx.month).split(' ').slice(-2).join(' ')}`,
      currency: ctx.business.currency,
      summary:
        debtors.length === 0
          ? 'No customer currently owes the business anything on credit.'
          : `${this.money(outstanding, ctx)} is outstanding across ${debtors.length} customers; ${this.money(pastTerms, ctx)} has been outstanding for more than 30 days, the oldest for ${oldest} days. Over the last ${recovery.months} months ${this.money(recovery.extended, ctx)} of credit was extended and ${this.money(recovery.recovered, ctx)} recovered (${recovery.recoveryRate}%). Outstanding credit is never counted as cash collected.`,
      kpis: [
        { label: 'Outstanding now', display: this.money(outstanding, ctx), upIsGood: false },
        { label: 'Over 30 days', display: this.money(pastTerms, ctx), upIsGood: false },
        { label: 'Recovery rate', display: `${recovery.recoveryRate}%` },
        { label: 'Written off', display: this.money(recovery.writtenOff, ctx), upIsGood: false },
      ],
      bars: { title: 'Outstanding by age', bars: buckets.map((b) => ({ label: b.label, value: b.amount })) },
      table: {
        title: 'Recovery trend',
        columns: [
          { key: 'month', label: 'Month', align: 'left' },
          { key: 'extended', label: 'Extended', align: 'right' },
          { key: 'recovered', label: 'Recovered', align: 'right' },
          { key: 'rate', label: 'Rate', align: 'right' },
          { key: 'writtenOff', label: 'Written off', align: 'right' },
        ],
        rows: recovery.trend.map((r) => ({
          month: r.month, extended: this.money(r.extended, ctx), recovered: this.money(r.recovered, ctx),
          rate: `${r.recoveryRate}%`, writtenOff: this.money(r.writtenOff, ctx),
        })),
        emptyText: 'No credit activity in this window.',
      },
      metrics: { outstanding, pastTerms, customersOwing: debtors.length, extended: recovery.extended, recovered: recovery.recovered, recoveryRate: recovery.recoveryRate, writtenOff: recovery.writtenOff, netExposure: recovery.netExposure },
      metricRows: [
        { label: 'Outstanding now', value: this.money(outstanding, ctx), tone: 'neg' },
        { label: 'Customers owing', value: String(debtors.length) },
        ...buckets.map((b) => ({ label: `Outstanding ${b.label}`, value: `${this.money(b.amount, ctx)} · ${b.count}` })),
        { label: `Extended (${recovery.months} months)`, value: this.money(recovery.extended, ctx) },
        { label: `Recovered (${recovery.months} months)`, value: this.money(recovery.recovered, ctx), tone: 'pos' },
        { label: 'Recovery rate', value: `${recovery.recoveryRate}%` },
        { label: 'Written off', value: this.money(recovery.writtenOff, ctx) },
      ],
      configuration: this.baseConfig(ctx, [{ label: 'Window', value: `Trailing ${recovery.months} months` }, { label: 'Aging', value: 'Days since the balance last returned to zero' }]),
      lineage: [
        { label: 'Figure', value: `Outstanding ${this.money(outstanding, ctx)}` },
        { label: 'Source', value: 'Credit ledger · every credit sale and payment', link: true },
        { label: 'Filter', value: 'Customers with a balance above zero', link: true },
        { label: 'Calculation', value: 'Σ credit entries − Σ payments, per customer' },
        { label: 'Result', value: this.money(outstanding, ctx), tone: 'neg' },
      ],
      footnotes: [
        'Outstanding credit is money customers owe; it is never counted as cash collected.',
        'Aging counts the days since a customer’s balance last returned to zero.',
        'All figures are actual. This report contains no forecast, estimate or simulated value.',
      ],
      sources: [{ module: 'Credit', records: debtors.length }, { module: 'Payments', records: recovery.trend.length }],
      recordsCount: debtors.length,
      validation: {
        status: Math.abs(diff) > 0.01 ? 'critical' : 'reconciled',
        checks: [
          { label: 'Outstanding (Σ balances)', value: this.money(outstanding, ctx) },
          { label: 'Outstanding (Σ aging buckets)', value: this.money(bucketSum, ctx) },
          { label: 'Difference', value: Math.abs(diff) <= 0.01 ? `${this.money(0, ctx)} · reconciled` : this.signedMoney(diff, ctx), tone: Math.abs(diff) <= 0.01 ? 'pos' : 'neg' },
        ],
        exclusions: [],
        reportTotal: this.money(outstanding, ctx),
        sourceTotal: this.money(bucketSum, ctx),
        difference: this.signedMoney(diff, ctx),
      },
      formats: ['PDF'],
    };
  }

  // ---------------------------------------------------------------- tax

  /** Also used by the Tax Reports screen, so the tab and the PDF can never disagree. */
  async taxFigures(businessId: string, month: string) {
    const { start, end } = monthBounds(month);
    const [orderAgg, inclusiveTax, rateRows, unrated, refunds] = await Promise.all([
      this.orderFigures(businessId, start, end),
      this.prisma.order.aggregate({
        where: { businessId, status: 'completed', isQuotation: false, taxInclusive: true, createdAt: { gte: start, lt: end } },
        _sum: { tax: true },
      }),
      this.prisma.$queryRaw<{ rate: string; taxable: string; collected: string; orders: bigint }[]>`
        SELECT oi.tax_rate_percent AS rate,
               SUM(IF(o.tax_inclusive, oi.price * oi.qty * (1 - IFNULL(o.discount / NULLIF(o.subtotal, 0), 0)) * 100 / (100 + oi.tax_rate_percent), oi.price * oi.qty * (1 - IFNULL(o.discount / NULLIF(o.subtotal, 0), 0)))) AS taxable,
               SUM(IF(o.tax_inclusive, oi.price * oi.qty * (1 - IFNULL(o.discount / NULLIF(o.subtotal, 0), 0)) * oi.tax_rate_percent / (100 + oi.tax_rate_percent), oi.price * oi.qty * (1 - IFNULL(o.discount / NULLIF(o.subtotal, 0), 0)) * oi.tax_rate_percent / 100)) AS collected,
               COUNT(DISTINCT o.id) AS orders
        FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.business_id = ${businessId} AND o.status = 'completed' AND o.is_quotation = false
          AND o.created_at >= ${start} AND o.created_at < ${end} AND oi.tax_rate_percent IS NOT NULL
        GROUP BY oi.tax_rate_percent ORDER BY oi.tax_rate_percent DESC
      `,
      this.prisma.$queryRaw<{ taxable: string | null; orders: bigint }[]>`
        SELECT SUM(oi.price * oi.qty * (1 - IFNULL(o.discount / NULLIF(o.subtotal, 0), 0))) AS taxable, COUNT(DISTINCT o.id) AS orders
        FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.business_id = ${businessId} AND o.status = 'completed' AND o.is_quotation = false
          AND o.created_at >= ${start} AND o.created_at < ${end} AND oi.tax_rate_percent IS NULL
      `,
      this.prisma.return.aggregate({
        where: { businessId, status: 'approved', createdAt: { gte: start, lt: end } },
        _sum: { refundAmount: true }, _count: true,
      }),
    ]);
    return {
      // Tax-inclusive orders carry their tax inside the price, so it comes off to leave the taxable amount.
      taxableSales: round2(orderAgg.subtotal - orderAgg.discount - Number(inclusiveTax._sum.tax ?? 0)),
      taxCollected: orderAgg.tax,
      orders: orderAgg.orders,
      rates: rateRows.map((r) => ({ ratePercent: Number(r.rate), taxable: round2(Number(r.taxable)), collected: round2(Number(r.collected)), orders: Number(r.orders) })),
      unrated: { taxable: round2(Number(unrated[0]?.taxable ?? 0)), orders: Number(unrated[0]?.orders ?? 0) },
      refunds: { amount: round2(Number(refunds._sum.refundAmount ?? 0)), count: refunds._count },
    };
  }

  private async buildTax(ctx: BuildContext): Promise<ReportData> {
    const f = await this.taxFigures(ctx.businessId, ctx.month);
    const prevF = await this.taxFigures(ctx.businessId, previousMonth(ctx.month));
    const label = ctx.business.taxLabel;
    const ratedCollected = round2(f.rates.reduce((s, r) => s + r.collected, 0));
    const ratedDiff = round2(f.taxCollected - ratedCollected);
    const exclusions = f.unrated.orders > 0 ? [`${f.unrated.orders} transaction${f.unrated.orders === 1 ? ' has' : 's have'} no tax rate recorded — listed separately, not assumed to be zero-rated`] : [];

    return {
      kind: 'tax',
      title: REPORT_LABELS.tax,
      period: ctx.month,
      periodLabel: monthLabel(ctx.month),
      currency: ctx.business.currency,
      summary:
        f.orders === 0
          ? `No taxable sales were recorded in ${monthLabel(ctx.month)}.`
          : `Taxable sales were ${this.money(f.taxableSales, ctx)} with ${this.money(f.taxCollected, ctx)} of ${label} collected. ${f.refunds.count > 0 ? `${f.refunds.count} approved return${f.refunds.count === 1 ? '' : 's'} refunded ${this.money(f.refunds.amount, ctx)} in the period; this is shown for information and is not netted off. ` : ''}${exclusions.length ? `${exclusions[0]}. ` : ''}${label} paid on purchases is not tracked, so net ${label.toLowerCase()} here is ${label.toLowerCase()} collected alone.`,
      kpis: [
        { label: 'Taxable sales', display: this.money(f.taxableSales, ctx), ...this.delta(f.taxableSales, prevF.taxableSales) },
        { label: `${label} collected`, display: this.money(f.taxCollected, ctx), ...this.delta(f.taxCollected, prevF.taxCollected) },
        { label: `${label} on purchases`, display: 'Not tracked' },
        { label: `Net ${label.toLowerCase()}`, display: this.money(f.taxCollected, ctx) },
      ],
      table: {
        title: `${label} by rate`,
        columns: [
          { key: 'rate', label: 'Rate', align: 'left' },
          { key: 'taxable', label: 'Taxable amount', align: 'right' },
          { key: 'collected', label: `${label} collected`, align: 'right' },
          { key: 'orders', label: 'Transactions', align: 'center' },
        ],
        rows: [
          ...f.rates.map((r) => ({ rate: `${r.ratePercent}%`, taxable: this.money(r.taxable, ctx), collected: this.money(r.collected, ctx), orders: String(r.orders) })),
          ...(f.unrated.orders > 0 ? [{ rate: 'No rate recorded', taxable: this.money(f.unrated.taxable, ctx), collected: '—', orders: String(f.unrated.orders) }] : []),
        ],
        emptyText: 'No taxed sales in this period.',
      },
      metrics: { taxableSales: f.taxableSales, taxCollected: f.taxCollected, refunds: f.refunds.amount, unratedTransactions: f.unrated.orders, transactions: f.orders },
      metricRows: [
        { label: 'Taxable sales', value: this.money(f.taxableSales, ctx), tone: 'pos' },
        { label: `${label} collected`, value: this.money(f.taxCollected, ctx), tone: 'pos' },
        { label: `${label} on purchases`, value: 'Not tracked' },
        { label: 'Refunds approved (gross, not netted)', value: this.money(f.refunds.amount, ctx) },
        { label: `Net ${label.toLowerCase()}`, value: this.money(f.taxCollected, ctx) },
        { label: 'Transactions', value: String(f.orders) },
        { label: 'Transactions with no tax rate', value: String(f.unrated.orders), tone: f.unrated.orders ? 'neg' : 'pos' },
      ],
      configuration: this.baseConfig(ctx, [
        { label: 'Tax label', value: label },
        { label: 'Flat rate configured', value: 'Per business, with optional per-category rules' },
        { label: 'Filters', value: 'Completed, non-quotation orders' },
      ]),
      lineage: [
        { label: 'Figure', value: `${label} collected ${this.money(f.taxCollected, ctx)}` },
        { label: 'Source', value: 'Sales transactions · order tax', link: true },
        { label: 'Filter', value: `${monthLabel(ctx.month)} · ${ctx.business.name}`, link: true },
        { label: 'Calculation', value: 'Σ tax computed on each order at sale time' },
        { label: 'Excluded', value: 'Cancelled, draft and quotation orders', link: true },
        { label: 'Result', value: this.money(f.taxCollected, ctx), tone: 'pos' },
      ],
      footnotes: [
        `This is a reporting figure prepared from recorded transactions. It is not a legal determination of what is owed, and Noxtill does not file returns or submit to any tax authority.`,
        `${label} on purchases is not tracked: no supplier invoice or expense records tax paid, so nothing is netted against ${label.toLowerCase()} collected.`,
        'A transaction with no tax rate recorded is listed on its own line, never assumed to be zero-rated, because that assumption would change net tax.',
        'Approved refunds are shown for information; how much of each refund was tax is not recorded, so no tax adjustment is calculated.',
      ],
      sources: [{ module: 'Fast Sale & Orders', records: f.orders }, { module: 'Returns', records: f.refunds.count }],
      recordsCount: f.orders,
      validation: {
        status: exclusions.length || ratedDiff > 0.01 ? 'warning' : 'reconciled',
        checks: [
          { label: `${label} collected (Σ order tax)`, value: this.money(f.taxCollected, ctx) },
          { label: `${label} on lines with a recorded rate`, value: this.money(ratedCollected, ctx) },
          { label: `${label} on lines with no recorded rate`, value: ratedDiff > 0.01 ? this.money(ratedDiff, ctx) : this.money(0, ctx), tone: ratedDiff > 0.01 ? 'neg' : 'pos' },
          { label: 'Excluded records', value: exclusions.length ? exclusions.join('; ') : 'None', tone: exclusions.length ? 'neg' : 'pos' },
        ],
        exclusions,
        reportTotal: this.money(f.taxCollected, ctx),
        sourceTotal: this.money(ratedCollected, ctx),
        difference: this.signedMoney(ratedDiff, ctx),
      },
      formats: ['PDF'],
    };
  }

  // ---------------------------------------------------------------- marketing

  private async buildMarketing(ctx: BuildContext): Promise<ReportData> {
    const { start, end } = monthBounds(ctx.month);
    const campaigns = await this.prisma.campaign.findMany({
      where: { businessId: ctx.businessId, createdAt: { gte: start, lt: end } },
      select: { id: true, segment: true, templateKey: true, sentCount: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const ids = campaigns.map((c) => c.id);
    const [byCampaign, byChannel] = await Promise.all([
      ids.length
        ? this.prisma.message.groupBy({ by: ['campaignId', 'status'], where: { campaignId: { in: ids } }, _count: true })
        : Promise.resolve([] as { campaignId: string | null; status: string; _count: number }[]),
      this.prisma.message.groupBy({ by: ['channel'], where: { businessId: ctx.businessId, campaignId: { not: null }, createdAt: { gte: start, lt: end } }, _count: true }),
    ]);
    const statusFor = (id: string, status: string) => byCampaign.filter((r) => r.campaignId === id && r.status === status).reduce((s, r) => s + r._count, 0);
    const rows = campaigns.map((c) => {
      const total = byCampaign.filter((r) => r.campaignId === c.id).reduce((s, r) => s + r._count, 0);
      const delivered = statusFor(c.id, 'delivered') + statusFor(c.id, 'read');
      return { c, total, delivered, read: statusFor(c.id, 'read'), failed: statusFor(c.id, 'failed') };
    });
    const sent = rows.reduce((s, r) => s + r.total, 0);
    const delivered = rows.reduce((s, r) => s + r.delivered, 0);
    const failed = rows.reduce((s, r) => s + r.failed, 0);
    const mismatched = rows.filter((r) => r.total !== r.c.sentCount).length;
    const rate = sent > 0 ? round2((delivered / sent) * 100) : 0;

    return {
      kind: 'marketing',
      title: REPORT_LABELS.marketing,
      period: ctx.month,
      periodLabel: monthLabel(ctx.month),
      currency: ctx.business.currency,
      summary:
        campaigns.length === 0
          ? `No campaigns were created in ${monthLabel(ctx.month)}.`
          : `${campaigns.length} campaigns produced ${sent} messages; ${delivered} (${rate}%) were reported delivered or read and ${failed} failed. Cost, conversions and attributed revenue are not tracked for campaigns, so no return on investment is shown.`,
      kpis: [
        { label: 'Campaigns', display: String(campaigns.length) },
        { label: 'Messages sent', display: String(sent) },
        { label: 'Delivered or read', display: `${rate}%` },
        { label: 'Failed', display: String(failed), upIsGood: false },
      ],
      bars: { title: 'Campaign messages by channel', bars: byChannel.map((g) => ({ label: String(g.channel), value: g._count })) },
      table: {
        title: 'Campaigns',
        columns: [
          { key: 'campaign', label: 'Campaign', align: 'left' },
          { key: 'date', label: 'Created', align: 'left' },
          { key: 'sent', label: 'Messages', align: 'right' },
          { key: 'delivered', label: 'Delivered or read', align: 'right' },
          { key: 'failed', label: 'Failed', align: 'right' },
        ],
        rows: rows.map((r) => ({
          campaign: `${r.c.templateKey} → ${r.c.segment}`,
          date: this.locale.formatDate(r.c.createdAt, ctx.business),
          sent: String(r.total), delivered: String(r.delivered), failed: String(r.failed),
        })),
        emptyText: 'No campaigns were created in this period.',
      },
      metrics: { campaigns: campaigns.length, messagesSent: sent, delivered, failed, deliveryRate: rate },
      metricRows: [
        { label: 'Campaigns created', value: String(campaigns.length) },
        { label: 'Messages sent', value: String(sent) },
        { label: 'Reported delivered or read', value: `${delivered} (${rate}%)`, tone: 'pos' },
        { label: 'Failed', value: String(failed), tone: failed ? 'neg' : 'pos' },
        { label: 'Cost, conversions and attributed revenue', value: 'Not tracked' },
      ],
      configuration: this.baseConfig(ctx, [{ label: 'Scope', value: 'Campaigns created in the period and the messages they sent' }]),
      lineage: [
        { label: 'Figure', value: `Messages sent ${sent}` },
        { label: 'Source', value: 'Marketing · campaign messages', link: true },
        { label: 'Filter', value: `Campaigns created ${monthLabel(ctx.month)}`, link: true },
        { label: 'Calculation', value: 'Count of messages linked to each campaign' },
        { label: 'Result', value: String(sent), tone: 'pos' },
      ],
      footnotes: [
        'Delivered and read are counted only where the channel reported them; a message with no report stays as sent.',
        'Campaign cost, conversions and attributed revenue are not recorded, so no return on investment is calculated.',
        'All figures are actual. This report contains no forecast, estimate or simulated value.',
      ],
      sources: [{ module: 'Marketing', records: campaigns.length }, { module: 'Messages', records: sent }],
      recordsCount: campaigns.length + sent,
      validation: {
        status: mismatched > 0 ? 'warning' : 'reconciled',
        checks: [
          { label: 'Messages counted per campaign', value: String(sent) },
          { label: 'Campaigns whose stored sent count differs from their messages', value: String(mismatched), tone: mismatched ? 'neg' : 'pos' },
        ],
        exclusions: mismatched ? [`${mismatched} campaign${mismatched === 1 ? '' : 's'} recorded a different sent count than the messages found`] : [],
        reportTotal: String(sent),
        sourceTotal: String(campaigns.reduce((s, c) => s + c.sentCount, 0)),
        difference: String(sent - campaigns.reduce((s, c) => s + c.sentCount, 0)),
      },
      formats: ['PDF'],
    };
  }
}
