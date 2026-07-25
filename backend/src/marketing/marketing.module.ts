import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CampaignsService } from './campaigns.service';
import { ReferralsService } from './referrals.service';
import { CompetitorsService } from './competitors.service';
import { CampaignsController } from './campaigns.controller';
import { ReferralsController } from './referrals.controller';
import { CompetitorsController } from './competitors.controller';
import { CompetitorSnapshotScheduler } from './jobs/competitor-snapshot.scheduler';
import { CompetitorSnapshotProcessor } from './jobs/competitor-snapshot.processor';
import { COMPETITOR_SNAPSHOT_QUEUE } from './marketing.constants';
import { MessagingModule } from '../messaging/messaging.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: COMPETITOR_SNAPSHOT_QUEUE }),
    MessagingModule,
    CustomersModule,
  ],
  controllers: [
    CampaignsController,
    ReferralsController,
    CompetitorsController,
  ],
  providers: [
    CampaignsService,
    ReferralsService,
    CompetitorsService,
    CompetitorSnapshotScheduler,
    CompetitorSnapshotProcessor,
  ],
})
export class MarketingModule {}
