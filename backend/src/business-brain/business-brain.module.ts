import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MessagingModule } from '../messaging/messaging.module';
import { CreditModule } from '../credit/credit.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProfitModule } from '../profit/profit.module';
import { AssistantModule } from '../assistant/assistant.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BrainController } from './brain.controller';
import { BrainContextService } from './brain-context.service';
import { BrainMetricsService } from './brain-metrics.service';
import { BrainDetectorsService } from './brain-detectors.service';
import { BrainReadingService } from './brain-reading.service';
import { BrainCauseService } from './brain-cause.service';
import { BrainActionsService } from './brain-actions.service';
import { BrainDecisionsService } from './brain-decisions.service';
import { BrainWatchService } from './brain-watch.service';
import { BrainAskService } from './brain-ask.service';
import { BrainViewsService } from './brain-views.service';
import { BrainTickProcessor, BrainTickScheduler } from './brain-tick.processor';
import { BRAIN_TICK_QUEUE } from './brain.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: BRAIN_TICK_QUEUE }),
    MessagingModule,
    CreditModule,
    InventoryModule,
    ProfitModule,
    AssistantModule,
    NotificationsModule,
  ],
  controllers: [BrainController],
  providers: [
    BrainContextService,
    BrainMetricsService,
    BrainDetectorsService,
    BrainReadingService,
    BrainCauseService,
    BrainActionsService,
    BrainDecisionsService,
    BrainWatchService,
    BrainAskService,
    BrainViewsService,
    BrainTickScheduler,
    BrainTickProcessor,
  ],
})
export class BusinessBrainModule {}
