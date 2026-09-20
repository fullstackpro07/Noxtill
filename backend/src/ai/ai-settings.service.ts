import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import {
  AI_FEATURE_KEYS,
  AI_USAGE_DISCLOSURE_TEXT,
  AiFeatureKey,
  KIND_TO_FEATURE,
} from './ai-infra.constants';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type FeatureToggles = Record<AiFeatureKey, boolean>;

function resolveToggles(raw: unknown): FeatureToggles {
  const stored = (raw ?? {}) as Partial<Record<AiFeatureKey, boolean>>;
  const resolved = {} as FeatureToggles;
  for (const key of AI_FEATURE_KEYS) {
    resolved[key] = stored[key] !== false;
  }
  return resolved;
}

/**
 * AI Settings (UPD-BE-115). Uses the raw `PrismaService`, not `TenantPrismaService` — same
 * convention as `AiInfraService` itself, which this reads alongside (`AiCallLog` isn't a
 * tenant-scoped model in `TenantPrismaService`'s extension, so every query here takes an explicit
 * `businessId` instead of relying on CLS).
 */
@Injectable()
export class AiSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Real per-day counts for the current calendar week (Monday–Sunday), for the AI Settings
   * "Queries this week" chart. MySQL's `WEEKDAY()` returns 0=Monday..6=Sunday directly, matching
   * `WEEKDAY_LABELS`'s order, so no remapping is needed the way `DAYOFWEEK()` needs elsewhere. */
  private async getQueriesThisWeek(
    businessId: string,
  ): Promise<{ day: string; count: number }[]> {
    const now = new Date();
    const isoDow = (now.getUTCDay() + 6) % 7; // 0=Monday..6=Sunday
    const weekStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - isoDow),
    );

    const rows = await this.prisma.$queryRaw<{ dow: number; count: bigint }[]>`
      SELECT WEEKDAY(created_at) AS dow, COUNT(*) AS count
      FROM ai_call_logs
      WHERE business_id = ${businessId} AND created_at >= ${weekStart}
      GROUP BY dow
    `;

    const countByDow = new Map(rows.map((r) => [Number(r.dow), Number(r.count)]));
    return WEEKDAY_LABELS.map((day, i) => ({ day, count: countByDow.get(i) ?? 0 }));
  }

  async getSettings(businessId: string) {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const limitResetsAt = new Date(
      Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1),
    );

    const [grouped, queriesThisWeek] = await Promise.all([
      this.prisma.aiCallLog.groupBy({
        by: ['kind'],
        where: { businessId, createdAt: { gte: monthStart } },
        _sum: { estimatedCostUsd: true },
        _count: { _all: true },
      }),
      this.getQueriesThisWeek(businessId),
    ]);

    const usageByFeature: Record<
      AiFeatureKey,
      { costUsd: number; calls: number }
    > = {} as Record<AiFeatureKey, { costUsd: number; calls: number }>;
    for (const key of AI_FEATURE_KEYS) {
      usageByFeature[key] = { costUsd: 0, calls: 0 };
    }
    let otherCostUsd = 0;
    let otherCalls = 0;

    for (const row of grouped) {
      const cost = Number(row._sum.estimatedCostUsd ?? 0);
      const calls = row._count._all;
      const featureKey = KIND_TO_FEATURE[row.kind];
      if (featureKey) {
        usageByFeature[featureKey].costUsd += cost;
        usageByFeature[featureKey].calls += calls;
      } else {
        otherCostUsd += cost;
        otherCalls += calls;
      }
    }

    const totalCostUsd =
      Object.values(usageByFeature).reduce((sum, u) => sum + u.costUsd, 0) +
      otherCostUsd;
    const totalCalls =
      Object.values(usageByFeature).reduce((sum, u) => sum + u.calls, 0) +
      otherCalls;

    return {
      aiMonthlyCostCapUsd: Number(business.aiMonthlyCostCapUsd),
      aiRateLimitPerMinute: business.aiRateLimitPerMinute,
      aiQueryQuota: business.aiQueryQuota,
      featureToggles: resolveToggles(business.aiFeatureToggles),
      usageThisMonth: {
        byFeature: usageByFeature,
        other: { costUsd: otherCostUsd, calls: otherCalls },
        totalCostUsd,
        totalCalls,
        queryQuotaUsedPercent:
          business.aiQueryQuota > 0
            ? Math.min(100, Math.round((totalCalls / business.aiQueryQuota) * 100))
            : 0,
        limitResetsAt: limitResetsAt.toISOString(),
      },
      queriesThisWeek,
      disclosureText: AI_USAGE_DISCLOSURE_TEXT,
    };
  }

  async updateSettings(businessId: string, dto: UpdateAiSettingsDto) {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    const currentToggles = resolveToggles(business.aiFeatureToggles);
    const nextToggles = dto.featureToggles
      ? { ...currentToggles, ...dto.featureToggles }
      : currentToggles;

    await this.prisma.business.update({
      where: { id: businessId },
      data: {
        aiMonthlyCostCapUsd: dto.aiMonthlyCostCapUsd,
        aiRateLimitPerMinute: dto.aiRateLimitPerMinute,
        aiQueryQuota: dto.aiQueryQuota,
        aiFeatureToggles: nextToggles,
      },
    });

    return this.getSettings(businessId);
  }
}
