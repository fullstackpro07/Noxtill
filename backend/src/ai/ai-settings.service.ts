import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import {
  AI_FEATURE_KEYS,
  AI_USAGE_DISCLOSURE_TEXT,
  AiFeatureKey,
  KIND_TO_FEATURE,
} from './ai-infra.constants';

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

  async getSettings(businessId: string) {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const grouped = await this.prisma.aiCallLog.groupBy({
      by: ['kind'],
      where: { businessId, createdAt: { gte: monthStart } },
      _sum: { estimatedCostUsd: true },
      _count: { _all: true },
    });

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

    return {
      aiMonthlyCostCapUsd: Number(business.aiMonthlyCostCapUsd),
      aiRateLimitPerMinute: business.aiRateLimitPerMinute,
      featureToggles: resolveToggles(business.aiFeatureToggles),
      usageThisMonth: {
        byFeature: usageByFeature,
        other: { costUsd: otherCostUsd, calls: otherCalls },
        totalCostUsd,
      },
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
        aiFeatureToggles: nextToggles,
      },
    });

    return this.getSettings(businessId);
  }
}
