import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { MasterListingService } from '../listings/master-listing.service';
import { ListingSyncService } from '../listings/listing-sync.service';
import { VisibilityScoreService } from './visibility-score.service';
import type { IntegrationsService } from '../integrations/integrations.service';
import type { ConnectorRegistry } from '../integrations/connector-registry';
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

describe('VisibilityScoreService (UPD-BE-052)', () => {
  let prisma: PrismaService;
  let service: VisibilityScoreService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const masterListing = new MasterListingService(tenantPrisma);
    // No directory providers configured — the listing component is deterministically 0 in every
    // test here; listing scoring's own real behavior is already covered by
    // listing-sync.service.spec.ts, this file only needs it as a stable input to the average.
    const connectors = { directoryProviders: () => [] };
    const listingSync = new ListingSyncService(
      tenantPrisma,
      {} as unknown as IntegrationsService,
      connectors as unknown as ConnectorRegistry,
      masterListing,
    );
    service = new VisibilityScoreService(tenantPrisma, listingSync);

    const business = await prisma.business.create({
      data: {
        name: 'Visibility Score Test Biz',
        slug: `visibility-score-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.visibilityScoreSnapshot.deleteMany({ where: { businessId } });
    await prisma.socialAnalyticsSnapshot.deleteMany({ where: { businessId } });
    await prisma.socialAccount.deleteMany({ where: { businessId } });
    await prisma.keywordRankSnapshot.deleteMany({
      where: { keyword: { businessId } },
    });
    await prisma.trackedKeyword.deleteMany({ where: { businessId } });
    await prisma.externalReview.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('every raw component is 0 with no data at all — never fabricated', async () => {
    const components = await service.computeRawComponents(businessId);
    expect(components).toEqual({
      listingScore: 0,
      reviewScore: 0,
      seoScore: 0,
      socialScore: 0,
    });
  });

  it('reviewScore reflects a fresh, fully-replied review as a high score', async () => {
    await prisma.externalReview.create({
      data: {
        businessId,
        platform: 'google',
        externalId: `ext-${Date.now()}`,
        stars: 5,
        repliedAt: new Date(),
      },
    });
    const components = await service.computeRawComponents(businessId);
    expect(components.reviewScore).toBeGreaterThan(90);
  });

  it('seoScore rewards a #1 rank and zeroes out an unranked keyword', async () => {
    const ranked = await prisma.trackedKeyword.create({
      data: { businessId, keyword: 'best pizza near me' },
    });
    await prisma.keywordRankSnapshot.create({
      data: { keywordId: ranked.id, rank: 1 },
    });

    let components = await service.computeRawComponents(businessId);
    expect(components.seoScore).toBe(100);

    const unranked = await prisma.trackedKeyword.create({
      data: { businessId, keyword: 'gourmet burgers downtown' },
    });
    await prisma.keywordRankSnapshot.create({
      data: { keywordId: unranked.id, rank: null },
    });

    components = await service.computeRawComponents(businessId);
    expect(components.seoScore).toBe(50); // average of 100 (rank 1) and 0 (unranked)
  });

  it('socialScore is 0 for a connected platform with no recent analytics snapshot, 100 once one lands', async () => {
    await prisma.socialAccount.create({
      data: {
        businessId,
        platform: SocialPlatform.instagram,
        status: 'connected',
      },
    });

    let components = await service.computeRawComponents(businessId);
    expect(components.socialScore).toBe(0);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await prisma.socialAnalyticsSnapshot.create({
      data: { businessId, platform: SocialPlatform.instagram, date: today },
    });

    components = await service.computeRawComponents(businessId);
    expect(components.socialScore).toBe(100);
  });

  it('getScore() averages the four real components and returns real snapshot history', async () => {
    const result = await service.getScore(businessId);
    const components = await service.computeRawComponents(businessId);
    const expectedScore =
      Math.round(
        ((components.listingScore +
          components.reviewScore +
          components.seoScore +
          components.socialScore) /
          4) *
          100,
      ) / 100;
    expect(result.score).toBeCloseTo(expectedScore, 2);
    expect(result.history).toEqual([]);
  });
});
