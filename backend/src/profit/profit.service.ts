import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { HourlyRow, ProductProfitRow, WeekdayRow } from './profit.types';

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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Profit & Loss analytics (BE-036/BE-037), computed from completed, non-quotation orders. */
@Injectable()
export class ProfitService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cls: ClsService,
  ) {}

  async byProduct(windowDays: 30 | 90 = 30) {
    const businessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID);
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const rows = await this.tenantPrisma.client.$queryRaw<ProductProfitRow[]>`
      SELECT oi.product_id, p.name, SUM(oi.qty) AS units, SUM(oi.price * oi.qty) AS revenue, SUM(oi.cost * oi.qty) AS cost
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN products p ON p.id = oi.product_id
      WHERE o.business_id = ${businessId} AND o.status = 'completed' AND o.is_quotation = false AND o.created_at >= ${since}
      GROUP BY oi.product_id, p.name
      ORDER BY revenue DESC
    `;

    const products = rows.map((row) => {
      const revenue = Number(row.revenue);
      const cost = Number(row.cost);
      const profit = round2(revenue - cost);
      const margin = revenue > 0 ? round2((profit / revenue) * 100) : 0;
      return {
        productId: row.product_id,
        name: row.name,
        units: Number(row.units),
        revenue: round2(revenue),
        cost: round2(cost),
        profit,
        margin,
        reviewPricing: margin < LOW_MARGIN_THRESHOLD,
        isTopPerformer: false,
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

  async byTime() {
    const businessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID);

    const [hourlyRows, weekdayRows] = await Promise.all([
      this.tenantPrisma.client.$queryRaw<HourlyRow[]>`
        SELECT EXTRACT(HOUR FROM created_at)::int AS hour, SUM(total) AS revenue
        FROM orders
        WHERE business_id = ${businessId} AND status = 'completed' AND is_quotation = false
        GROUP BY hour
        ORDER BY hour
      `,
      this.tenantPrisma.client.$queryRaw<WeekdayRow[]>`
        SELECT EXTRACT(DOW FROM created_at)::int AS dow, SUM(total) AS revenue
        FROM orders
        WHERE business_id = ${businessId} AND status = 'completed' AND is_quotation = false
        GROUP BY dow
        ORDER BY dow
      `,
    ]);

    const hourly = hourlyRows.map((row) => ({
      hour: row.hour,
      revenue: round2(Number(row.revenue)),
    }));
    const weekday = weekdayRows.map((row) => ({
      day: WEEKDAY_NAMES[row.dow],
      revenue: round2(Number(row.revenue)),
    }));

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

  /** GET /profit/pnl?month — revenue − COGS − expenses (by category) = net (BE-037). */
  async pnl(month: string) {
    const [year, mon] = month.split('-').map(Number);
    const start = new Date(Date.UTC(year, mon - 1, 1));
    const end = new Date(Date.UTC(year, mon, 1));

    const [orderTotals, expensesByCategory] = await Promise.all([
      this.tenantPrisma.client.order.aggregate({
        where: {
          status: 'completed',
          isQuotation: false,
          createdAt: { gte: start, lt: end },
        },
        _sum: { total: true, cogs: true },
      }),
      this.tenantPrisma.client.expense.groupBy({
        by: ['category'],
        where: { incurredOn: { gte: start, lt: end } },
        _sum: { amount: true },
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
    const netProfit = round2(revenue - cogs - totalExpenses);

    return {
      month,
      revenue,
      cogs,
      expenses: expenseBreakdown,
      totalExpenses,
      netProfit,
    };
  }
}
