import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { IntegrationProvider } from '@prisma/client';
import { Job, Queue } from 'bullmq';
import { PayContextService } from './pay-context.service';
import { PayApplyService } from './pay-apply.service';

export const PAYMENTS_QUEUE = 'payments';

/** Retention: months kept for sanitised provider event payloads, from the policy label. */
const months = (label: string) => Number(/^(\d+)/.exec(label)?.[1] ?? 13);

@Injectable()
export class PaymentsScheduler implements OnModuleInit {
  private readonly logger = new Logger(PaymentsScheduler.name);

  constructor(@InjectQueue(PAYMENTS_QUEUE) private readonly queue: Queue) {}

  onModuleInit() {
    const add = (name: string, every: number) =>
      this.queue
        .add(
          name,
          {},
          {
            repeat: { every },
            jobId: `payments-${name}`,
            removeOnComplete: true,
            removeOnFail: 50,
          },
        )
        .catch((e: Error) =>
          this.logger.error(`Failed to register ${name}: ${e.message}`),
        );
    void add('sync', 10 * 60_000);
    void add('retention', 24 * 60 * 60_000);
  }
}

/**
 * Every 10 minutes for every business group using Payments (or holding a payment connection):
 * provider sync + catch-up events, the Noxtill-source projector, mandates, refund resolution,
 * request expiry and reconciliation. Nightly: test-data and raw-event retention.
 */
@Processor(PAYMENTS_QUEUE)
export class PaymentsProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentsProcessor.name);

  constructor(
    private readonly ctx: PayContextService,
    private readonly apply: PayApplyService,
  ) {
    super();
  }

  async roots(): Promise<string[]> {
    const opened = await this.ctx.db.paySettings.findMany({
      select: { businessId: true },
    });
    const integ = await this.ctx.db.integration.findMany({
      where: {
        provider: {
          in: [
            IntegrationProvider.stripe,
            IntegrationProvider.stripe_test,
            IntegrationProvider.square,
            IntegrationProvider.paypal,
          ],
        },
        status: 'connected',
      },
      select: { businessId: true },
    });
    const roots = new Set(opened.map((x) => x.businessId));
    for (const i of integ) roots.add(await this.ctx.rootOf(i.businessId));
    return [...roots];
  }

  async process(job: Job): Promise<void> {
    for (const rootId of await this.roots()) {
      try {
        if (job.name === 'retention') await this.retention(rootId);
        else await this.apply.syncGroup(rootId);
      } catch (e) {
        this.logger.warn(
          `payments ${job.name} failed for ${rootId}: ${(e as Error).message}`,
        );
      }
    }
  }

  async retention(rootId: string) {
    const pol = await this.ctx.policy(rootId);
    const cut = new Date(
      Date.now() - pol.safeguards.testRetentionDays * 86400000,
    );
    const db = this.ctx.db;
    const tx = await db.payTransaction.deleteMany({
      where: { businessId: rootId, env: 'test', occurredAt: { lt: cut } },
    });
    const rq = await db.payRequest.deleteMany({
      where: {
        businessId: rootId,
        env: 'test',
        createdAt: { lt: cut },
        status: { in: ['Paid', 'Expired', 'Cancelled'] },
      },
    });
    await db.payRefund.deleteMany({
      where: { businessId: rootId, env: 'test', createdAt: { lt: cut } },
    });
    const evCut = new Date(
      Date.now() - months(pol.retention.rawEvents) * 30 * 86400000,
    );
    const ev = await db.payEvent.updateMany({
      where: {
        businessId: rootId,
        receivedAt: { lt: evCut },
        NOT: { payload: { equals: {} } },
      },
      data: { payload: {} },
    });
    if (tx.count || rq.count || ev.count)
      await this.ctx.audit(
        rootId,
        'System',
        'Retention applied',
        'policy',
        rootId,
        `${tx.count} test transactions, ${rq.count} test requests removed · ${ev.count} raw event payloads cleared`,
      );
  }
}
