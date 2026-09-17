import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { REVIEW_METRICS_SNAPSHOT_QUEUE } from './review-metrics-snapshot.constants';

/**
 * Weekly refresh (UPD-BE-M31): records one `ReviewMetricsSnapshot` row per business so the
 * Sentiment and Competitors screens have real history to chart from, same shape/ordering as
 * `HealthScoreSnapshotProcessor`. Runs outside any request context, so every query goes through
 * `TenantPrismaService` with an explicit `businessId` rather than relying on CLS auto-scoping.
 */
@Processor(REVIEW_METRICS_SNAPSHOT_QUEUE)
export class ReviewMetricsSnapshotProcessor extends WorkerHost {
  private readonly logger = new Logger(ReviewMetricsSnapshotProcessor.name);

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
          `Review metrics snapshot failed for business ${businessId}: ${(error as Error).message}`,
        );
      }
    }

    this.logger.debug(
      `Review metrics snapshot evaluated ${succeeded}/${businesses.length} business(es)`,
    );
  }

  /** Shared by the weekly job — kept separate so a future manual "refresh now" endpoint can reuse it. */
  async snapshotOne(businessId: string): Promise<void> {
    const reviews = await this.tenantPrisma.client.externalReview.findMany({
      where: { businessId },
      select: { stars: true },
    });
    const totalReviews = reviews.length;
    const averageRating =
      totalReviews > 0
        ? Math.round(
            (reviews.reduce((sum, r) => sum + r.stars, 0) / totalReviews) * 100,
          ) / 100
        : 0;

    const themes = await this.tenantPrisma.client.reviewSentimentTheme.findMany(
      {
        where: { businessId, source: 'public_review' },
        select: { sentiment: true, reviewCount: true },
      },
    );
    const totalThemeMentions = themes.reduce(
      (sum, t) => sum + t.reviewCount,
      0,
    );
    const positiveThemePct =
      totalThemeMentions > 0
        ? Math.round(
            (themes
              .filter((t) => t.sentiment.toLowerCase() === 'positive')
              .reduce((sum, t) => sum + t.reviewCount, 0) /
              totalThemeMentions) *
              10000,
          ) / 100
        : null;
    const negativeThemePct =
      totalThemeMentions > 0
        ? Math.round(
            (themes
              .filter((t) => t.sentiment.toLowerCase() === 'negative')
              .reduce((sum, t) => sum + t.reviewCount, 0) /
              totalThemeMentions) *
              10000,
          ) / 100
        : null;

    await this.tenantPrisma.client.reviewMetricsSnapshot.create({
      data: {
        businessId,
        averageRating,
        totalReviews,
        positiveThemePct,
        negativeThemePct,
      },
    });
  }
}
