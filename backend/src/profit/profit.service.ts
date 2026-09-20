import { Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { BranchScopeService } from '../common/tenancy/branch-scope.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import {
  CategoryProfitRow,
  CoPurchaseRow,
  HourlyRow,
  ProductProfitRow,
  WeekdayRow,
} from './profit.types';
import { PnlPeriod } from './dto/query-pnl.dto';

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const LOW_MARGIN_THRESHOLD = 10;
const TOP_PRODUCTS_COUNT = 3;
const CO_PURCHASE_MIN_COUNT = 2;
const BUNDLE_SUGGESTION_LIMIT = 5;
/** P&L Overview's trend chart (UPD-BE-112): the requested month plus the 5 preceding it. */
const PNL_TREND_MONTHS = 6;
/** Deterministic, not AI-decided — a modest incentive to buy the pair together. */
const BUNDLE_DISCOUNT_RATE = 0.1;
const PRODUCT_SUGGESTION_LIMIT = 5;
/** Deterministic target for the "AI Suggestions" repricing pitch — not AI-decided. */
const TARGET_MARGIN_PERCENT = 20;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Profit & Loss analytics (BE-036/BE-037), computed from completed, non-quotation orders. */
@Injectable()
export class ProfitService {
  private readonly logger = new Logger(ProfitService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly cls: ClsService,
    private readonly aiInfra: AiInfraService,
  ) {}

  async byProduct(
    businessId: string,
    branchId?: string,
    windowDays: 30 | 90 = 30,
  ) {
    const ids = await this.branchScope.resolveIds(businessId, branchId);
    const now = Date.now();
    const since = new Date(now - windowDays * 24 * 60 * 60 * 1000);
    // Product Profitability's "Trend" column (UPD-BE-112c): the equal-length window immediately
    // before `since`, so a real up/down arrow compares like-for-like, never a fabricated sparkline.
    const priorSince = new Date(now - windowDays * 2 * 24 * 60 * 60 * 1000);

    const [rows, priorRows] = await Promise.all([
      this.prisma.$queryRaw<ProductProfitRow[]>`
        SELECT oi.product_id, p.name, COALESCE(p.category, 'Uncategorized') AS category,
               SUM(oi.qty) AS units, SUM(oi.price * oi.qty) AS revenue, SUM(oi.cost * oi.qty) AS cost
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN products p ON p.id = oi.product_id
        WHERE o.business_id IN (${Prisma.join(ids)}) AND o.status = 'completed' AND o.is_quotation = false AND o.created_at >= ${since}
        GROUP BY oi.product_id, p.name, category
        ORDER BY revenue DESC
      `,
      this.prisma.$queryRaw<{ product_id: string; revenue: string }[]>`
        SELECT oi.product_id, SUM(oi.price * oi.qty) AS revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.business_id IN (${Prisma.join(ids)}) AND o.status = 'completed' AND o.is_quotation = false
          AND o.created_at >= ${priorSince} AND o.created_at < ${since}
        GROUP BY oi.product_id
      `,
    ]);

    const priorRevenueById = new Map(
      priorRows.map((r) => [r.product_id, Number(r.revenue)]),
    );

    const products = rows.map((row) => {
      const revenue = Number(row.revenue);
      const cost = Number(row.cost);
      const profit = round2(revenue - cost);
      const margin = revenue > 0 ? round2((profit / revenue) * 100) : 0;
      const priorRevenue = priorRevenueById.get(row.product_id) ?? 0;
      const trend: 'up' | 'down' | 'flat' =
        revenue === priorRevenue ? 'flat' : revenue > priorRevenue ? 'up' : 'down';
      return {
        productId: row.product_id,
        name: row.name,
        category: row.category,
        units: Number(row.units),
        revenue: round2(revenue),
        cost: round2(cost),
        profit,
        margin,
        reviewPricing: margin < LOW_MARGIN_THRESHOLD,
        isTopPerformer: false,
        trend,
      };
    });

    const topIds = new Set(
      [...products]
        .sort((a, b) => b.profit - a.profit)
        .slice(0, TOP_PRODUCTS_COUNT)
        .map((p) => p.productId),
    );
    for (const product of products) {
      product.isTopPerformer = topIds.has(product.productId);
    }

    return { windowDays, products };
  }

