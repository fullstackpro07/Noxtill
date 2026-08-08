import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { MessagingModule } from '../messaging/messaging.module';
import { ProfitModule } from '../profit/profit.module';
import { StaffModule } from '../staff/staff.module';

@Module({
  imports: [MessagingModule, ProfitModule, StaffModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
