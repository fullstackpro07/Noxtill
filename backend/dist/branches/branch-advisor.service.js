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
exports.BranchAdvisorService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const ai_infra_service_1 = require("../ai/ai-infra.service");
const locale_service_1 = require("../common/localization/locale.service");
const DISCLAIMER = "This answer is based only on your own branch's data.";
const REFUSAL = "I can only answer questions about this branch's own sales, orders, and performance data.";
let BranchAdvisorService = class BranchAdvisorService {
    tenantPrisma;
    locale;
    aiInfra;
    constructor(tenantPrisma, locale, aiInfra) {
        this.tenantPrisma = tenantPrisma;
        this.locale = locale;
        this.aiInfra = aiInfra;
    }
    async ask(businessId, dto) {
        const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
            where: { id: businessId },
        });
        const rows = await this.tenantPrisma.client.$queryRaw `
      SELECT close_date, orders_count, revenue, gross_profit
      FROM v_daily_close
      WHERE business_id = ${businessId} AND close_date >= now() - interval '30 days'
      ORDER BY close_date ASC
    `;
        const historyLines = rows.length > 0
            ? rows
                .map((r) => `${r.close_date.toISOString().slice(0, 10)}: ${r.orders_count} orders, ` +
                `${this.locale.formatCurrency(Number(r.revenue ?? 0), business)} revenue, ` +
                `${this.locale.formatCurrency(Number(r.gross_profit ?? 0), business)} gross profit`)
                .join('\n')
            : 'No sales recorded in the last 30 days.';
        const prompt = [
            `You are a plain-language business advisor for the branch "${business.name}", speaking ONLY from the data below.`,
            `Last 30 days of daily performance:\n${historyLines}`,
            `The owner asks: "${dto.question}"`,
            "If this question is about this branch's own sales, orders, staffing, or performance, answer in 2-4 short sentences using ONLY the data above — never invent numbers.",
            `If the question is NOT about this branch's own performance (e.g. general business advice unrelated to the data, or asks about other businesses/branches), respond with exactly: "${REFUSAL}"`,
        ].join('\n\n');
        let answer;
        try {
            answer = await this.aiInfra.complete(businessId, prompt);
        }
        catch (error) {
            if (error instanceof app_exception_1.AppException) {
                throw error;
            }
            throw new app_exception_1.AppException('AI_UNAVAILABLE', 'The AI assistant is not available right now — please try again later.', common_1.HttpStatus.SERVICE_UNAVAILABLE);
        }
        return { answer, disclaimer: DISCLAIMER };
    }
};
exports.BranchAdvisorService = BranchAdvisorService;
exports.BranchAdvisorService = BranchAdvisorService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        locale_service_1.LocaleService,
        ai_infra_service_1.AiInfraService])
], BranchAdvisorService);
//# sourceMappingURL=branch-advisor.service.js.map