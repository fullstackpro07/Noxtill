import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { COMPETITIVE_OPPORTUNITIES_QUEUE } from '../competitive.constants';

/** Weekly (Monday 05:30) repeatable tick — deliberately after the 05:00 daily ai-insights tick. */
@Injectable()
export class CompetitiveOpportunitiesScheduler implements OnModuleInit {
  private readonly logger = new Logger(CompetitiveOpportunitiesScheduler.name);

  constructor(
    @InjectQueue(COMPETITIVE_OPPORTUNITIES_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '30 5 * * 1' },
          jobId: 'competitive-opportunities-weekly-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register competitive-opportunities tick: ${error.message}`,
        ),
      );
  }
}
