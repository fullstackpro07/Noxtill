import { PrismaService } from '../../prisma/prisma.service';
import { AdCampaignsService } from '../ad-campaigns.service';
import { AdAutoPauseProcessor } from './ad-auto-pause.processor';
import { IntegrationProvider, Prisma, Role } from '@prisma/client';

describe('AdAutoPauseProcessor (UPD-BE-131, real auto-pause enforcement)', () => {
  let prisma: PrismaService;
  let processor: AdAutoPauseProcessor;
  const update = jest.fn();
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    processor = new AdAutoPauseProcessor(prisma, {
      update,
    } as unknown as AdCampaignsService);

    const business = await prisma.business.create({
      data: {
        name: 'Ad Auto Pause Test Biz',
        slug: `ad-auto-pause-${Date.now()}`,
      },
    });
    businessId = business.id;
  });

  afterEach(async () => {
    jest.clearAllMocks();
    // The mocked `update()` never actually flips a campaign's real status, so leftover active
    // rows from one test would otherwise be re-evaluated (and could re-trigger `update`) by the
    // next test's `processor.run()` — each test gets a clean slate.
    await prisma.adCampaign.deleteMany({ where: { businessId } });
  });

  afterAll(async () => {
    await prisma.adCampaign.deleteMany({ where: { businessId } });
    await prisma.adSettings.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  async function makeCampaign(status: string, stats: Record<string, unknown>) {
    return prisma.adCampaign.create({
      data: {
        businessId,
        provider: IntegrationProvider.meta_ads,
        goal: 'traffic',
        budget: 10,
        status,
        stats: stats as unknown as Prisma.InputJsonValue,
      },
    });
  }

  it('pauses a real active campaign whose real cost-per-result exceeds the configured threshold', async () => {
    await prisma.adSettings.upsert({
      where: { businessId },
      create: { businessId, autoPauseCostPerResult: 5 },
      update: { autoPauseCostPerResult: 5 },
    });
    const campaign = await makeCampaign('active', { spend: 100, results: 10 }); // cost-per-result = 10 > 5

    await processor.run();

    expect(update).toHaveBeenCalledWith(
      businessId,
      campaign.id,
      { status: 'paused' },
      Role.owner,
    );
  });

  it('does not pause a campaign whose real cost-per-result is within the threshold', async () => {
    await prisma.adSettings.upsert({
      where: { businessId },
      create: { businessId, autoPauseCostPerResult: 5 },
      update: { autoPauseCostPerResult: 5 },
    });
    await makeCampaign('active', { spend: 20, results: 10 }); // cost-per-result = 2 <= 5

    await processor.run();

    expect(update).not.toHaveBeenCalled();
  });

  it('never fabricates a cost-per-result for a campaign with zero real results', async () => {
    await prisma.adSettings.upsert({
      where: { businessId },
      create: { businessId, autoPauseCostPerResult: 1 },
      update: { autoPauseCostPerResult: 1 },
    });
    await makeCampaign('active', { spend: 500, results: 0 });

    await processor.run();

    expect(update).not.toHaveBeenCalled();
  });

  it('ignores a business with no auto-pause threshold configured', async () => {
    await prisma.adSettings.upsert({
      where: { businessId },
      create: { businessId, autoPauseCostPerResult: null },
      update: { autoPauseCostPerResult: null },
    });
    await makeCampaign('active', { spend: 1000, results: 1 }); // would exceed any real threshold

    await processor.run();

    expect(update).not.toHaveBeenCalled();
  });

  it('ignores a non-active campaign even with a real over-threshold cost-per-result', async () => {
    await prisma.adSettings.upsert({
      where: { businessId },
      create: { businessId, autoPauseCostPerResult: 5 },
      update: { autoPauseCostPerResult: 5 },
    });
    await makeCampaign('paused', { spend: 100, results: 1 });

    await processor.run();

    expect(update).not.toHaveBeenCalled();
  });
});
