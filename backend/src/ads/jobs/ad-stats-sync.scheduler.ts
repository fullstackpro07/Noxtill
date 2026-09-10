import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AD_STATS_SYNC_QUEUE } from '../ads.constants';

/** Hourly tick, mirroring `QuotaResetScheduler`/`AdAutoPauseScheduler` exactly. */
@Injectable()
export class AdStatsSyncScheduler implements OnModuleInit {
  private readonly logger = new Logger(AdStatsSyncScheduler.name);

  constructor(
    @InjectQueue(AD_STATS_SYNC_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '0 * * * *' },
          jobId: 'ad-stats-sync-hourly-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register ad-stats-sync tick: ${error.message}`,
        ),
      );
  }
}
