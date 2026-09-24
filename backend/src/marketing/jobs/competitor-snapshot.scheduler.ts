import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { COMPETITOR_SNAPSHOT_QUEUE } from '../marketing.constants';

/**
 * The fixed-weekly tick this scheduler replaced (Monday 03:00) — removed on boot so both never run.
 * BullMQ keys repeatables by an opaque hash, so the old one is recognised by its cron pattern; this
 * queue only ever holds this scheduler's jobs.
 */
const LEGACY_WEEKLY_PATTERN = '0 3 * * 1';

/**
 * Daily (03:00) repeatable tick. Each business chooses how often its competitors are actually
 * snapshotted (`CompetitiveSettings.scanFrequencyDays`, default 7); the processor skips a
 * competitor until that many days have passed since its last snapshot.
 */
@Injectable()
export class CompetitorSnapshotScheduler implements OnModuleInit {
  private readonly logger = new Logger(CompetitorSnapshotScheduler.name);

  constructor(
    @InjectQueue(COMPETITOR_SNAPSHOT_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.register().catch((error: Error) =>
      this.logger.error(
        `Failed to register competitor-snapshot tick: ${error.message}`,
      ),
    );
  }

  private async register(): Promise<void> {
    const repeatables = await this.queue.getRepeatableJobs();
    for (const job of repeatables) {
      if (job.pattern === LEGACY_WEEKLY_PATTERN) {
        await this.queue.removeRepeatableByKey(job.key);
      }
    }
    await this.queue.add(
      'tick',
      {},
      {
        repeat: { pattern: '0 3 * * *' },
        jobId: 'competitor-snapshot-daily-tick',
      },
    );
  }
}
