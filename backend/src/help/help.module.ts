import { Module } from '@nestjs/common';
import { HelpArticlesSeedService } from './help-articles-seed.service';
import { HelpService } from './help.service';
import { HelpController } from './help.controller';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [HelpController],
  providers: [HelpArticlesSeedService, HelpService],
  exports: [HelpService],
})
export class HelpModule {}
