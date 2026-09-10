import { PrismaService } from '../../prisma/prisma.service';
import { IntegrationsService } from '../../integrations/integrations.service';
import { ConnectorRegistry } from '../../integrations/connector-registry';
import { AdStatsSyncProcessor } from './ad-stats-sync.processor';
import { IntegrationProvider, IntegrationStatus } from '@prisma/client';

describe('AdStatsSyncProcessor (fatigue-warning depth fix, real stats history)', () => {
  let prisma: PrismaService;
  let processor: AdStatsSyncProcessor;
  const getTokens = jest.fn();
  const fetchCampaignStats = jest.fn();
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    processor = new AdStatsSyncProcessor(
      prisma,
      { getTokens } as unknown as IntegrationsService,
      {
        get: (provider: IntegrationProvider) =>
          provider === IntegrationProvider.meta_ads
            ? { fetchCampaignStats }
            : {}, // tiktok_ads-shaped connector with NO fetchCampaignStats — the "unsupported provider" branch
      } as unknown as ConnectorRegistry,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Ad Stats Sync Test Biz',
        slug: `ad-stats-sync-${Date.now()}`,
      },
    });
    businessId = business.id;
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await prisma.adCampaignStatsSnapshot.deleteMany({ where: { businessId } });
    await prisma.adCampaign.deleteMany({ where: { businessId } });
    await prisma.integration.deleteMany({ where: { businessId } });
  });

  afterAll(async () => {
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  async function makeCampaign(
    provider: IntegrationProvider,
    externalId: string | null,
    status = 'active',
  ) {
    return prisma.adCampaign.create({
      data: {
        businessId,
        provider,
        goal: 'traffic',
        budget: 10,
        status,
        externalId,
      },
    });
  }

  it('refreshes real stats and appends a real snapshot for a connected campaign', async () => {
    await prisma.integration.create({
      data: {
        businessId,
        provider: IntegrationProvider.meta_ads,
        status: IntegrationStatus.connected,
      },
    });
    getTokens.mockResolvedValue({ accessToken: 'tok' });
    fetchCampaignStats.mockResolvedValue({
      spend: 12.5,
      impressions: 500,
      clicks: 20,
      results: 3,
    });
    const campaign = await makeCampaign(IntegrationProvider.meta_ads, 'camp_1');

    await processor.run();

    const updated = await prisma.adCampaign.findUniqueOrThrow({
      where: { id: campaign.id },
    });
    expect(updated.stats).toEqual({
      spend: 12.5,
      impressions: 500,
      clicks: 20,
      results: 3,
    });

    const snapshots = await prisma.adCampaignStatsSnapshot.findMany({
      where: { campaignId: campaign.id },
    });
    expect(snapshots).toHaveLength(1);
    expect(Number(snapshots[0].spend)).toBe(12.5);
    expect(snapshots[0].results).toBe(3);
  });

  it('skips a campaign whose connector has no fetchCampaignStats (e.g. Microsoft/Amazon)', async () => {
    await prisma.integration.create({
      data: {
        businessId,
        provider: IntegrationProvider.tiktok_ads,
        status: IntegrationStatus.connected,
      },
    });
    const campaign = await makeCampaign(
      IntegrationProvider.tiktok_ads,
      'camp_2',
    );

    await processor.run();

    expect(fetchCampaignStats).not.toHaveBeenCalled();
    const snapshots = await prisma.adCampaignStatsSnapshot.findMany({
      where: { campaignId: campaign.id },
    });
    expect(snapshots).toHaveLength(0);
  });

  it('skips a campaign whose integration is not connected', async () => {
    const campaign = await makeCampaign(IntegrationProvider.meta_ads, 'camp_3');

    await processor.run();

    expect(fetchCampaignStats).not.toHaveBeenCalled();
    const snapshots = await prisma.adCampaignStatsSnapshot.findMany({
      where: { campaignId: campaign.id },
    });
    expect(snapshots).toHaveLength(0);
  });

  it('skips a local-draft campaign with no externalId', async () => {
    await prisma.integration.create({
      data: {
        businessId,
        provider: IntegrationProvider.meta_ads,
        status: IntegrationStatus.connected,
      },
    });
    await makeCampaign(IntegrationProvider.meta_ads, null, 'draft');

    await processor.run();

    expect(fetchCampaignStats).not.toHaveBeenCalled();
  });

  it('logs and skips, never crashing the whole run, when the real provider call throws', async () => {
    await prisma.integration.create({
      data: {
        businessId,
        provider: IntegrationProvider.meta_ads,
        status: IntegrationStatus.connected,
      },
    });
    getTokens.mockResolvedValue({ accessToken: 'tok' });
    fetchCampaignStats.mockRejectedValue(new Error('rate limited'));
    const campaign = await makeCampaign(IntegrationProvider.meta_ads, 'camp_5');

    await expect(processor.run()).resolves.toBeUndefined();

    const snapshots = await prisma.adCampaignStatsSnapshot.findMany({
      where: { campaignId: campaign.id },
    });
    expect(snapshots).toHaveLength(0);
  });
});
