import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WebhooksController } from './webhooks.controller';
import { WebhookEventsProcessor } from './webhook-events.processor';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { WEBHOOK_EVENTS_QUEUE } from './webhooks.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: WEBHOOK_EVENTS_QUEUE }),
    WhatsappModule,
  ],
  controllers: [WebhooksController],
  providers: [WebhookEventsProcessor],
})
export class WebhooksModule {}
