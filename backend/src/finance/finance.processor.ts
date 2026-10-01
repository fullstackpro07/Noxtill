import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { FinanceJobsService } from './finance-jobs.service';
import { FINANCE_QUEUE } from './finance.constants';

@Injectable()
export class FinanceScheduler implements OnModuleInit {
  private readonly logger = new Logger(FinanceScheduler.name);

  constructor(@InjectQueue(FINANCE_QUEUE) private readonly queue: Queue) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { every: 60_000 },
          jobId: 'finance-tick',
          removeOnComplete: true,
          removeOnFail: 50,
        },
      )
      .catch((error: Error) =>
        this.logger.error(`Failed to register Finance job: ${error.message}`),
      );
  }
}

/** Every minute, for every ledger that has been opened: see FinanceJobsService.run. */
@Processor(FINANCE_QUEUE)
export class FinanceProcessor extends WorkerHost {
  private readonly logger = new Logger(FinanceProcessor.name);

  constructor(private readonly jobs: FinanceJobsService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    for (const rootId of await this.jobs.ledgers()) {
      try {
        await this.jobs.run(rootId);
      } catch (e) {
        this.logger.warn(
          `finance tick failed for ${rootId}: ${(e as Error).message}`,
        );
      }
    }
  }
}
