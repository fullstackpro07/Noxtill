import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NIGHTLY_CLOSE_QUEUE } from './nightly-close.constants';

/**
 * Registers the hourly repeatable tick once at boot (BullMQ handles the
 * recurrence). Registration is fire-and-forget: if Redis isn't reachable yet,
 * the rest of the app must still boot — BullMQ will retry the connection in
 * the background and this job registers as soon as it can.
 */
@Injectable()
export class NightlyCloseScheduler implements OnModuleInit {
  private readonly logger = new Logger(NightlyCloseScheduler.name);

  constructor(@InjectQueue(NIGHTLY_CLOSE_QUEUE) private readonly queue: Queue) {
    // An unlistened 'error' event on the queue's connection (e.g. Redis over
    // quota) throws and crashes the whole process, not just this scheduler.
    this.queue.on('error', (error: Error) =>
      this.logger.warn(
        `Nightly close queue connection error: ${error.message}`,
      ),
    );
  }

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '0 * * * *' },
          jobId: 'nightly-close-hourly-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(`Failed to register hourly tick: ${error.message}`),
      );
  }
}
