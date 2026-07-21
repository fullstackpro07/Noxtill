import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { LOW_STOCK_SCAN_QUEUE } from './low-stock-scan.constants';

/** Registers the hourly low-stock scan tick (spec §6 jobs list) — fire-and-forget, same pattern as other schedulers. */
@Injectable()
export class LowStockScanScheduler implements OnModuleInit {
  private readonly logger = new Logger(LowStockScanScheduler.name);

  constructor(
    @InjectQueue(LOW_STOCK_SCAN_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '0 * * * *' },
          jobId: 'low-stock-scan-hourly-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register low-stock scan tick: ${error.message}`,
        ),
      );
  }
}
