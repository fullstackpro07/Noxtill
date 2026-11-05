import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { StripeGatewayAdapter } from '../billing/adapters/stripe-gateway.adapter';
import { AuthMailerService } from '../auth/auth-mailer.service';
import { UsageController } from './usage.controller';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { PurchasesService } from './purchases.service';
import { PaymentMethodsService } from './payment-methods.service';
import { UsageReadService } from './usage-read.service';
import { UsageStripeHelper } from './usage-stripe.helper';
import { UsageStripeEventsService } from './usage-stripe-events.service';
import { UsageAlertsService } from './usage-alerts.service';
import { UsageReconcileService } from './usage-reconcile.service';
import { UsageSeedService } from './usage-seed.service';
import { UsageMaintenanceScheduler } from './jobs/usage-maintenance.scheduler';
import { UsageMaintenanceProcessor } from './jobs/usage-maintenance.processor';
import { USAGE_QUEUE } from './usage.constants';

/**
 * Settings → Usage & Limits: subscription lifecycle, purchases, payment methods, alerts,
 * reconciliation and the screen read models. The enforcement core lives in the global
 * UsageCoreModule so feature modules can use it without importing this one.
 */
@Module({
  imports: [BullModule.registerQueue({ name: USAGE_QUEUE })],
  controllers: [UsageController, SubscriptionController],
  providers: [
    StripeGatewayAdapter,
    AuthMailerService,
    UsageStripeHelper,
    SubscriptionService,
    PurchasesService,
    PaymentMethodsService,
    UsageReadService,
    UsageStripeEventsService,
    UsageAlertsService,
    UsageReconcileService,
    UsageSeedService,
    UsageMaintenanceScheduler,
    UsageMaintenanceProcessor,
  ],
  exports: [UsageStripeEventsService, SubscriptionService],
})
export class UsageModule {}
