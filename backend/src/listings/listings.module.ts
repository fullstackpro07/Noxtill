import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MasterListingService } from './master-listing.service';
import { ListingSyncService } from './listing-sync.service';
import { GmbManagementService } from './gmb-management.service';
import { GmbInsightsScheduler } from './gmb-insights.scheduler';
import { GmbInsightsProcessor } from './gmb-insights.processor';
import { ListingPhotosService } from './listing-photos.service';
import { ListingSettingsService } from './listing-settings.service';
import { ListingAutoSyncScheduler } from './listing-auto-sync.scheduler';
import { ListingAutoSyncProcessor } from './listing-auto-sync.processor';
import { ListingsController } from './listings.controller';
import {
  GMB_INSIGHTS_QUEUE,
  LISTINGS_AUTO_SYNC_QUEUE,
} from './listings.constants';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: GMB_INSIGHTS_QUEUE }),
    BullModule.registerQueue({ name: LISTINGS_AUTO_SYNC_QUEUE }),
    IntegrationsModule,
  ],
  controllers: [ListingsController],
  providers: [
    MasterListingService,
    ListingSyncService,
    GmbManagementService,
    GmbInsightsScheduler,
    GmbInsightsProcessor,
    ListingPhotosService,
    ListingSettingsService,
    ListingAutoSyncScheduler,
    ListingAutoSyncProcessor,
  ],
  exports: [
    MasterListingService,
    ListingSyncService,
    GmbManagementService,
    ListingPhotosService,
    ListingSettingsService,
  ],
})
export class ListingsModule {}
