import { Module } from '@nestjs/common';
import { AssistantService } from './assistant.service';
import { AssistantController } from './assistant.controller';
import { AssistantAttachmentService } from './attachment.service';
import { AssistantReportService } from './assistant-report.service';
import { AssistantHistoryService } from './assistant-history.service';
import { AssistantHistoryController } from './assistant-history.controller';
import { AiModule } from '../ai/ai.module';
import { VoiceCommandModule } from './voice-command/voice-command.module';
import { StorageModule } from '../common/storage/storage.module';

@Module({
  imports: [AiModule, VoiceCommandModule, StorageModule],
  controllers: [AssistantController, AssistantHistoryController],
  providers: [
    AssistantService,
    AssistantAttachmentService,
    AssistantReportService,
    AssistantHistoryService,
  ],
})
export class AssistantModule {}
