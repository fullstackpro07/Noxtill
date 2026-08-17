import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { SocialAnalyticsService } from './social-analytics.service';
import type { SocialAccountsService } from './social-accounts.service';
import type { SocialConnectorRegistry } from './connectors/social-connector-registry';
import { SocialPlatform } from '@prisma/client';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('SocialAnalyticsService (UPD-BE-050)', () => {
  let prisma: PrismaService;
  let service: SocialAnalyticsService;
  let businessId: string;

  const fetchInsights = jest.fn();
  const accounts = {
    getTokens: jest.fn(),
    getAccount: jest.fn().mockResolvedValue({ meta: {} }),
  };
  const connectors = { get: jest.fn().mockReturnValue({ fetchInsights }) };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new SocialAnalyticsService(
      tenantPrisma,
      accounts as unknown as SocialAccountsService,
      connectors as unknown as SocialConnectorRegistry,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Social Analytics Test Biz',
        slug: `social-analytics-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterEach(() => jest.clearAllMocks());

  afterAll(async () => {
    await prisma.socialAnalyticsSnapshot.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('pullForAccount() rejects when the platform has no real tokens', async () => {
    accounts.getTokens.mockResolvedValue(null);
    await expect(
      service.pullForAccount(businessId, SocialPlatform.facebook),
    ).rejects.toThrow();
  });

  it('pullForAccount() calls the real connector and upserts a snapshot for today', async () => {
    accounts.getTokens.mockResolvedValue({ accessToken: 'tok' });
    fetchInsights.mockResolvedValue({
      followers: 500,
      reach: 200,
      engagement: 40,
      impressions: 900,
    });

    const snapshot = await service.pullForAccount(
      businessId,
      SocialPlatform.facebook,
    );
    expect(snapshot.followers).toBe(500);

    // Re-pulling the same day upserts in place rather than duplicating.
    fetchInsights.mockResolvedValue({
      followers: 510,
      reach: 210,
      engagement: 45,
      impressions: 950,
    });
    await service.pullForAccount(businessId, SocialPlatform.facebook);

    const rows = await prisma.socialAnalyticsSnapshot.findMany({
      where: { businessId, platform: SocialPlatform.facebook },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].followers).toBe(510);
  });

  it('summary() aggregates the latest snapshot per platform', async () => {
    accounts.getTokens.mockResolvedValue({ accessToken: 'tok' });
    fetchInsights.mockResolvedValue({
      followers: 300,
      reach: 100,
      engagement: 20,
      impressions: 400,
    });
    await service.pullForAccount(businessId, SocialPlatform.instagram);

    const summary = await service.summary(businessId);
    expect(summary.totalFollowers).toBe(510 + 300);
    expect(summary.byPlatform).toHaveLength(2);
  });

  it('list() filters by platform', async () => {
    const facebookOnly = await service.list(
      businessId,
      SocialPlatform.facebook,
    );
    expect(
      facebookOnly.every((r) => r.platform === SocialPlatform.facebook),
    ).toBe(true);
  });
});
