import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { MarketingOverviewService } from './overview.service';
import type { AiInfraService } from '../ai/ai-infra.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('MarketingOverviewService (BE-089, extended UPD-BE-105a)', () => {
  let prisma: PrismaService;
  let service: MarketingOverviewService;
  let businessId: string;
  const aiInfra = {
    complete: jest.fn().mockResolvedValue('Shift budget toward WhatsApp.'),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new MarketingOverviewService(
      tenantPrisma,
      aiInfra as unknown as AiInfraService,
      cls as unknown as ClsService,
    );

    const business = await prisma.business.create({
      data: { name: 'Overview Test Biz', slug: `overview-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const whatsappCampaign = await prisma.campaign.create({
      data: {
        businessId,
        segment: 'all',
        templateKey: 'campaign',
        body: 'hi',
        sentCount: 10,
      },
    });
    await prisma.message.createMany({
      data: [
        {
          businessId,
          campaignId: whatsappCampaign.id,
          channel: 'whatsapp',
          category: 'marketing',
          templateKey: 'campaign',
          status: 'delivered',
        },
        {
          businessId,
          campaignId: whatsappCampaign.id,
          channel: 'whatsapp',
          category: 'marketing',
          templateKey: 'campaign',
          status: 'read',
        },
        {
          businessId,
          campaignId: whatsappCampaign.id,
          channel: 'whatsapp',
          category: 'marketing',
          templateKey: 'campaign',
          status: 'queued',
        },
      ],
    });

    const emailCampaign = await prisma.emailCampaign.create({
      data: {
        businessId,
        subject: 'x',
        body: 'x',
        segment: 'all',
        sentCount: 5,
      },
    });
    await prisma.emailEvent.createMany({
      data: [
        {
          emailCampaignId: emailCampaign.id,
          recipient: 'a@x.com',
          type: 'delivered',
        },
        {
          emailCampaignId: emailCampaign.id,
          recipient: 'a@x.com',
          type: 'open',
        },
      ],
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

    const coupon = await prisma.coupon.create({
      data: {
        businessId,
        code: `OVERVIEW-${Date.now()}`,
        type: 'fixed',
        value: 5,
      },
    });
    await prisma.order.create({
      data: {
        businessId,
        orderNo: 1,
        status: 'completed',
        subtotal: 50,
        total: 45,
        couponId: coupon.id,
        couponDiscountAmount: 5,
      },
    });
    await prisma.order.create({
      data: {
        businessId,
        orderNo: 2,
        status: 'completed',
        subtotal: 30,
        total: 30,
      },
    });
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.coupon.deleteMany({ where: { businessId } });
    await prisma.emailEvent.deleteMany({
      where: { emailCampaign: { businessId } },
    });
    await prisma.emailCampaign.deleteMany({ where: { businessId } });
    await prisma.message.deleteMany({ where: { businessId } });
    await prisma.campaign.deleteMany({ where: { businessId } });
    await prisma.adCampaign.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('aggregates real spend/results/delivered per channel, including zero-data channels', async () => {
    const result = await service.overview();
    const byChannel = new Map(result.channels.map((r) => [r.channel, r]));

    expect(byChannel.get('WhatsApp')).toEqual({
      channel: 'WhatsApp',
      spend: 0,
      results: 10,
      delivered: 2, // 1 delivered + 1 read; the queued one doesn't count
      costPerResult: 0,
    });
    expect(byChannel.get('Email')).toEqual({
      channel: 'Email',
      spend: 0,
      results: 5,
      delivered: 1,
      costPerResult: 0,
    });
    expect(byChannel.get('Google Ads')).toEqual({
      channel: 'Google Ads',
      spend: 100,
      results: 20,
      delivered: null,
      costPerResult: 5,
    });
    expect(byChannel.get('Meta Ads')).toEqual({
      channel: 'Meta Ads',
      spend: 0,
      results: 0,
      delivered: null,
      costPerResult: null,
    });
  });

  it('rolls up real totals: blended CPR across all channels, and coupon/voucher-attributed redemptions/revenue', async () => {
    const result = await service.overview();

    expect(result.totals.spend).toBe(100);
    expect(result.totals.results).toBe(35); // 10 + 5 + 20
    expect(result.totals.delivered).toBe(3); // 2 whatsapp + 1 email
    expect(result.totals.blendedCostPerResult).toBe(
      Math.round((100 / 35) * 100) / 100,
    );
    expect(result.totals.redemptions).toBe(1); // only the coupon-attributed order
    expect(result.totals.revenue).toBe(45); // that order's total
  });

  it('suggests a real AI reallocation grounded in the real channel numbers', async () => {
    const result = await service.suggestReallocation();

    expect(result.suggestion).toBe('Shift budget toward WhatsApp.');
    expect(aiInfra.complete).toHaveBeenCalledWith(
      businessId,
      expect.stringContaining('"Google Ads"'),
      0.5,
      'marketing_reallocation',
    );
  });

  it('falls back to an honest message when the AI call fails, never fabricating a suggestion', async () => {
    aiInfra.complete.mockRejectedValueOnce(new Error('AI down'));
    const result = await service.suggestReallocation();
    expect(result.suggestion).toMatch(/not available|aren't available/i);
  });
});
