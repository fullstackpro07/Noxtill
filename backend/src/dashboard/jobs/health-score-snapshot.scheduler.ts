import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { HEALTH_SCORE_SNAPSHOT_QUEUE } from '../dashboard.constants';

/** Weekly (Monday 04:00) repeatable tick — deliberately after the 03:00 competitor-snapshot tick. */
@Injectable()
export class HealthScoreSnapshotScheduler implements OnModuleInit {
  private readonly logger = new Logger(HealthScoreSnapshotScheduler.name);

  constructor(
    @InjectQueue(HEALTH_SCORE_SNAPSHOT_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '0 4 * * 1' },
          jobId: 'health-score-snapshot-weekly-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register health-score-snapshot tick: ${error.message}`,
        ),
      );
  }
}
