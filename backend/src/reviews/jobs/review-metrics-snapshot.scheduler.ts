import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { REVIEW_METRICS_SNAPSHOT_QUEUE } from './review-metrics-snapshot.constants';

/** Weekly (Monday 04:45) repeatable tick — deliberately after the health-score snapshot's own
 * 04:00 Monday tick, same ordering convention as that job sits after the 03:00 competitor-snapshot. */
@Injectable()
export class ReviewMetricsSnapshotScheduler implements OnModuleInit {
  private readonly logger = new Logger(ReviewMetricsSnapshotScheduler.name);

  constructor(
    @InjectQueue(REVIEW_METRICS_SNAPSHOT_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '45 4 * * 1' },
          jobId: 'review-metrics-snapshot-weekly-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register review-metrics-snapshot tick: ${error.message}`,
        ),
      );
  }
}
