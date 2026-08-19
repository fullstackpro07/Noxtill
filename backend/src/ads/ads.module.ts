import { Module } from '@nestjs/common';
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
import { IntegrationsModule } from '../integrations/integrations.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [IntegrationsModule, CustomersModule],
  controllers: [
    AdAccountsController,
    AdCampaignsController,
    AdCreativesController,
    AdAudiencesController,
    AdAnalyticsController,
    AdLeadsController,
  ],
  providers: [
    AdAccountsService,
    AdCampaignsService,
    AdCreativesService,
    AdAudiencesService,
    AdAnalyticsService,
    AdLeadsService,
  ],
})
export class AdsModule {}
