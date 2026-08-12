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
var AiInsightsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiInsightsService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const ai_infra_service_1 = require("../ai/ai-infra.service");
const crm_jobs_constants_1 = require("../customers/jobs/crm-jobs.constants");
const dashboard_constants_1 = require("./dashboard.constants");
function round2(value) {
    return Math.round(value * 100) / 100;
}
let AiInsightsService = AiInsightsService_1 = class AiInsightsService {
    tenantPrisma;
    aiInfra;
    logger = new common_1.Logger(AiInsightsService_1.name);
    constructor(tenantPrisma, aiInfra) {
        this.tenantPrisma = tenantPrisma;
        this.aiInfra = aiInfra;
    }
    async list(businessId, category, status) {
        return this.tenantPrisma.client.aiInsight.findMany({
            where: {
                businessId,
                ...(category ? { category } : {}),
                ...(status ? { status: status } : {}),
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    async setStatus(businessId, id, status) {
        const insight = await this.tenantPrisma.client.aiInsight.findUnique({
            where: { id },
        });
        if (!insight || insight.businessId !== businessId) {
            throw new common_1.NotFoundException('Insight not found');
        }
        return this.tenantPrisma.client.aiInsight.update({
            where: { id },
            data: { status },
        });
    }
    async generateForBusiness(businessId) {
        const facts = await this.gatherFacts(businessId);
        if (facts.length === 0)
            return 0;
        let observations;
        try {
            observations = await this.phraseObservations(businessId, facts);
        }
        catch (error) {
            if (error instanceof app_exception_1.AppException) {
                this.logger.warn(`AI insight phrasing skipped for business ${businessId}: ${error.message}`);
            }
            else {
                this.logger.warn(`AI insight phrasing failed for business ${businessId}: ${error.message}`);
            }
            observations = facts.map((f) => f.sourceFigure);
        }
        await this.tenantPrisma.client.aiInsight.createMany({
            data: facts.map((fact, i) => ({
                businessId,
                category: fact.category,
                sourceFigure: fact.sourceFigure,
                observation: observations[i] || fact.sourceFigure,
            })),
        });
        return facts.length;
    }
    async phraseObservations(businessId, facts) {
        const factLines = facts
            .map((f, i) => `${i + 1}. [${f.category}] ${f.sourceFigure} — ${f.context}`)
            .join('\n');
        const prompt = [
            'You write one-sentence business insights from real figures a system has already computed.',
            'Here are the numbered facts:',
            factLines,
            'For each numbered fact, write exactly one short, plain-language sentence (max ~20 words)',
            'that states the observation and, where natural, a brief suggested action.',
            'Use ONLY the numbers already given — never introduce a new number, date, or figure of your own.',
            'Reply with ONLY a JSON array of strings, one per fact, in the same order. No other text.',
            'Example shape: ["Sentence for fact 1.", "Sentence for fact 2."]',
        ].join('\n');
        const raw = await this.aiInfra.complete(businessId, prompt);
        const parsed = this.parseObservationArray(raw, facts.length);
        if (!parsed) {
            throw new app_exception_1.AppException('AI_INSIGHT_PARSE_FAILED', 'The AI response could not be parsed as insight text.', common_1.HttpStatus.SERVICE_UNAVAILABLE);
        }
        return parsed;
    }
    parseObservationArray(raw, expectedLength) {
        const jsonStart = raw.indexOf('[');
        const jsonEnd = raw.lastIndexOf(']');
        if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart)
            return null;
        try {
            const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
            if (!Array.isArray(parsed) ||
                parsed.length !== expectedLength ||
                !parsed.every((item) => typeof item === 'string' && item.trim().length > 0)) {
                return null;
            }
            return parsed;
        }
        catch {
            return null;
        }
    }
    async gatherFacts(businessId) {
        const [sales, stock, customers, marketing, credit] = await Promise.all([
            this.salesFact(businessId),
            this.stockFact(businessId),
            this.customersFact(businessId),
            this.marketingFact(businessId),
            this.creditFact(businessId),
        ]);
        return [sales, stock, customers, marketing, credit].filter((fact) => fact !== null);
    }
    async salesFact(businessId) {
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        const [thisWeek, lastWeek] = await Promise.all([
            this.tenantPrisma.client.order.aggregate({
                where: {
                    businessId,
                    status: 'completed',
                    isQuotation: false,
                    createdAt: { gte: weekAgo },
                },
                _sum: { total: true },
            }),
            this.tenantPrisma.client.order.aggregate({
                where: {
                    businessId,
                    status: 'completed',
                    isQuotation: false,
                    createdAt: { gte: twoWeeksAgo, lt: weekAgo },
                },
                _sum: { total: true },
            }),
        ]);
        const thisWeekTotal = round2(Number(thisWeek._sum.total ?? 0));
        const lastWeekTotal = round2(Number(lastWeek._sum.total ?? 0));
        if (thisWeekTotal === 0 && lastWeekTotal === 0)
            return null;
        const deltaPercent = lastWeekTotal > 0
            ? round2(((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100)
            : thisWeekTotal > 0
                ? 100
                : 0;
        if (Math.abs(deltaPercent) < dashboard_constants_1.SALES_NOTABLE_DELTA_PERCENT)
            return null;
        const sign = deltaPercent >= 0 ? '+' : '';
        return {
            category: 'sales',
            sourceFigure: `Revenue: ${thisWeekTotal} this week vs ${lastWeekTotal} last week (${sign}${deltaPercent}%)`,
            context: deltaPercent >= 0
                ? 'this is a real increase'
                : 'this is a real decline',
        };
    }
    async stockFact(businessId) {
        const rows = await this.tenantPrisma.client.$queryRaw `
      SELECT id, name, stock_qty, low_stock_threshold FROM products
      WHERE business_id = ${businessId} AND active = true AND stock_qty <= low_stock_threshold
      ORDER BY stock_qty ASC
      LIMIT 5
    `;
        if (rows.length === 0)
            return null;
        const names = rows.map((r) => `${r.name} (${r.stock_qty} left)`).join(', ');
        return {
            category: 'stock',
            sourceFigure: `${rows.length} product(s) at or below their reorder threshold: ${names}`,
            context: 'these need reordering soon to avoid stockouts',
        };
    }
    async customersFact(businessId) {
        const cutoff = new Date(Date.now() - crm_jobs_constants_1.LAPSED_DAYS * 24 * 60 * 60 * 1000);
        const lapsedCount = await this.tenantPrisma.client.customer.count({
            where: {
                businessId,
                visitCount: { gt: 0 },
                OR: [{ lastVisitAt: { lt: cutoff } }, { lastVisitAt: null }],
            },
        });
        if (lapsedCount === 0)
            return null;
        return {
            category: 'customers',
            sourceFigure: `${lapsedCount} customer(s) haven't visited in ${crm_jobs_constants_1.LAPSED_DAYS}+ days`,
            context: 'a win-back message could bring some of them back',
        };
    }
    async marketingFact(businessId) {
        const cutoff = new Date(Date.now() - dashboard_constants_1.MARKETING_QUIET_DAYS * 24 * 60 * 60 * 1000);
        const recentCampaign = await this.tenantPrisma.client.campaign.findFirst({
            where: { businessId, createdAt: { gte: cutoff } },
        });
        if (recentCampaign)
            return null;
        const hasAnyCustomers = await this.tenantPrisma.client.customer.count({
            where: { businessId },
        });
        if (hasAnyCustomers === 0)
            return null;
        return {
            category: 'marketing',
            sourceFigure: `No campaign sent in the last ${dashboard_constants_1.MARKETING_QUIET_DAYS} days`,
            context: 'a simple campaign to existing customers could re-engage them',
        };
    }
    async creditFact(businessId) {
        const rows = await this.tenantPrisma.client.$queryRaw `
      SELECT v.customer_id, c.name, v.balance, v.days_outstanding
      FROM v_credit_balances v
      JOIN customers c ON c.id = v.customer_id
      WHERE v.business_id = ${businessId} AND v.balance > 0 AND v.days_outstanding >= ${dashboard_constants_1.CREDIT_NOTABLE_OVERDUE_DAYS}
      ORDER BY v.days_outstanding DESC
      LIMIT 1
    `;
        if (rows.length === 0)
            return null;
        const [top] = rows;
        return {
            category: 'credit',
            sourceFigure: `${top.name} owes ${round2(Number(top.balance))}, ${top.days_outstanding} days overdue`,
            context: 'this is the most overdue outstanding balance right now',
        };
    }
};
exports.AiInsightsService = AiInsightsService;
exports.AiInsightsService = AiInsightsService = AiInsightsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        ai_infra_service_1.AiInfraService])
], AiInsightsService);
//# sourceMappingURL=ai-insights.service.js.map