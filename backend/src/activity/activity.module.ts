import { Module } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { ActivityController } from './activity.controller';
import { ActivityPubSubService } from './activity-pubsub.service';
import { AutomationsModule } from '../marketing/automations/automations.module';
import { AutomationModule as OutboundWebhookAutomationModule } from '../integrations/automation/automation.module';

@Module({
  imports: [AutomationsModule, OutboundWebhookAutomationModule],
  controllers: [ActivityController],
  providers: [ActivityService, ActivityPubSubService],
  exports: [ActivityService, ActivityPubSubService],
})
export class ActivityModule {}
