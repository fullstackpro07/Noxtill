import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { InboxAutomationService } from './inbox-automation.service';

export const INBOX_AUTOMATION_QUEUE = 'inbox-automation';

/** Registers the repeating tick that drives the time-based inbox rules. */
@Injectable()
export class InboxAutomationScheduler implements OnModuleInit {
  private readonly logger = new Logger(InboxAutomationScheduler.name);

  constructor(
    @InjectQueue(INBOX_AUTOMATION_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '*/2 * * * *' },
          jobId: 'inbox-automation-2min-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(`Failed to register inbox tick: ${error.message}`),
      );
  }
}

/**
 * Every two minutes, per business with open conversations or a connected social account: mirror
 * new social messages in, wake snoozed conversations, run "unanswered" rules and the unassigned
 * alert. Each business runs inside its own tenant context.
 */
@Processor(INBOX_AUTOMATION_QUEUE)
export class InboxAutomationProcessor extends WorkerHost {
  private readonly logger = new Logger(InboxAutomationProcessor.name);

  constructor(
    private readonly cls: ClsService,
    private readonly automation: InboxAutomationService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'tick') return;
    for (const businessId of await this.automation.businessesToTick()) {
      try {
        await this.cls.run(async () => {
          this.cls.set(CLS_KEY_BUSINESS_ID, businessId);
          await this.automation.syncSocial(businessId);
          await this.automation.tick(businessId);
        });
      } catch (error) {
        this.logger.warn(
          `Inbox tick failed for ${businessId}: ${(error as Error).message}`,
        );
      }
    }
  }

  @OnWorkerEvent('error')
  onError(error: Error) {
    this.logger.warn(
      `Inbox automation worker connection error: ${error.message}`,
    );
  }
}
