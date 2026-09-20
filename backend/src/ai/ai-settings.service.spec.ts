import { PrismaService } from '../prisma/prisma.service';
import { AiSettingsService } from './ai-settings.service';

describe('AiSettingsService (UPD-BE-115)', () => {
  let prisma: PrismaService;
  let service: AiSettingsService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new AiSettingsService(prisma);

    const business = await prisma.business.create({
      data: {
        name: 'AI Settings Test Biz',
        slug: `ai-settings-test-${Date.now()}`,
      },
    });
    businessId = business.id;
  });

  afterAll(async () => {
    await prisma.aiCallLog.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('returns every toggle defaulted to enabled when nothing has been set', async () => {
    const settings = await service.getSettings(businessId);
    expect(settings.featureToggles).toEqual({
      voiceEntry: true,
      photoDigitizer: true,
      reviewReplies: true,
      campaignCopy: true,
      insights: true,
      whatIf: true,
      assistant: true,
    });
    expect(settings.disclosureText).toContain('AI');
  });

  it('groups real AiCallLog rows into their feature bucket, with unmapped kinds under "other"', async () => {
    await prisma.aiCallLog.createMany({
      data: [
        {
          businessId,
          kind: 'review_reply',
          inputTokens: 100,
          outputTokens: 50,
          estimatedCostUsd: 0.01,
        },
        {
          businessId,
          kind: 'review_reply',
          inputTokens: 100,
          outputTokens: 50,
          estimatedCostUsd: 0.02,
        },
        {
          businessId,
          kind: 'ai_insights',
          inputTokens: 100,
          outputTokens: 50,
          estimatedCostUsd: 0.03,
        },
        {
          businessId,
          kind: 'branch_advisor_unmapped',
          inputTokens: 100,
          outputTokens: 50,
          estimatedCostUsd: 0.04,
        },
      ],
    });

    const settings = await service.getSettings(businessId);
    expect(settings.usageThisMonth.byFeature.reviewReplies.calls).toBe(2);
    expect(settings.usageThisMonth.byFeature.reviewReplies.costUsd).toBeCloseTo(
      0.03,
      4,
    );
    expect(settings.usageThisMonth.byFeature.insights.calls).toBe(1);
    expect(settings.usageThisMonth.byFeature.insights.costUsd).toBeCloseTo(
      0.03,
      4,
    );
    expect(settings.usageThisMonth.other.calls).toBe(1);
    expect(settings.usageThisMonth.other.costUsd).toBeCloseTo(0.04, 4);
    expect(settings.usageThisMonth.totalCostUsd).toBeCloseTo(0.1, 4);
    expect(settings.usageThisMonth.totalCalls).toBe(4);
    expect(settings.aiQueryQuota).toBe(500);
    expect(settings.usageThisMonth.queryQuotaUsedPercent).toBe(1);
    expect(new Date(settings.usageThisMonth.limitResetsAt).getUTCDate()).toBe(1);
    expect(settings.queriesThisWeek).toHaveLength(7);
    expect(settings.queriesThisWeek.map((d) => d.day)).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ]);
    expect(settings.queriesThisWeek.reduce((sum, d) => sum + d.count, 0)).toBe(4);
  });

  it('updates the cost cap, rate limit, and merges partial feature toggles without clobbering the rest', async () => {
    const updated = await service.updateSettings(businessId, {
      aiMonthlyCostCapUsd: 25,
      aiRateLimitPerMinute: 30,
      aiQueryQuota: 1000,
      featureToggles: { reviewReplies: false },
    });

    expect(updated.aiMonthlyCostCapUsd).toBe(25);
    expect(updated.aiRateLimitPerMinute).toBe(30);
    expect(updated.aiQueryQuota).toBe(1000);
    expect(updated.featureToggles.reviewReplies).toBe(false);
    expect(updated.featureToggles.insights).toBe(true);

    const again = await service.updateSettings(businessId, {
      featureToggles: { campaignCopy: false },
    });
    expect(again.featureToggles.reviewReplies).toBe(false);
    expect(again.featureToggles.campaignCopy).toBe(false);
    expect(again.aiMonthlyCostCapUsd).toBe(25);
  });
});
