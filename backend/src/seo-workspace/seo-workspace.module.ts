import { Module } from '@nestjs/common';
import { SeoCalendarController } from './seo-calendar.controller';
import { SeoCalendarService } from './seo-calendar.service';
import { SeoAgentWorkspaceController } from './seo-agent-workspace.controller';
import { SeoAgentWorkspaceService } from './seo-agent-workspace.service';
import { SeoReportsController } from './seo-reports.controller';
import { SeoReportsService } from './seo-reports.service';
import { SeoSettingsController } from './seo-settings.controller';
import { SeoSettingsService } from './seo-settings.service';
import { SeoSpecialistAgentService } from './seo-specialist-agent.service';
import { AiModule } from '../ai/ai.module';
import { MarketingModule } from '../marketing/marketing.module';
import { SpecialistAgentEventQueueModule } from '../common/agents/specialist-agent-event-queue.module';
import { SeoAuditAgentEventProcessor } from './seo-audit-agent-event.processor';
import { IntegrationsModule } from '../integrations/integrations.module';
import { SeoSearchConsoleController } from './seo-search-console.controller';
import { SeoSearchConsoleService } from './seo-search-console.service';
import { SeoAnalyticsAttributionController } from './seo-analytics-attribution.controller';
import { SeoAnalyticsAttributionService } from './seo-analytics-attribution.service';

/**
 * SEO Autopilot screens 13–16 (Content Calendar, Agent Workspace, Reports, Settings). It reuses the
 * canonical content service rather than duplicating keyword and brief behavior.
 */
@Module({
  imports: [
    AiModule,
    MarketingModule,
    SpecialistAgentEventQueueModule,
    IntegrationsModule,
  ],
  controllers: [
    SeoCalendarController,
    SeoAgentWorkspaceController,
    SeoReportsController,
    SeoSettingsController,
    SeoSearchConsoleController,
    SeoAnalyticsAttributionController,
  ],
  providers: [
    SeoCalendarService,
    SeoAgentWorkspaceService,
    SeoReportsService,
    SeoSettingsService,
    SeoSpecialistAgentService,
    SeoAuditAgentEventProcessor,
    SeoSearchConsoleService,
    SeoAnalyticsAttributionService,
  ],
  exports: [SeoSpecialistAgentService],
})
export class SeoWorkspaceModule {}
