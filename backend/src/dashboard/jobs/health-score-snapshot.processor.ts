import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { HealthScoreService } from '../health-score.service';
import { HEALTH_SCORE_SNAPSHOT_QUEUE } from '../dashboard.constants';

/**
 * Weekly refresh (UPD-BE-001): records one HealthScoreSnapshot row per business so the 12-week
 * trend has real history to read from — same shape as the competitor-snapshot job it's scheduled
 * right after. Runs outside any request context, so every query goes through TenantPrismaService
 * with an explicit businessId in its `where`/`data` (safe regardless of CLS — see
 * tenant-prisma.extension.ts) rather than relying on CLS auto-scoping.
 */
@Processor(HEALTH_SCORE_SNAPSHOT_QUEUE)
export class HealthScoreSnapshotProcessor extends WorkerHost {
  private readonly logger = new Logger(HealthScoreSnapshotProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly healthScoreService: HealthScoreService,
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
        // A single business failing (e.g. deleted between the listing query above and its own
        // snapshot — a real possibility with account deletion, not just a test-timing artifact)
        // must not abort every other business's snapshot for the week.
        this.logger.warn(
          `Health score snapshot failed for business ${businessId}: ${(error as Error).message}`,
        );
      }
    }

    this.logger.debug(
      `Health score snapshot evaluated ${succeeded}/${businesses.length} business(es)`,
    );
  }

  /** Shared by the weekly job — kept separate so a future manual "refresh now" endpoint can reuse it. */
  async snapshotOne(businessId: string): Promise<void> {
    const [weights, raw] = await Promise.all([
      this.healthScoreService.getWeights(businessId),
      this.healthScoreService.computeRawComponents(businessId),
    ]);
    const components = this.healthScoreService.weightComponents(raw, weights);
    const totalScore =
      components.ratingTrend +
      components.repeatCustomerRate +
      components.margin +
      components.creditRecovery;

    await this.tenantPrisma.client.healthScoreSnapshot.create({
      data: {
        businessId,
        ratingTrendScore: components.ratingTrend,
        repeatCustomerScore: components.repeatCustomerRate,
        marginScore: components.margin,
        creditRecoveryScore: components.creditRecovery,
        totalScore,
      },
    });
  }
}
