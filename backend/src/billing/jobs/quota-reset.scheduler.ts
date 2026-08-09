import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUOTA_RESET_QUEUE } from '../billing.constants';

/** Hourly tick, mirroring TrialExpiryScheduler exactly — the processor itself decides whether a new UTC calendar month has actually started for any given business. */
@Injectable()
export class QuotaResetScheduler implements OnModuleInit {
  private readonly logger = new Logger(QuotaResetScheduler.name);

  constructor(@InjectQueue(QUOTA_RESET_QUEUE) private readonly queue: Queue) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        { repeat: { pattern: '0 * * * *' }, jobId: 'quota-reset-hourly-tick' },
      )
      .catch((error: Error) =>
        this.logger.error(`Failed to register quota-reset tick: ${error.message}`),
      );
  }
}
