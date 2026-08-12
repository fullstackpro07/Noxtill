import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PlansSeedService } from './plans-seed.service';
import { StripeSyncService } from './stripe-sync.service';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { PlanAssignmentService } from './plan-assignment.service';
import { StripeGatewayAdapter } from './adapters/stripe-gateway.adapter';
import { JazzCashGatewayAdapter } from './adapters/jazzcash-gateway.adapter';
import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeWebhookProcessor } from './stripe-webhook.processor';
import { STRIPE_WEBHOOK_QUEUE } from './stripe-webhook.constants';
import { TrialExpiryScheduler } from './jobs/trial-expiry.scheduler';
import { TrialExpiryProcessor } from './jobs/trial-expiry.processor';
import { QuotaResetScheduler } from './jobs/quota-reset.scheduler';
import { QuotaResetProcessor } from './jobs/quota-reset.processor';
import { TRIAL_EXPIRY_QUEUE, QUOTA_RESET_QUEUE } from './billing.constants';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: STRIPE_WEBHOOK_QUEUE },
      { name: TRIAL_EXPIRY_QUEUE },
      { name: QUOTA_RESET_QUEUE },
    ),
  ],
  controllers: [BillingController, StripeWebhookController],
  providers: [
    PlansSeedService,
    StripeSyncService,
    BillingService,
    PlanAssignmentService,
    StripeGatewayAdapter,
    JazzCashGatewayAdapter,
    StripeWebhookProcessor,
    TrialExpiryScheduler,
    TrialExpiryProcessor,
    QuotaResetScheduler,
    QuotaResetProcessor,
  ],
  exports: [BillingService],
})
export class BillingModule {}
