import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { VisibilityScoreService } from '../visibility-score.service';
import { VISIBILITY_SCORE_SNAPSHOT_QUEUE } from '../competitive.constants';

/**
 * Weekly refresh (UPD-BE-052): records one VisibilityScoreSnapshot row per business so the trend
 * history has real data to read from — same shape as HealthScoreSnapshotProcessor. Runs outside
 * any request context, so every query goes through TenantPrismaService with an explicit businessId.
 */
@Processor(VISIBILITY_SCORE_SNAPSHOT_QUEUE)
export class VisibilityScoreSnapshotProcessor extends WorkerHost {
  private readonly logger = new Logger(VisibilityScoreSnapshotProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly visibilityScore: VisibilityScoreService,
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
        // One business failing must not abort every other business's snapshot for the week.
        this.logger.warn(
          `Visibility score snapshot failed for business ${businessId}: ${(error as Error).message}`,
        );
      }
    }

    this.logger.debug(
      `Visibility score snapshot evaluated ${succeeded}/${businesses.length} business(es)`,
    );
  }

  /** Shared by the weekly job — kept separate so a future manual "refresh now" endpoint can reuse it. */
  async snapshotOne(businessId: string): Promise<void> {
    const components =
      await this.visibilityScore.computeRawComponents(businessId);
    const totalScore =
      (components.listingScore +
        components.reviewScore +
        components.seoScore +
        components.socialScore) /
      4;

    await this.tenantPrisma.client.visibilityScoreSnapshot.create({
      data: {
        businessId,
        listingScore: components.listingScore,
        reviewScore: components.reviewScore,
        seoScore: components.seoScore,
        socialScore: components.socialScore,
        totalScore,
      },
    });
  }
}
