import { Module } from '@nestjs/common';
import { AssistantService } from './assistant.service';
import { AssistantController } from './assistant.controller';
import { AiModule } from '../ai/ai.module';
import { VoiceCommandModule } from './voice-command/voice-command.module';

@Module({
  imports: [AiModule, VoiceCommandModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
