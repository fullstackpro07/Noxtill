import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { GMB_INSIGHTS_QUEUE } from './listings.constants';

/** Registers the nightly GMB insights-pull tick (UPD-BE-042) — fire-and-forget, same pattern as `LowStockScanScheduler`. */
@Injectable()
export class GmbInsightsScheduler implements OnModuleInit {
  private readonly logger = new Logger(GmbInsightsScheduler.name);

  constructor(@InjectQueue(GMB_INSIGHTS_QUEUE) private readonly queue: Queue) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '0 3 * * *' },
          jobId: 'gmb-insights-nightly-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register GMB insights tick: ${error.message}`,
        ),
      );
  }
}
