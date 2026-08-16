import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CampaignsService } from './campaigns.service';
import { ReferralsService } from './referrals.service';
import { CompetitorsService } from './competitors.service';
import { KeywordsService } from './keywords.service';
import { CampaignsController } from './campaigns.controller';
import { ReferralsController } from './referrals.controller';
import { CompetitorsController } from './competitors.controller';
import { KeywordsController } from './keywords.controller';
import { OverviewController } from './overview.controller';
import { MarketingOverviewService } from './overview.service';
import { CompetitorSnapshotScheduler } from './jobs/competitor-snapshot.scheduler';
import { CompetitorSnapshotProcessor } from './jobs/competitor-snapshot.processor';
import { KeywordRankScheduler } from './jobs/keyword-rank.scheduler';
import { KeywordRankProcessor } from './jobs/keyword-rank.processor';
import { GooglePlacesService } from './google-places.service';
import { SerpRankService } from './serp-rank.service';
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

@Module({
  imports: [
    BullModule.registerQueue({ name: COMPETITOR_SNAPSHOT_QUEUE }),
    BullModule.registerQueue({ name: KEYWORD_RANK_QUEUE }),
    MessagingModule,
    CustomersModule,
  ],
  controllers: [
    CampaignsController,
    ReferralsController,
    CompetitorsController,
    KeywordsController,
    OverviewController,
    CouponsController,
    VouchersController,
  ],
  providers: [
    CampaignsService,
    ReferralsService,
    CompetitorsService,
    KeywordsService,
    MarketingOverviewService,
    CompetitorSnapshotScheduler,
    CompetitorSnapshotProcessor,
    KeywordRankScheduler,
    KeywordRankProcessor,
    GooglePlacesService,
    SerpRankService,
    CouponsService,
    VouchersService,
  ],
  exports: [ReferralsService, CouponsService, VouchersService],
})
export class MarketingModule {}
