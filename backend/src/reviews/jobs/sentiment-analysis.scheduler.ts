import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SENTIMENT_ANALYSIS_QUEUE } from '../sentiment-analysis.constants';

/** Daily (05:30) repeatable tick — just after the AI Insights daily tick (05:00). */
@Injectable()
export class SentimentAnalysisScheduler implements OnModuleInit {
  private readonly logger = new Logger(SentimentAnalysisScheduler.name);

  constructor(
    @InjectQueue(SENTIMENT_ANALYSIS_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '30 5 * * *' },
          jobId: 'sentiment-analysis-daily-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register sentiment-analysis tick: ${error.message}`,
        ),
      );
  }
}
