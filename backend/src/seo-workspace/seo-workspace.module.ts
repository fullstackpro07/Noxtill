import { Module } from '@nestjs/common';
import { SeoCalendarController } from './seo-calendar.controller';
import { SeoCalendarService } from './seo-calendar.service';

/**
 * SEO Autopilot screens 13–16 (Content Calendar, Agent Workspace, Reports, Settings). Kept in its own
 * module so it never edits MarketingModule; it reads the canonical SEO records directly.
 */
@Module({
  controllers: [SeoCalendarController],
  providers: [SeoCalendarService],
})
export class SeoWorkspaceModule {}
