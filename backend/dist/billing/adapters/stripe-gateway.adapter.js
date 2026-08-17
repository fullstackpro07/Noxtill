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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var StripeGatewayAdapter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StripeGatewayAdapter = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const stripe_1 = __importDefault(require("stripe"));
let StripeGatewayAdapter = StripeGatewayAdapter_1 = class StripeGatewayAdapter {
    config;
    key = 'stripe';
    logger = new common_1.Logger(StripeGatewayAdapter_1.name);
    client;
    constructor(config) {
        this.config = config;
        const secretKey = this.config.get('STRIPE_SECRET_KEY');
        if (secretKey) {
            this.client = new stripe_1.default(secretKey);
        }
        else {
            this.logger.warn('STRIPE_SECRET_KEY not configured — Stripe billing is disabled');
        }
    }
    get isConfigured() {
        return !!this.client;
    }
    get stripe() {
        return this.client;
    }
    async createCheckoutSession(params) {
        if (!this.client) {
            throw new Error('Stripe is not configured');
        }
        const session = await this.client.checkout.sessions.create({
            mode: 'subscription',
            line_items: [{ price: params.priceRef, quantity: 1 }],
            customer: params.existingCustomerRef,
            customer_email: params.existingCustomerRef
                ? undefined
                : params.customerEmail,
            success_url: params.successUrl,
            cancel_url: params.cancelUrl,
            client_reference_id: params.businessId,
            subscription_data: { metadata: { businessId: params.businessId } },
        });
        if (!session.url) {
            throw new Error('Stripe did not return a checkout URL');
        }
        return { url: session.url, sessionRef: session.id };
    }
    async refund(providerRef, amount) {
        if (!this.client) {
            throw new Error('Stripe is not configured');
        }
        const refund = await this.client.refunds.create({
            payment_intent: providerRef,
            amount: Math.round(amount * 100),
        });
        return { refundRef: refund.id };
    }
    async createSubscriptionCheckout(params) {
        if (!this.client) {
            throw new Error('Stripe is not configured');
        }
        const session = await this.client.checkout.sessions.create({
            mode: 'subscription',
            line_items: [{ price: params.priceRef, quantity: 1 }],
            customer_email: params.customerEmail,
            success_url: params.successUrl,
            cancel_url: params.cancelUrl,
            client_reference_id: params.referenceId,
            subscription_data: {
                metadata: { [params.referenceKey]: params.referenceId },
            },
        });
        if (!session.url) {
            throw new Error('Stripe did not return a checkout URL');
        }
        return { url: session.url, sessionRef: session.id };
    }
    async cancelSubscription(providerRef) {
        if (!this.client) {
            throw new Error('Stripe is not configured');
        }
        await this.client.subscriptions.cancel(providerRef);
    }
};
exports.StripeGatewayAdapter = StripeGatewayAdapter;
exports.StripeGatewayAdapter = StripeGatewayAdapter = StripeGatewayAdapter_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], StripeGatewayAdapter);
//# sourceMappingURL=stripe-gateway.adapter.js.map