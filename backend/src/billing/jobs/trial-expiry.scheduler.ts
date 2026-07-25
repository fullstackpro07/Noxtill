import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TRIAL_EXPIRY_QUEUE } from '../billing.constants';

/** Hourly tick — trial expiry is a plain UTC-timestamp comparison, no per-business local time involved. */
@Injectable()
export class TrialExpiryScheduler implements OnModuleInit {
  private readonly logger = new Logger(TrialExpiryScheduler.name);

  constructor(@InjectQueue(TRIAL_EXPIRY_QUEUE) private readonly queue: Queue) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        { repeat: { pattern: '0 * * * *' }, jobId: 'trial-expiry-hourly-tick' },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register trial-expiry tick: ${error.message}`,
        ),
      );
  }
}
