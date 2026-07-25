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
var StripeWebhookProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StripeWebhookProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const plan_assignment_service_1 = require("./plan-assignment.service");
const stripe_gateway_adapter_1 = require("./adapters/stripe-gateway.adapter");
const stripe_webhook_constants_1 = require("./stripe-webhook.constants");
let StripeWebhookProcessor = StripeWebhookProcessor_1 = class StripeWebhookProcessor extends bullmq_1.WorkerHost {
    prisma;
    planAssignment;
    stripeAdapter;
    logger = new common_1.Logger(StripeWebhookProcessor_1.name);
    constructor(prisma, planAssignment, stripeAdapter) {
        super();
        this.prisma = prisma;
        this.planAssignment = planAssignment;
        this.stripeAdapter = stripeAdapter;
    }
    async process(job) {
        switch (job.name) {
            case 'checkout.session.completed':
                return this.handleCheckoutCompleted(job.data);
            case 'customer.subscription.updated':
                return this.handleSubscriptionUpdated(job.data);
            case 'customer.subscription.deleted':
                return this.handleSubscriptionDeleted(job.data);
            default:
                this.logger.debug(`Ignoring unhandled Stripe event type: ${job.name}`);
        }
    }
    async handleCheckoutCompleted(session) {
        const businessId = session.client_reference_id;
        const subscriptionId = typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;
        const customerId = typeof session.customer === 'string'
            ? session.customer
            : session.customer?.id;
        if (!businessId ||
            !subscriptionId ||
            !customerId ||
            !this.stripeAdapter.stripe) {
            this.logger.warn('checkout.session.completed missing businessId/subscription/customer');
            return;
        }
        const subscription = await this.stripeAdapter.stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0]?.price.id;
        await this.prisma.business.update({
            where: { id: businessId },
            data: {
                stripeCustomerId: customerId,
                stripeSubscriptionId: subscriptionId,
                trialEndsAt: null,
            },
        });
        if (priceId) {
            await this.planAssignment.assignByStripePriceId(businessId, priceId);
        }
    }
    async handleSubscriptionUpdated(subscription) {
        const business = await this.prisma.business.findUnique({
            where: { stripeSubscriptionId: subscription.id },
        });
        if (!business)
            return;
        const priceId = subscription.items.data[0]?.price.id;
        if (priceId) {
            await this.planAssignment.assignByStripePriceId(business.id, priceId);
        }
    }
    async handleSubscriptionDeleted(subscription) {
        const business = await this.prisma.business.findUnique({
            where: { stripeSubscriptionId: subscription.id },
        });
        if (!business)
            return;
        await this.prisma.business.update({
            where: { id: business.id },
            data: { stripeSubscriptionId: null },
        });
        await this.planAssignment.downgradeToBasic(business.id);
    }
};
exports.StripeWebhookProcessor = StripeWebhookProcessor;
exports.StripeWebhookProcessor = StripeWebhookProcessor = StripeWebhookProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(stripe_webhook_constants_1.STRIPE_WEBHOOK_QUEUE),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        plan_assignment_service_1.PlanAssignmentService,
        stripe_gateway_adapter_1.StripeGatewayAdapter])
], StripeWebhookProcessor);
//# sourceMappingURL=stripe-webhook.processor.js.map