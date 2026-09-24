import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { COMPETITIVE_WEEKLY_REPORT_QUEUE } from '../competitive.constants';

/** Weekly (Monday 07:00) repeatable tick — after the 03:00 rating snapshots and 05:30 gap analysis, so the email reflects both. */
@Injectable()
export class CompetitiveWeeklyReportScheduler implements OnModuleInit {
  private readonly logger = new Logger(CompetitiveWeeklyReportScheduler.name);

  constructor(
    @InjectQueue(COMPETITIVE_WEEKLY_REPORT_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '0 7 * * 1' },
          jobId: 'competitive-weekly-report-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register competitive-weekly-report tick: ${error.message}`,
        ),
      );
  }
}
