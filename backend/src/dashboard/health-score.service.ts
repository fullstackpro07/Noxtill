import { HttpStatus, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { ProfitService } from '../profit/profit.service';
import { AppException } from '../common/filters/app.exception';
import {
  DEFAULT_HEALTH_SCORE_WEIGHTS,
  HEALTH_SCORE_WINDOW_WEEKS,
} from './dashboard.constants';
import { Prisma } from '@prisma/client';

export type HealthScoreWeights = Record<
  'ratingTrend' | 'repeatCustomerRate' | 'margin' | 'creditRecovery',
  number
>;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Business Health Score (UPD-BE-001): one 0-100 number from four independently-scored
 * components (rating trend, repeat-customer rate, margin, credit recovery), each worth up to
 * its configured weight (default 25 apiece). Every raw component score is computed 0-100 first,
 * then scaled by weight/100 to produce its contribution — this is what "each 0-25" in the spec
 * means under the default equal weighting.
 */
@Injectable()
export class HealthScoreService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly profitService: ProfitService,
  ) {}

  async getWeights(businessId: string): Promise<HealthScoreWeights> {
    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { healthScoreWeights: true },
    });
    const stored =
      business.healthScoreWeights as Partial<HealthScoreWeights> | null;
    return { ...DEFAULT_HEALTH_SCORE_WEIGHTS, ...(stored ?? {}) };
  }

  async updateWeights(
    businessId: string,
    weights: HealthScoreWeights,
  ): Promise<HealthScoreWeights> {
    const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
    if (Math.round(total) !== 100) {
      throw new AppException(
        'health_score.weights_must_sum_to_100',
        `Weights must sum to 100 (got ${total}).`,
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.tenantPrisma.client.business.update({
      where: { id: businessId },
      data: { healthScoreWeights: weights as Prisma.InputJsonValue },
    });
    return weights;
  }

  async getScore(businessId: string, range?: string) {
    const weeks = range
      ? Number(range) || HEALTH_SCORE_WINDOW_WEEKS
      : HEALTH_SCORE_WINDOW_WEEKS;
    const weights = await this.getWeights(businessId);
    const raw = await this.computeRawComponents(businessId);
    const components = this.weightComponents(raw, weights);
    const score = round2(
      components.ratingTrend +
        components.repeatCustomerRate +
        components.margin +
        components.creditRecovery,
    );

    const history = await this.tenantPrisma.client.healthScoreSnapshot.findMany(
      {
        where: { businessId },
        orderBy: { capturedAt: 'desc' },
        take: weeks,
      },
    );

    return {
      score,
      components,
      weights,
      history: history.reverse().map((row) => ({
        capturedAt: row.capturedAt,
        totalScore: Number(row.totalScore),
        ratingTrend: Number(row.ratingTrendScore),
        repeatCustomerRate: Number(row.repeatCustomerScore),
        margin: Number(row.marginScore),
        creditRecovery: Number(row.creditRecoveryScore),
      })),
    };
  }

  /** Each raw sub-score is 0-100, independent of weighting — shared by getScore() and the weekly snapshot job. */
  async computeRawComponents(businessId: string) {
    const since = new Date(
      Date.now() - HEALTH_SCORE_WINDOW_WEEKS * 7 * 24 * 60 * 60 * 1000,
    );

    const [ratingTrend, repeatCustomerRate, margin, creditRecovery] =
      await Promise.all([
        this.ratingTrendRaw(businessId, since),
        this.repeatCustomerRateRaw(businessId),
        this.marginRaw(),
        this.creditRecoveryRaw(businessId, since),
      ]);

    return { ratingTrend, repeatCustomerRate, margin, creditRecovery };
  }

  weightComponents(
    raw: {
      ratingTrend: number;
      repeatCustomerRate: number;
      margin: number;
      creditRecovery: number;
    },
    weights: HealthScoreWeights,
  ) {
    return {
      ratingTrend: round2((raw.ratingTrend / 100) * weights.ratingTrend),
      repeatCustomerRate: round2(
        (raw.repeatCustomerRate / 100) * weights.repeatCustomerRate,
      ),
      margin: round2((raw.margin / 100) * weights.margin),
      creditRecovery: round2(
        (raw.creditRecovery / 100) * weights.creditRecovery,
      ),
    };
  }

  /** Average review rating over the window, scaled from the 1-5 star scale to 0-100. No reviews yet = 0, not fabricated. */
  private async ratingTrendRaw(
    businessId: string,
    since: Date,
  ): Promise<number> {
    const result = await this.tenantPrisma.client.externalReview.aggregate({
      where: { businessId, createdAt: { gte: since } },
      _avg: { stars: true },
    });
    const avg = result._avg.stars ?? 0;
    return round2(clamp((avg / 5) * 100, 0, 100));
  }

  /** % of customers with more than one visit, among customers with at least one visit. */
  private async repeatCustomerRateRaw(businessId: string): Promise<number> {
    const [withVisit, repeat] = await Promise.all([
      this.tenantPrisma.client.customer.count({
        where: { businessId, visitCount: { gte: 1 } },
      }),
      this.tenantPrisma.client.customer.count({
        where: { businessId, visitCount: { gt: 1 } },
      }),
    ]);
    if (withVisit === 0) return 0;
    return round2(clamp((repeat / withVisit) * 100, 0, 100));
  }

  /**
   * Net margin for the current UTC month, scaled so 25%+ net margin scores 100 — matches this
   * app's existing "margin under 10% is a red flag" convention used on the Products/Profit screens,
   * so a business right at that red-flag line scores a middling ~40, not a false-healthy number.
   */
  private async marginRaw(): Promise<number> {
    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const { revenue, netProfit } = await this.profitService.pnl(month);
    if (revenue <= 0) return 0;
    const marginPercent = (netProfit / revenue) * 100;
    return round2(clamp((marginPercent / 25) * 100, 0, 100));
  }

  /**
   * Amount recovered (payments) vs. amount extended (credit) in the window. A business that
   * extended no new credit in the window has nothing outstanding to recover from this period,
   * scored as healthy (100) rather than penalised for a metric that doesn't apply to them.
   */
  private async creditRecoveryRaw(
    businessId: string,
    since: Date,
  ): Promise<number> {
    const [extended, recovered] = await Promise.all([
      this.tenantPrisma.client.creditEntry.aggregate({
        where: { businessId, kind: 'credit', createdAt: { gte: since } },
        _sum: { amount: true },
      }),
      this.tenantPrisma.client.creditEntry.aggregate({
        where: { businessId, kind: 'payment', createdAt: { gte: since } },
        _sum: { amount: true },
      }),
    ]);
    const extendedTotal = Number(extended._sum.amount ?? 0);
    if (extendedTotal <= 0) return 100;
    const recoveredTotal = Number(recovered._sum.amount ?? 0);
    return round2(clamp((recoveredTotal / extendedTotal) * 100, 0, 100));
  }
}
