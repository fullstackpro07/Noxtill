import { Module } from '@nestjs/common';
import { SeoCalendarController } from './seo-calendar.controller';
import { SeoCalendarService } from './seo-calendar.service';
import { SeoAgentWorkspaceController } from './seo-agent-workspace.controller';
import { SeoAgentWorkspaceService } from './seo-agent-workspace.service';

/**
 * SEO Autopilot screens 13–16 (Content Calendar, Agent Workspace, Reports, Settings). Kept in its own
 * module so it never edits MarketingModule; it reads the canonical SEO records directly.
 */
@Module({
  controllers: [SeoCalendarController, SeoAgentWorkspaceController],
  providers: [SeoCalendarService, SeoAgentWorkspaceService],
})
export class SeoWorkspaceModule {}
