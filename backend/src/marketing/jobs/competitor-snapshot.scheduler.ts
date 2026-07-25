import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { COMPETITOR_SNAPSHOT_QUEUE } from '../marketing.constants';

/** Weekly (Monday 03:00) repeatable tick. */
@Injectable()
export class CompetitorSnapshotScheduler implements OnModuleInit {
  private readonly logger = new Logger(CompetitorSnapshotScheduler.name);

  constructor(
    @InjectQueue(COMPETITOR_SNAPSHOT_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '0 3 * * 1' },
          jobId: 'competitor-snapshot-weekly-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register competitor-snapshot tick: ${error.message}`,
        ),
      );
  }
}
