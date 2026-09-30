import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { HelpdeskJobsService } from './helpdesk-jobs.service';
import { HELPDESK_QUEUE } from './helpdesk.constants';

@Injectable()
export class HelpdeskScheduler implements OnModuleInit {
  private readonly logger = new Logger(HelpdeskScheduler.name);

  constructor(@InjectQueue(HELPDESK_QUEUE) private readonly queue: Queue) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { every: 60_000 },
          jobId: 'helpdesk-tick',
          removeOnComplete: true,
          removeOnFail: 50,
        },
      )
      .catch((error: Error) =>
        this.logger.error(`Failed to register Helpdesk job: ${error.message}`),
      );
  }
}

/** Every minute: SLA risk/breach detection, escalation rules, CSAT sending, auto-close, leave, retention. */
@Processor(HELPDESK_QUEUE)
export class HelpdeskProcessor extends WorkerHost {
  private readonly logger = new Logger(HelpdeskProcessor.name);

  constructor(private readonly jobs: HelpdeskJobsService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    for (const rootId of await this.jobs.helpdesks()) {
      try {
        await this.jobs.run(rootId);
      } catch (e) {
        this.logger.warn(
          `helpdesk tick failed for ${rootId}: ${(e as Error).message}`,
        );
      }
    }
  }
}