  /**
   * Product Profitability's "AI Suggestions" (UPD-BE-112d) — same facts-then-phrase pattern as
   * `bundleSuggestions()`: a deterministic target price (to reach `TARGET_MARGIN_PERCENT`) is
   * computed for each real low-margin product first, then the AI is only asked to phrase a short
   * pitch for numbers already computed — never asked to invent a price of its own.
   */
  async productSuggestions(
    businessId: string,
    branchId?: string,
    windowDays: 30 | 90 = 30,
  ) {
    const { products } = await this.byProduct(businessId, branchId, windowDays);

    const candidates = products
      .filter((p) => p.reviewPricing && p.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, PRODUCT_SUGGESTION_LIMIT)
      .map((p) => {
        const unitCost = p.units > 0 ? p.cost / p.units : 0;
        const currentPrice = p.units > 0 ? p.revenue / p.units : 0;
        const suggestedPrice = round2(
          unitCost / (1 - TARGET_MARGIN_PERCENT / 100),
        );
        return {
          productId: p.productId,
          name: p.name,
          currentPrice: round2(currentPrice),
          suggestedPrice,
          currentMargin: p.margin,
          pitch: `${p.name} is at ${p.margin.toFixed(1)}% margin — raising the price to ${suggestedPrice} would reach ~${TARGET_MARGIN_PERCENT}%.`,
        };
      });

    if (candidates.length === 0) return [];

    try {
      const pitches = await this.phraseProductPitches(businessId, candidates);
      return candidates.map((c, i) => ({ ...c, pitch: pitches[i] || c.pitch }));
    } catch (error) {
      this.logger.warn(
        `Product-suggestion phrasing skipped for business ${businessId}: ${(error as Error).message}`,
      );
      return candidates;
    }
  }

