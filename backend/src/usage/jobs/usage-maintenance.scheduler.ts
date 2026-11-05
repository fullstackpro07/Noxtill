import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { USAGE_QUEUE } from '../usage.constants';

/** Repeating ticks for Usage & Limits (pattern of billing/jobs/quota-reset.scheduler.ts). */
const TICKS: { name: string; pattern: string }[] = [
  // Release reservations/holds nobody settled (spec §4.7: every minute).
  { name: 'sweep', pattern: '* * * * *' },
  // Drain the transactional outbox → threshold alerts for the businesses that just changed.
  { name: 'outbox', pattern: '* * * * *' },
  // Renewals, scheduled downgrades, cancellations, trial ends, trial reminders.
  { name: 'periods', pattern: '*/15 * * * *' },
  // Full alert sweep (capacity changes don't go through the outbox).
  { name: 'alerts', pattern: '7 * * * *' },
  // Nightly provider reconciliation + margin check (spec §17).
  { name: 'reconcile', pattern: '30 3 * * *' },
  // Monthly provider price refresh (spec §5.2).
  { name: 'provider-costs', pattern: '0 4 1 * *' },
];

@Injectable()
export class UsageMaintenanceScheduler implements OnModuleInit {
  private readonly logger = new Logger(UsageMaintenanceScheduler.name);

  constructor(@InjectQueue(USAGE_QUEUE) private readonly queue: Queue) {}

  onModuleInit() {
    for (const tick of TICKS) {
      this.queue
        .add(
          tick.name,
          {},
          {
            repeat: { pattern: tick.pattern },
            jobId: `usage-${tick.name}-tick`,
            removeOnComplete: 50,
            removeOnFail: 50,
          },
        )
        .catch((error: Error) =>
          this.logger.error(
            `Failed to register usage ${tick.name} tick: ${error.message}`,
          ),
        );
    }
  }
}
