import { Module } from '@nestjs/common';
import { ApiKeyService } from './api-key.service';
import { ApiKeysController } from './api-keys.controller';
import { DeveloperWebhooksController } from './developer-webhooks.controller';
import { DeveloperOverviewController } from './developer-overview.controller';
import { DeveloperOverviewService } from './developer-overview.service';
import { AutomationModule as OutboundWebhookAutomationModule } from '../integrations/automation/automation.module';

/** `ApiKeyAuthService` (the guard-facing read side) lives in `CommonModule`, global — not repeated here. */
@Module({
  imports: [OutboundWebhookAutomationModule],
  controllers: [
    ApiKeysController,
    DeveloperWebhooksController,
    DeveloperOverviewController,
  ],
  providers: [ApiKeyService, DeveloperOverviewService],
})
export class DeveloperModule {}
