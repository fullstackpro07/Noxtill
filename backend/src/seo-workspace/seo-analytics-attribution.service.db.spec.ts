import { ClsService } from 'nestjs-cls';
import { IntegrationProvider, IntegrationStatus, Prisma } from '@prisma/client';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { ConnectorRegistry } from '../integrations/connector-registry';
import { IntegrationsService } from '../integrations/integrations.service';
import { PrismaService } from '../prisma/prisma.service';
import { SeoAnalyticsAttributionService } from './seo-analytics-attribution.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('SeoAnalyticsAttributionService (MySQL)', () => {
  let prisma: PrismaService;
  let tenant: TenantPrismaService;
  let cls: FakeClsService;
  let service: SeoAnalyticsAttributionService;
  let businessId: string;
  let otherBusinessId: string;
  let connector: {
    sync: jest.Mock;
    getPropertyDetails: jest.Mock;
    queryOrganicSearch: jest.Mock;
    queryOrganicSearchLandingPages: jest.Mock;
  };
  const stamp = Date.now();
  const property = 'properties/123456';
  const properties = [
    {
      property,
      displayName: 'QA Analytics Property',
      propertyType: 'PROPERTY_TYPE_ORDINARY',
      account: 'accounts/9876',
      accountDisplayName: 'QA Analytics Account',
    },
  ];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    tenant = new TenantPrismaService(prisma, cls as unknown as ClsService);
    businessId = (
      await prisma.business.create({
        data: { name: 'SEO GA4 QA', slug: `seo-ga4-${stamp}` },
      })
    ).id;
    otherBusinessId = (
      await prisma.business.create({
        data: { name: 'Other SEO GA4 QA', slug: `seo-ga4-other-${stamp}` },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    connector = {
      sync: jest.fn().mockResolvedValue(properties),
      getPropertyDetails: jest.fn().mockResolvedValue({
        displayName: 'QA Analytics Property',
        currencyCode: 'USD',
        timeZone: 'UTC',
      }),
      queryOrganicSearch: jest
        .fn()
        .mockResolvedValueOnce({
          sessions: '140',
          keyEvents: '7',
          totalRevenue: '245.50',
        })
        .mockResolvedValueOnce({
          sessions: '100',
          keyEvents: '4',
          totalRevenue: '190.00',
        }),
      queryOrganicSearchLandingPages: jest.fn().mockResolvedValue({
        rows: [
          {
            landingPage: '/products/widget',
            sessions: '42',
            keyEvents: '3',
            totalRevenue: '90.00',
          },
        ],
        totalRows: 1,
        truncated: false,
      }),
    };
    const registry = {
      get: jest.fn().mockReturnValue(connector),
    } as unknown as ConnectorRegistry;
    const integrations = {
      getFreshTokens: jest
        .fn()
        .mockResolvedValue({ accessToken: 'encrypted-test-token' }),
    } as unknown as IntegrationsService;
    service = new SeoAnalyticsAttributionService(
      tenant,
      integrations,
      registry,
    );

    await prisma.integration.create({
      data: {
        businessId,
        provider: IntegrationProvider.google_analytics,
        status: IntegrationStatus.connected,
        tokens: 'encrypted-by-the-real-integration-layer',
        meta: { unrelatedProviderSetting: 'keep-me' },
      },
    });
    await prisma.integration.create({
      data: {
        businessId: otherBusinessId,
        provider: IntegrationProvider.google_analytics,
        status: IntegrationStatus.connected,
        meta: {
          analyticsProperties: [
            { ...properties[0], displayName: 'Other property' },
          ],
          analyticsSelectedProperty: 'properties/999999',
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.integration.deleteMany({
      where: { businessId: { in: [businessId, otherBusinessId] } },
    });
    await prisma.business.deleteMany({
      where: { id: { in: [businessId, otherBusinessId] } },
    });
    await prisma.$disconnect();
  });

  it('refreshes properties without overwriting other integration metadata', async () => {
    const result = await service.refreshProperties(businessId);
    expect(result.properties).toEqual(properties);
    const saved = await prisma.integration.findUniqueOrThrow({
      where: {
        businessId_provider: {
          businessId,
          provider: IntegrationProvider.google_analytics,
        },
      },
    });
    expect(saved.meta).toMatchObject({
      unrelatedProviderSetting: 'keep-me',
      analyticsProperties: properties,
      analyticsPropertiesRefreshedAt: result.refreshedAt.toISOString(),
    });
  });

  it('rejects a property not accessible to the connected Google account', async () => {
    await expect(
      service.selectProperty(businessId, 'properties/654321'),
    ).rejects.toMatchObject({
      response: { code: 'SEO_GA4_PROPERTY_NOT_ACCESSIBLE' },
    });
  });

  it('selects an accessible property and persists two real comparison periods', async () => {
    await expect(service.selectProperty(businessId, property)).resolves.toEqual(
      {
        selectedProperty: property,
        availableProperties: 1,
      },
    );
    const result = await service.syncOrganicSearch(businessId);
    expect(result.status).toBe(IntegrationStatus.connected);
    expect(result.selectedProperty).toBe(property);
    expect(result.snapshot).toMatchObject({
      property,
      propertyName: 'QA Analytics Property',
      currencyCode: 'USD',
      windowDays: 28,
      current: {
        dataState: 'returned',
        sessions: '140',
        keyEvents: '7',
        totalRevenue: '245.50',
        landingPages: {
          dataState: 'returned',
          rows: [
            {
              landingPage: '/products/widget',
              sessions: '42',
              keyEvents: '3',
              totalRevenue: '90.00',
            },
          ],
          totalRows: 1,
          truncated: false,
        },
      },
      comparison: {
        dataState: 'returned',
        sessions: '100',
        keyEvents: '4',
        totalRevenue: '190.00',
      },
    });
    const current = new Date(
      `${result.snapshot!.current.startDate}T00:00:00.000Z`,
    );
    const currentEnd = new Date(
      `${result.snapshot!.current.endDate}T00:00:00.000Z`,
    );
    const comparisonEnd = new Date(
      `${result.snapshot!.comparison.endDate}T00:00:00.000Z`,
    );
    const comparisonStart = new Date(
      `${result.snapshot!.comparison.startDate}T00:00:00.000Z`,
    );
    expect((currentEnd.getTime() - current.getTime()) / 86_400_000 + 1).toBe(
      28,
    );
    expect((current.getTime() - comparisonEnd.getTime()) / 86_400_000).toBe(1);
    expect(
      (comparisonEnd.getTime() - comparisonStart.getTime()) / 86_400_000 + 1,
    ).toBe(28);
    expect(connector.getPropertyDetails).toHaveBeenCalledWith(
      { accessToken: 'encrypted-test-token' },
      property,
    );
    expect(connector.queryOrganicSearch).toHaveBeenCalledTimes(2);
    expect(connector.queryOrganicSearchLandingPages).toHaveBeenCalledTimes(2);
    expect(result.snapshot?.comparison.landingPages?.rows[0].landingPage).toBe(
      '/products/widget',
    );

    const saved = await prisma.integration.findUniqueOrThrow({
      where: {
        businessId_provider: {
          businessId,
          provider: IntegrationProvider.google_analytics,
        },
      },
    });
    expect(saved.lastSyncAt).not.toBeNull();
    expect(
      (saved.meta as Prisma.JsonObject).analyticsOrganicSearchSnapshot,
    ).toMatchObject({
      property,
      currencyCode: 'USD',
    });
    expect(result.disclosure).toContain(
      'do not prove an SEO change caused an outcome',
    );
    const agentEvidence = await service.agentEvidence(businessId);
    expect(agentEvidence.landingPages).toMatchObject({
      dataState: 'returned',
      rows: [
        {
          landingPage: '/products/widget',
          sessions: '42',
          keyEvents: '3',
        },
      ],
    });
  });

  it('does not read another business property through the selected tenant context', async () => {
    cls.set(CLS_KEY_BUSINESS_ID, otherBusinessId);
    const result = await service.summary(otherBusinessId);
    expect(result.selectedProperty).toBe('properties/999999');
    expect(result.properties).toHaveLength(1);
    expect(result.properties[0].displayName).toBe('Other property');
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  it('does not pretend an unconnected or unsynced property has zero metrics', async () => {
    const emptyBusinessId = (
      await prisma.business.create({
        data: { name: 'Empty GA4 QA', slug: `seo-ga4-empty-${stamp}` },
      })
    ).id;
    try {
      const evidence = await service.agentEvidence(emptyBusinessId);
      expect(evidence).toMatchObject({
        status: IntegrationStatus.not_connected,
        current: null,
        comparison: null,
        unavailableReason: 'Google Analytics is not connected.',
      });
      expect(evidence).not.toHaveProperty('sessions', '0');
    } finally {
      await prisma.business.delete({ where: { id: emptyBusinessId } });
    }
  });
});
