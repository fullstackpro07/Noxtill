import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AppointmentStatus,
  FeedbackStatus,
  MessageStatus,
  OrderStatus,
  Role,
} from '../../generated/prisma';
import { WidgetCategory } from './widgets.constants';

export interface WidgetContext {
  businessId: string;
  tenantPrisma: TenantPrismaService;
  /** Trailing-day window for range-aware widgets (the "(this month)" ones) — undefined means "this calendar month", the original default. */
  days?: number;
  /** Plain (non-tenant) Prisma client — only used by the assistant's search_help_docs tool to query the global help_articles table; every widget resolver ignores it. */
  prisma?: PrismaService;
}

export interface WidgetDefinition {
  key: string;
  title: string;
  category: WidgetCategory;
  resolve(ctx: WidgetContext): Promise<unknown>;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function startOfToday(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** No `days` (dashboard's default) keeps the original calendar-month behavior; an explicit range uses a trailing N-day window instead. */
function startOfRange(days?: number): Date {
  if (!days) return startOfMonth();
  const start = startOfToday();
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return start;
}

/**
 * Widget registry (BE-067): every widget is independently fetchable
 * (`GET /widgets/:key`) and describable (`GET /widgets/registry`) without
 * exposing data — `resolve` only runs when a specific widget is requested,
 * and its result is what gets cached for WIDGET_CACHE_TTL_MS.
 */
export const WIDGET_REGISTRY: WidgetDefinition[] = [
  {
    key: 'revenue_today',
    title: "Today's Revenue",
    category: 'sales',
    async resolve({ tenantPrisma }) {
      const since = startOfToday();
      const agg = await tenantPrisma.client.order.aggregate({
        where: {
          status: OrderStatus.completed,
          isQuotation: false,
          createdAt: { gte: since },
        },
        _sum: { total: true },
        _count: true,
      });
      return {
        revenue: round2(Number(agg._sum.total ?? 0)),
        orders: agg._count,
      };
    },
  },
  {
    key: 'orders_today',
    title: "Today's Orders",
    category: 'sales',
    async resolve({ tenantPrisma }) {
      const since = startOfToday();
      const count = await tenantPrisma.client.order.count({
        where: { isQuotation: false, createdAt: { gte: since } },
      });
      return { count };
    },
  },
  {
    key: 'avg_order_value_month',
    title: 'Average Order Value (this month)',
    category: 'sales',
    async resolve({ tenantPrisma, days }) {
      const since = startOfRange(days);
      const agg = await tenantPrisma.client.order.aggregate({
        where: {
          status: OrderStatus.completed,
          isQuotation: false,
          createdAt: { gte: since },
        },
        _sum: { total: true },
        _count: true,
      });
      const total = Number(agg._sum.total ?? 0);
      return { average: agg._count > 0 ? round2(total / agg._count) : 0 };
    },
  },
  {
    key: 'revenue_this_month',
    title: 'Revenue (this month)',
    category: 'sales',
    async resolve({ tenantPrisma, days }) {
      const since = startOfRange(days);
      const agg = await tenantPrisma.client.order.aggregate({
        where: {
          status: OrderStatus.completed,
          isQuotation: false,
          createdAt: { gte: since },
        },
        _sum: { total: true, cogs: true },
      });
      const revenue = Number(agg._sum.total ?? 0);
      const cogs = Number(agg._sum.cogs ?? 0);
      return { revenue: round2(revenue), grossProfit: round2(revenue - cogs) };
    },
  },
  {
    key: 'top_products_month',
    title: 'Top Products (this month)',
    category: 'sales',
    async resolve({ businessId, tenantPrisma, days }) {
      const since = startOfRange(days);
      const rows = await tenantPrisma.client.$queryRaw<
        { name: string; units: bigint; revenue: string }[]
      >`
        SELECT p.name, SUM(oi.qty) AS units, SUM(oi.price * oi.qty) AS revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN products p ON p.id = oi.product_id
        WHERE o.business_id = ${businessId} AND o.status = 'completed' AND o.is_quotation = false AND o.created_at >= ${since}
        GROUP BY p.name
        ORDER BY revenue DESC
        LIMIT 5
      `;
      return rows.map((r) => ({
        name: r.name,
        units: Number(r.units),
        revenue: round2(Number(r.revenue)),
      }));
    },
  },
  {
    key: 'expenses_this_month',
    title: 'Expenses (this month)',
    category: 'sales',
    async resolve({ tenantPrisma, days }) {
      const since = startOfRange(days);
      const agg = await tenantPrisma.client.expense.aggregate({
        where: { incurredOn: { gte: since } },
        _sum: { amount: true },
      });
      return { total: round2(Number(agg._sum.amount ?? 0)) };
    },
  },
  {
    key: 'low_stock_count',
    title: 'Low Stock Items',
    category: 'inventory',
    async resolve({ tenantPrisma }) {
      const products = await tenantPrisma.client.product.findMany({
        where: { active: true },
        select: { stockQty: true, lowStockThreshold: true },
      });
      const count = products.filter(
        (p) => p.stockQty <= p.lowStockThreshold,
      ).length;
      return { count };
    },
  },
  {
    key: 'credit_outstanding',
    title: 'Credit Outstanding',
    category: 'credit',
    async resolve({ businessId, tenantPrisma }) {
      const rows = await tenantPrisma.client.$queryRaw<
        { total: string | null }[]
      >`
        SELECT SUM(balance) AS total FROM v_credit_balances WHERE business_id = ${businessId} AND balance > 0
      `;
      return { total: round2(Number(rows[0]?.total ?? 0)) };
    },
  },
  {
    key: 'upcoming_appointments',
    title: 'Upcoming Appointments (next 7 days)',
    category: 'bookings',
    async resolve({ tenantPrisma }) {
      const now = new Date();
      const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const count = await tenantPrisma.client.appointment.count({
        where: {
          startsAt: { gte: now, lte: in7Days },
          status: {
            in: [AppointmentStatus.booked, AppointmentStatus.confirmed],
          },
        },
      });
      return { count };
    },
  },
  {
    key: 'no_show_rate_month',
    title: 'No-show Rate (this month)',
    category: 'bookings',
    async resolve({ tenantPrisma, days }) {
      const since = startOfRange(days);
      const [total, noShows] = await Promise.all([
        tenantPrisma.client.appointment.count({
          where: {
            startsAt: { gte: since },
            status: {
              in: [AppointmentStatus.completed, AppointmentStatus.no_show],
            },
          },
        }),
        tenantPrisma.client.appointment.count({
          where: {
            startsAt: { gte: since },
            status: AppointmentStatus.no_show,
          },
        }),
      ]);
      return { rate: total > 0 ? round2((noShows / total) * 100) : 0 };
    },
  },
  {
    key: 'reviews_average',
    title: 'Average Review Rating',
    category: 'reviews',
    async resolve({ tenantPrisma }) {
      const agg = await tenantPrisma.client.externalReview.aggregate({
        _avg: { stars: true },
      });
      return {
        average: agg._avg.stars ? round2(Number(agg._avg.stars)) : null,
      };
    },
  },
  {
    key: 'open_complaints',
    title: 'Open Private Complaints',
    category: 'reviews',
    async resolve({ tenantPrisma }) {
      const count = await tenantPrisma.client.privateFeedback.count({
        where: { status: FeedbackStatus.open },
      });
      return { count };
    },
  },
  {
    key: 'pending_review_requests',
    title: 'Pending Review Requests',
    category: 'reviews',
    async resolve({ tenantPrisma }) {
      const count = await tenantPrisma.client.reviewRequest.count({
        where: { respondedAt: null },
      });
      return { count };
    },
  },
  {
    key: 'campaign_performance_month',
    title: 'Campaign Performance (this month)',
    category: 'marketing',
    async resolve({ tenantPrisma, days }) {
      const since = startOfRange(days);
      const campaigns = await tenantPrisma.client.campaign.findMany({
        where: { createdAt: { gte: since } },
        select: { id: true, sentCount: true },
      });
      const totalSent = campaigns.reduce((sum, c) => sum + c.sentCount, 0);
      return { campaignCount: campaigns.length, totalSent };
    },
  },
  {
    key: 'referral_count',
    title: 'Customers Referred',
    category: 'marketing',
    async resolve({ tenantPrisma }) {
      const count = await tenantPrisma.client.customer.count({
        where: { referredByCustomerId: { not: null } },
      });
      return { count };
    },
  },
  {
    key: 'competitor_comparison',
    title: 'Competitor Ratings',
    category: 'marketing',
    async resolve({ tenantPrisma }) {
      const competitors = await tenantPrisma.client.competitor.findMany({
        select: { platformRef: true, lastRating: true, lastReviewsCount: true },
      });
      return competitors.map((c) => ({
        platformRef: c.platformRef,
        rating: c.lastRating ? Number(c.lastRating) : null,
        reviewsCount: c.lastReviewsCount,
      }));
    },
  },
  {
    key: 'staff_leaderboard_month',
    title: 'Staff Sales Leaderboard (this month)',
    category: 'staff',
    async resolve({ businessId, tenantPrisma, days }) {
      const since = startOfRange(days);
      const rows = await tenantPrisma.client.$queryRaw<
        { name: string; total: string }[]
      >`
        SELECT u.name, SUM(o.total) AS total
        FROM orders o
        JOIN business_users bu ON bu.id = o.staff_user_id
        JOIN users u ON u.id = bu.user_id
        WHERE o.business_id = ${businessId} AND o.status = 'completed' AND o.is_quotation = false AND o.created_at >= ${since}
        GROUP BY u.name
        ORDER BY total DESC
        LIMIT 5
      `;
      return rows.map((r) => ({
        name: r.name,
        total: round2(Number(r.total)),
      }));
    },
  },
  {
    key: 'staff_count',
    title: 'Team Size',
    category: 'staff',
    async resolve({ tenantPrisma }) {
      const count = await tenantPrisma.client.businessUser.count({
        where: { role: { in: [Role.manager, Role.staff] } },
      });
      return { count };
    },
  },
  {
    key: 'message_quota_usage',
    title: 'Message Quota Usage',
    category: 'messaging',
    async resolve({ businessId, tenantPrisma }) {
      const business = await tenantPrisma.client.business.findUniqueOrThrow({
        where: { id: businessId },
      });
      return {
        used: business.msgUsed,
        quota: business.msgQuota,
        percent:
          business.msgQuota > 0
            ? round2((business.msgUsed / business.msgQuota) * 100)
            : 0,
      };
    },
  },
  {
    key: 'channel_breakdown_month',
    title: 'Messages by Channel (this month)',
    category: 'messaging',
    async resolve({ tenantPrisma, days }) {
      const since = startOfRange(days);
      const groups = await tenantPrisma.client.message.groupBy({
        by: ['channel'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      });
      return Object.fromEntries(groups.map((g) => [g.channel, g._count._all]));
    },
  },
  {
    key: 'delivery_rate_month',
    title: 'Message Delivery Rate (this month)',
    category: 'messaging',
    async resolve({ tenantPrisma, days }) {
      const since = startOfRange(days);
      const [total, delivered] = await Promise.all([
        tenantPrisma.client.message.count({
          where: { createdAt: { gte: since } },
        }),
        tenantPrisma.client.message.count({
          where: {
            createdAt: { gte: since },
            status: { in: [MessageStatus.delivered, MessageStatus.read] },
          },
        }),
      ]);
      return { rate: total > 0 ? round2((delivered / total) * 100) : 0 };
    },
  },
  {
    key: 'new_customers_month',
    title: 'New Customers (this month)',
    category: 'sales',
    async resolve({ tenantPrisma, days }) {
      const since = startOfRange(days);
      const count = await tenantPrisma.client.customer.count({
        where: { createdAt: { gte: since } },
      });
      return { count };
    },
  },
  {
    key: 'lapsed_customers',
    title: 'Lapsed Customers',
    category: 'sales',
    async resolve({ tenantPrisma }) {
      const count = await tenantPrisma.client.customer.count({
        where: { tags: { has: 'Lapsed' } },
      });
      return { count };
    },
  },
  {
    key: 'vip_customers',
    title: 'VIP Customers',
    category: 'sales',
    async resolve({ tenantPrisma }) {
      const count = await tenantPrisma.client.customer.count({
        where: { tags: { has: 'VIP' } },
      });
      return { count };
    },
  },
  {
    key: 'attendance_today',
    title: 'Staff Checked In Today',
    category: 'staff',
    async resolve({ tenantPrisma }) {
      const count = await tenantPrisma.client.attendance.count({
        where: { checkOut: null },
      });
      return { count };
    },
  },
  {
    key: 'appointments_completed_month',
    title: 'Appointments Completed (this month)',
    category: 'bookings',
    async resolve({ tenantPrisma, days }) {
      const since = startOfRange(days);
      const count = await tenantPrisma.client.appointment.count({
        where: {
          startsAt: { gte: since },
          status: AppointmentStatus.completed,
        },
      });
      return { count };
    },
  },
  {
    key: 'pending_appointments_today',
    title: "Today's Appointments",
    category: 'bookings',
    async resolve({ tenantPrisma }) {
      const since = startOfToday();
      const tomorrow = new Date(since.getTime() + 24 * 60 * 60 * 1000);
      const count = await tenantPrisma.client.appointment.count({
        where: { startsAt: { gte: since, lt: tomorrow } },
      });
      return { count };
    },
  },
];

export function findWidget(key: string): WidgetDefinition | undefined {
  return WIDGET_REGISTRY.find((w) => w.key === key);
}
