"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WIDGET_REGISTRY = void 0;
exports.findWidget = findWidget;
const prisma_1 = require("../../generated/prisma");
function round2(value) {
    return Math.round(value * 100) / 100;
}
function startOfToday() {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
}
function startOfMonth() {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
exports.WIDGET_REGISTRY = [
    {
        key: 'revenue_today',
        title: "Today's Revenue",
        category: 'sales',
        async resolve({ tenantPrisma }) {
            const since = startOfToday();
            const agg = await tenantPrisma.client.order.aggregate({
                where: {
                    status: prisma_1.OrderStatus.completed,
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
        async resolve({ tenantPrisma }) {
            const since = startOfMonth();
            const agg = await tenantPrisma.client.order.aggregate({
                where: {
                    status: prisma_1.OrderStatus.completed,
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
        async resolve({ tenantPrisma }) {
            const since = startOfMonth();
            const agg = await tenantPrisma.client.order.aggregate({
                where: {
                    status: prisma_1.OrderStatus.completed,
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
        async resolve({ businessId, tenantPrisma }) {
            const since = startOfMonth();
            const rows = await tenantPrisma.client.$queryRaw `
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
        async resolve({ tenantPrisma }) {
            const since = startOfMonth();
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
            const count = products.filter((p) => p.stockQty <= p.lowStockThreshold).length;
            return { count };
        },
    },
    {
        key: 'credit_outstanding',
        title: 'Credit Outstanding',
        category: 'credit',
        async resolve({ businessId, tenantPrisma }) {
            const rows = await tenantPrisma.client.$queryRaw `
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
                        in: [prisma_1.AppointmentStatus.booked, prisma_1.AppointmentStatus.confirmed],
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
        async resolve({ tenantPrisma }) {
            const since = startOfMonth();
            const [total, noShows] = await Promise.all([
                tenantPrisma.client.appointment.count({
                    where: {
                        startsAt: { gte: since },
                        status: {
                            in: [prisma_1.AppointmentStatus.completed, prisma_1.AppointmentStatus.no_show],
                        },
                    },
                }),
                tenantPrisma.client.appointment.count({
                    where: {
                        startsAt: { gte: since },
                        status: prisma_1.AppointmentStatus.no_show,
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
                where: { status: prisma_1.FeedbackStatus.open },
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
        async resolve({ tenantPrisma }) {
            const since = startOfMonth();
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
        async resolve({ businessId, tenantPrisma }) {
            const since = startOfMonth();
            const rows = await tenantPrisma.client.$queryRaw `
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
                where: { role: { in: [prisma_1.Role.manager, prisma_1.Role.staff] } },
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
                percent: business.msgQuota > 0
                    ? round2((business.msgUsed / business.msgQuota) * 100)
                    : 0,
            };
        },
    },
    {
        key: 'channel_breakdown_month',
        title: 'Messages by Channel (this month)',
        category: 'messaging',
        async resolve({ tenantPrisma }) {
            const since = startOfMonth();
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
        async resolve({ tenantPrisma }) {
            const since = startOfMonth();
            const [total, delivered] = await Promise.all([
                tenantPrisma.client.message.count({
                    where: { createdAt: { gte: since } },
                }),
                tenantPrisma.client.message.count({
                    where: {
                        createdAt: { gte: since },
                        status: { in: [prisma_1.MessageStatus.delivered, prisma_1.MessageStatus.read] },
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
        async resolve({ tenantPrisma }) {
            const since = startOfMonth();
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
        async resolve({ tenantPrisma }) {
            const since = startOfMonth();
            const count = await tenantPrisma.client.appointment.count({
                where: {
                    startsAt: { gte: since },
                    status: prisma_1.AppointmentStatus.completed,
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
function findWidget(key) {
    return exports.WIDGET_REGISTRY.find((w) => w.key === key);
}
//# sourceMappingURL=widget-registry.js.map