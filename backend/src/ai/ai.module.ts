import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { ClaudeClient } from './claude.client';
import { AiInfraService } from './ai-infra.service';

@Module({
  controllers: [AiController],
  providers: [AiService, ClaudeClient, AiInfraService],
  exports: [ClaudeClient, AiInfraService],
})
export class AiModule {}
