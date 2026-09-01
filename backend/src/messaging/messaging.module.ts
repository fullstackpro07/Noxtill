import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SendGateService } from './send-gate.service';
import { TemplateRegistryService } from './templates/template-registry.service';
import { SmsService } from './channels/sms.service';
import { EmailService } from './channels/email.service';
import { MessageWorkerProcessor } from './message-worker.processor';
import { MessageDeadLetterListener } from './message-dead-letter.listener';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { MessagingChannelsService } from './messaging-channels.service';
import { MessagingChannelsController } from './messaging-channels.controller';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { SettingsModule } from '../settings/settings.module';
import { MESSAGES_QUEUE } from './messaging.constants';
import { dlqName } from '../common/queue/queue.constants';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: MESSAGES_QUEUE },
      { name: dlqName(MESSAGES_QUEUE) },
    ),
    WhatsappModule,
    SettingsModule,
  ],
  controllers: [MessagesController, MessagingChannelsController],
  providers: [
    SendGateService,
    TemplateRegistryService,
    SmsService,
    EmailService,
    MessageWorkerProcessor,
    MessageDeadLetterListener,
    MessagesService,
    MessagingChannelsService,
  ],
  exports: [SendGateService, TemplateRegistryService],
})
export class MessagingModule {}
