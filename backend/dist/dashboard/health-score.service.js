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
exports.HealthScoreService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const profit_service_1 = require("../profit/profit.service");
const app_exception_1 = require("../common/filters/app.exception");
const dashboard_constants_1 = require("./dashboard.constants");
function round2(value) {
    return Math.round(value * 100) / 100;
}
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
let HealthScoreService = class HealthScoreService {
    tenantPrisma;
    profitService;
    constructor(tenantPrisma, profitService) {
        this.tenantPrisma = tenantPrisma;
        this.profitService = profitService;
    }
    async getWeights(businessId) {
        const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
            where: { id: businessId },
            select: { healthScoreWeights: true },
        });
        const stored = business.healthScoreWeights;
        return { ...dashboard_constants_1.DEFAULT_HEALTH_SCORE_WEIGHTS, ...(stored ?? {}) };
    }
    async updateWeights(businessId, weights) {
        const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
        if (Math.round(total) !== 100) {
            throw new app_exception_1.AppException('health_score.weights_must_sum_to_100', `Weights must sum to 100 (got ${total}).`, common_1.HttpStatus.BAD_REQUEST);
        }
        await this.tenantPrisma.client.business.update({
            where: { id: businessId },
            data: { healthScoreWeights: weights },
        });
        return weights;
    }
    async getScore(businessId, range) {
        const weeks = range
            ? Number(range) || dashboard_constants_1.HEALTH_SCORE_WINDOW_WEEKS
            : dashboard_constants_1.HEALTH_SCORE_WINDOW_WEEKS;
        const weights = await this.getWeights(businessId);
        const raw = await this.computeRawComponents(businessId);
        const components = this.weightComponents(raw, weights);
        const score = round2(components.ratingTrend +
            components.repeatCustomerRate +
            components.margin +
            components.creditRecovery);
        const history = await this.tenantPrisma.client.healthScoreSnapshot.findMany({
            where: { businessId },
            orderBy: { capturedAt: 'desc' },
            take: weeks,
        });
        return {
            score,
            components,
            weights,
            history: history.reverse().map((row) => ({
                capturedAt: row.capturedAt,
                totalScore: Number(row.totalScore),
                ratingTrend: Number(row.ratingTrendScore),
                repeatCustomerRate: Number(row.repeatCustomerScore),
                margin: Number(row.marginScore),
                creditRecovery: Number(row.creditRecoveryScore),
            })),
        };
    }
    async computeRawComponents(businessId) {
        const since = new Date(Date.now() - dashboard_constants_1.HEALTH_SCORE_WINDOW_WEEKS * 7 * 24 * 60 * 60 * 1000);
        const [ratingTrend, repeatCustomerRate, margin, creditRecovery] = await Promise.all([
            this.ratingTrendRaw(businessId, since),
            this.repeatCustomerRateRaw(businessId),
            this.marginRaw(),
            this.creditRecoveryRaw(businessId, since),
        ]);
        return { ratingTrend, repeatCustomerRate, margin, creditRecovery };
    }
    weightComponents(raw, weights) {
        return {
            ratingTrend: round2((raw.ratingTrend / 100) * weights.ratingTrend),
            repeatCustomerRate: round2((raw.repeatCustomerRate / 100) * weights.repeatCustomerRate),
            margin: round2((raw.margin / 100) * weights.margin),
            creditRecovery: round2((raw.creditRecovery / 100) * weights.creditRecovery),
        };
    }
    async ratingTrendRaw(businessId, since) {
        const result = await this.tenantPrisma.client.externalReview.aggregate({
            where: { businessId, createdAt: { gte: since } },
            _avg: { stars: true },
        });
        const avg = result._avg.stars ?? 0;
        return round2(clamp((avg / 5) * 100, 0, 100));
    }
    async repeatCustomerRateRaw(businessId) {
        const [withVisit, repeat] = await Promise.all([
            this.tenantPrisma.client.customer.count({
                where: { businessId, visitCount: { gte: 1 } },
            }),
            this.tenantPrisma.client.customer.count({
                where: { businessId, visitCount: { gt: 1 } },
            }),
        ]);
        if (withVisit === 0)
            return 0;
        return round2(clamp((repeat / withVisit) * 100, 0, 100));
    }
    async marginRaw() {
        const now = new Date();
        const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
        const { revenue, netProfit } = await this.profitService.pnl(month);
        if (revenue <= 0)
            return 0;
        const marginPercent = (netProfit / revenue) * 100;
        return round2(clamp((marginPercent / 25) * 100, 0, 100));
    }
    async creditRecoveryRaw(businessId, since) {
        const [extended, recovered] = await Promise.all([
            this.tenantPrisma.client.creditEntry.aggregate({
                where: { businessId, kind: 'credit', createdAt: { gte: since } },
                _sum: { amount: true },
            }),
            this.tenantPrisma.client.creditEntry.aggregate({
                where: { businessId, kind: 'payment', createdAt: { gte: since } },
                _sum: { amount: true },
            }),
        ]);
        const extendedTotal = Number(extended._sum.amount ?? 0);
        if (extendedTotal <= 0)
            return 100;
        const recoveredTotal = Number(recovered._sum.amount ?? 0);
        return round2(clamp((recoveredTotal / extendedTotal) * 100, 0, 100));
    }
};
exports.HealthScoreService = HealthScoreService;
exports.HealthScoreService = HealthScoreService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        profit_service_1.ProfitService])
], HealthScoreService);
//# sourceMappingURL=health-score.service.js.map