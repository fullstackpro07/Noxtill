import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CREDIT_OVERDUE_SCAN_QUEUE } from '../workflows.constants';

/** Registers the hourly overdue-installment scan tick — same pattern as `LowStockScanScheduler`. */
@Injectable()
export class CreditOverdueScanScheduler implements OnModuleInit {
  private readonly logger = new Logger(CreditOverdueScanScheduler.name);

  constructor(
    @InjectQueue(CREDIT_OVERDUE_SCAN_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '0 * * * *' },
          jobId: 'credit-overdue-scan-hourly-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register credit-overdue scan tick: ${error.message}`,
        ),
      );
  }
}
