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
exports.AiService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const locale_service_1 = require("../common/localization/locale.service");
const ai_infra_service_1 = require("./ai-infra.service");
const DISCLAIMER = 'This is an AI-generated estimate based on your own sales history — not a guarantee.';
let AiService = class AiService {
    tenantPrisma;
    locale;
    aiInfra;
    constructor(tenantPrisma, locale, aiInfra) {
        this.tenantPrisma = tenantPrisma;
        this.locale = locale;
        this.aiInfra = aiInfra;
    }
    async whatIf(businessId, dto) {
        const [business, product] = await Promise.all([
            this.tenantPrisma.client.business.findUniqueOrThrow({
                where: { id: businessId },
            }),
            this.tenantPrisma.client.product.findUnique({
                where: { id: dto.productId },
            }),
        ]);
        if (!product) {
            throw new common_1.NotFoundException('Product not found');
        }
        const history = await this.tenantPrisma.client.$queryRaw `
      SELECT to_char(o.created_at, 'YYYY-MM') AS month, SUM(oi.qty) AS units, SUM(oi.price * oi.qty) AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.product_id = ${dto.productId}
        AND o.status = 'completed' AND o.is_quotation = false
        AND o.created_at >= now() - interval '6 months'
      GROUP BY month
      ORDER BY month
    `;
        if (history.length === 0) {
            return {
                estimate: 'Not enough sales history for this product yet — check back after a few sales.',
                disclaimer: DISCLAIMER,
            };
        }
        const historyLines = history
            .map((row) => `${row.month}: ${row.units} units, ${this.locale.formatCurrency(Number(row.revenue), business)}`)
            .join('\n');
        const prompt = [
            `You are a plain-language business assistant for a small business owner using ${business.currency} currency.`,
            `Product: "${product.name}", currently priced at ${this.locale.formatCurrency(Number(product.sellingPrice), business)}.`,
            `Monthly sales history (last 6 months):\n${historyLines}`,
            `The owner is considering a ${dto.priceDeltaPct > 0 ? '+' : ''}${dto.priceDeltaPct}% price change.`,
            'In 2-3 short sentences, estimate the likely impact on monthly revenue based ONLY on the history above. Be specific with a number where possible. Do not invent data not shown above.',
        ].join('\n\n');
        let estimate;
        try {
            estimate = await this.aiInfra.complete(businessId, prompt);
        }
        catch (error) {
            if (error instanceof app_exception_1.AppException) {
                throw error;
            }
            throw new app_exception_1.AppException('AI_UNAVAILABLE', 'The AI assistant is not available right now — please try again later.', common_1.HttpStatus.SERVICE_UNAVAILABLE);
        }
        return { estimate, disclaimer: DISCLAIMER };
    }
};
exports.AiService = AiService;
exports.AiService = AiService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        locale_service_1.LocaleService,
        ai_infra_service_1.AiInfraService])
], AiService);
//# sourceMappingURL=ai.service.js.map