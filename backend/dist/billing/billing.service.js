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
exports.BillingService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const stripe_gateway_adapter_1 = require("./adapters/stripe-gateway.adapter");
const jazzcash_gateway_adapter_1 = require("./adapters/jazzcash-gateway.adapter");
const billing_constants_1 = require("./billing.constants");
let BillingService = class BillingService {
    prisma;
    adapters;
    constructor(prisma, stripeAdapter, jazzCashAdapter) {
        this.prisma = prisma;
        this.adapters = {
            [stripeAdapter.key]: stripeAdapter,
            [jazzCashAdapter.key]: jazzCashAdapter,
        };
    }
    async createCheckout(businessId, dto) {
        const business = await this.prisma.business.findUniqueOrThrow({
            where: { id: businessId },
            include: {
                businessUsers: { where: { role: 'owner' }, include: { user: true } },
            },
        });
        const plan = await this.prisma.plan.findUnique({
            where: { key: dto.planKey },
        });
        if (!plan) {
            throw new app_exception_1.AppException(billing_constants_1.BILLING_ERROR_CODES.PLAN_NOT_FOUND, `Unknown plan: ${dto.planKey}`, common_1.HttpStatus.NOT_FOUND);
        }
        const adapter = this.adapters[dto.gateway ?? 'stripe'];
        if (!adapter.isConfigured) {
            throw new app_exception_1.AppException(billing_constants_1.BILLING_ERROR_CODES.GATEWAY_NOT_CONFIGURED, `Payment gateway "${adapter.key}" is not configured`, common_1.HttpStatus.SERVICE_UNAVAILABLE);
        }
        if (!plan.stripePriceId && adapter.key === 'stripe') {
            throw new app_exception_1.AppException(billing_constants_1.BILLING_ERROR_CODES.PLAN_NOT_FOUND, `Plan "${plan.key}" has no price configured yet`, common_1.HttpStatus.SERVICE_UNAVAILABLE);
        }
        const owner = business.businessUsers[0]?.user;
        const session = await adapter.createCheckoutSession({
            businessId,
            businessName: business.name,
            customerEmail: owner?.email ?? undefined,
            priceRef: plan.stripePriceId ?? plan.key,
            existingCustomerRef: business.stripeCustomerId ?? undefined,
            successUrl: dto.successUrl,
            cancelUrl: dto.cancelUrl,
        });
        return { url: session.url };
    }
    async status(businessId) {
        const business = await this.prisma.business.findUniqueOrThrow({
            where: { id: businessId },
            include: { plan: true },
        });
        const monthStart = new Date();
        monthStart.setUTCDate(1);
        monthStart.setUTCHours(0, 0, 0, 0);
        const aiAgg = await this.prisma.aiCallLog.aggregate({
            where: { businessId, createdAt: { gte: monthStart } },
            _sum: { estimatedCostUsd: true },
        });
        return {
            planKey: business.plan?.key ?? null,
            planName: business.plan?.name ?? null,
            price: business.plan ? Number(business.plan.price) : null,
            msgQuota: business.msgQuota,
            msgUsed: business.msgUsed,
            userLimit: business.plan?.userLimit ?? null,
            aiCostCapUsd: Number(business.aiMonthlyCostCapUsd),
            aiCostUsedUsd: Number(aiAgg._sum.estimatedCostUsd ?? 0),
            trialEndsAt: business.trialEndsAt,
            hasActiveSubscription: !!business.stripeSubscriptionId,
        };
    }
};
exports.BillingService = BillingService;
exports.BillingService = BillingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        stripe_gateway_adapter_1.StripeGatewayAdapter,
        jazzcash_gateway_adapter_1.JazzCashGatewayAdapter])
], BillingService);
//# sourceMappingURL=billing.service.js.map