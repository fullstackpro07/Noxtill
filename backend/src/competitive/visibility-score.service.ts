import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { ListingSyncService } from '../listings/listing-sync.service';
import { VISIBILITY_SCORE_WINDOW_WEEKS } from './competitive.constants';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface VisibilityRawComponents {
  listingScore: number;
  reviewScore: number;
  seoScore: number;
  socialScore: number;
}

/**
 * Visibility Score (UPD-BE-052): one 0-100 number from four equally-weighted (25 each) raw 0-100
 * components — listing completeness (reuses `ListingSyncService.health()` from UPD-BE-044 rather
 * than reimplementing it), review freshness, SEO/keyword-rank health, and connected social
 * platforms' activity (UPD-BE-050's snapshot data). Same gather-raw-then-average shape as
 * `HealthScoreService`, just without per-business weight customization — nothing in the spec calls
 * for that here.
 */
@Injectable()
export class VisibilityScoreService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly listingSync: ListingSyncService,
  ) {}

  async getScore(businessId: string, range?: string) {
    const weeks = range
      ? Number(range) || VISIBILITY_SCORE_WINDOW_WEEKS
      : VISIBILITY_SCORE_WINDOW_WEEKS;
    const components = await this.computeRawComponents(businessId);
    const score = round2(
      (components.listingScore +
        components.reviewScore +
        components.seoScore +
        components.socialScore) /
        4,
    );

    const history =
      await this.tenantPrisma.client.visibilityScoreSnapshot.findMany({
        where: { businessId },
        orderBy: { capturedAt: 'desc' },
        take: weeks,
      });

    return {
      score,
      components,
      history: history.reverse().map((row) => ({
        capturedAt: row.capturedAt,
        totalScore: Number(row.totalScore),
        listingScore: Number(row.listingScore),
        reviewScore: Number(row.reviewScore),
        seoScore: Number(row.seoScore),
        socialScore: Number(row.socialScore),
      })),
    };
  }

  /** Each raw sub-score is 0-100 — shared by getScore() and the weekly snapshot job. */
  async computeRawComponents(
    businessId: string,
  ): Promise<VisibilityRawComponents> {
    const [listingScore, reviewScore, seoScore, socialScore] =
      await Promise.all([
        this.listingScoreRaw(businessId),
        this.reviewScoreRaw(businessId),
        this.seoScoreRaw(businessId),
        this.socialScoreRaw(businessId),
      ]);
    return { listingScore, reviewScore, seoScore, socialScore };
  }

  private async listingScoreRaw(businessId: string): Promise<number> {
    const health = await this.listingSync.health(businessId);
    return round2(clamp(health.score, 0, 100));
  }

  /** Half recency of the latest review (decays to 0 over 30 days), half reply rate. No reviews ever = 0, not fabricated. */
  private async reviewScoreRaw(businessId: string): Promise<number> {
    const [latest, total, replied] = await Promise.all([
      this.tenantPrisma.client.externalReview.findFirst({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
      }),
      this.tenantPrisma.client.externalReview.count({
        where: { businessId },
      }),
      this.tenantPrisma.client.externalReview.count({
        where: { businessId, repliedAt: { not: null } },
      }),
    ]);
    if (!latest) return 0;

    const daysSince =
      (Date.now() - latest.createdAt.getTime()) / (24 * 60 * 60 * 1000);
    const freshness = clamp(100 - (daysSince / 30) * 100, 0, 100);
    const replyRate = total > 0 ? (replied / total) * 100 : 100;
    return round2((freshness + replyRate) / 2);
  }

  /** Average per-keyword rank score (rank 1 = 100, -10/position, unranked/null = 0). No tracked keywords = 0, unmeasured. */
  private async seoScoreRaw(businessId: string): Promise<number> {
    const keywords = await this.tenantPrisma.client.trackedKeyword.findMany({
      where: { businessId },
      include: { snapshots: { orderBy: { capturedAt: 'desc' }, take: 1 } },
    });
    if (keywords.length === 0) return 0;

    const perKeyword = keywords.map((keyword) => {
      const rank = keyword.snapshots[0]?.rank;
      if (rank == null) return 0;
      return clamp(100 - (rank - 1) * 10, 0, 100);
    });
    return round2(
      perKeyword.reduce((sum, s) => sum + s, 0) / perKeyword.length,
    );
  }

  /** % of connected social platforms with an analytics snapshot in the last 30 days. No connected platforms = 0. */
  private async socialScoreRaw(businessId: string): Promise<number> {
    const connectedAccounts =
      await this.tenantPrisma.client.socialAccount.findMany({
        where: { businessId, status: 'connected' },
      });
    if (connectedAccounts.length === 0) return 0;

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const activeSnapshots =
      await this.tenantPrisma.client.socialAnalyticsSnapshot.findMany({
        where: { businessId, date: { gte: since } },
        distinct: ['platform'],
        select: { platform: true },
      });
    const connectedPlatforms = new Set(
      connectedAccounts.map((account) => account.platform),
    );
    const activeCount = activeSnapshots.filter((snapshot) =>
      connectedPlatforms.has(snapshot.platform),
    ).length;
    return round2(
      clamp((activeCount / connectedAccounts.length) * 100, 0, 100),
    );
  }
}
