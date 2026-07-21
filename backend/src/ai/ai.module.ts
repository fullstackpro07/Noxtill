import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { ClaudeClient } from './claude.client';

@Module({
  controllers: [AiController],
  providers: [AiService, ClaudeClient],
  exports: [ClaudeClient],
})
export class AiModule {}
