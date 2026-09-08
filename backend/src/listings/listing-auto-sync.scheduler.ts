import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { LISTINGS_AUTO_SYNC_QUEUE } from './listings.constants';

/** Registers the hourly auto-sync tick (UPD-BE-125) — same fire-and-forget pattern as `GmbInsightsScheduler`. Runs every hour so each business's own configured frequency is checked promptly, not the frequency itself. */
@Injectable()
export class ListingAutoSyncScheduler implements OnModuleInit {
  private readonly logger = new Logger(ListingAutoSyncScheduler.name);

  constructor(
    @InjectQueue(LISTINGS_AUTO_SYNC_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '0 * * * *' },
          jobId: 'listings-auto-sync-hourly-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register listings auto-sync tick: ${error.message}`,
        ),
      );
  }
}
