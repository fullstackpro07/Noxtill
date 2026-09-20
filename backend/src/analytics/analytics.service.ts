import { HttpStatus, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { BranchScopeService } from '../common/tenancy/branch-scope.service';
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
  role: string;
  total: string;
  orders: bigint;
}

interface NoShowRow {
  staff_user_id: string;
  no_shows: bigint;
}

interface AppointmentCountRow {
  staff_user_id: string;
  appointments: bigint;
}

/** Analytics/KPI endpoints (BE-071) — every method is tenant-scoped via CLS, same as ProfitService. */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
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

  /** Business Overview chart fix-it: the design's 3-series overlay (Sales/Orders/Bookings) only
   * ever had real per-day data for Sales — `revenueSeries()` above already carries real per-day
   * Orders too (`orders_count`), but there was no real per-day Bookings series anywhere. This is
   * a straightforward day-bucketed count of real appointments, not cancelled, by `startsAt` date —
   * no new view needed since `Appointment.startsAt` already indexes on `[businessId, startsAt]`. */
  async bookingsSeries(days = 30) {
    const businessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const appointments = await this.tenantPrisma.client.appointment.findMany({
      where: {
        businessId,
        startsAt: { gte: since },
        status: { not: 'cancelled' },
      },
      select: { startsAt: true },
    });

    const counts = new Map<string, number>();
    for (const a of appointments) {
      const key = a.startsAt.toISOString().slice(0, 10);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const result: { date: string; bookings: number }[] = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      result.push({ date: key, bookings: counts.get(key) ?? 0 });
    }
    return result;
  }

  /** Monthly-signup-cohort retention: % of each cohort with >=1 order in each month since signup. */
  async cohorts(businessId: string, branchId?: string) {
    const ids = await this.branchScope.resolveIds(businessId, branchId);
    const client = this.prisma;

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
          where: { businessId: { in: ids }, createdAt: { gte: cohortStart, lt: cohortEnd } },
          select: { id: true, lifetimeSpend: true },
        });
        const customerIds = cohortCustomers.map((c) => c.id);
        const cohortSize = customerIds.length;
        // Real lifetime revenue from this cohort's own customers (all-time, not just this month).
        const revenue = round2(
          cohortCustomers.reduce((sum, c) => sum + Number(c.lifetimeSpend), 0),
        );

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
              businessId: { in: ids },
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
          revenue,
        };
      }),
    );

    return cohorts;
  }

  /**
   * Customer Analytics' "New vs returning" chart (UPD-BE-113): for each of `monthsBack` months, a
   * real distinct-customer split among customers who actually bought that month — "new" is a
   * customer whose earliest-ever completed order falls in that month, "returning" is an
   * active-that-month customer whose earliest order was earlier. A single global
   * first-order-per-customer map avoids N+1 queries across the months.
   */
  private async computeNewVsReturning(ids: string[], monthsBack: number) {
    const client = this.prisma;
    const monthStarts = Array.from({ length: monthsBack }, (_, i) =>
      startOfMonth(monthsBack - 1 - i),
    );
    const rangeStart = monthStarts[0];

    const [firstOrders, ordersInRange] = await Promise.all([
      client.order.groupBy({
        by: ['customerId'],
        where: {
          businessId: { in: ids },
          status: OrderStatus.completed,
          isQuotation: false,
          customerId: { not: null },
        },
        _min: { createdAt: true },
      }),
      client.order.findMany({
        where: {
          businessId: { in: ids },
          status: OrderStatus.completed,
          isQuotation: false,
          customerId: { not: null },
          createdAt: { gte: rangeStart },
        },
        select: { customerId: true, createdAt: true },
      }),
    ]);

    const firstOrderByCustomer = new Map(
      firstOrders
        .filter((r) => r.customerId && r._min.createdAt)
        .map((r) => [r.customerId as string, r._min.createdAt as Date]),
    );

    return monthStarts.map((start) => {
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
      const activeCustomerIds = new Set(
        ordersInRange
          .filter((o) => o.createdAt >= start && o.createdAt < end)
          .map((o) => o.customerId as string),
      );
      let newCount = 0;
      let returningCount = 0;
      for (const customerId of activeCustomerIds) {
        const firstOrder = firstOrderByCustomer.get(customerId);
        if (firstOrder && firstOrder >= start && firstOrder < end) newCount += 1;
        else returningCount += 1;
      }
      return { month: start.toISOString().slice(0, 7), newCount, returningCount };
    });
  }

  async newVsReturningByMonth(businessId: string, branchId?: string) {
    const ids = await this.branchScope.resolveIds(businessId, branchId);
    return this.computeNewVsReturning(ids, COHORT_MONTHS_BACK);
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
  /**
   * Staff module v2 (UPD-BE-STAFF-08): `month` ("YYYY-MM") lets a caller ask for an arbitrary past
   * month instead of always "this month so far" — omitted keeps the original behavior exactly
   * (current month, no upper bound needed since nothing dated in the future exists yet). An
   * explicit past month gets a real upper bound too, so it can never leak into the following
   * month's data. `reviewMentionCount` stays all-time regardless — see its own read below.
   */
  async staff(businessId: string, branchId?: string, month?: string) {
    const ids = await this.branchScope.resolveIds(businessId, branchId);
    const { since, until } = this.staffMonthRange(month);

    const [salesRows, noShowRows, appointmentRows] = await Promise.all([
      this.prisma.$queryRaw<StaffRow[]>`
        SELECT bu.id AS staff_user_id, u.name, bu.role, SUM(o.total) AS total, COUNT(*) AS orders
        FROM orders o
        JOIN business_users bu ON bu.id = o.staff_user_id
        JOIN users u ON u.id = bu.user_id
        WHERE o.business_id IN (${Prisma.join(ids)}) AND o.status = 'completed' AND o.is_quotation = false AND o.created_at >= ${since} AND o.created_at < ${until}
        GROUP BY bu.id, u.name, bu.role
        ORDER BY total DESC
      `,
      this.prisma.$queryRaw<NoShowRow[]>`
        SELECT staff_user_id, COUNT(*) AS no_shows
        FROM appointments
        WHERE business_id IN (${Prisma.join(ids)}) AND status = 'no_show' AND staff_user_id IS NOT NULL AND starts_at >= ${since} AND starts_at < ${until}
        GROUP BY staff_user_id
      `,
      // Every real appointment on the books this period, regardless of status — the Staff
      // Analytics table's "Appointments" column, distinct from the no-shows already broken out.
      this.prisma.$queryRaw<AppointmentCountRow[]>`
        SELECT staff_user_id, COUNT(*) AS appointments
        FROM appointments
        WHERE business_id IN (${Prisma.join(ids)}) AND staff_user_id IS NOT NULL AND starts_at >= ${since} AND starts_at < ${until}
        GROUP BY staff_user_id
      `,
    ]);

    const noShowByStaff = new Map(
      noShowRows.map((r) => [r.staff_user_id, Number(r.no_shows)]),
    );
    const appointmentsByStaff = new Map(
      appointmentRows.map((r) => [r.staff_user_id, Number(r.appointments)]),
    );

    return Promise.all(
      salesRows.map(async (r) => {
        const totalSales = round2(Number(r.total));
        const orders = Number(r.orders);
        const reviewMentions = await this.prisma.externalReview.count({
          where: { businessId: { in: ids }, text: { contains: r.name } },
        });
        return {
          staffUserId: r.staff_user_id,
          name: r.name,
          role: r.role,
          totalSales,
          orders,
          avgTicketSize: orders > 0 ? round2(totalSales / orders) : 0,
          noShowCount: noShowByStaff.get(r.staff_user_id) ?? 0,
          appointmentsCount: appointmentsByStaff.get(r.staff_user_id) ?? 0,
          reviewMentionCount: reviewMentions,
        };
      }),
    );
  }

  private staffMonthRange(month?: string): { since: Date; until: Date } {
    if (month) {
      const [year, mon] = month.split('-').map(Number);
      return {
        since: new Date(Date.UTC(year, mon - 1, 1)),
        until: new Date(Date.UTC(year, mon, 1)),
      };
    }
    const since = startOfMonth();
    return {
      since,
      until: new Date(
        Date.UTC(since.getUTCFullYear(), since.getUTCMonth() + 1, 1),
      ),
    };
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
  async customerSummary(businessId: string, branchId?: string) {
    const ids = await this.branchScope.resolveIds(businessId, branchId);
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    // `atRiskCount` deliberately stays scoped to the caller's own business only, not the resolved
    // branch group: `SegmentsService` (shared with Marketing's Audiences feature) has no
    // multi-business concept, and giving it one is a larger change than this screen's branch
    // filter warrants. Every other figure below respects the real branch selection.
    const [lapsedSegment, customers, newThisMonth] = await Promise.all([
      this.segments.getSegment('lapsed'),
      this.prisma.customer.findMany({
        where: { businessId: { in: ids } },
        select: { id: true, visitCount: true, lifetimeSpend: true },
      }),
      // Same real "signed up this calendar month" definition `cohorts()` uses for a cohort's own
      // size (UPD-BE-113b) — before this, "New Customers" used a different, unrelated window
      // (signed up in the trailing 30 days), which didn't line up with the "New vs returning"
      // chart's current-month bar directly below it on the same screen.
      this.prisma.customer.count({
        where: { businessId: { in: ids }, createdAt: { gte: monthStart, lt: monthEnd } },
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
      newCount: newThisMonth,
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

  /** UPD-FE-098's cohort-table drill-down — the real customers behind one cohort month's %. Takes
   * the same businessId/branchId as `cohorts()` so drilling into a cohort computed under a
   * specific branch selection shows that branch's own customers, not a different scope. */
  async cohortCustomers(
    businessId: string,
    cohortMonth: string,
    branchId?: string,
  ) {
    const ids = await this.branchScope.resolveIds(businessId, branchId);
    const [year, month] = cohortMonth.split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));

    return this.prisma.customer.findMany({
      where: { businessId: { in: ids }, createdAt: { gte: start, lt: end } },
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
