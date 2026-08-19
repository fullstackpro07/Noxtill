import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { IntegrationsService } from '../integrations/integrations.service';
import { ConnectorRegistry } from '../integrations/connector-registry';
import { AdCampaignsService } from './ad-campaigns.service';
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

describe('AdCampaignsService (UPD-BE-069)', () => {
  let prisma: PrismaService;
  let service: AdCampaignsService;
  let businessId: string;
  const getTokens = jest.fn();
  const createCampaign = jest.fn();

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
      get: (provider: IntegrationProvider) =>
        provider === IntegrationProvider.meta_ads ? { createCampaign } : {}, // tiktok_ads-shaped connector with NO createCampaign — the "unsupported provider" branch
    };
    service = new AdCampaignsService(
      tenantPrisma,
      integrations as unknown as IntegrationsService,
      connectors as unknown as ConnectorRegistry,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Ad Campaigns Test Biz',
        slug: `ad-campaigns-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.adCampaign.deleteMany({ where: { businessId } });
    await prisma.integration.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('pushes a real paused campaign to a genuinely connected provider and stores its real externalId', async () => {
    await prisma.integration.create({
      data: {
        businessId,
        provider: IntegrationProvider.meta_ads,
        status: IntegrationStatus.connected,
      },
    });
    getTokens.mockResolvedValue({ accessToken: 'tok' });
    createCampaign.mockResolvedValue({ externalId: 'camp_real_123' });

    const campaign = await service.create(businessId, 'meta_ads', {
      name: 'Summer Sale',
      goal: 'traffic',
      dailyBudget: 20,
    });

    expect(campaign.status).toBe('paused');
    expect(campaign.externalId).toBe('camp_real_123');

    expect(createCampaign).toHaveBeenCalledWith(
      { accessToken: 'tok' },
      { name: 'Summer Sale', goal: 'traffic', dailyBudget: 20 },
      {},
    );
  });

  it('creates a real local draft when the provider is not connected, never throwing', async () => {
    const campaign = await service.create(businessId, 'tiktok_ads', {
      name: 'Not Connected Campaign',
      goal: 'awareness',
      dailyBudget: 15,
    });

    expect(campaign.status).toBe('draft');
    expect(campaign.externalId).toBeNull();
    const stored = await prisma.adCampaign.findUnique({
      where: { id: campaign.id },
    });
    expect(stored).not.toBeNull();
  });

  it('creates a real local draft when the real provider call throws, rather than failing the request', async () => {
    await prisma.integration.updateMany({
      where: { businessId, provider: IntegrationProvider.meta_ads },
      data: { status: IntegrationStatus.connected },
    });
    getTokens.mockResolvedValue({ accessToken: 'tok' });
    createCampaign.mockRejectedValue(new Error('rate limited'));

    const campaign = await service.create(businessId, 'meta_ads', {
      name: 'Fallback Campaign',
      goal: 'sales',
      dailyBudget: 10,
    });

    expect(campaign.status).toBe('draft');
    expect(campaign.externalId).toBeNull();
  });

  it('rejects an unknown provider', async () => {
    await expect(
      service.create(businessId, 'not_a_real_provider', {
        name: 'x',
        goal: 'traffic',
        dailyBudget: 5,
      }),
    ).rejects.toThrow();
  });

  it('list() and findOne() read real persisted campaigns', async () => {
    const all = await service.list();
    expect(all.length).toBeGreaterThan(0);

    const found = await service.findOne(all[0].id);
    expect(found.id).toBe(all[0].id);

    await expect(service.findOne('no-such-campaign')).rejects.toThrow();
  });
});