  private async phraseProductPitches(
    businessId: string,
    candidates: {
      name: string;
      currentMargin: number;
      suggestedPrice: number;
    }[],
  ): Promise<string[]> {
    const factLines = candidates
      .map(
        (c, i) =>
          `${i + 1}. "${c.name}", currently ${c.currentMargin.toFixed(1)}% margin, suggested new price ${c.suggestedPrice}`,
      )
      .join('\n');

    const prompt = [
      'You write short, one-sentence retail pricing suggestions from real numbers a system has already computed.',
      'Here are the numbered candidates:',
      factLines,
      'For each numbered candidate, write exactly one short sentence (max ~20 words) suggesting the new price,',
      'explaining briefly why (low margin).',
      'Use ONLY the numbers already given — never introduce a new number or price of your own.',
      'Reply with ONLY a JSON array of strings, one per candidate, in the same order. No other text.',
    ].join('\n');

    const raw = await this.aiInfra.complete(businessId, prompt);
    const jsonStart = raw.indexOf('[');
    const jsonEnd = raw.lastIndexOf(']');
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
      throw new Error('AI response had no JSON array');
    }
    const parsed: unknown = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    if (
      !Array.isArray(parsed) ||
      parsed.length !== candidates.length ||
      !parsed.every(
        (item) => typeof item === 'string' && item.trim().length > 0,
      )
    ) {
      throw new Error('AI response array shape mismatch');
    }
    return parsed as string[];
  }

  async byTime(businessId: string, branchId?: string) {
    const ids = await this.branchScope.resolveIds(businessId, branchId);

    const [hourlyRows, weekdayRows] = await Promise.all([
      this.prisma.$queryRaw<HourlyRow[]>`
        SELECT HOUR(created_at) AS hour, SUM(total) AS revenue, COUNT(*) AS sales_count
        FROM orders
        WHERE business_id IN (${Prisma.join(ids)}) AND status = 'completed' AND is_quotation = false
        GROUP BY hour
        ORDER BY hour
      `,
      // MySQL's DAYOFWEEK() returns 1=Sunday..7=Saturday; the -1 keeps the existing
      // 0=Sunday..6=Saturday indexing that WEEKDAY_NAMES (and Postgres's old EXTRACT(DOW...)) used.
      this.prisma.$queryRaw<WeekdayRow[]>`
        SELECT DAYOFWEEK(created_at) - 1 AS dow, SUM(total) AS revenue, COUNT(*) AS sales_count
        FROM orders
        WHERE business_id IN (${Prisma.join(ids)}) AND status = 'completed' AND is_quotation = false
        GROUP BY dow
        ORDER BY dow
      `,
    ]);

    const hourly = hourlyRows.map((row) => {
      const revenue = round2(Number(row.revenue));
      const salesCount = Number(row.sales_count);
      return {
        // MySQL migration: HOUR(created_at) is a raw date/time function call, which mysql2/Prisma
        // deserialize as a JS `bigint` — same quirk as DATEDIFF() elsewhere, not just aggregates.
        hour: Number(row.hour),
        revenue,
        salesCount,
        avgTicket: salesCount > 0 ? round2(revenue / salesCount) : 0,
      };
    });
    const weekday = weekdayRows.map((row) => {
      const revenue = round2(Number(row.revenue));
      const salesCount = Number(row.sales_count);
      return {
        day: WEEKDAY_NAMES[Number(row.dow)],
        revenue,
        salesCount,
        avgTicket: salesCount > 0 ? round2(revenue / salesCount) : 0,
      };
    });

    return { hourly, weekday, insight: this.buildInsight(hourly, weekday) };
  }

  private buildInsight(
    hourly: { hour: number; revenue: number }[],
    weekday: { day: string; revenue: number }[],
  ): string {
    const total = hourly.reduce((sum, h) => sum + h.revenue, 0);
    if (total === 0)
      return 'Not enough sales data yet for a time-of-day insight.';

    let bestWindowStart = 0;
    let bestWindowRevenue = -1;
    for (let start = 0; start < 24; start++) {
      const windowRevenue = [0, 1, 2].reduce((sum, offset) => {
        const hour = (start + offset) % 24;
        return sum + (hourly.find((h) => h.hour === hour)?.revenue ?? 0);
      }, 0);
      if (windowRevenue > bestWindowRevenue) {
        bestWindowRevenue = windowRevenue;
        bestWindowStart = start;
      }
    }
    const pct = Math.round((bestWindowRevenue / total) * 100);
    const end = (bestWindowStart + 3) % 24;

    const slowest = weekday.length
      ? weekday.reduce((min, w) => (w.revenue < min.revenue ? w : min))
      : undefined;
    const slowestNote = slowest ? ` ${slowest.day} is your slowest day.` : '';

    return `${pct}% of sales happen between ${bestWindowStart}:00–${end}:00.${slowestNote}`;
  }

  /**
   * GET /profit/pnl?month — revenue − COGS − expenses (by category) = net (BE-037).
   * `businessId` is taken as an explicit parameter (unlike this service's other methods, which
   * read it from CLS) because `HealthScoreService.marginRaw()` calls this from
   * `HealthScoreSnapshotProcessor`'s weekly background job — a context with no bound CLS. Without
   * an explicit businessId here, the tenant-scoping Prisma extension fails open (see
   * `tenant-prisma.extension.ts`'s documented behavior for background jobs) and this would
   * aggregate revenue across every business in the database, not just the one being scored.
   */
  async pnl(
    businessId: string,
    month: string,
    period: PnlPeriod = 'month',
    branchId?: string,
  ) {
    const ids = await this.branchScope.resolveIds(businessId, branchId);
    const monthComputed = await this.computeMonthPnl(ids, month);
    const range =
      period === 'month'
        ? this.monthRange(month)
        : this.periodRange(period);
    const headline =
      period === 'month'
        ? monthComputed
        : await this.computeRangePnl(ids, range.start, range.end);
    const [categoryBreakdown, trend] = await Promise.all([
      this.categoryBreakdown(ids, range.start, range.end),
      this.pnlTrend(ids, month, monthComputed),
    ]);
    return { ...headline, month, period, categoryBreakdown, trend };
  }

  private monthRange(month: string): { start: Date; end: Date } {
    const [year, mon] = month.split('-').map(Number);
    return {
      start: new Date(Date.UTC(year, mon - 1, 1)),
      end: new Date(Date.UTC(year, mon, 1)),
    };
  }

  /** Real date ranges for the Period filter (Today/Week/Quarter/Year) — "week"/"today" are trailing windows ending now, matching the rolling-window convention `CashForecastService`/`HealthScoreService` already use elsewhere in this module. */
  private periodRange(period: PnlPeriod): { start: Date; end: Date } {
    const now = new Date();
    const end = now;
    switch (period) {
      case 'today':
        return {
          start: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          end,
        };
      case 'week':
        return {
          start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          end,
        };
      case 'quarter': {
        const quarterStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;
        return {
          start: new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth, 1)),
          end,
        };
      }
      case 'year':
        return { start: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), end };
      case 'month':
      default:
        return this.monthRange(
          `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
        );
    }
  }

  /** Revenue/COGS/expenses(by expense category)/wastage/net for one calendar month — shared by `pnl()`'s current month, its trend, and `HealthScoreService.marginRaw()`. */
  private async computeMonthPnl(ids: string[], month: string) {
    const { start, end } = this.monthRange(month);
    return { month, ...(await this.computeRangePnl(ids, start, end)) };
  }

  /** The actual revenue/COGS/expenses/wastage/net computation for an arbitrary date range and real business-id set — `computeMonthPnl` is just this with a calendar-month range. Uses the raw `PrismaService` (not `TenantPrismaService`): a multi-id `ids` array (an "All branches" aggregate) can never be expressed through the tenant-scoping extension, which always forces the single CLS-bound business id onto every query regardless of what's passed. */
  private async computeRangePnl(ids: string[], start: Date, end: Date) {
    const [orderTotals, expensesByCategory, wastageMovements] =
      await Promise.all([
        this.prisma.order.aggregate({
          where: {
            businessId: { in: ids },
            status: 'completed',
            isQuotation: false,
            createdAt: { gte: start, lt: end },
          },
          _sum: { total: true, cogs: true },
        }),
        this.prisma.expense.groupBy({
          by: ['category'],
          where: { businessId: { in: ids }, incurredOn: { gte: start, lt: end } },
          _sum: { amount: true },
        }),
        // Inventory depth fix (UPD-INT-013): wastage/theft was a real stock decrement that never
        // showed up anywhere in reported profit — `unitCost` (snapshotted at write time by
        // `InventoryService.recordWastage`) is real for every movement recorded since that fix;
        // older rows without it honestly contribute $0 rather than guessing at a historical cost.
        this.prisma.stockMovement.findMany({
          where: {
            businessId: { in: ids },
            kind: 'wastage',
            createdAt: { gte: start, lt: end },
          },
          select: { qty: true, unitCost: true },
        }),
      ]);

    const revenue = round2(Number(orderTotals._sum.total ?? 0));
    const cogs = round2(Number(orderTotals._sum.cogs ?? 0));
    const expenseBreakdown = expensesByCategory.map((row) => ({
      category: row.category,
      amount: round2(Number(row._sum.amount ?? 0)),
    }));
    const totalExpenses = round2(
      expenseBreakdown.reduce((sum, row) => sum + row.amount, 0),
    );
    const wastageCost = round2(
      wastageMovements.reduce(
        (sum, m) => sum + Math.abs(m.qty) * Number(m.unitCost ?? 0),
        0,
      ),
    );
    const netProfit = round2(revenue - cogs - totalExpenses - wastageCost);

    return {
      revenue,
      cogs,
      expenses: expenseBreakdown,
      totalExpenses,
      wastageCost,
      netProfit,
    };
  }

  /**
   * P&L Overview's "Category summary" (UPD-BE-112) — real revenue/cost/gross-profit per PRODUCT
   * category (`Product.category`), from the same completed-order-items join `byProduct()` uses.
   * `expenses`/`netProfit` per row are a real overhead expense TOTAL split proportionally to each
   * category's share of revenue — overhead (rent, salaries, utilities) has no per-product-category
   * tracking in this data model, so this is a disclosed proportional allocation, not a tracked
   * figure; `allocatedExpenses` always sums back to the period's real `totalExpenses + wastageCost`.
   */
  private async categoryBreakdown(ids: string[], start: Date, end: Date) {
    const [rows, overheadTotal] = await Promise.all([
      this.prisma.$queryRaw<CategoryProfitRow[]>`
        SELECT COALESCE(p.category, 'Uncategorized') AS category,
               SUM(oi.price * oi.qty) AS revenue, SUM(oi.cost * oi.qty) AS cost
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN products p ON p.id = oi.product_id
        WHERE o.business_id IN (${Prisma.join(ids)}) AND o.status = 'completed' AND o.is_quotation = false
          AND o.created_at >= ${start} AND o.created_at < ${end}
        GROUP BY category
        ORDER BY revenue DESC
      `,
      this.overheadTotal(ids, start, end),
    ]);

    const categories = rows.map((row) => {
      const revenue = round2(Number(row.revenue));
      const cost = round2(Number(row.cost));
      const grossProfit = round2(revenue - cost);
      return { category: row.category, revenue, cost, grossProfit };
    });
    const totalRevenue = categories.reduce((sum, c) => sum + c.revenue, 0);

    return categories.map((c) => {
      const allocatedExpenses =
        totalRevenue > 0
          ? round2((c.revenue / totalRevenue) * overheadTotal)
          : 0;
      const netProfit = round2(c.grossProfit - allocatedExpenses);
      const margin = c.revenue > 0 ? round2((netProfit / c.revenue) * 100) : 0;
      return { ...c, allocatedExpenses, netProfit, margin };
    });
  }

  /** Real total overhead (expenses + wastage) for a date range — the figure `categoryBreakdown()` splits proportionally by revenue share. */
  private async overheadTotal(
    ids: string[],
    start: Date,
    end: Date,
  ): Promise<number> {
    const [expenseAgg, wastageMovements] = await Promise.all([
      this.prisma.expense.aggregate({
        where: { businessId: { in: ids }, incurredOn: { gte: start, lt: end } },
        _sum: { amount: true },
      }),
      this.prisma.stockMovement.findMany({
        where: { businessId: { in: ids }, kind: 'wastage', createdAt: { gte: start, lt: end } },
        select: { qty: true, unitCost: true },
      }),
    ]);
    const wastageCost = wastageMovements.reduce(
      (sum, m) => sum + Math.abs(m.qty) * Number(m.unitCost ?? 0),
      0,
    );
    return round2(Number(expenseAgg._sum.amount ?? 0) + wastageCost);
  }

  /** The requested month's real revenue/cost/net-profit plus the 5 preceding it — a real trend, not interpolated. */
  private async pnlTrend(
    ids: string[],
    month: string,
    current: Awaited<ReturnType<ProfitService['computeMonthPnl']>>,
  ) {
    const [year, mon] = month.split('-').map(Number);
    const priorMonths = Array.from(
      { length: PNL_TREND_MONTHS - 1 },
      (_, i) => {
        const offset = PNL_TREND_MONTHS - 1 - i;
        const d = new Date(Date.UTC(year, mon - 1 - offset, 1));
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      },
    );
    const priorResults = await Promise.all(
      priorMonths.map((m) => this.computeMonthPnl(ids, m)),
    );
    return [...priorResults, current].map((r) => ({
      month: r.month,
      revenue: r.revenue,
      cogs: r.cogs,
      totalExpenses: r.totalExpenses,
      wastageCost: r.wastageCost,
      netProfit: r.netProfit,
    }));
  }

  /**
   * Bundle suggestions (UPD-BE-013) — grounded entirely in real co-purchase data: which product
   * pairs actually get bought together, and how often. The AI is only ever asked to phrase a
   * short pitch for pairs the system has already found and priced (`suggestedPrice` is a plain
   * deterministic formula below, never something the AI is asked to invent) — same
   * facts-then-phrase pattern as `AiInsightsService.phraseObservations`, with the same
   * graceful-degradation fallback if the AI call fails.
   */
  async bundleSuggestions() {
    const businessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID);

    const [pairs, existingBundles] = await Promise.all([
      this.tenantPrisma.client.$queryRaw<CoPurchaseRow[]>`
        SELECT a.product_id AS product_a, b.product_id AS product_b, pa.name AS name_a, pb.name AS name_b,
               COUNT(DISTINCT a.order_id) AS together_count
        FROM order_items a
        JOIN order_items b ON a.order_id = b.order_id AND a.product_id < b.product_id
        JOIN orders o ON o.id = a.order_id
        JOIN products pa ON pa.id = a.product_id
        JOIN products pb ON pb.id = b.product_id
        WHERE o.business_id = ${businessId} AND o.status = 'completed' AND o.is_quotation = false
        GROUP BY a.product_id, b.product_id, pa.name, pb.name
        HAVING COUNT(DISTINCT a.order_id) >= ${CO_PURCHASE_MIN_COUNT}
        ORDER BY together_count DESC
        LIMIT ${BUNDLE_SUGGESTION_LIMIT * 3}
      `,
      this.tenantPrisma.client.bundle.findMany({
        include: { items: true },
      }),
    ]);

    const alreadyBundled = new Set(
      existingBundles.map((b) =>
        [...b.items.map((i) => i.productId)].sort().join('|'),
      ),
    );

    const productIds = [
      ...new Set(pairs.flatMap((p) => [p.product_a, p.product_b])),
    ];
    const products = await this.tenantPrisma.client.product.findMany({
      where: { id: { in: productIds } },
    });
    const priceById = new Map(
      products.map((p) => [p.id, Number(p.sellingPrice)]),
    );

    const candidates = pairs
      .filter(
        (pair) =>
          !alreadyBundled.has(
            [pair.product_a, pair.product_b].sort().join('|'),
          ),
      )
      .slice(0, BUNDLE_SUGGESTION_LIMIT)
      .map((pair) => {
        const priceA = priceById.get(pair.product_a) ?? 0;
        const priceB = priceById.get(pair.product_b) ?? 0;
        const combinedPrice = round2(priceA + priceB);
        const suggestedPrice = round2(
          combinedPrice * (1 - BUNDLE_DISCOUNT_RATE),
        );
        return {
          productAId: pair.product_a,
          productBId: pair.product_b,
          nameA: pair.name_a,
          nameB: pair.name_b,
          togetherCount: Number(pair.together_count),
          combinedPrice,
          suggestedPrice,
          pitch: `${pair.name_a} + ${pair.name_b} — bought together ${Number(pair.together_count)} times.`,
        };
      });

    if (candidates.length === 0) return [];

    try {
      const pitches = await this.phrasePitches(businessId, candidates);
      return candidates.map((c, i) => ({ ...c, pitch: pitches[i] || c.pitch }));
    } catch (error) {
      this.logger.warn(
        `Bundle-suggestion phrasing skipped for business ${businessId}: ${(error as Error).message}`,
      );
      return candidates;
    }
  }

  private async phrasePitches(
    businessId: string,
    candidates: {
      nameA: string;
      nameB: string;
      togetherCount: number;
      suggestedPrice: number;
    }[],
  ): Promise<string[]> {
    const factLines = candidates
      .map(
        (c, i) =>
          `${i + 1}. "${c.nameA}" + "${c.nameB}", bought together ${c.togetherCount} times, suggested bundle price ${c.suggestedPrice}`,
      )
      .join('\n');

    const prompt = [
      'You write short, upbeat one-sentence retail bundle pitches from real numbers a system has already computed.',
      'Here are the numbered candidates:',
      factLines,
      'For each numbered candidate, write exactly one short sentence (max ~20 words) suggesting the bundle,',
      'mentioning the suggested price already given.',
      'Use ONLY the numbers already given — never introduce a new number or price of your own.',
      'Reply with ONLY a JSON array of strings, one per candidate, in the same order. No other text.',
    ].join('\n');

    const raw = await this.aiInfra.complete(businessId, prompt);
    const jsonStart = raw.indexOf('[');
    const jsonEnd = raw.lastIndexOf(']');
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
      throw new Error('AI response had no JSON array');
    }
    const parsed: unknown = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    if (
      !Array.isArray(parsed) ||
      parsed.length !== candidates.length ||
      !parsed.every(
        (item) => typeof item === 'string' && item.trim().length > 0,
      )
    ) {
      throw new Error('AI response array shape mismatch');
    }
    return parsed as string[];
  }
}
