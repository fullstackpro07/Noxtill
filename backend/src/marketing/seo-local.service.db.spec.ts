import { ClsService } from 'nestjs-cls';
import { IntegrationProvider, SeoContentFormat } from '@prisma/client';
import type { AiInfraService } from '../ai/ai-infra.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { SeoContentService } from './seo-content.service';
import { SeoLocalService } from './seo-local.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

const SITE = 'https://local-seo.test/';
const url = (path: string) => new URL(path, SITE).toString();

describe('SeoLocalService (MySQL)', () => {
  let prisma: PrismaService;
  let service: SeoLocalService;
  let rootId: string;
  let activeLocationId: string;
  let inactiveLocationId: string;
  let otherBusinessId: string;
  let keywordId: string;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    const content = new SeoContentService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
      {} as AiInfraService,
    );
    service = new SeoLocalService(prisma, content);

    const root = await prisma.business.create({
      data: { name: 'Local SEO Group', slug: `seo-local-${stamp}` },
    });
    rootId = root.id;
    cls.set(CLS_KEY_BUSINESS_ID, rootId);
    const activeLocation = await prisma.business.create({
      data: {
        name: 'Local SEO Uptown',
        slug: `seo-local-uptown-${stamp}`,
        parentId: rootId,
      },
    });
    activeLocationId = activeLocation.id;
    const inactiveLocation = await prisma.business.create({
      data: {
        name: 'Local SEO Closed',
        slug: `seo-local-closed-${stamp}`,
        parentId: rootId,
        active: false,
      },
    });
    inactiveLocationId = inactiveLocation.id;
    const otherBusiness = await prisma.business.create({
      data: { name: 'Other Local SEO', slug: `seo-local-other-${stamp}` },
    });
    otherBusinessId = otherBusiness.id;

    const rootListing = {
      name: 'Local SEO Group Main',
      phone: '+1 555 0100',
      website: SITE,
      addressLine1: '10 Main Street',
      addressLine2: 'Suite 2',
      city: 'Metro City',
      state: 'CA',
      postalCode: '90001',
      country: 'US',
      categories: ['Plumbing'],
      description: 'Canonical local listing',
      hours: { mon: [['09:00', '17:00']] },
    };
    await prisma.masterListing.create({
      data: { businessId: rootId, ...rootListing },
    });
    await prisma.masterListing.create({
      data: {
        businessId: activeLocationId,
        name: 'Uptown Plumbing',
        website: SITE,
        city: 'Uptown',
        country: 'US',
        categories: [],
        hours: {},
      },
    });
    await prisma.listingSettings.create({
      data: { businessId: rootId, fieldMapping: { gmb: ['phone'] } },
    });
    await prisma.citation.createMany({
      data: [
        {
          businessId: rootId,
          provider: IntegrationProvider.gmb,
          syncedAt: new Date(Date.now() - 2 * 86_400_000),
          snapshot: { ...rootListing, phone: '+1 555 OLD' },
        },
        {
          businessId: rootId,
          provider: IntegrationProvider.yelp,
          syncedAt: new Date(Date.now() - 3 * 86_400_000),
          snapshot: { ...rootListing, city: 'Oldtown' },
        },
      ],
    });
    await prisma.externalReview.createMany({
      data: [
        {
          businessId: rootId,
          platform: 'google',
          externalId: `current-${stamp}`,
          stars: 5,
          createdAt: new Date(),
        },
        {
          businessId: rootId,
          platform: 'google',
          externalId: `old-${stamp}`,
          stars: 1,
          createdAt: new Date(Date.now() - 120 * 86_400_000),
        },
        {
          businessId: activeLocationId,
          platform: 'yelp',
          externalId: `uptown-${stamp}`,
          stars: 4,
          createdAt: new Date(),
        },
      ],
    });

    const keyword = await prisma.trackedKeyword.create({
      data: {
        businessId: rootId,
        keyword: 'plumber metro city',
        intent: 'local',
      },
    });
    keywordId = keyword.id;
    await prisma.keywordRankSnapshot.createMany({
      data: [
        {
          keywordId,
          rank: 12,
          capturedAt: new Date(Date.now() - 2 * 86_400_000),
        },
        { keywordId, rank: 5, capturedAt: new Date(Date.now() - 86_400_000) },
      ],
    });
    await prisma.trackedKeyword.create({
      data: {
        businessId: rootId,
        keyword: 'plumbing supplies',
        intent: 'informational',
      },
    });

    await prisma.seoHeatmapPoint.createMany({
      data: [
        {
          businessId: rootId,
          scanId: 'older-local-scan',
          keyword: 'plumber metro city',
          lat: 34,
          lng: -118,
          rank: 3,
          scannedAt: new Date(Date.now() - 2 * 86_400_000),
        },
        {
          businessId: rootId,
          scanId: 'latest-local-scan',
          keyword: 'plumber metro city',
          lat: 34,
          lng: -118,
          rank: 2,
          scannedAt: new Date(Date.now() - 60_000),
        },
        {
          businessId: rootId,
          scanId: 'latest-local-scan',
          keyword: 'plumber metro city',
          lat: 34.01,
          lng: -118.01,
          rank: null,
          scannedAt: new Date(Date.now() - 59_000),
        },
        {
          businessId: rootId,
          scanId: 'latest-local-scan',
          keyword: 'plumber metro city',
          lat: 33.99,
          lng: -118.02,
          rank: null,
          scannedAt: new Date(Date.now() - 58_000),
        },
      ],
    });
    await prisma.seoAuditRun.create({
      data: {
        businessId: rootId,
        status: 'completed',
        siteUrl: SITE,
        startedAt: new Date(Date.now() - 30_000),
        pages: [
          {
            url: url('/metro'),
            finalUrl: url('/metro'),
            statusCode: 200,
            contentType: 'text/html',
            title: 'Plumber in Metro City',
            description: 'Reliable service',
            h1: 'Metro City plumbing',
          },
          {
            url: url('/other'),
            finalUrl: url('/other'),
            statusCode: 200,
            contentType: 'text/html',
            title: 'About us',
            description: 'Serving elsewhere',
            h1: 'Our team',
          },
        ],
      },
    });
  });

  afterAll(async () => {
    const ids = [
      rootId,
      activeLocationId,
      inactiveLocationId,
      otherBusinessId,
    ].filter(Boolean);
    if (rootId) {
      await prisma.seoContentBriefAudit.deleteMany({
        where: { businessId: rootId },
      });
      await prisma.seoContentBrief.deleteMany({
        where: { businessId: rootId },
      });
    }
    await prisma.seoAuditRun.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.seoHeatmapPoint.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.keywordRankSnapshot.deleteMany({
      where: { keyword: { businessId: { in: ids } } },
    });
    await prisma.trackedKeyword.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.externalReview.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.citation.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.listingSettings.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.masterListing.deleteMany({
      where: { businessId: { in: ids } },
    });
    if (activeLocationId)
      await prisma.business.delete({ where: { id: activeLocationId } });
    if (inactiveLocationId)
      await prisma.business.delete({ where: { id: inactiveLocationId } });
    if (rootId) await prisma.business.delete({ where: { id: rootId } });
    if (otherBusinessId)
      await prisma.business.delete({ where: { id: otherBusinessId } });
    await prisma.$disconnect();
  });

  it('summarizes the active branch group from canonical records and latest local evidence', async () => {
    const result = await service.overview(rootId);
    expect(result.locations.map((location) => location.businessId)).toEqual([
      rootId,
      activeLocationId,
    ]);
    const root = result.locations[0];
    expect(root.listing).toMatchObject({
      configured: true,
      missingFields: [],
      missingHours: false,
      missingCategories: false,
      listingUrl: '/listings',
    });
    expect(root.citations).toMatchObject({
      total: 2,
      stale: 1,
      mismatchCount: 1,
    });
    expect(
      root.citations.records.find((citation) => citation.provider === 'gmb'),
    ).toMatchObject({
      status: 'matches_snapshot',
      mismatchedFields: [],
    });
    expect(root.reviews90Days).toMatchObject({ count: 1, averageStars: 5 });
    expect(root.localKeywords.records).toEqual([
      expect.objectContaining({
        keyword: 'plumber metro city',
        currentRank: 5,
        previousRank: 12,
        positionsGained: 7,
        movement: 'improving',
      }),
    ]);
    expect(root.localPack).toMatchObject({
      scanId: 'latest-local-scan',
      visiblePoints: 1,
      totalPoints: 3,
      sharePercent: 33.3,
    });
    expect(root.cityMentions).toMatchObject({
      pageCount: 1,
      pages: [
        expect.objectContaining({
          url: url('/metro'),
          mentionFields: ['title', 'h1'],
        }),
      ],
    });
    expect(result.locations[1].listing).toMatchObject({
      missingFields: [
        'phone',
        'addressLine1',
        'addressLine2',
        'state',
        'postalCode',
      ],
      missingHours: true,
      missingCategories: true,
    });
    expect(result.summary).toMatchObject({
      locations: 2,
      staleCitations: 1,
      reviewCount90Days: 2,
      averageReviewStars90Days: 4.5,
      localKeywords: 1,
      improvingLocalKeywords: 1,
      localPack: { visiblePoints: 1, totalPoints: 3, sharePercent: 33.3 },
    });
    expect(result.disclosures.localSchema).toBe('Not tracked');
  });

  it('creates a location-page brief through Content SEO and refuses an unrelated location', async () => {
    const brief = await service.createLocalPageBrief(
      rootId,
      'seo-local-owner',
      activeLocationId,
    );
    expect(brief).toMatchObject({
      format: SeoContentFormat.location_page,
      intent: 'local',
      topic: 'Local page for Uptown, US',
      createdByUserId: 'seo-local-owner',
    });
    await expect(
      service.createLocalPageBrief(rootId, 'seo-local-owner', otherBusinessId),
    ).rejects.toMatchObject({
      response: { code: 'SEO_LOCAL_LOCATION_NOT_FOUND' },
    });
  });
});
