import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { ClaudeClient } from './claude.client';
import { AiInfraService } from './ai-infra.service';
import { AiSettingsService } from './ai-settings.service';
import { SpeechToTextService } from './speech-to-text.service';

@Module({
  controllers: [AiController],
  providers: [
    AiService,
    ClaudeClient,
    AiInfraService,
    AiSettingsService,
    SpeechToTextService,
  ],
  exports: [ClaudeClient, AiInfraService, SpeechToTextService],
})
export class AiModule {}
