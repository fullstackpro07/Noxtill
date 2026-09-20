import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ExportsService } from './exports.service';
import { ExportsController } from './exports.controller';
import { AccountZipProcessor } from './account-zip.processor';
import { ScheduledExportsService } from './scheduled-exports.service';
import { ScheduledExportsController } from './scheduled-exports.controller';
import { ScheduledExportsScheduler } from './scheduled-exports.scheduler';
import { ScheduledExportsProcessor } from './scheduled-exports.processor';
import { DATA_EXPORTS_QUEUE, EXPORTS_QUEUE } from './exports.constants';
import { DataExportsService } from './data-exports.service';
import { DataExportsController } from './data-exports.controller';
import { DataExportsProcessor } from './data-exports.processor';
import { SCHEDULED_EXPORTS_QUEUE } from './scheduled-exports.constants';
import { BackupService } from './backup.service';
import { BackupProcessor } from './backup.processor';
import { BackupScheduler } from './backup.scheduler';
import { BACKUP_QUEUE } from './backup.constants';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReportsModule } from '../reports/reports.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: EXPORTS_QUEUE }),
    BullModule.registerQueue({ name: SCHEDULED_EXPORTS_QUEUE }),
    BullModule.registerQueue({ name: DATA_EXPORTS_QUEUE }),
    BullModule.registerQueue({ name: BACKUP_QUEUE }),
    NotificationsModule,
    ReportsModule,
    MessagingModule,
  ],
  // ScheduledExportsController (`/exports/schedules`) must be registered BEFORE ExportsController
  // — Nest/Express resolve routes in registration order, and ExportsController's `GET/:kind` would
  // otherwise swallow `/exports/schedules` as if `kind` were literally "schedules" (same class of
  // ordering issue as BundlesController/PricingController vs ProductsController in products.module.ts).
  controllers: [
    ScheduledExportsController,
    DataExportsController,
    ExportsController,
  ],
  providers: [
    ExportsService,
    AccountZipProcessor,
    ScheduledExportsService,
    ScheduledExportsScheduler,
    ScheduledExportsProcessor,
    DataExportsService,
    DataExportsProcessor,
    BackupService,
    BackupProcessor,
    BackupScheduler,
  ],
  exports: [BackupService],
})
export class ExportsModule {}
