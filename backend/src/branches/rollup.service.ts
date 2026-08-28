import { NotFoundException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  BRANCH_COMPARE_DEFAULT_WEEKS,
  BRANCH_ROLLUP_DEFAULT_DAYS,
} from './branches.constants';

interface DailyCloseAgg {
  business_id: string;
  orders_count: bigint;
  revenue: string | null;
  gross_profit: string | null;
}

interface WeeklyAgg extends DailyCloseAgg {
  week_start: Date;
}

/**
 * Multi-location roll-up (BE-059). Deliberately uses the raw PrismaService,
 * not TenantPrismaService — this endpoint's entire point is reading across
 * MULTIPLE businesses (a branch group) at once, so every query scopes
 * explicitly by the resolved group of business ids rather than relying on
 * (single-tenant) CLS injection.
 */
@Injectable()
export class RollupService {
  constructor(private readonly prisma: PrismaService) {}

  /** The branch group a business belongs to: itself, its parent (if it's a branch), and all siblings. */
  private async getGroup(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!business) {
      throw new NotFoundException('Business not found');
    }
    const rootId = business.parentId ?? business.id;

    return this.prisma.business.findMany({
      where: { OR: [{ id: rootId }, { parentId: rootId }] },
      orderBy: { createdAt: 'asc' },
    });
  }

  async dashboard(
    businessId: string,
    days: number = BRANCH_ROLLUP_DEFAULT_DAYS,
  ) {
    const group = await this.getGroup(businessId);
    const ids = group.map((b) => b.id);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [rows, reviewAggs, customerCounts, creditRows] = await Promise.all([
      this.prisma.$queryRaw<DailyCloseAgg[]>`
        SELECT business_id,
               SUM(orders_count) AS orders_count,
               SUM(revenue) AS revenue,
               SUM(gross_profit) AS gross_profit
        FROM v_daily_close
        WHERE business_id IN (${Prisma.join(ids)}) AND close_date >= DATE(${since.toISOString().slice(0, 10)})
        GROUP BY business_id
      `,
      this.prisma.externalReview.groupBy({
        by: ['businessId'],
        where: { businessId: { in: ids }, createdAt: { gte: since } },
        _avg: { stars: true },
      }),
      this.prisma.customer.groupBy({
        by: ['businessId'],
        where: { businessId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<{ business_id: string; total: string | null }[]>`
        SELECT business_id, SUM(balance) AS total
        FROM v_credit_balances
        WHERE business_id IN (${Prisma.join(ids)}) AND balance > 0
        GROUP BY business_id
      `,
    ]);
    const byBusiness = new Map(rows.map((r) => [r.business_id, r]));
    const reviewAvgByBusiness = new Map(
      reviewAggs.map((r) => [r.businessId, r._avg.stars]),
    );
    const customerCountByBusiness = new Map(
      customerCounts.map((r) => [r.businessId, r._count._all]),
    );
    const creditByBusiness = new Map(
      creditRows.map((r) => [r.business_id, Number(r.total ?? 0)]),
    );

    const branches = group.map((b) => {
      const row = byBusiness.get(b.id);
      const reviewAvg = reviewAvgByBusiness.get(b.id);
      return {
        businessId: b.id,
        name: b.name,
        ordersCount: Number(row?.orders_count ?? 0),
        revenue: Number(row?.revenue ?? 0),
        grossProfit: Number(row?.gross_profit ?? 0),
        reviewAvg: reviewAvg != null ? Number(reviewAvg) : null,
        customerCount: customerCountByBusiness.get(b.id) ?? 0,
        creditOutstanding: creditByBusiness.get(b.id) ?? 0,
      };
    });

    const totals = branches.reduce(
      (acc, b) => ({
        ordersCount: acc.ordersCount + b.ordersCount,
        revenue: acc.revenue + b.revenue,
        grossProfit: acc.grossProfit + b.grossProfit,
        customerCount: acc.customerCount + b.customerCount,
        creditOutstanding: acc.creditOutstanding + b.creditOutstanding,
      }),
      {
        ordersCount: 0,
        revenue: 0,
        grossProfit: 0,
        customerCount: 0,
        creditOutstanding: 0,
      },
    );

    return { totals, branches };
  }

  async compare(
    businessId: string,
    weeks: number = BRANCH_COMPARE_DEFAULT_WEEKS,
  ) {
    const group = await this.getGroup(businessId);
    const ids = group.map((b) => b.id);
    const since = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.$queryRaw<WeeklyAgg[]>`
      SELECT business_id,
             DATE_SUB(close_date, INTERVAL WEEKDAY(close_date) DAY) AS week_start,
             SUM(orders_count) AS orders_count,
             SUM(revenue) AS revenue,
             SUM(gross_profit) AS gross_profit
      FROM v_daily_close
      WHERE business_id IN (${Prisma.join(ids)}) AND close_date >= DATE(${since.toISOString().slice(0, 10)})
      GROUP BY business_id, week_start
      ORDER BY week_start ASC
    `;

    return group.map((b) => ({
      businessId: b.id,
      name: b.name,
      weeks: rows
        .filter((r) => r.business_id === b.id)
        .map((r) => ({
          weekStart: r.week_start.toISOString().slice(0, 10),
          ordersCount: Number(r.orders_count),
          revenue: Number(r.revenue),
          grossProfit: Number(r.gross_profit),
        })),
    }));
  }
}
