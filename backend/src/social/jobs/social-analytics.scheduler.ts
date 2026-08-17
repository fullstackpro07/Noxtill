import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SOCIAL_ANALYTICS_QUEUE } from '../social.constants';

/** Registers the nightly social-analytics pull tick (UPD-BE-050) — same pattern as `GmbInsightsScheduler`/`LowStockScanScheduler`. */
@Injectable()
export class SocialAnalyticsScheduler implements OnModuleInit {
  private readonly logger = new Logger(SocialAnalyticsScheduler.name);

  constructor(
    @InjectQueue(SOCIAL_ANALYTICS_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '0 4 * * *' },
          jobId: 'social-analytics-nightly-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register social analytics tick: ${error.message}`,
        ),
      );
  }
}
