import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { ReportBuildersService } from './report-builders.service';
import { ReportRunsService } from './report-runs.service';
import { TaxReportsService } from './tax-reports.service';
import { MessagingModule } from '../messaging/messaging.module';
import { StaffModule } from '../staff/staff.module';
import { CreditModule } from '../credit/credit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiModule } from '../ai/ai.module';
import { StorageModule } from '../common/storage/storage.module';

@Module({
  imports: [MessagingModule, StaffModule, CreditModule, NotificationsModule, AiModule, StorageModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportBuildersService, ReportRunsService, TaxReportsService],
  exports: [ReportsService, ReportRunsService, TaxReportsService],
})
export class ReportsModule {}
