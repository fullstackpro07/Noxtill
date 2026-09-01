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
    await prisma.business.delete({ where: { id: businessId } });
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
  });

  it('updates the cost cap, rate limit, and merges partial feature toggles without clobbering the rest', async () => {
    const updated = await service.updateSettings(businessId, {
      aiMonthlyCostCapUsd: 25,
      aiRateLimitPerMinute: 30,
      featureToggles: { reviewReplies: false },
    });

    expect(updated.aiMonthlyCostCapUsd).toBe(25);
    expect(updated.aiRateLimitPerMinute).toBe(30);
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
