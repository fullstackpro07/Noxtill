import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { IntegrationsService } from '../integrations/integrations.service';
import { ConnectorRegistry } from '../integrations/connector-registry';
import { AdCampaignsService } from './ad-campaigns.service';
import { AdSettingsService } from './ad-settings.service';
import { IntegrationProvider, IntegrationStatus, Role } from '@prisma/client';

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
  const updateCampaign = jest.fn();

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
        provider === IntegrationProvider.meta_ads
          ? { createCampaign, updateCampaign }
          : {}, // tiktok_ads-shaped connector with NO createCampaign/updateCampaign — the "unsupported provider" branch
    };
    service = new AdCampaignsService(
      tenantPrisma,
      integrations as unknown as IntegrationsService,
      connectors as unknown as ConnectorRegistry,
      new AdSettingsService(tenantPrisma),
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
    await prisma.adCampaignStatsSnapshot.deleteMany({ where: { businessId } });
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

  describe('update() (UPD-BE-130, campaign management actions)', () => {
    it('applies a real pause at the provider and persists it locally, replaying the stored providerMeta', async () => {
      await prisma.integration.updateMany({
        where: { businessId, provider: IntegrationProvider.meta_ads },
        data: { status: IntegrationStatus.connected },
      });
      getTokens.mockResolvedValue({ accessToken: 'tok' });
      createCampaign.mockResolvedValue({ externalId: 'camp_update_1' });
      updateCampaign.mockResolvedValue(undefined);

      const created = await service.create(businessId, 'meta_ads', {
        name: 'Update Me',
        goal: 'traffic',
        dailyBudget: 20,
        meta: { adAccountId: 'act_999' },
      });

      const updated = await service.update(
        businessId,
        created.id,
        { status: 'paused', dailyBudget: 30 },
        Role.manager,
      );

      expect(updated.status).toBe('paused');
      expect(Number(updated.budget)).toBe(30);
      expect(updateCampaign).toHaveBeenCalledWith(
        { accessToken: 'tok' },
        'camp_update_1',
        { status: 'paused', dailyBudget: 30 },
        { adAccountId: 'act_999' },
      );
    });

    it('still applies the change locally when the real provider call throws', async () => {
      await prisma.integration.updateMany({
        where: { businessId, provider: IntegrationProvider.meta_ads },
        data: { status: IntegrationStatus.connected },
      });
      getTokens.mockResolvedValue({ accessToken: 'tok' });
      createCampaign.mockResolvedValue({ externalId: 'camp_update_2' });
      const created = await service.create(businessId, 'meta_ads', {
        name: 'Update Me 2',
        goal: 'traffic',
        dailyBudget: 20,
      });

      updateCampaign.mockRejectedValue(new Error('provider down'));
      const updated = await service.update(
        businessId,
        created.id,
        { status: 'active' },
        Role.owner,
      );
      expect(updated.status).toBe('active');
    });

    it('applies the change locally only for a local-draft campaign (no externalId, no real call attempted)', async () => {
      const created = await service.create(businessId, 'tiktok_ads', {
        name: 'Local Draft',
        goal: 'awareness',
        dailyBudget: 5,
      });
      expect(created.externalId).toBeNull();

      const updated = await service.update(
        businessId,
        created.id,
        { status: 'active' },
        Role.owner,
      );
      expect(updated.status).toBe('active');
      expect(updateCampaign).not.toHaveBeenCalled();
    });

    it('rejects an unknown campaign id', async () => {
      await expect(
        service.update(
          businessId,
          'no-such-campaign',
          { status: 'paused' },
          Role.owner,
        ),
      ).rejects.toThrow();
    });
  });

  describe('update() requireApproval gate (depth fix)', () => {
    it('blocks a manager from activating a campaign when the business requires owner approval, but still lets them pause/budget-adjust', async () => {
      const cls = new FakeClsService();
      const tenantPrisma = new TenantPrismaService(
        prisma,
        cls as unknown as ClsService,
      );
      const gatedSettings = new AdSettingsService(tenantPrisma);
      const gatedService = new AdCampaignsService(
        tenantPrisma,
        { getTokens } as unknown as IntegrationsService,
        { get: () => ({}) } as unknown as ConnectorRegistry,
        gatedSettings,
      );
      const business = await prisma.business.create({
        data: {
          name: 'Approval Gate Test Biz',
          slug: `approval-gate-test-${Date.now()}`,
        },
      });
      cls.set(CLS_KEY_BUSINESS_ID, business.id);
      await gatedSettings.update(business.id, { requireApproval: true });

      const created = await gatedService.create(business.id, 'tiktok_ads', {
        name: 'Needs Approval',
        goal: 'traffic',
        dailyBudget: 10,
      });

      await expect(
        gatedService.update(
          business.id,
          created.id,
          { status: 'active' },
          Role.manager,
        ),
      ).rejects.toThrow();

      // A manager can still pause and adjust budget freely — only activation is gated.
      const paused = await gatedService.update(
        business.id,
        created.id,
        { status: 'paused', dailyBudget: 25 },
        Role.manager,
      );
      expect(paused.status).toBe('paused');
      expect(Number(paused.budget)).toBe(25);

      // The owner can activate it.
      const activated = await gatedService.update(
        business.id,
        created.id,
        { status: 'active' },
        Role.owner,
      );
      expect(activated.status).toBe('active');

      await prisma.adCampaign.deleteMany({
        where: { businessId: business.id },
      });
      await prisma.adSettings.deleteMany({
        where: { businessId: business.id },
      });
      await prisma.business.delete({ where: { id: business.id } });
    });

    it('lets a manager activate a campaign when requireApproval is off', async () => {
      const created = await service.create(businessId, 'tiktok_ads', {
        name: 'No Approval Needed',
        goal: 'traffic',
        dailyBudget: 10,
      });
      const activated = await service.update(
        businessId,
        created.id,
        { status: 'active' },
        Role.manager,
      );
      expect(activated.status).toBe('active');
    });
  });

  describe('getFatigueWarning() (fatigue-warning depth fix)', () => {
    async function makeSnapshot(
      campaignId: string,
      data: { impressions: number; clicks: number; capturedAt: Date },
    ) {
      return prisma.adCampaignStatsSnapshot.create({
        data: {
          businessId,
          campaignId,
          spend: 0,
          impressions: data.impressions,
          clicks: data.clicks,
          results: 0,
          capturedAt: data.capturedAt,
        },
      });
    }

    it('reports no fatigue (not a fabricated false) with fewer than 2 real snapshots', async () => {
      const created = await service.create(businessId, 'tiktok_ads', {
        name: 'Fatigue Test A',
        goal: 'traffic',
        dailyBudget: 10,
      });
      expect(await service.getFatigueWarning(created.id)).toEqual({
        fatigued: false,
        sampleSize: 0,
      });

      await makeSnapshot(created.id, {
        impressions: 1000,
        clicks: 50,
        capturedAt: new Date(),
      });
      expect(await service.getFatigueWarning(created.id)).toEqual({
        fatigued: false,
        sampleSize: 1,
      });
    });

    it('flags real fatigue when CTR has genuinely declined 25%+ since a snapshot at least a week old', async () => {
      const created = await service.create(businessId, 'tiktok_ads', {
        name: 'Fatigue Test B',
        goal: 'traffic',
        dailyBudget: 10,
      });
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
      // baseline CTR = 100/1000 = 10%; latest CTR = 50/1000 = 5% -> 50% decline
      await makeSnapshot(created.id, {
        impressions: 1000,
        clicks: 100,
        capturedAt: weekAgo,
      });
      await makeSnapshot(created.id, {
        impressions: 1000,
        clicks: 50,
        capturedAt: now,
      });

      const result = await service.getFatigueWarning(created.id);
      expect(result.fatigued).toBe(true);
      expect(result.ctrDeclinePercent).toBe(50);
      expect(result.sampleSize).toBe(2);
    });

    it('does not flag fatigue when CTR is stable or improving', async () => {
      const created = await service.create(businessId, 'tiktok_ads', {
        name: 'Fatigue Test C',
        goal: 'traffic',
        dailyBudget: 10,
      });
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
      await makeSnapshot(created.id, {
        impressions: 1000,
        clicks: 50,
        capturedAt: weekAgo,
      });
      await makeSnapshot(created.id, {
        impressions: 1000,
        clicks: 60,
        capturedAt: now,
      });

      const result = await service.getFatigueWarning(created.id);
      expect(result.fatigued).toBe(false);
    });

    it('rejects an unknown campaign id', async () => {
      await expect(
        service.getFatigueWarning('no-such-campaign'),
      ).rejects.toThrow();
    });
  });
});
