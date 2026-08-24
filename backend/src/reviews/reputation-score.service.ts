import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  REPUTATION_RECENCY_HORIZON_DAYS,
  REPUTATION_SCORE_WEIGHTS,
  REPUTATION_TREND_WEEKS,
  REPUTATION_VOLUME_TARGET,
} from './reviews.constants';

export type ReputationScoreComponents = Record<
  keyof typeof REPUTATION_SCORE_WEIGHTS,
  number
>;

export interface ReputationScoreTrendPoint {
  weekEnding: Date;
  totalScore: number;
}

export interface ReputationScoreResult {
  score: number;
  components: ReputationScoreComponents;
  weights: typeof REPUTATION_SCORE_WEIGHTS;
  trend: ReputationScoreTrendPoint[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Reputation Score (UPD-BE-103) — a rating/volume/recency/response-rate composite distinct from
 * Dashboard's Business Health Score (which is about the business's overall operational health;
 * this is specifically about public review reputation). Reuses `HealthScoreService`'s weighting
 * shape (raw 0-100 components each scaled by weight/100) but with fixed weights — no per-business
 * weight-editing UI for this one, per the ticket.
 */
@Injectable()
export class ReputationScoreService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async getScore(): Promise<ReputationScoreResult> {
    const now = new Date();
    const raw = await this.computeRawComponents(now);
    const components = this.weightComponents(raw);
    const score = this.totalScore(components);
    const trend = await this.getTrend(now);

    return {
      score,
      components,
      weights: REPUTATION_SCORE_WEIGHTS,
      trend,
    };
  }

  /**
   * Real, not fabricated: every component is reconstructed "as of" each trailing week's end date
   * from ExternalReview's actual `createdAt`/`repliedAt` timestamps — no separate snapshot table
   * needed, since a review's reply timestamp is itself a real historical fact, not a live-only
   * value that would need pre-recording to look back on.
   */
  async getTrend(now: Date = new Date()): Promise<ReputationScoreTrendPoint[]> {
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const points: ReputationScoreTrendPoint[] = [];
    for (let i = REPUTATION_TREND_WEEKS - 1; i >= 0; i--) {
      const weekEnding = new Date(now.getTime() - i * weekMs);
      const raw = await this.computeRawComponents(weekEnding);
      const totalScore = this.totalScore(this.weightComponents(raw));
      points.push({ weekEnding, totalScore });
    }
    return points;
  }

  private async computeRawComponents(asOf: Date) {
    const [rating, volume, recency, responseRate] = await Promise.all([
      this.ratingRaw(asOf),
      this.volumeRaw(asOf),
      this.recencyRaw(asOf),
      this.responseRateRaw(asOf),
    ]);
    return { rating, volume, recency, responseRate };
  }

  private weightComponents(raw: {
    rating: number;
    volume: number;
    recency: number;
    responseRate: number;
  }): ReputationScoreComponents {
    return {
      rating: round2((raw.rating / 100) * REPUTATION_SCORE_WEIGHTS.rating),
      volume: round2((raw.volume / 100) * REPUTATION_SCORE_WEIGHTS.volume),
      recency: round2((raw.recency / 100) * REPUTATION_SCORE_WEIGHTS.recency),
      responseRate: round2(
        (raw.responseRate / 100) * REPUTATION_SCORE_WEIGHTS.responseRate,
      ),
    };
  }

  private totalScore(components: ReputationScoreComponents): number {
    return round2(
      components.rating +
        components.volume +
        components.recency +
        components.responseRate,
    );
  }

  /** Average star rating (1-5) among reviews posted on/before `asOf`, scaled to 0-100. No reviews yet = 0, not fabricated. */
  private async ratingRaw(asOf: Date): Promise<number> {
    const result = await this.tenantPrisma.client.externalReview.aggregate({
      where: { createdAt: { lte: asOf } },
      _avg: { stars: true },
    });
    const avg = result._avg.stars ?? 0;
    return round2(clamp((avg / 5) * 100, 0, 100));
  }

  /** Review count on/before `asOf`, relative to REPUTATION_VOLUME_TARGET. */
  private async volumeRaw(asOf: Date): Promise<number> {
    const count = await this.tenantPrisma.client.externalReview.count({
      where: { createdAt: { lte: asOf } },
    });
    return round2(clamp((count / REPUTATION_VOLUME_TARGET) * 100, 0, 100));
  }

  /** Days between `asOf` and the most recent review on/before it — fresher reviews score higher. */
  private async recencyRaw(asOf: Date): Promise<number> {
    const latest = await this.tenantPrisma.client.externalReview.findFirst({
      where: { createdAt: { lte: asOf } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (!latest) return 0;
    const daysSince =
      (asOf.getTime() - latest.createdAt.getTime()) / (24 * 60 * 60 * 1000);
    return round2(
      clamp(100 - (daysSince / REPUTATION_RECENCY_HORIZON_DAYS) * 100, 0, 100),
    );
  }

  /** % of reviews (on/before `asOf`) that had been replied to by `asOf` — a reply counts only once its own `repliedAt` is in range, so this is genuinely reconstructable history, not a live-only snapshot. Nothing to reply to yet = 100, matching the app's existing convention (see `visibility-score.service.ts`). */
  private async responseRateRaw(asOf: Date): Promise<number> {
    const [total, replied] = await Promise.all([
      this.tenantPrisma.client.externalReview.count({
        where: { createdAt: { lte: asOf } },
      }),
      this.tenantPrisma.client.externalReview.count({
        where: { createdAt: { lte: asOf }, repliedAt: { lte: asOf } },
      }),
    ]);
    if (total === 0) return 100;
    return round2(clamp((replied / total) * 100, 0, 100));
  }
}
