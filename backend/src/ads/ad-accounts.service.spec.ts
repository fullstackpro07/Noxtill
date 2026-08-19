import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { IntegrationsService } from '../integrations/integrations.service';
import { ConnectorRegistry } from '../integrations/connector-registry';
import { AdAccountsService } from './ad-accounts.service';
import { IntegrationProvider, IntegrationStatus } from '@prisma/client';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('AdAccountsService (UPD-BE-069)', () => {
  let prisma: PrismaService;
  let service: AdAccountsService;
  let businessId: string;
  const getTokens = jest.fn();
  const metaSync = jest.fn();
  const googleSync = jest.fn();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const integrations = { getTokens };
    const connectors = {
      get: (provider: IntegrationProvider) => {
        if (provider === IntegrationProvider.meta_ads) {
          return { sync: metaSync };
        }
        if (provider === IntegrationProvider.google_ads) {
          return { sync: googleSync };
        }
        return { sync: jest.fn() };
      },
    };
    service = new AdAccountsService(
      tenantPrisma,
      integrations as unknown as IntegrationsService,
      connectors as unknown as ConnectorRegistry,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Ad Accounts Test Biz',
        slug: `ad-accounts-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.integration.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('reports every ad provider, marking the ones with no real Integration row as not connected', async () => {
    const rows = await service.list(businessId);
    expect(rows.length).toBeGreaterThanOrEqual(9);
    expect(rows.every((r) => r.connected === false)).toBe(true);
  });

  it('calls the real connector for a genuinely connected provider and returns its real accounts', async () => {
    await prisma.integration.create({
      data: {
        businessId,
        provider: IntegrationProvider.meta_ads,
        status: IntegrationStatus.connected,
      },
    });
    getTokens.mockResolvedValue({ accessToken: 'tok' });
    metaSync.mockResolvedValue({
      data: [{ id: 'act_123', name: 'Real Ad Account' }],
    });

    const rows = await service.list(businessId);
    const metaRow = rows.find(
      (r) => r.provider === IntegrationProvider.meta_ads,
    );
    expect(metaRow?.connected).toBe(true);
    expect(metaRow?.accounts).toEqual({
      data: [{ id: 'act_123', name: 'Real Ad Account' }],
    });

    expect(metaSync).toHaveBeenCalledWith({ accessToken: 'tok' });
  });

  it('reports a real connected provider whose sync() call fails, without breaking other providers', async () => {
    await prisma.integration.create({
      data: {
        businessId,
        provider: IntegrationProvider.google_ads,
        status: IntegrationStatus.connected,
      },
    });
    getTokens.mockResolvedValue({ accessToken: 'tok' });
    metaSync.mockResolvedValue({ data: [] });
    googleSync.mockRejectedValue(new Error('token expired'));

    const rows = await service.list(businessId);
    const googleRow = rows.find(
      (r) => r.provider === IntegrationProvider.google_ads,
    );
    expect(googleRow?.connected).toBe(true);
    expect(googleRow?.error).toBe('token expired');

    const metaRow = rows.find(
      (r) => r.provider === IntegrationProvider.meta_ads,
    );
    expect(metaRow?.error).toBeUndefined();
  });
});
