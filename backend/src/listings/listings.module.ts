import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MasterListingService } from './master-listing.service';
import { ListingSyncService } from './listing-sync.service';
import { GmbManagementService } from './gmb-management.service';
import { GmbInsightsScheduler } from './gmb-insights.scheduler';
import { GmbInsightsProcessor } from './gmb-insights.processor';
import { ListingsController } from './listings.controller';
import { GMB_INSIGHTS_QUEUE } from './listings.constants';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: GMB_INSIGHTS_QUEUE }),
    IntegrationsModule,
  ],
  controllers: [ListingsController],
  providers: [
    MasterListingService,
    ListingSyncService,
    GmbManagementService,
    GmbInsightsScheduler,
    GmbInsightsProcessor,
  ],
  exports: [MasterListingService, ListingSyncService, GmbManagementService],
})
export class ListingsModule {}
