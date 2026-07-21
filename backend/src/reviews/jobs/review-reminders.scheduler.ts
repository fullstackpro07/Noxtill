import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { REVIEW_REMINDERS_QUEUE } from './review-reminders.constants';

/** Hourly heartbeat; the processor only acts once a business hits its configured local hour. */
@Injectable()
export class ReviewRemindersScheduler implements OnModuleInit {
  private readonly logger = new Logger(ReviewRemindersScheduler.name);

  constructor(
    @InjectQueue(REVIEW_REMINDERS_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '0 * * * *' },
          jobId: 'review-reminders-hourly-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register review-reminders tick: ${error.message}`,
        ),
      );
  }
}
