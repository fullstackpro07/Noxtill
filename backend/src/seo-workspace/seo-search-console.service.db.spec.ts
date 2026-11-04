import { ClsService } from 'nestjs-cls';
import { IntegrationProvider, IntegrationStatus, Prisma } from '@prisma/client';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { ConnectorRegistry } from '../integrations/connector-registry';
import { IntegrationsService } from '../integrations/integrations.service';
import { PrismaService } from '../prisma/prisma.service';
import { SeoSearchConsoleService } from './seo-search-console.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('SeoSearchConsoleService (MySQL)', () => {
  let prisma: PrismaService;
  let tenant: TenantPrismaService;
  let cls: FakeClsService;
  let service: SeoSearchConsoleService;
  let businessId: string;
  let otherBusinessId: string;
  let connector: {
    sync: jest.Mock;
    queryPropertyPerformance: jest.Mock;
    queryKeywordPerformance: jest.Mock;
    queryPagePerformance: jest.Mock;
    inspectUrl: jest.Mock;
  };
  const stamp = Date.now();
  const propertyUrl = 'https://search-console.test/';
  const properties = [
    { siteUrl: propertyUrl, permissionLevel: 'siteOwner' },
    {
      siteUrl: 'sc-domain:search-console.test',
      permissionLevel: 'siteFullUser',
    },
  ];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    tenant = new TenantPrismaService(prisma, cls as unknown as ClsService);
    businessId = (
      await prisma.business.create({
        data: { name: 'Search Console QA', slug: `seo-gsc-${stamp}` },
      })
    ).id;
    otherBusinessId = (
      await prisma.business.create({
        data: {
          name: 'Other Search Console QA',
          slug: `seo-gsc-other-${stamp}`,
        },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    connector = {
      sync: jest.fn().mockResolvedValue(properties),
      queryPropertyPerformance: jest.fn().mockResolvedValue({
        clicks: '123',
        impressions: '4567',
        clickThroughRate: 0.0269,
        averagePosition: 8.4,
      }),
      queryKeywordPerformance: jest.fn().mockResolvedValue([]),
      queryPagePerformance: jest.fn().mockResolvedValue({
        pageUrl: 'https://search-console.test/page',
        clicks: '12',
        impressions: '345',
        clickThroughRate: 12 / 345,
        averagePosition: 6.25,
      }),
      inspectUrl: jest.fn().mockResolvedValue({
        inspectionResultLink:
          'https://search.google.com/search-console/inspect',
        verdict: 'PASS',
        coverageState: 'Submitted and indexed',
        indexingState: 'INDEXING_ALLOWED',
        robotsTxtState: 'ALLOWED',
        pageFetchState: 'SUCCESSFUL',
        lastCrawlTime: '2026-10-30T12:00:00Z',
        googleCanonical: 'https://search-console.test/page',
        userCanonical: 'https://search-console.test/page',
        sitemaps: ['https://search-console.test/sitemap.xml'],
        referringUrls: [],
      }),
    };
    const registry = {
      get: jest.fn().mockReturnValue(connector),
    } as unknown as ConnectorRegistry;
    const integrations = {
      getFreshTokens: jest
        .fn()
        .mockResolvedValue({ accessToken: 'test-token' }),
    } as unknown as IntegrationsService;
    service = new SeoSearchConsoleService(tenant, integrations, registry);

    await prisma.integration.create({
      data: {
        businessId,
        provider: IntegrationProvider.google_search_console,
        status: IntegrationStatus.connected,
        tokens: 'encrypted-by-the-real-integration-layer',
      },
    });
    await prisma.integration.create({
      data: {
        businessId: otherBusinessId,
        provider: IntegrationProvider.google_search_console,
        status: IntegrationStatus.connected,
        meta: { searchConsoleSelectedProperty: propertyUrl },
      },
    });
  });

  afterAll(async () => {
    await prisma.seoSearchConsoleKeywordSnapshot.deleteMany({
      where: { businessId: { in: [businessId, otherBusinessId] } },
    });
    await prisma.trackedKeyword.deleteMany({
      where: { businessId: { in: [businessId, otherBusinessId] } },
    });
    await prisma.seoSearchConsoleSnapshot.deleteMany({
      where: { businessId: { in: [businessId, otherBusinessId] } },
    });
    await prisma.integration.deleteMany({
      where: { businessId: { in: [businessId, otherBusinessId] } },
    });
    await prisma.business.deleteMany({
      where: { id: { in: [businessId, otherBusinessId] } },
    });
    await prisma.$disconnect();
  });

  it('lists only properties returned by the connected Google account and selects an accessible one', async () => {
    const result = await service.refreshProperties(businessId);
    expect(result.properties).toEqual(properties);
    expect(connector.sync).toHaveBeenCalledWith({ accessToken: 'test-token' });

    await expect(
      service.selectProperty(businessId, 'https://not-accessible.test/'),
    ).rejects.toMatchObject({
      response: { code: 'SEO_GSC_PROPERTY_NOT_ACCESSIBLE' },
    });
    await expect(
      service.selectProperty(businessId, propertyUrl),
    ).resolves.toMatchObject({
      id: businessId,
      selectedProperty: propertyUrl,
      availableProperties: 2,
    });
    expect((await service.summary(businessId)).selectedProperty).toBe(
      propertyUrl,
    );
  });

  it('stores two real aggregate windows, preserving large counts without rounding', async () => {
    const result = await service.syncPerformance(businessId);
    expect(result.windows).toHaveLength(2);
    expect(connector.queryPropertyPerformance).toHaveBeenCalledTimes(2);
    expect(connector.queryPropertyPerformance).toHaveBeenCalledWith(
      { accessToken: 'test-token' },
      propertyUrl,
      expect.any(String),
      expect.any(String),
    );
    const rows = await prisma.seoSearchConsoleSnapshot.findMany({
      where: { businessId },
      orderBy: { endDate: 'desc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      propertyUrl,
      clicks: 123n,
      impressions: 4567n,
      clickThroughRate: new Prisma.Decimal('0.0269'),
      averagePosition: new Prisma.Decimal('8.4'),
      dataState: 'final',
    });
    expect((await service.summary(businessId)).snapshots[0].clicks).toBe('123');
  });

  it('records an empty provider response as unavailable data instead of zero metrics', async () => {
    connector.queryPropertyPerformance.mockResolvedValue(null);
    const result = await service.syncPerformance(businessId);
    expect(result.windows[0].snapshot).toMatchObject({
      clicks: null,
      impressions: null,
      clickThroughRate: null,
      averagePosition: null,
      dataState: 'no_data_returned',
    });
    connector.queryPropertyPerformance.mockResolvedValue({
      clicks: '123',
      impressions: '4567',
      clickThroughRate: 0.0269,
      averagePosition: 8.4,
    });
  });

  it('inspects a URL inside the selected property and returns provider evidence with a clear limitation', async () => {
    await service.selectProperty(businessId, propertyUrl);
    const result = await service.inspectUrl(
      businessId,
      'https://search-console.test/page',
    );

    expect(connector.inspectUrl).toHaveBeenCalledWith(
      { accessToken: 'test-token' },
      propertyUrl,
      'https://search-console.test/page',
    );
    expect(result).toMatchObject({
      propertyUrl,
      inspectionUrl: 'https://search-console.test/page',
      verdict: 'PASS',
      coverageState: 'Submitted and indexed',
      source: 'google_search_console_index',
      searchPerformance: {
        status: 'final',
        pageUrl: 'https://search-console.test/page',
        clicks: '12',
        impressions: '345',
        clickThroughRate: 12 / 345,
        averagePosition: 6.25,
      },
    });
    expect(result.disclosure).toContain('not a live-page test');
    expect(result.searchPerformance.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.searchPerformance.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.searchPerformanceDisclosure).toContain(
      'not visits, conversions, orders or revenue attribution',
    );
    expect(connector.queryPagePerformance).toHaveBeenCalledWith(
      { accessToken: 'test-token' },
      propertyUrl,
      'https://search-console.test/page',
      expect.any(String),
      expect.any(String),
    );
    expect(result.inspectedAt).toBeInstanceOf(Date);
  });

  it('accepts a subdomain for a domain property but refuses URLs outside the property', async () => {
    await service.selectProperty(businessId, 'sc-domain:search-console.test');
    const result = await service.inspectUrl(
      businessId,
      'https://shop.search-console.test/catalog/item',
    );
    expect(result.propertyUrl).toBe('sc-domain:search-console.test');
    expect(connector.inspectUrl).toHaveBeenCalledWith(
      { accessToken: 'test-token' },
      'sc-domain:search-console.test',
      'https://shop.search-console.test/catalog/item',
    );

    await expect(
      service.inspectUrl(
        businessId,
        'https://search-console.attacker.test/page',
      ),
    ).rejects.toMatchObject({
      response: { code: 'SEO_GSC_INSPECTION_URL_OUTSIDE_PROPERTY' },
    });
  });

  it('keeps missing or unavailable page-performance data distinct from zero metrics', async () => {
    await service.selectProperty(businessId, propertyUrl);
    connector.queryPagePerformance.mockResolvedValueOnce(null);
    const noRow = await service.inspectUrl(
      businessId,
      'https://search-console.test/page',
    );
    expect(noRow.searchPerformance).toMatchObject({
      status: 'no_data_returned',
      clicks: null,
      impressions: null,
      clickThroughRate: null,
      averagePosition: null,
    });

    connector.queryPagePerformance.mockRejectedValueOnce(
      new Error('Search Analytics unavailable'),
    );
    const unavailable = await service.inspectUrl(
      businessId,
      'https://search-console.test/page',
    );
    expect(unavailable.searchPerformance).toMatchObject({
      status: 'unavailable',
      clicks: null,
      impressions: null,
      clickThroughRate: null,
      averagePosition: null,
    });
  });

  it('rejects credentials, fragments and non-HTTP protocols before contacting Google', async () => {
    await service.selectProperty(businessId, propertyUrl);
    connector.inspectUrl.mockClear();

    for (const url of [
      'javascript:alert(1)',
      'https://user:pass@search-console.test/page',
      'https://search-console.test/page#fragment',
    ]) {
      await expect(service.inspectUrl(businessId, url)).rejects.toMatchObject({
        response: { code: 'SEO_GSC_INSPECTION_URL_INVALID' },
      });
    }
    expect(connector.inspectUrl).not.toHaveBeenCalled();
  });

  it('maps provider URL inspection failures to a typed domain error', async () => {
    await service.selectProperty(businessId, propertyUrl);
    connector.inspectUrl.mockRejectedValueOnce(new Error('provider detail'));

    await expect(
      service.inspectUrl(businessId, 'https://search-console.test/page'),
    ).rejects.toMatchObject({
      response: { code: 'SEO_GSC_URL_INSPECTION_FAILED' },
    });
  });

  it('stores only exact tracked-keyword Search Console evidence and distinguishes unreported terms', async () => {
    const tracked = await prisma.trackedKeyword.create({
      data: { businessId, keyword: 'Coffee beans' },
    });
    const unreported = await prisma.trackedKeyword.create({
      data: { businessId, keyword: 'espresso grinder' },
    });
    const privateQuery = 'private search phrase not tracked';
    connector.queryKeywordPerformance.mockResolvedValue([
      {
        query: 'coffee   beans',
        clicks: '4',
        impressions: '100',
        clickThroughRate: 0.04,
        averagePosition: 5,
      },
      {
        query: privateQuery,
        clicks: '999',
        impressions: '9999',
        clickThroughRate: 0.1,
        averagePosition: 1,
      },
    ]);

    await service.selectProperty(businessId, propertyUrl);
    const sync = await service.syncPerformance(businessId);
    expect(sync.windows).toHaveLength(2);
    expect(connector.queryKeywordPerformance).toHaveBeenCalledTimes(2);

    const snapshots = await prisma.seoSearchConsoleKeywordSnapshot.findMany({
      where: { businessId },
      orderBy: [{ keywordId: 'asc' }, { endDate: 'desc' }],
    });
    expect(snapshots).toHaveLength(4);
    expect(snapshots.filter((row) => row.keywordId === tracked.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          clicks: 4n,
          impressions: 100n,
          dataState: 'final',
        }),
      ]),
    );
    expect(snapshots.filter((row) => row.keywordId === unreported.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          clicks: null,
          impressions: null,
          dataState: 'not_returned',
        }),
      ]),
    );
    expect(
      JSON.stringify(snapshots, (_key, value: unknown) =>
        typeof value === 'bigint' ? value.toString() : value,
      ),
    ).not.toContain(privateQuery);

    const summary = await service.keywordPerformanceSummary(businessId);
    expect(summary).toMatchObject({
      status: IntegrationStatus.connected,
      trackedKeywordCount: 2,
      matchedKeywordCount: 1,
      notReportedKeywordCount: 1,
    });
    expect(
      summary.windows.find((row) => row.id === tracked.id)?.snapshots[0],
    ).toMatchObject({
      clicks: '4',
      impressions: '100',
      dataState: 'final',
    });
    expect(
      summary.windows.find((row) => row.id === unreported.id)?.snapshots[0],
    ).toMatchObject({
      clicks: null,
      impressions: null,
      dataState: 'not_returned',
    });
    expect(JSON.stringify(summary)).not.toContain(privateQuery);
  });

  it('does not expose another business property through a mismatched tenant context', async () => {
    const result = await service.summary(otherBusinessId);
    expect(result.status).toBe(IntegrationStatus.not_connected);
    expect(result.selectedProperty).toBeNull();
    expect(result.snapshots).toEqual([]);
  });
});
