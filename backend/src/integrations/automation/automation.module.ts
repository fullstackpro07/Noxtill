import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OutboundWebhookService } from './outbound-webhook.service';
import { OutboundWebhookDispatchService } from './outbound-webhook-dispatch.service';
import { OutboundWebhookProcessor } from './jobs/outbound-webhook.processor';
import { AutomationController } from './automation.controller';
import { SlackNotifierService } from './slack-notifier.service';
import { TokenCipherService } from '../token-cipher.service';
import { SlackConnector } from '../connectors/slack.connector';
import { OUTBOUND_WEBHOOK_QUEUE } from './automation.constants';

@Module({
  imports: [BullModule.registerQueue({ name: OUTBOUND_WEBHOOK_QUEUE })],
  controllers: [AutomationController],
  providers: [
    OutboundWebhookService,
    OutboundWebhookDispatchService,
    OutboundWebhookProcessor,
    SlackNotifierService,
    // Slack posting only needs to decrypt one stored webhook URL — depending on
    // `IntegrationsModule` here would create an import cycle (Integrations -> Email -> Customers ->
    // Automations -> this module), so the two small collaborators are provided directly.
    TokenCipherService,
    SlackConnector,
  ],
  exports: [OutboundWebhookDispatchService, OutboundWebhookService],
})
export class AutomationModule {}
