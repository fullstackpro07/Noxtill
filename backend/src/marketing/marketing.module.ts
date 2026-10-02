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
  SEO_AUDIT_QUEUE,
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
import { SeoAutopilotService } from './seo-autopilot.service';
import { SeoAutopilotController } from './seo-autopilot.controller';
import { SeoOnPageController } from './seo-on-page.controller';
import { SeoOnPageService } from './seo-on-page.service';
import { SeoSiteAuditCrawler } from './seo-site-audit.crawler';
import { SeoSiteAuditService } from './seo-site-audit.service';
import { SeoAuditIssuesService } from './seo-audit-issues.service';
import { SeoAuditScheduleService } from './seo-audit-schedule.service';
import {
  SeoAuditScheduleProcessor,
  SeoAuditScheduleScheduler,
} from './jobs/seo-audit-schedule.processor';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: COMPETITOR_SNAPSHOT_QUEUE }),
    BullModule.registerQueue({ name: KEYWORD_RANK_QUEUE }),
    BullModule.registerQueue({ name: SEO_AUDIT_QUEUE }),
    MessagingModule,
    CustomersModule,
    ListingsModule,
    ProfitModule,
    AiModule,
    ActivityModule,
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
    SeoAutopilotController,
    SeoOnPageController,
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
    SeoAutopilotService,
    SeoSiteAuditCrawler,
    SeoSiteAuditService,
    SeoOnPageService,
    SeoAuditIssuesService,
    SeoAuditScheduleService,
    SeoAuditScheduleProcessor,
    SeoAuditScheduleScheduler,
  ],
  exports: [ReferralsService, CouponsService, VouchersService],
})
export class MarketingModule {}
