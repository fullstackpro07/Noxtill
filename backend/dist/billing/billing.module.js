"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingModule = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const plans_seed_service_1 = require("./plans-seed.service");
const stripe_sync_service_1 = require("./stripe-sync.service");
const billing_service_1 = require("./billing.service");
const billing_controller_1 = require("./billing.controller");
const plan_assignment_service_1 = require("./plan-assignment.service");
const stripe_gateway_adapter_1 = require("./adapters/stripe-gateway.adapter");
const jazzcash_gateway_adapter_1 = require("./adapters/jazzcash-gateway.adapter");
const stripe_webhook_controller_1 = require("./stripe-webhook.controller");
const stripe_webhook_processor_1 = require("./stripe-webhook.processor");
const stripe_webhook_constants_1 = require("./stripe-webhook.constants");
const trial_expiry_scheduler_1 = require("./jobs/trial-expiry.scheduler");
const trial_expiry_processor_1 = require("./jobs/trial-expiry.processor");
const quota_reset_scheduler_1 = require("./jobs/quota-reset.scheduler");
const quota_reset_processor_1 = require("./jobs/quota-reset.processor");
const billing_constants_1 = require("./billing.constants");
let BillingModule = class BillingModule {
};
exports.BillingModule = BillingModule;
exports.BillingModule = BillingModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bullmq_1.BullModule.registerQueue({ name: stripe_webhook_constants_1.STRIPE_WEBHOOK_QUEUE }, { name: billing_constants_1.TRIAL_EXPIRY_QUEUE }, { name: billing_constants_1.QUOTA_RESET_QUEUE }),
        ],
        controllers: [billing_controller_1.BillingController, stripe_webhook_controller_1.StripeWebhookController],
        providers: [
            plans_seed_service_1.PlansSeedService,
            stripe_sync_service_1.StripeSyncService,
            billing_service_1.BillingService,
            plan_assignment_service_1.PlanAssignmentService,
            stripe_gateway_adapter_1.StripeGatewayAdapter,
            jazzcash_gateway_adapter_1.JazzCashGatewayAdapter,
            stripe_webhook_processor_1.StripeWebhookProcessor,
            trial_expiry_scheduler_1.TrialExpiryScheduler,
            trial_expiry_processor_1.TrialExpiryProcessor,
            quota_reset_scheduler_1.QuotaResetScheduler,
            quota_reset_processor_1.QuotaResetProcessor,
        ],
        exports: [billing_service_1.BillingService],
    })
], BillingModule);
//# sourceMappingURL=billing.module.js.map