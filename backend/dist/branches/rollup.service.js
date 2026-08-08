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
exports.RollupService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const prisma_1 = require("../../generated/prisma");
const branches_constants_1 = require("./branches.constants");
let RollupService = class RollupService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getGroup(businessId) {
        const business = await this.prisma.business.findUnique({
            where: { id: businessId },
        });
        if (!business) {
            throw new common_1.NotFoundException('Business not found');
        }
        const rootId = business.parentId ?? business.id;
        return this.prisma.business.findMany({
            where: { OR: [{ id: rootId }, { parentId: rootId }] },
            orderBy: { createdAt: 'asc' },
        });
    }
    async dashboard(businessId, days = branches_constants_1.BRANCH_ROLLUP_DEFAULT_DAYS) {
        const group = await this.getGroup(businessId);
        const ids = group.map((b) => b.id);
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const rows = await this.prisma.$queryRaw `
      SELECT business_id,
             SUM(orders_count) AS orders_count,
             SUM(revenue) AS revenue,
             SUM(gross_profit) AS gross_profit
      FROM v_daily_close
      WHERE business_id IN (${prisma_1.Prisma.join(ids)}) AND close_date >= ${since.toISOString().slice(0, 10)}::date
      GROUP BY business_id
    `;
        const byBusiness = new Map(rows.map((r) => [r.business_id, r]));
        const reviewAggs = await this.prisma.externalReview.groupBy({
            by: ['businessId'],
            where: { businessId: { in: ids }, createdAt: { gte: since } },
            _avg: { stars: true },
        });
        const reviewAvgByBusiness = new Map(reviewAggs.map((r) => [r.businessId, r._avg.stars]));
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
            };
        });
        const totals = branches.reduce((acc, b) => ({
            ordersCount: acc.ordersCount + b.ordersCount,
            revenue: acc.revenue + b.revenue,
            grossProfit: acc.grossProfit + b.grossProfit,
        }), { ordersCount: 0, revenue: 0, grossProfit: 0 });
        return { totals, branches };
    }
    async compare(businessId, weeks = branches_constants_1.BRANCH_COMPARE_DEFAULT_WEEKS) {
        const group = await this.getGroup(businessId);
        const ids = group.map((b) => b.id);
        const since = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000);
        const rows = await this.prisma.$queryRaw `
      SELECT business_id,
             date_trunc('week', close_date) AS week_start,
             SUM(orders_count) AS orders_count,
             SUM(revenue) AS revenue,
             SUM(gross_profit) AS gross_profit
      FROM v_daily_close
      WHERE business_id IN (${prisma_1.Prisma.join(ids)}) AND close_date >= ${since.toISOString().slice(0, 10)}::date
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
};
exports.RollupService = RollupService;
exports.RollupService = RollupService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], RollupService);
//# sourceMappingURL=rollup.service.js.map