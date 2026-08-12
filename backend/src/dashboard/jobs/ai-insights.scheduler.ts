import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AI_INSIGHTS_QUEUE } from '../dashboard.constants';

/** Daily (05:00) repeatable tick — after the weekly health-score (Mon 04:00) and competitor-snapshot (Mon 03:00) jobs. */
@Injectable()
export class AiInsightsScheduler implements OnModuleInit {
  private readonly logger = new Logger(AiInsightsScheduler.name);

  constructor(@InjectQueue(AI_INSIGHTS_QUEUE) private readonly queue: Queue) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '0 5 * * *' },
          jobId: 'ai-insights-daily-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register ai-insights tick: ${error.message}`,
        ),
      );
  }
}
