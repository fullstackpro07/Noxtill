import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OutboundWebhookService } from './outbound-webhook.service';
import { OutboundWebhookDispatchService } from './outbound-webhook-dispatch.service';
import { OutboundWebhookProcessor } from './jobs/outbound-webhook.processor';
import { AutomationController } from './automation.controller';
import { OUTBOUND_WEBHOOK_QUEUE } from './automation.constants';

@Module({
  imports: [BullModule.registerQueue({ name: OUTBOUND_WEBHOOK_QUEUE })],
  controllers: [AutomationController],
  providers: [
    OutboundWebhookService,
    OutboundWebhookDispatchService,
    OutboundWebhookProcessor,
  ],
  exports: [OutboundWebhookDispatchService, OutboundWebhookService],
})
export class AutomationModule {}
