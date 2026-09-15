import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { CREDIT_BALANCE_SNAPSHOT_QUEUE } from './credit-balance-snapshot.constants';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Daily refresh: records one CreditBalanceSnapshot row per business from the same
 * `v_credit_balances` view the `credit_outstanding` widget already reads, so the KPI drawer has
 * real day-over-day history to compare against. Runs outside any request context, so every query
 * goes through TenantPrismaService with an explicit businessId (same pattern as
 * HealthScoreSnapshotProcessor, which this mirrors).
 */
@Processor(CREDIT_BALANCE_SNAPSHOT_QUEUE)
export class CreditBalanceSnapshotProcessor extends WorkerHost {
  private readonly logger = new Logger(CreditBalanceSnapshotProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'tick') return;
    return this.runSnapshot();
  }

  async runSnapshot(): Promise<void> {
    const businesses = await this.prisma.business.findMany({
      select: { id: true },
    });

    let succeeded = 0;
    for (const { id: businessId } of businesses) {
      try {
        await this.snapshotOne(businessId);
        succeeded += 1;
      } catch (error) {
        this.logger.warn(
          `Credit balance snapshot failed for business ${businessId}: ${(error as Error).message}`,
        );
      }
    }

    this.logger.debug(
      `Credit balance snapshot evaluated ${succeeded}/${businesses.length} business(es)`,
    );
  }

  /** Shared by the daily job — kept separate so a future manual "refresh now" path can reuse it. */
  async snapshotOne(businessId: string): Promise<void> {
    const rows = await this.tenantPrisma.client.$queryRaw<
      { total: string | null }[]
    >`
      SELECT SUM(balance) AS total FROM v_credit_balances WHERE business_id = ${businessId} AND balance > 0
    `;
    const balance = round2(Number(rows[0]?.total ?? 0));
    const today = new Date();
    const snapshotDate = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );

    await this.tenantPrisma.client.creditBalanceSnapshot.upsert({
      where: { businessId_snapshotDate: { businessId, snapshotDate } },
      create: { businessId, snapshotDate, balance },
      update: { balance },
    });
  }
}
