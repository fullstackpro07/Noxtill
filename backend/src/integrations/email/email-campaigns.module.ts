import { Module } from '@nestjs/common';
import { EmailCampaignsService } from './email-campaigns.service';
import { EmailCampaignsController } from './email-campaigns.controller';
import { CustomersModule } from '../../customers/customers.module';

@Module({
  imports: [CustomersModule],
  controllers: [EmailCampaignsController],
  providers: [EmailCampaignsService],
})
export class EmailCampaignsModule {}
