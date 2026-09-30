import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { WORKFLOW_SCHEDULE_QUEUE } from '../workflows.constants';

/** Polls MySQL due-times once per minute; MySQL remains the durable schedule source of truth. */
@Injectable()
export class WorkflowScheduleScheduler implements OnModuleInit {
  private readonly logger = new Logger(WorkflowScheduleScheduler.name);

  constructor(
    @InjectQueue(WORKFLOW_SCHEDULE_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '* * * * *' },
          jobId: 'workflow-schedule-minute-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register workflow-schedule tick: ${error.message}`,
        ),
      );
  }
}
