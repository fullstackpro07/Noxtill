import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SCHEDULED_EXPORTS_QUEUE } from './scheduled-exports.constants';

/** Registers the daily due-schedule check (same registration pattern as RecurringExpensesScheduler). */
@Injectable()
export class ScheduledExportsScheduler implements OnModuleInit {
  private readonly logger = new Logger(ScheduledExportsScheduler.name);

  constructor(
    @InjectQueue(SCHEDULED_EXPORTS_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(
        'check',
        {},
        {
          repeat: { pattern: '0 6 * * *' }, // 6am daily
          jobId: 'scheduled-exports-daily-check',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register scheduled-exports daily check job: ${error.message}`,
        ),
      );
  }
}
