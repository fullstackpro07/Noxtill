import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MessagingModule } from '../messaging/messaging.module';
import { SocialModule } from '../social/social.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiModule } from '../ai/ai.module';
import { LocalizationModule } from '../common/localization/localization.module';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';
import { InboxViewsService } from './inbox-views.service';
import { InboxRepliesService } from './inbox-replies.service';
import { InboxRulesService } from './inbox-rules.service';
import { InboxSettingsService } from './inbox-settings.service';
import { InboxCoreService } from './inbox-core.service';
import { InboxFactsService } from './inbox-facts.service';
import { InboxSendService } from './inbox-send.service';
import { InboxAiService } from './inbox-ai.service';
import { InboxAutomationService } from './inbox-automation.service';
import {
  INBOX_AUTOMATION_QUEUE,
  InboxAutomationProcessor,
  InboxAutomationScheduler,
} from './inbox-automation.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: INBOX_AUTOMATION_QUEUE }),
    MessagingModule,
    SocialModule,
    WhatsappModule,
    NotificationsModule,
    AiModule,
    LocalizationModule,
  ],
  controllers: [InboxController],
  providers: [
    InboxService,
    InboxViewsService,
    InboxRepliesService,
    InboxRulesService,
    InboxSettingsService,
    InboxCoreService,
    InboxFactsService,
    InboxSendService,
    InboxAiService,
    InboxAutomationService,
    InboxAutomationScheduler,
    InboxAutomationProcessor,
  ],
  exports: [InboxAutomationService],
})
export class UnifiedInboxModule {}
