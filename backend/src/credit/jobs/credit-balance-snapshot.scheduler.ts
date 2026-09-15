import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CREDIT_BALANCE_SNAPSHOT_QUEUE } from './credit-balance-snapshot.constants';

/** Credit Outstanding KPI drawer fix-it — daily (02:00, after the nightly close's hourly tick
 * window) so the KpiRow's Credit Outstanding drawer can show a real week-over-week delta instead
 * of the "no historical snapshot" disclosure it shipped with. */
@Injectable()
export class CreditBalanceSnapshotScheduler implements OnModuleInit {
  private readonly logger = new Logger(CreditBalanceSnapshotScheduler.name);

  constructor(
    @InjectQueue(CREDIT_BALANCE_SNAPSHOT_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '0 2 * * *' },
          jobId: 'credit-balance-snapshot-daily-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register credit-balance-snapshot tick: ${error.message}`,
        ),
      );
  }
}
