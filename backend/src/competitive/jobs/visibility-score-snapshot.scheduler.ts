import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { VISIBILITY_SCORE_SNAPSHOT_QUEUE } from '../competitive.constants';

/** Weekly (Monday 04:30) repeatable tick — deliberately after the 04:00 health-score-snapshot tick. */
@Injectable()
export class VisibilityScoreSnapshotScheduler implements OnModuleInit {
  private readonly logger = new Logger(VisibilityScoreSnapshotScheduler.name);

  constructor(
    @InjectQueue(VISIBILITY_SCORE_SNAPSHOT_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '30 4 * * 1' },
          jobId: 'visibility-score-snapshot-weekly-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register visibility-score-snapshot tick: ${error.message}`,
        ),
      );
  }
}
