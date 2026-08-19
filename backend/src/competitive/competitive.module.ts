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
import { CompetitiveController } from './competitive.controller';
import {
  COMPETITIVE_OPPORTUNITIES_QUEUE,
  VISIBILITY_SCORE_SNAPSHOT_QUEUE,
} from './competitive.constants';
import { ListingsModule } from '../listings/listings.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: VISIBILITY_SCORE_SNAPSHOT_QUEUE },
      { name: COMPETITIVE_OPPORTUNITIES_QUEUE },
    ),
    ListingsModule,
    AiModule,
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
  ],
})
export class CompetitiveModule {}
