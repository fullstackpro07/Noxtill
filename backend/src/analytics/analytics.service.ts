import { HttpStatus, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { SegmentsService } from '../customers/segments.service';
import { SendGateService } from '../messaging/send-gate.service';
import { AppException } from '../common/filters/app.exception';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import {
  CAMPAIGN_TEMPLATE_KEY,
  MARKETING_ERROR_CODES,
} from '../marketing/marketing.constants';
import { OrderStatus, Prisma } from '@prisma/client';

const COHORT_MONTHS_BACK = 6;
const COHORT_RELATIVE_MONTHS = 6;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function startOfMonth(monthsAgo = 0): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - monthsAgo, 1));
}

interface RevenueSeriesRow {
  close_date: Date;
  orders_count: bigint;
  revenue: string | null;
  gross_profit: string | null;
}

interface CampaignRow {
  id: string;
  segment: string;
  sent_count: number;
  delivered: bigint;
  read_count: bigint;
  failed: bigint;
}

interface StaffRow {
  staff_user_id: string;
  name: string;
  total: string;
  orders: bigint;
}

interface NoShowRow {
  staff_user_id: string;
  no_shows: bigint;
}

/** Analytics/KPI endpoints (BE-071) — every method is tenant-scoped via CLS, same as ProfitService. */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cls: ClsService,
    private readonly segments: SegmentsService,
    private readonly sendGate: SendGateService,
  ) {}

  async kpis() {
    const client = this.tenantPrisma.client;
    const since = startOfMonth();

    const [orderAgg, newCustomers, appointmentsBooked, reviewsAvg] =
      await Promise.all([
        client.order.aggregate({
          where: {
            status: OrderStatus.completed,
            isQuotation: false,
            createdAt: { gte: since },
          },
          _sum: { total: true, cogs: true },
          _count: true,
        }),
        client.customer.count({ where: { createdAt: { gte: since } } }),
        client.appointment.count({ where: { createdAt: { gte: since } } }),
        client.externalReview.aggregate({ _avg: { stars: true } }),
      ]);

    const revenue = Number(orderAgg._sum.total ?? 0);
    const cogs = Number(orderAgg._sum.cogs ?? 0);

    return {
      revenueThisMonth: round2(revenue),
      grossProfitThisMonth: round2(revenue - cogs),
      ordersThisMonth: orderAgg._count,
      avgOrderValue:
        orderAgg._count > 0 ? round2(revenue / orderAgg._count) : 0,
      newCustomersThisMonth: newCustomers,
      appointmentsBookedThisMonth: appointmentsBooked,
      reviewsAverage: reviewsAvg._avg.stars
        ? round2(Number(reviewsAvg._avg.stars))
        : null,
    };
  }

  async revenueSeries(days = 30) {
    const businessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await this.tenantPrisma.client.$queryRaw<RevenueSeriesRow[]>`
      SELECT close_date, orders_count, revenue, gross_profit
      FROM v_daily_close
      WHERE business_id = ${businessId} AND close_date >= ${since}
      ORDER BY close_date ASC
    `;

    return rows.map((r) => ({
      date: r.close_date.toISOString().slice(0, 10),
      orders: Number(r.orders_count),
      revenue: round2(Number(r.revenue ?? 0)),
      grossProfit: round2(Number(r.gross_profit ?? 0)),
    }));
  }

  /** Monthly-signup-cohort retention: % of each cohort with >=1 order in each month since signup. */
  async cohorts() {
    const client = this.tenantPrisma.client;

    const cohortStarts = Array.from({ length: COHORT_MONTHS_BACK }, (_, i) =>
      startOfMonth(COHORT_MONTHS_BACK - 1 - i),
    );

    const cohorts = await Promise.all(
      cohortStarts.map(async (cohortStart) => {
        const cohortEnd = new Date(
          Date.UTC(
            cohortStart.getUTCFullYear(),
            cohortStart.getUTCMonth() + 1,
            1,
          ),
        );
        const cohortCustomers = await client.customer.findMany({
          where: { createdAt: { gte: cohortStart, lt: cohortEnd } },
          select: { id: true },
        });
        const customerIds = cohortCustomers.map((c) => c.id);
        const cohortSize = customerIds.length;

        const retention: number[] = [];
        for (let m = 0; m < COHORT_RELATIVE_MONTHS; m++) {
          const windowStart = new Date(
            Date.UTC(
              cohortStart.getUTCFullYear(),
              cohortStart.getUTCMonth() + m,
              1,
            ),
          );
          const windowEnd = new Date(
            Date.UTC(
              cohortStart.getUTCFullYear(),
              cohortStart.getUTCMonth() + m + 1,
              1,
            ),
          );
          if (windowStart > new Date() || cohortSize === 0) {
            retention.push(0);
            continue;
          }
          const activeCount = await client.order.groupBy({
            by: ['customerId'],
            where: {
              customerId: { in: customerIds },
              createdAt: { gte: windowStart, lt: windowEnd },
              status: OrderStatus.completed,
            },
          });
          retention.push(
            cohortSize > 0
              ? round2((activeCount.length / cohortSize) * 100)
              : 0,
          );
        }

        return {
          cohortMonth: cohortStart.toISOString().slice(0, 7),
          size: cohortSize,
          retention,
        };
      }),
    );

    return cohorts;
  }

  async campaigns() {
    const businessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID);

    const rows = await this.tenantPrisma.client.$queryRaw<CampaignRow[]>`
      SELECT
        c.id, c.segment, c.sent_count,
        SUM(CASE WHEN m.status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
        SUM(CASE WHEN m.status = 'read' THEN 1 ELSE 0 END) AS read_count,
        SUM(CASE WHEN m.status = 'failed' THEN 1 ELSE 0 END) AS failed
      FROM campaigns c
      LEFT JOIN messages m ON m.campaign_id = c.id
      WHERE c.business_id = ${businessId}
      GROUP BY c.id, c.segment, c.sent_count
      ORDER BY c.created_at DESC
    `;

    return rows.map((r) => ({
      campaignId: r.id,
      segment: r.segment,
      sent: r.sent_count,
      delivered: Number(r.delivered),
      read: Number(r.read_count),
      failed: Number(r.failed),
    }));
  }

  /** UPD-BE-108: extends the original name/sales/orders shape with avg ticket size (derived),
   * real no-show counts (from `Appointment.status`), and an approximate review-mention count
   * (case-insensitive substring match of the staff member's name in real review text — there's no
   * structured staff-tagging on reviews in this schema, so this is disclosed as approximate, never
   * claimed exact). Grouped by `bu.id` now, not `u.name` — two staff sharing a name used to
   * silently merge into one row. */
  async staff() {
    const businessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID);
    const since = startOfMonth();

    const [salesRows, noShowRows] = await Promise.all([
      this.tenantPrisma.client.$queryRaw<StaffRow[]>`
        SELECT bu.id AS staff_user_id, u.name, SUM(o.total) AS total, COUNT(*) AS orders
        FROM orders o
        JOIN business_users bu ON bu.id = o.staff_user_id
        JOIN users u ON u.id = bu.user_id
        WHERE o.business_id = ${businessId} AND o.status = 'completed' AND o.is_quotation = false AND o.created_at >= ${since}
        GROUP BY bu.id, u.name
        ORDER BY total DESC
      `,
      this.tenantPrisma.client.$queryRaw<NoShowRow[]>`
        SELECT staff_user_id, COUNT(*) AS no_shows
        FROM appointments
        WHERE business_id = ${businessId} AND status = 'no_show' AND staff_user_id IS NOT NULL AND starts_at >= ${since}
        GROUP BY staff_user_id
      `,
    ]);

    const noShowByStaff = new Map(
      noShowRows.map((r) => [r.staff_user_id, Number(r.no_shows)]),
    );

    return Promise.all(
      salesRows.map(async (r) => {
        const totalSales = round2(Number(r.total));
        const orders = Number(r.orders);
        const reviewMentions =
          await this.tenantPrisma.client.externalReview.count({
            where: { text: { contains: r.name } },
          });
        return {
          staffUserId: r.staff_user_id,
          name: r.name,
          totalSales,
          orders,
          avgTicketSize: orders > 0 ? round2(totalSales / orders) : 0,
          noShowCount: noShowByStaff.get(r.staff_user_id) ?? 0,
          reviewMentionCount: reviewMentions,
        };
      }),
    );
  }

  async channels(days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const groups = await this.tenantPrisma.client.message.groupBy({
      by: ['channel', 'status'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    });

    const byChannel = new Map<string, Record<string, number>>();
    for (const g of groups) {
      const bucket = byChannel.get(g.channel) ?? {};
      bucket[g.status] = g._count._all;
      byChannel.set(g.channel, bucket);
    }
    return Object.fromEntries(byChannel);
  }

  /** UPD-FE-098: new/returning/retention/LTV/at-risk — all from real, already-stored fields
   * (`Customer.visitCount`/`lifetimeSpend`, and the real `Lapsed` tag `CrmJobsProcessor` already
   * maintains — reused via `SegmentsService`, not a re-derived "days since last visit" guess that
   * could disagree with what the Customers screen shows for the same customer). */
  async customerSummary() {
    const [newSegment, lapsedSegment, customers] = await Promise.all([
      this.segments.getSegment('new'),
      this.segments.getSegment('lapsed'),
      this.tenantPrisma.client.customer.findMany({
        select: { id: true, visitCount: true, lifetimeSpend: true },
      }),
    ]);

    const withVisit = customers.filter((c) => c.visitCount >= 1);
    const returning = customers.filter((c) => c.visitCount > 1);
    const retentionRate =
      withVisit.length > 0
        ? round2((returning.length / withVisit.length) * 100)
        : 0;

    const spends = customers
      .map((c) => Number(c.lifetimeSpend))
      .sort((a, b) => a - b);
    const avgLTV = spends.length
      ? round2(spends.reduce((sum, v) => sum + v, 0) / spends.length)
      : 0;

    return {
      totalCustomers: customers.length,
      newCount: newSegment.count,
      returningCount: returning.length,
      retentionRate,
      avgLTV,
      ltvDistribution: this.buildLtvQuartiles(spends),
      atRiskCount: lapsedSegment.count,
    };
  }

  /** Real percentile-based buckets (not fixed currency amounts, which would be meaningless across
   * businesses using different currencies) — quartiles of this business's own real LTV spread. */
  private buildLtvQuartiles(sortedSpends: number[]) {
    if (sortedSpends.length === 0) return [];
    const quartileLabels = ['Bottom 25%', '25–50%', '50–75%', 'Top 25%'];
    const size = Math.ceil(sortedSpends.length / 4);
    return quartileLabels.map((label, i) => {
      const bucket = sortedSpends.slice(i * size, (i + 1) * size);
      return {
        label,
        count: bucket.length,
        minLtv: bucket.length ? round2(bucket[0]) : 0,
        maxLtv: bucket.length ? round2(bucket[bucket.length - 1]) : 0,
      };
    });
  }

  /** UPD-FE-098's cohort-table drill-down — the real customers behind one cohort month's %. */
  async cohortCustomers(cohortMonth: string) {
    const [year, month] = cohortMonth.split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));

    return this.tenantPrisma.client.customer.findMany({
      where: { createdAt: { gte: start, lt: end } },
      select: {
        id: true,
        name: true,
        phone: true,
        lifetimeSpend: true,
        visitCount: true,
        lastVisitAt: true,
      },
      orderBy: { lifetimeSpend: 'desc' },
    });
  }

  /** UPD-FE-098's "message at-risk customers" — same quota-checked segment-send shape as
   * `DeadHoursOfferService.send` (can't share the service directly without a cross-module
   * dependency neither module currently has reason to take on), scoped to the real `lapsed`
   * segment. */
  async messageAtRisk(offerText: string) {
    const businessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID);
    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
    });

    const { members } = await this.segments.getSegment('lapsed');
    const eligible = members.filter((m) => !m.optedOut);
    if (eligible.length === 0) {
      throw new AppException(
        MARKETING_ERROR_CODES.EMPTY_SEGMENT,
        'No reachable (non-opted-out) at-risk customers right now',
        HttpStatus.BAD_REQUEST,
      );
    }

    const remainingQuota = business.msgQuota - business.msgUsed;
    if (eligible.length > remainingQuota) {
      throw new AppException(
        MARKETING_ERROR_CODES.QUOTA_EXCEEDED,
        `This send needs ${eligible.length} messages but only ${remainingQuota} remain this month`,
        HttpStatus.FORBIDDEN,
      );
    }

    const campaign = await this.tenantPrisma.client.campaign.create({
      data: {
        segment: 'lapsed',
        templateKey: CAMPAIGN_TEMPLATE_KEY,
        body: offerText,
      } as Prisma.CampaignUncheckedCreateInput,
    });

    let sentCount = 0;
    for (const customer of eligible) {
      const personalizedBody = offerText.replace(
        /{{\s*customerName\s*}}/g,
        customer.name,
      );
      await this.sendGate
        .send({
          businessId,
          customerId: customer.id,
          templateKey: CAMPAIGN_TEMPLATE_KEY,
          variables: { body: personalizedBody },
          campaignId: campaign.id,
        })
        .then(() => {
          sentCount += 1;
        })
        .catch(() => undefined);
    }

    return this.tenantPrisma.client.campaign.update({
      where: { id: campaign.id },
      data: { sentCount },
    });
  }
}
