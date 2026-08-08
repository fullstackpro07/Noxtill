import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { KEYWORD_RANK_QUEUE } from '../marketing.constants';

/** Weekly (Monday 04:00 — an hour after the competitor snapshot tick) repeatable tick. */
@Injectable()
export class KeywordRankScheduler implements OnModuleInit {
  private readonly logger = new Logger(KeywordRankScheduler.name);

  constructor(@InjectQueue(KEYWORD_RANK_QUEUE) private readonly queue: Queue) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '0 4 * * 1' },
          jobId: 'keyword-rank-weekly-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(`Failed to register keyword-rank tick: ${error.message}`),
      );
  }
}
