import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { AiRouterService } from './routing/ai-router.service';
import { AiInfraService } from './ai-infra.service';
import { AiSettingsService } from './ai-settings.service';
import { SpeechToTextService } from './speech-to-text.service';

@Module({
  controllers: [AiController],
  providers: [
    AiService,
    AiRouterService,
    AiInfraService,
    AiSettingsService,
    SpeechToTextService,
  ],
  exports: [AiRouterService, AiInfraService, SpeechToTextService],
})
export class AiModule {}
