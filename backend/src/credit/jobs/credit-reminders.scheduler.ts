import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CREDIT_REMINDERS_QUEUE } from './credit-reminders.constants';

/** Credit reminder rules (UPD-BE-095) — runs once a day; each debtor is reminded at most once per
 * day even if they match multiple rules (see `CreditRemindersProcessor`). */
@Injectable()
export class CreditRemindersScheduler implements OnModuleInit {
  private readonly logger = new Logger(CreditRemindersScheduler.name);

  constructor(
    @InjectQueue(CREDIT_REMINDERS_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '0 9 * * *' },
          jobId: 'credit-reminders-daily-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register credit-reminders tick: ${error.message}`,
        ),
      );
  }
}
