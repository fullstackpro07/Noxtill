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
var StripeSyncService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StripeSyncService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const stripe_gateway_adapter_1 = require("./adapters/stripe-gateway.adapter");
let StripeSyncService = StripeSyncService_1 = class StripeSyncService {
    prisma;
    stripeAdapter;
    logger = new common_1.Logger(StripeSyncService_1.name);
    constructor(prisma, stripeAdapter) {
        this.prisma = prisma;
        this.stripeAdapter = stripeAdapter;
    }
    async onModuleInit() {
        if (!this.stripeAdapter.isConfigured || !this.stripeAdapter.stripe) {
            return;
        }
        const stripe = this.stripeAdapter.stripe;
        try {
            const plans = await this.prisma.plan.findMany({
                where: { stripePriceId: null },
            });
            for (const plan of plans) {
                if (Number(plan.price) === 0)
                    continue;
                const product = await stripe.products.create({
                    name: `Noxtill — ${plan.name}`,
                });
                const price = await stripe.prices.create({
                    product: product.id,
                    unit_amount: Math.round(Number(plan.price) * 100),
                    currency: 'usd',
                    recurring: { interval: 'month' },
                });
                await this.prisma.plan.update({
                    where: { id: plan.id },
                    data: { stripePriceId: price.id },
                });
            }
        }
        catch (error) {
            this.logger.error(`Failed to sync Stripe products/prices: ${error.message}`);
        }
    }
};
exports.StripeSyncService = StripeSyncService;
exports.StripeSyncService = StripeSyncService = StripeSyncService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        stripe_gateway_adapter_1.StripeGatewayAdapter])
], StripeSyncService);
//# sourceMappingURL=stripe-sync.service.js.map