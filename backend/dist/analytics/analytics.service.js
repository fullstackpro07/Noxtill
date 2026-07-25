"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsService = void 0;
const common_1 = require("@nestjs/common");
const nestjs_cls_1 = require("nestjs-cls");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const tenant_constants_1 = require("../common/tenancy/tenant.constants");
const prisma_1 = require("../../generated/prisma");
const COHORT_MONTHS_BACK = 6;
const COHORT_RELATIVE_MONTHS = 6;
function round2(value) {
    return Math.round(value * 100) / 100;
}
function startOfMonth(monthsAgo = 0) {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - monthsAgo, 1));
}
let AnalyticsService = class AnalyticsService {
    tenantPrisma;
    cls;
    constructor(tenantPrisma, cls) {
        this.tenantPrisma = tenantPrisma;
        this.cls = cls;
    }
    async kpis() {
        const client = this.tenantPrisma.client;
        const since = startOfMonth();
        const [orderAgg, newCustomers, appointmentsBooked, reviewsAvg] = await Promise.all([
            client.order.aggregate({
                where: {
                    status: prisma_1.OrderStatus.completed,
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
            avgOrderValue: orderAgg._count > 0 ? round2(revenue / orderAgg._count) : 0,
            newCustomersThisMonth: newCustomers,
            appointmentsBookedThisMonth: appointmentsBooked,
            reviewsAverage: reviewsAvg._avg.stars
                ? round2(Number(reviewsAvg._avg.stars))
                : null,
        };
    }
    async revenueSeries(days = 30) {
        const businessId = this.cls.get(tenant_constants_1.CLS_KEY_BUSINESS_ID);
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const rows = await this.tenantPrisma.client.$queryRaw `
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
    async cohorts() {
        const client = this.tenantPrisma.client;
        const cohortStarts = Array.from({ length: COHORT_MONTHS_BACK }, (_, i) => startOfMonth(COHORT_MONTHS_BACK - 1 - i));
        const cohorts = await Promise.all(cohortStarts.map(async (cohortStart) => {
            const cohortEnd = new Date(Date.UTC(cohortStart.getUTCFullYear(), cohortStart.getUTCMonth() + 1, 1));
            const cohortCustomers = await client.customer.findMany({
                where: { createdAt: { gte: cohortStart, lt: cohortEnd } },
                select: { id: true },
            });
            const customerIds = cohortCustomers.map((c) => c.id);
            const cohortSize = customerIds.length;
            const retention = [];
            for (let m = 0; m < COHORT_RELATIVE_MONTHS; m++) {
                const windowStart = new Date(Date.UTC(cohortStart.getUTCFullYear(), cohortStart.getUTCMonth() + m, 1));
                const windowEnd = new Date(Date.UTC(cohortStart.getUTCFullYear(), cohortStart.getUTCMonth() + m + 1, 1));
                if (windowStart > new Date() || cohortSize === 0) {
                    retention.push(0);
                    continue;
                }
                const activeCount = await client.order.groupBy({
                    by: ['customerId'],
                    where: {
                        customerId: { in: customerIds },
                        createdAt: { gte: windowStart, lt: windowEnd },
                        status: prisma_1.OrderStatus.completed,
                    },
                });
                retention.push(cohortSize > 0
                    ? round2((activeCount.length / cohortSize) * 100)
                    : 0);
            }
            return {
                cohortMonth: cohortStart.toISOString().slice(0, 7),
                size: cohortSize,
                retention,
            };
        }));
        return cohorts;
    }
    async campaigns() {
        const businessId = this.cls.get(tenant_constants_1.CLS_KEY_BUSINESS_ID);
        const rows = await this.tenantPrisma.client.$queryRaw `
      SELECT
        c.id, c.segment, c.sent_count,
        COUNT(*) FILTER (WHERE m.status = 'delivered') AS delivered,
        COUNT(*) FILTER (WHERE m.status = 'read') AS read,
        COUNT(*) FILTER (WHERE m.status = 'failed') AS failed
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
            read: Number(r.read),
            failed: Number(r.failed),
        }));
    }
    async staff() {
        const businessId = this.cls.get(tenant_constants_1.CLS_KEY_BUSINESS_ID);
        const since = startOfMonth();
        const rows = await this.tenantPrisma.client.$queryRaw `
      SELECT u.name, SUM(o.total) AS total, COUNT(*) AS orders
      FROM orders o
      JOIN business_users bu ON bu.id = o.staff_user_id
      JOIN users u ON u.id = bu.user_id
      WHERE o.business_id = ${businessId} AND o.status = 'completed' AND o.is_quotation = false AND o.created_at >= ${since}
      GROUP BY u.name
      ORDER BY total DESC
    `;
        return rows.map((r) => ({
            name: r.name,
            totalSales: round2(Number(r.total)),
            orders: Number(r.orders),
        }));
    }
    async channels(days = 30) {
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const groups = await this.tenantPrisma.client.message.groupBy({
            by: ['channel', 'status'],
            where: { createdAt: { gte: since } },
            _count: { _all: true },
        });
        const byChannel = new Map();
        for (const g of groups) {
            const bucket = byChannel.get(g.channel) ?? {};
            bucket[g.status] = g._count._all;
            byChannel.set(g.channel, bucket);
        }
        return Object.fromEntries(byChannel);
    }
};
exports.AnalyticsService = AnalyticsService;
exports.AnalyticsService = AnalyticsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        nestjs_cls_1.ClsService])
], AnalyticsService);
//# sourceMappingURL=analytics.service.js.map