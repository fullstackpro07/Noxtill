import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { VisibilityScoreService } from './visibility-score.service';
import { VisibilityScoreController } from './visibility-score.controller';
import { VisibilityScoreSnapshotScheduler } from './jobs/visibility-score-snapshot.scheduler';
import { VisibilityScoreSnapshotProcessor } from './jobs/visibility-score-snapshot.processor';
import { CompetitiveOpportunitiesService } from './competitive-opportunities.service';
import { CompetitiveOpportunitiesScheduler } from './jobs/competitive-opportunities.scheduler';
import { CompetitiveOpportunitiesProcessor } from './jobs/competitive-opportunities.processor';
import { CompetitiveSettingsService } from './competitive-settings.service';
import { CompetitorSocialService } from './competitor-social.service';
import { OwnListingCompletenessService } from './own-listing-completeness.service';
import { CompetitiveWeeklyReportService } from './competitive-weekly-report.service';
import { CompetitiveWeeklyReportScheduler } from './jobs/competitive-weekly-report.scheduler';
import { CompetitiveWeeklyReportProcessor } from './jobs/competitive-weekly-report.processor';
import { CompetitiveController } from './competitive.controller';
import {
  COMPETITIVE_OPPORTUNITIES_QUEUE,
  COMPETITIVE_WEEKLY_REPORT_QUEUE,
  VISIBILITY_SCORE_SNAPSHOT_QUEUE,
} from './competitive.constants';
import { ListingsModule } from '../listings/listings.module';
import { AiModule } from '../ai/ai.module';
import { SocialModule } from '../social/social.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: VISIBILITY_SCORE_SNAPSHOT_QUEUE },
      { name: COMPETITIVE_OPPORTUNITIES_QUEUE },
      { name: COMPETITIVE_WEEKLY_REPORT_QUEUE },
    ),
    ListingsModule,
    AiModule,
    SocialModule,
    MessagingModule,
  ],
  controllers: [VisibilityScoreController, CompetitiveController],
  providers: [
    VisibilityScoreService,
    VisibilityScoreSnapshotScheduler,
    VisibilityScoreSnapshotProcessor,
    CompetitiveOpportunitiesService,
    CompetitiveOpportunitiesScheduler,
    CompetitiveOpportunitiesProcessor,
    CompetitiveSettingsService,
    CompetitorSocialService,
    OwnListingCompletenessService,
    CompetitiveWeeklyReportService,
    CompetitiveWeeklyReportScheduler,
    CompetitiveWeeklyReportProcessor,
  ],
})
export class CompetitiveModule {}
