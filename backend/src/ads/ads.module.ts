import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AdAccountsService } from './ad-accounts.service';
import { AdAccountsController } from './ad-accounts.controller';
import { AdCampaignsService } from './ad-campaigns.service';
import { AdCampaignsController } from './ad-campaigns.controller';
import { AdCreativesService } from './ad-creatives.service';
import { AdCreativesController } from './ad-creatives.controller';
import { AdAudiencesService } from './ad-audiences.service';
import { AdAudiencesController } from './ad-audiences.controller';
import { AdAnalyticsService } from './ad-analytics.service';
import { AdAnalyticsController } from './ad-analytics.controller';
import { AdLeadsService } from './ad-leads.service';
import { AdLeadsController } from './ad-leads.controller';
import { AdSettingsService } from './ad-settings.service';
import { AdSettingsController } from './ad-settings.controller';
import { AdAutoPauseScheduler } from './jobs/ad-auto-pause.scheduler';
import { AdAutoPauseProcessor } from './jobs/ad-auto-pause.processor';
import { AdStatsSyncScheduler } from './jobs/ad-stats-sync.scheduler';
import { AdStatsSyncProcessor } from './jobs/ad-stats-sync.processor';
import { AD_AUTO_PAUSE_QUEUE, AD_STATS_SYNC_QUEUE } from './ads.constants';
import { IntegrationsModule } from '../integrations/integrations.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [
    IntegrationsModule,
    CustomersModule,
    BullModule.registerQueue(
      { name: AD_AUTO_PAUSE_QUEUE },
      { name: AD_STATS_SYNC_QUEUE },
    ),
  ],
  controllers: [
    AdAccountsController,
    AdCampaignsController,
    AdCreativesController,
    AdAudiencesController,
    AdAnalyticsController,
    AdLeadsController,
    AdSettingsController,
  ],
  providers: [
    AdAccountsService,
    AdCampaignsService,
    AdCreativesService,
    AdAudiencesService,
    AdAnalyticsService,
    AdLeadsService,
    AdSettingsService,
    AdAutoPauseScheduler,
    AdAutoPauseProcessor,
    AdStatsSyncScheduler,
    AdStatsSyncProcessor,
  ],
  exports: [AdCampaignsService],
})
export class AdsModule {}
