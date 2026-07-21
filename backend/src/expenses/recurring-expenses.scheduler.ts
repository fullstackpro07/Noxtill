import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RECURRING_EXPENSES_QUEUE } from './recurring-expenses.constants';

/** Registers the monthly recurring-expense clone job (fire-and-forget, same pattern as Nightly Close's scheduler). */
@Injectable()
export class RecurringExpensesScheduler implements OnModuleInit {
  private readonly logger = new Logger(RecurringExpensesScheduler.name);

  constructor(
    @InjectQueue(RECURRING_EXPENSES_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(
        'clone',
        {},
        {
          repeat: { pattern: '0 0 1 * *' }, // midnight on the 1st of every month
          jobId: 'recurring-expenses-monthly-clone',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register monthly clone job: ${error.message}`,
        ),
      );
  }
}
