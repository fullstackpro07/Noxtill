import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { BookingSyncService } from './booking-sync.service';

export const BOOKING_SYNC_QUEUE = 'integration-booking-sync';

/** Every five minutes — mirrors `BookingRemindersScheduler`. */
@Injectable()
export class BookingSyncScheduler implements OnModuleInit {
  private readonly logger = new Logger(BookingSyncScheduler.name);

  constructor(@InjectQueue(BOOKING_SYNC_QUEUE) private readonly queue: Queue) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '*/5 * * * *' },
          jobId: 'integration-booking-sync-5min-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register booking-sync tick: ${error.message}`,
        ),
      );
  }
}

@Processor(BOOKING_SYNC_QUEUE)
export class BookingSyncProcessor extends WorkerHost {
  constructor(private readonly sync: BookingSyncService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'tick') return;
    await this.sync.runAll();
  }
}
