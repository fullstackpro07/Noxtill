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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StripeWebhookController = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const public_decorator_1 = require("../common/decorators/public.decorator");
const webhook_idempotency_service_1 = require("../common/webhooks/webhook-idempotency.service");
const stripe_gateway_adapter_1 = require("./adapters/stripe-gateway.adapter");
const stripe_webhook_constants_1 = require("./stripe-webhook.constants");
let StripeWebhookController = class StripeWebhookController {
    config;
    idempotency;
    stripeAdapter;
    queue;
    constructor(config, idempotency, stripeAdapter, queue) {
        this.config = config;
        this.idempotency = idempotency;
        this.stripeAdapter = stripeAdapter;
        this.queue = queue;
    }
    async stripe(req, signature) {
        const stripe = this.stripeAdapter.stripe;
        const webhookSecret = this.config.get('STRIPE_WEBHOOK_SECRET');
        if (!stripe || !webhookSecret) {
            throw new common_1.ServiceUnavailableException('Stripe billing is not configured');
        }
        let event;
        try {
            event = stripe.webhooks.constructEvent(req.rawBody ?? Buffer.from(''), signature ?? '', webhookSecret);
        }
        catch {
            throw new common_1.ForbiddenException('Invalid Stripe signature');
        }
        await this.idempotency.handle('stripe', event.id, async () => {
            await this.queue.add(event.type, event.data.object, { jobId: event.id });
        });
        return { received: true };
    }
};
exports.StripeWebhookController = StripeWebhookController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('stripe'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Headers)('stripe-signature')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], StripeWebhookController.prototype, "stripe", null);
exports.StripeWebhookController = StripeWebhookController = __decorate([
    (0, common_1.Controller)('webhooks'),
    __param(3, (0, bullmq_1.InjectQueue)(stripe_webhook_constants_1.STRIPE_WEBHOOK_QUEUE)),
    __metadata("design:paramtypes", [config_1.ConfigService,
        webhook_idempotency_service_1.WebhookIdempotencyService,
        stripe_gateway_adapter_1.StripeGatewayAdapter,
        bullmq_2.Queue])
], StripeWebhookController);
//# sourceMappingURL=stripe-webhook.controller.js.map