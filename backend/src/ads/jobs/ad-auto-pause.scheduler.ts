import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AD_AUTO_PAUSE_QUEUE } from '../ads.constants';

/** Hourly tick, mirroring `QuotaResetScheduler` exactly. */
@Injectable()
export class AdAutoPauseScheduler implements OnModuleInit {
  private readonly logger = new Logger(AdAutoPauseScheduler.name);

  constructor(
    @InjectQueue(AD_AUTO_PAUSE_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '0 * * * *' },
          jobId: 'ad-auto-pause-hourly-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register ad-auto-pause tick: ${error.message}`,
        ),
      );
  }
}
