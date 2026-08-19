import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { AdAnalyticsService } from './ad-analytics.service';
import { IntegrationProvider, Prisma } from '@prisma/client';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('AdAnalyticsService (UPD-BE-071)', () => {
  let prisma: PrismaService;
  let service: AdAnalyticsService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new AdAnalyticsService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Ad Analytics Test Biz',
        slug: `ad-analytics-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    await prisma.adCampaign.createMany({
      data: [
        {
          businessId,
          provider: IntegrationProvider.meta_ads,
          goal: 'traffic',
          budget: 20,
          status: 'paused',
          stats: {
            spend: 100,
            impressions: 10000,
            clicks: 200,
            results: 20,
          } as unknown as Prisma.InputJsonValue,
        },
        {
          businessId,
          provider: IntegrationProvider.meta_ads,
          goal: 'leads',
          budget: 30,
          status: 'active',
          stats: {
            spend: 50,
            impressions: 5000,
            clicks: 100,
            results: 10,
          } as unknown as Prisma.InputJsonValue,
        },
        {
          businessId,
          provider: IntegrationProvider.google_ads,
          goal: 'sales',
          budget: 40,
          status: 'draft', // excluded from budget() — a draft never actually spends
          stats: {} as unknown as Prisma.InputJsonValue,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.adCampaign.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('budget() sums real daily budgets per provider, excluding local-only drafts', async () => {
    const result = await service.budget();
    const metaRow = result.rows.find((r) => r.provider === 'meta_ads');
    expect(metaRow?.campaignCount).toBe(2);
    expect(metaRow?.totalDailyBudget).toBe(50);
    expect(
      result.rows.find((r) => r.provider === 'google_ads'),
    ).toBeUndefined();
    expect(result.totalDailyBudget).toBe(50);
  });

  it('performance() aggregates real stats across every campaign for a provider', async () => {
    const result = await service.performance();
    const metaRow = result.find((r) => r.provider === 'meta_ads');
    expect(metaRow?.spend).toBe(150);
    expect(metaRow?.impressions).toBe(15000);
    expect(metaRow?.clicks).toBe(300);
    expect(metaRow?.results).toBe(30);
    expect(metaRow?.ctr).toBe(2); // 300/15000 * 100
    expect(metaRow?.costPerResult).toBe(5); // 150/30

    const googleRow = result.find((r) => r.provider === 'google_ads');
    expect(googleRow?.spend).toBe(0);
    expect(googleRow?.ctr).toBeNull();
    expect(googleRow?.costPerResult).toBeNull();
  });
});
