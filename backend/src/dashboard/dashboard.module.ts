import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { HealthScoreService } from './health-score.service';
import { HealthScoreController } from './health-score.controller';
import { HealthScoreSnapshotScheduler } from './jobs/health-score-snapshot.scheduler';
import { HealthScoreSnapshotProcessor } from './jobs/health-score-snapshot.processor';
import { AiInsightsService } from './ai-insights.service';
import { AiInsightsController } from './ai-insights.controller';
import { AiInsightsScheduler } from './jobs/ai-insights.scheduler';
import { AiInsightsProcessor } from './jobs/ai-insights.processor';
import {
  AI_INSIGHTS_QUEUE,
  HEALTH_SCORE_SNAPSHOT_QUEUE,
} from './dashboard.constants';
import { WidgetsModule } from '../widgets/widgets.module';
import { ProfitModule } from '../profit/profit.module';
import { AiModule } from '../ai/ai.module';
import { ActionCenterService } from './action-center.service';
import { ActionCenterController } from './action-center.controller';
import { TodayBusinessService } from './today-business.service';

@Module({
  imports: [
    WidgetsModule,
    ProfitModule,
    AiModule,
    BullModule.registerQueue(
      { name: HEALTH_SCORE_SNAPSHOT_QUEUE },
      { name: AI_INSIGHTS_QUEUE },
    ),
  ],
  controllers: [
    DashboardController,
    HealthScoreController,
    AiInsightsController,
    ActionCenterController,
  ],
  providers: [
    DashboardService,
    HealthScoreService,
    HealthScoreSnapshotScheduler,
    HealthScoreSnapshotProcessor,
    AiInsightsService,
    AiInsightsScheduler,
    AiInsightsProcessor,
    ActionCenterService,
    TodayBusinessService,
  ],
})
export class DashboardModule {}
