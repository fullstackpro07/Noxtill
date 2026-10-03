import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { WORKFLOW_RETENTION_QUEUE } from '../workflows.constants';

/** Registers the nightly run-history retention pass. */
@Injectable()
export class WorkflowRetentionScheduler implements OnModuleInit {
  private readonly logger = new Logger(WorkflowRetentionScheduler.name);

  constructor(
    @InjectQueue(WORKFLOW_RETENTION_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(
        'cleanup',
        {},
        {
          repeat: { pattern: '30 3 * * *', tz: 'UTC' },
          jobId: 'workflow-retention-nightly-cleanup',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register workflow-retention cleanup: ${error.message}`,
        ),
      );
  }
}
