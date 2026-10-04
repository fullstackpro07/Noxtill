import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MessagingModule } from '../messaging/messaging.module';
import { AiModule } from '../ai/ai.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { PaymentsController, PayPublicController } from './payments.controller';
import { PayWebhookController } from './pay-webhook.controller';
import { PayContextService } from './pay-context.service';
import { PayLedgerService } from './pay-ledger.service';
import { PayIdempotencyService } from './pay-idempotency.service';
import { PayStripeService } from './pay-stripe.service';
import { PayMessagingService } from './pay-messaging.service';
import { PayRequestsService } from './pay-requests.service';
import { PayApprovalsService } from './pay-approvals.service';
import { PayRefundsService } from './pay-refunds.service';
import { PayAiService } from './pay-ai.service';
import { PayRecoveryService } from './pay-recovery.service';
import { PayDisputesService } from './pay-disputes.service';
import { PayRecurringService } from './pay-recurring.service';
import { PayRoutingService } from './pay-routing.service';
import { PayReconService } from './pay-recon.service';
import { PayPolicyService } from './pay-policy.service';
import { PayApplyService } from './pay-apply.service';
import { PayDataService } from './pay-data.service';
import { PayViewsService } from './pay-views.service';
import { PayDrawersService } from './pay-drawers.service';
import { PayDocsService } from './pay-docs.service';
import {
  PAYMENTS_QUEUE,
  PaymentsProcessor,
  PaymentsScheduler,
} from './payments.processor';
import {
  HttpStripeTransport,
  STRIPE_TRANSPORT,
} from './providers/stripe.transport';

@Module({
  imports: [
    BullModule.registerQueue({ name: PAYMENTS_QUEUE }),
    MessagingModule,
    AiModule,
    IntegrationsModule,
  ],
  controllers: [PaymentsController, PayPublicController, PayWebhookController],
  providers: [
    { provide: STRIPE_TRANSPORT, useClass: HttpStripeTransport },
    PayContextService,
    PayLedgerService,
    PayIdempotencyService,
    PayStripeService,
    PayMessagingService,
    PayRequestsService,
    PayApprovalsService,
    PayRefundsService,
    PayAiService,
    PayRecoveryService,
    PayDisputesService,
    PayRecurringService,
    PayRoutingService,
    PayReconService,
    PayPolicyService,
    PayApplyService,
    PayDataService,
    PayViewsService,
    PayDrawersService,
    PayDocsService,
    PaymentsScheduler,
    PaymentsProcessor,
  ],
  exports: [
    PayRefundsService,
    PayRecurringService,
    PayRequestsService,
    PayContextService,
    PayLedgerService,
  ],
})
export class PaymentsModule {}
