import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CRM_JOBS_QUEUE } from './crm-jobs.constants';

/**
 * Registers the hourly ticks for tag_rules (nightly per timezone) and
 * birthday_greetings (daily per timezone) — same hourly-tick-checks-local-time
 * pattern as Nightly Close (BE-022) and low-stock scan (BE-039), since there's
 * no per-business cron scheduling primitive, only a shared hourly heartbeat.
 */
@Injectable()
export class CrmJobsScheduler implements OnModuleInit {
  private readonly logger = new Logger(CrmJobsScheduler.name);

  constructor(@InjectQueue(CRM_JOBS_QUEUE) private readonly queue: Queue) {}

  onModuleInit() {
    this.register('tag-rules-tick', 'crm-tag-rules-hourly-tick');
    this.register('birthday-tick', 'crm-birthday-hourly-tick');
  }

  private register(name: string, jobId: string) {
    this.queue
      .add(name, {}, { repeat: { pattern: '0 * * * *' }, jobId })
      .catch((error: Error) =>
        this.logger.error(`Failed to register ${name}: ${error.message}`),
      );
  }
}
