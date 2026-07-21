import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BOOKING_REMINDERS_QUEUE } from './booking-reminders.constants';

@Injectable()
export class BookingRemindersScheduler implements OnModuleInit {
  private readonly logger = new Logger(BookingRemindersScheduler.name);

  constructor(
    @InjectQueue(BOOKING_REMINDERS_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '*/15 * * * *' },
          jobId: 'booking-reminders-15min-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register booking-reminders tick: ${error.message}`,
        ),
      );
  }
}
