import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreditsService } from '../credits.service';
import { MetersService } from '../meters.service';
import { SubscriptionService } from '../subscription.service';
import { UsageAlertsService } from '../usage-alerts.service';
import { UsageReconcileService } from '../usage-reconcile.service';
import { USAGE_QUEUE } from '../usage.constants';

@Processor(USAGE_QUEUE)
export class UsageMaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(UsageMaintenanceProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly meters: MetersService,
    private readonly subscriptions: SubscriptionService,
    private readonly alerts: UsageAlertsService,
    private readonly reconcile: UsageReconcileService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case 'sweep':
        return {
          credits: await this.credits.sweepExpired(),
          holds: await this.meters.sweepExpiredHolds(),
        };
      case 'outbox':
        return this.drainOutbox();
      case 'periods': {
        const rolled = await this.subscriptions.rollDuePeriods();
        const trials = await this.subscriptions.endDueTrials();
        const reminders = await this.alerts.trialReminders();
        return { rolled, ...trials, reminders };
      }
      case 'alerts': {
        const subs = await this.prisma.subscription.findMany({
          where: { status: { not: 'cancelled' } },
          select: { businessId: true },
        });
        let fired = 0;
        for (const s of subs)
          fired += await this.alerts.check(s.businessId).catch(() => 0);
        return { fired };
      }
      case 'reconcile':
        return this.reconcile.nightly();
      case 'provider-costs':
        return this.reconcile.refreshProviderCosts();
      default:
        return null;
    }
  }

  /**
   * Publishes outbox rows (spec §10: written in the state change's own transaction, published
   * afterwards). Publishing here means: run threshold alerts for every business with new usage,
   * and log the event stream. Rows are marked published only after that succeeds.
   */
  async drainOutbox(): Promise<number> {
    const rows = await this.prisma.usageOutbox.findMany({
      where: { publishedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    if (!rows.length) return 0;
    const businesses = new Set(
      rows
        .filter(
          (r) =>
            r.businessId &&
            /^(usage\.(committed|reserved)|capacity\.|spend_cap\.)/.test(
              r.type,
            ),
        )
        .map((r) => r.businessId!),
    );
    for (const id of businesses) {
      await this.alerts
        .check(id)
        .catch((error: Error) =>
          this.logger.warn(`Alert check failed for ${id}: ${error.message}`),
        );
    }
    for (const r of rows.filter((x) =>
      /estimate_exceeded|limit_reached|variance|cost_changed|margin/.test(
        x.type,
      ),
    )) {
      this.logger.warn(`${r.type} ${JSON.stringify(r.payload)}`);
    }
    await this.prisma.usageOutbox.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { publishedAt: new Date() },
    });
    return rows.length;
  }

  @OnWorkerEvent('error')
  onError(error: Error) {
    this.logger.warn(`Usage worker connection error: ${error.message}`);
  }
}
