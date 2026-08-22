import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ExportsService } from './exports.service';
import { ExportsController } from './exports.controller';
import { AccountZipProcessor } from './account-zip.processor';
import { ScheduledExportsService } from './scheduled-exports.service';
import { ScheduledExportsController } from './scheduled-exports.controller';
import { ScheduledExportsScheduler } from './scheduled-exports.scheduler';
import { ScheduledExportsProcessor } from './scheduled-exports.processor';
import { EXPORTS_QUEUE } from './exports.constants';
import { SCHEDULED_EXPORTS_QUEUE } from './scheduled-exports.constants';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: EXPORTS_QUEUE }),
    BullModule.registerQueue({ name: SCHEDULED_EXPORTS_QUEUE }),
    NotificationsModule,
  ],
  // ScheduledExportsController (`/exports/schedules`) must be registered BEFORE ExportsController
  // — Nest/Express resolve routes in registration order, and ExportsController's `GET/:kind` would
  // otherwise swallow `/exports/schedules` as if `kind` were literally "schedules" (same class of
  // ordering issue as BundlesController/PricingController vs ProductsController in products.module.ts).
  controllers: [ScheduledExportsController, ExportsController],
  providers: [
    ExportsService,
    AccountZipProcessor,
    ScheduledExportsService,
    ScheduledExportsScheduler,
    ScheduledExportsProcessor,
  ],
})
export class ExportsModule {}
