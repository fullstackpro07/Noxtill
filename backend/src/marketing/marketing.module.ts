import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CampaignsService } from './campaigns.service';
import { ReferralsService } from './referrals.service';
import { CompetitorsService } from './competitors.service';
import { KeywordsService } from './keywords.service';
import { CampaignsController } from './campaigns.controller';
import { ReferralsController } from './referrals.controller';
import { CompetitorsController } from './competitors.controller';
import { CompetitorObservationsController } from './competitor-observations.controller';
import { CompetitorObservationsService } from './competitor-observations.service';
import { KeywordsController } from './keywords.controller';
import { OverviewController } from './overview.controller';
import { MarketingOverviewService } from './overview.service';
import { CompetitorSnapshotScheduler } from './jobs/competitor-snapshot.scheduler';
import { CompetitorSnapshotProcessor } from './jobs/competitor-snapshot.processor';
import { KeywordRankScheduler } from './jobs/keyword-rank.scheduler';
import { KeywordRankProcessor } from './jobs/keyword-rank.processor';
import { GooglePlacesService } from './google-places.service';
import { SerpRankService } from './serp-rank.service';
import { GoogleTrendsService } from './google-trends.service';
import { MetaAdLibraryService } from './meta-ad-library.service';
import {
  COMPETITOR_SNAPSHOT_QUEUE,
  KEYWORD_RANK_QUEUE,
} from './marketing.constants';
import { MessagingModule } from '../messaging/messaging.module';
import { CustomersModule } from '../customers/customers.module';
import { CouponsService } from './coupons.service';
import { CouponsController } from './coupons.controller';
import { VouchersService } from './vouchers.service';
import { VouchersController } from './vouchers.controller';
import { SeoHeatmapService } from './seo-heatmap.service';
import { SeoHeatmapController } from './seo-heatmap.controller';
import { ListingsModule } from '../listings/listings.module';
import { ProfitModule } from '../profit/profit.module';
import { AiModule } from '../ai/ai.module';
import { MarketingAssetsService } from './marketing-assets.service';
import { MarketingAssetsController } from './marketing-assets.controller';
import { ContentItemsService } from './content-items.service';
import { ContentItemsController } from './content-items.controller';
import { MarketingTasksService } from './marketing-tasks.service';
import { MarketingTasksController } from './marketing-tasks.controller';
import { MarketingSettingsService } from './marketing-settings.service';
import { MarketingSettingsController } from './marketing-settings.controller';

@Module({
  imports: [
    BullModule.registerQueue({ name: COMPETITOR_SNAPSHOT_QUEUE }),
    BullModule.registerQueue({ name: KEYWORD_RANK_QUEUE }),
    MessagingModule,
    CustomersModule,
    ListingsModule,
    ProfitModule,
    AiModule,
  ],
  controllers: [
    CampaignsController,
    ReferralsController,
    CompetitorsController,
    CompetitorObservationsController,
    KeywordsController,
    OverviewController,
    CouponsController,
    VouchersController,
    SeoHeatmapController,
    MarketingAssetsController,
    ContentItemsController,
    MarketingTasksController,
    MarketingSettingsController,
  ],
  providers: [
    CampaignsService,
    ReferralsService,
    CompetitorsService,
    CompetitorObservationsService,
    KeywordsService,
    MarketingOverviewService,
    CompetitorSnapshotScheduler,
    CompetitorSnapshotProcessor,
    KeywordRankScheduler,
    KeywordRankProcessor,
    GooglePlacesService,
    SerpRankService,
    GoogleTrendsService,
    MetaAdLibraryService,
    CouponsService,
    VouchersService,
    SeoHeatmapService,
    MarketingAssetsService,
    ContentItemsService,
    MarketingTasksService,
    MarketingSettingsService,
  ],
  exports: [ReferralsService, CouponsService, VouchersService],
})
export class MarketingModule {}
