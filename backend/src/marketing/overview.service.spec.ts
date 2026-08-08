import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { MarketingOverviewService } from './overview.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('MarketingOverviewService (BE-089)', () => {
  let prisma: PrismaService;
  let service: MarketingOverviewService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(prisma, cls as unknown as ClsService);
    service = new MarketingOverviewService(tenantPrisma);

    const business = await prisma.business.create({
      data: { name: 'Overview Test Biz', slug: `overview-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    await prisma.campaign.create({
      data: { businessId, segment: 'all', templateKey: 'campaign', body: 'hi', sentCount: 10 },
    });
    await prisma.emailCampaign.create({
      data: { businessId, subject: 'x', body: 'x', segment: 'all', sentCount: 5 },
    });
    await prisma.adCampaign.create({
      data: {
        businessId,
        provider: 'google_ads',
        goal: 'traffic',
        budget: 100,
        stats: { results: 20 },
      },
    });
  });

  afterAll(async () => {
    await prisma.adCampaign.deleteMany({ where: { businessId } });
    await prisma.emailCampaign.deleteMany({ where: { businessId } });
    await prisma.campaign.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('aggregates real spend/results per channel, including zero-data channels', async () => {
    const rows = await service.overview(businessId);
    const byChannel = new Map(rows.map((r) => [r.channel, r]));

    expect(byChannel.get('WhatsApp')).toEqual({ channel: 'WhatsApp', spend: 0, results: 10, costPerResult: 0 });
    expect(byChannel.get('Email')).toEqual({ channel: 'Email', spend: 0, results: 5, costPerResult: 0 });
    expect(byChannel.get('Google Ads')).toEqual({
      channel: 'Google Ads',
      spend: 100,
      results: 20,
      costPerResult: 5,
    });
    expect(byChannel.get('Meta Ads')).toEqual({ channel: 'Meta Ads', spend: 0, results: 0, costPerResult: null });
    expect(byChannel.get('TikTok Ads')).toEqual({ channel: 'TikTok Ads', spend: 0, results: 0, costPerResult: null });
  });
});
