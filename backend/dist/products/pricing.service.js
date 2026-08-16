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
var PricingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PricingService = void 0;
const common_1 = require("@nestjs/common");
const nestjs_cls_1 = require("nestjs-cls");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const ai_infra_service_1 = require("../ai/ai-infra.service");
const tenant_constants_1 = require("../common/tenancy/tenant.constants");
const pricing_constants_1 = require("./pricing.constants");
function round2(value) {
    return Math.round(value * 100) / 100;
}
let PricingService = PricingService_1 = class PricingService {
    tenantPrisma;
    cls;
    aiInfra;
    logger = new common_1.Logger(PricingService_1.name);
    constructor(tenantPrisma, cls, aiInfra) {
        this.tenantPrisma = tenantPrisma;
        this.cls = cls;
        this.aiInfra = aiInfra;
    }
    async bulkPrice(dto) {
        const where = { active: true };
        if (dto.productIds)
            where.id = { in: dto.productIds };
        if (dto.category)
            where.category = dto.category;
        const products = await this.tenantPrisma.client.product.findMany({
            where,
        });
        if (products.length === 0) {
            throw new app_exception_1.AppException(pricing_constants_1.PRICING_ERROR_CODES.NO_MATCHING_PRODUCTS, 'No products matched the given filter', common_1.HttpStatus.BAD_REQUEST);
        }
        const preview = products.map((product) => {
            const oldPrice = Number(product.sellingPrice);
            const rawNewPrice = dto.mode === 'percent'
                ? oldPrice * (1 + dto.value / 100)
                : oldPrice + dto.value;
            return {
                productId: product.id,
                name: product.name,
                oldPrice,
                newPrice: round2(Math.max(0, rawNewPrice)),
            };
        });
        if (dto.dryRun) {
            return { dryRun: true, changes: preview };
        }
        const actorUserId = this.cls.get(tenant_constants_1.CLS_KEY_USER_ID);
        await this.tenantPrisma.client.$transaction([
            ...preview.map((p) => this.tenantPrisma.client.product.update({
                where: { id: p.productId },
                data: { sellingPrice: p.newPrice },
            })),
            ...preview.map((p) => this.tenantPrisma.client.priceHistory.create({
                data: {
                    productId: p.productId,
                    oldPrice: p.oldPrice,
                    newPrice: p.newPrice,
                    changedByUserId: actorUserId,
                    note: `Bulk ${dto.mode} change of ${dto.value}`,
                },
            })),
        ]);
        return { dryRun: false, changes: preview };
    }
    priceHistory(productId) {
        return this.tenantPrisma.client.priceHistory.findMany({
            where: { productId },
            orderBy: { createdAt: 'desc' },
        });
    }
    async suggestedPrice(businessId, productId) {
        const product = await this.tenantPrisma.client.product.findUnique({
            where: { id: productId },
        });
        if (!product) {
            throw new common_1.NotFoundException('Product not found');
        }
        const costPrice = Number(product.costPrice);
        const sellingPrice = Number(product.sellingPrice);
        const currentMargin = sellingPrice > 0 ? (sellingPrice - costPrice) / sellingPrice : 0;
        const underpriced = currentMargin < pricing_constants_1.LOW_MARGIN_RATE && costPrice > 0;
        const suggestedPrice = underpriced
            ? round2(costPrice / (1 - pricing_constants_1.TARGET_MARGIN_RATE))
            : sellingPrice;
        const fallbackRationale = underpriced
            ? `Current margin is ${round2(currentMargin * 100)}%, below a healthy ${pricing_constants_1.TARGET_MARGIN_RATE * 100}% target — consider raising the price.`
            : `Current margin is ${round2(currentMargin * 100)}%, already healthy — no change suggested.`;
        const result = {
            productId,
            costPrice,
            currentPrice: sellingPrice,
            currentMarginPercent: round2(currentMargin * 100),
            suggestedPrice,
            rationale: fallbackRationale,
        };
        try {
            result.rationale = await this.phraseRationale(businessId, result);
        }
        catch (error) {
            this.logger.warn(`Price-suggestion phrasing skipped for product ${productId}: ${error.message}`);
        }
        return result;
    }
    async phraseRationale(businessId, facts) {
        const prompt = [
            'You write one-sentence pricing rationales from real numbers a system has already computed.',
            `Current price: ${facts.currentPrice}. Current margin: ${facts.currentMarginPercent}%. Suggested price: ${facts.suggestedPrice}.`,
            'Write exactly one short, plain-language sentence (max ~25 words) explaining the suggestion.',
            'Use ONLY the numbers already given — never introduce a new number of your own.',
            'Reply with ONLY the sentence text. No quotes, no other text.',
        ].join('\n');
        const raw = (await this.aiInfra.complete(businessId, prompt)).trim();
        if (!raw) {
            throw new Error('Empty AI response');
        }
        return raw;
    }
};
exports.PricingService = PricingService;
exports.PricingService = PricingService = PricingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        nestjs_cls_1.ClsService,
        ai_infra_service_1.AiInfraService])
], PricingService);
//# sourceMappingURL=pricing.service.js.map