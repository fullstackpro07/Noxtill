import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { VoiceAnalyticsTrendsService } from './voice-analytics-trends.service';

class FakeClsService {
  private readonly store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('VoiceAnalyticsTrendsService (real MySQL)', () => {
  let prisma: PrismaService;
  let service: VoiceAnalyticsTrendsService;
  let businessId: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    service = new VoiceAnalyticsTrendsService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
    );
    businessId = (
      await prisma.business.create({
        data: {
          name: 'Trends Test',
          slug: `voice-trends-${suffix}`,
          timezone: 'UTC',
        },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const day = new Date();
    day.setUTCHours(10, 0, 0, 0);
    const base = { businessId, transcript: [] as never[], startedAt: day };
    await prisma.phoneCall.createMany({
      data: [
        {
          ...base,
          callSid: `CA-t1-${suffix}`,
          fromNumber: '+14155550201',
          status: 'completed',
          endedAt: new Date(day.getTime() + 120_000),
          providerCost: '0.0300',
          providerCostUnit: 'USD',
          providerCostCheckedAt: day,
        },
        {
          ...base,
          callSid: `CA-t2-${suffix}`,
          fromNumber: '+14155550202',
          status: 'missed',
        },
        {
          ...base,
          callSid: `CA-t3-${suffix}`,
          fromNumber: '+14155550203',
          status: 'completed',
          endedAt: new Date(day.getTime() + 300_000),
          joinedAt: day,
        },
        {
          ...base,
          callSid: `CA-t4-${suffix}`,
          fromNumber: '+14155550204',
          status: 'transferred',
          endedAt: new Date(day.getTime() + 60_000),
        },
      ],
    });
    await prisma.voiceOutboundEligibilityDecision.createMany({
      data: [
        {
          businessId,
          phoneE164: '+14155550205',
          countryCode: 'US',
          purpose: 'callback',
          callerType: 'live_agent',
          allowed: true,
          reasonCode: 'eligible',
          evaluatedByUserId: 'x',
        },
        {
          businessId,
          phoneE164: '+14155550206',
          countryCode: 'US',
          purpose: 'callback',
          callerType: 'live_agent',
          allowed: false,
          reasonCode: 'suppressed',
          evaluatedByUserId: 'x',
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.phoneCall.deleteMany({ where: { businessId } });
      await tx.voiceOutboundEligibilityDecision.deleteMany({
        where: { businessId },
      });
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('builds daily rows from stored facts only', async () => {
    const result = await service.trends(businessId, '7');
    expect(result.totals).toMatchObject({
      calls: 4,
      missed: 1,
      transferred: 1,
      aiContained: 1,
      humanConnected: 1,
      aiOnlyMinutes: 2,
      humanInvolvedMinutes: 5,
      pricedCalls: 1,
    });
    const today = result.series.find((row) => row.calls === 4);
    expect(today).toMatchObject({
      costPerPricedCall: 0.03,
      averageQualityScore: null,
      complianceBlockedRate: 0.5,
    });
    expect(result.glossary.length).toBeGreaterThan(5);
  });
});
