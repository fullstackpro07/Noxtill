import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { IntegrationsModule } from '../integrations.module';
import { SyncLogService } from './sync-log.service';
import { CapabilitySyncService } from './capability-sync.service';
import { BookingSyncService } from './booking-sync.service';
import {
  BOOKING_SYNC_QUEUE,
  BookingSyncProcessor,
  BookingSyncScheduler,
} from './booking-sync.jobs';

/**
 * The real sync paths for the connectors added in the Integrations redesign — payments, analytics,
 * marketing audiences, Merchant Center, and booking calendars/meetings.
 */
@Module({
  imports: [
    IntegrationsModule,
    BullModule.registerQueue({ name: BOOKING_SYNC_QUEUE }),
  ],
  providers: [
    SyncLogService,
    CapabilitySyncService,
    BookingSyncService,
    BookingSyncScheduler,
    BookingSyncProcessor,
  ],
  exports: [SyncLogService, CapabilitySyncService, BookingSyncService],
})
export class IntegrationSyncModule {}
