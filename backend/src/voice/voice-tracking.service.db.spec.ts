import { ClsService } from 'nestjs-cls';
import { randomUUID } from 'crypto';
import { PhoneCallStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { VoiceTrackingService } from './voice-tracking.service';

class FakeClsService {
  private readonly values: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.values[key] as T;
  }
  set(key: string, value: unknown) {
    this.values[key] = value;
  }
}

describe('VoiceTrackingService (MySQL)', () => {
  let prisma: PrismaService;
  let service: VoiceTrackingService;
  let businessId: string;
  let otherBusinessId: string;
  let appointmentId: string;
  let productId: string;
  let customerId: string;
  let callId: string;
  let campaignId: string;
  let otherCampaignId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    const [business, otherBusiness] = await Promise.all([
      prisma.business.create({
        data: { name: 'Tracking QA', slug: `voice-tracking-${randomUUID()}` },
      }),
      prisma.business.create({
        data: {
          name: 'Other Tracking QA',
          slug: `voice-tracking-other-${randomUUID()}`,
        },
      }),
    ]);
    businessId = business.id;
    otherBusinessId = otherBusiness.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    service = new VoiceTrackingService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
    );

    const customer = await prisma.customer.create({
      data: { businessId, name: 'Tracking Customer', phone: '+15550004001' },
    });
    customerId = customer.id;
    const serviceProduct = await prisma.product.create({
      data: { businessId, name: 'Tracked service', kind: 'service' },
    });
    productId = serviceProduct.id;
    const appointment = await prisma.appointment.create({
      data: {
        businessId,
        serviceId: productId,
        customerId,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 30 * 60 * 1000),
        status: 'completed',
        source: 'phone',
      },
    });
    appointmentId = appointment.id;
    await prisma.phoneNumber.create({
      data: {
        businessId,
        twilioSid: `PN${randomUUID().replace(/-/g, '').slice(0, 32)}`,
        phoneNumber: `+1555${String(Date.now()).slice(-7)}`,
      },
    });
    const [campaign, otherCampaign] = await Promise.all([
      prisma.adCampaign.create({
        data: {
          businessId,
          provider: 'google_ads',
          goal: 'QA source campaign',
          budget: new Prisma.Decimal('25.00'),
        },
      }),
      prisma.adCampaign.create({
        data: {
          businessId: otherBusinessId,
          provider: 'meta_ads',
          goal: 'Other tenant campaign',
          budget: new Prisma.Decimal('25.00'),
        },
      }),
    ]);
    campaignId = campaign.id;
    otherCampaignId = otherCampaign.id;
    callId = randomUUID();
    await prisma.phoneCall.createMany({
      data: [
        {
          id: callId,
          businessId,
          callSid: `CA-tracking-booked-${randomUUID()}`,
          fromNumber: '+15551234567',
          status: PhoneCallStatus.completed,
          appointmentId,
          providerCost: new Prisma.Decimal('0.03'),
          providerCostUnit: 'USD',
          providerCostCheckedAt: new Date(),
          startedAt: new Date(),
        },
        {
          businessId,
          callSid: `CA-tracking-unlinked-${randomUUID()}`,
          fromNumber: '+15557654321',
          status: PhoneCallStatus.missed,
          startedAt: new Date(),
        },
        {
          businessId: otherBusinessId,
          callSid: `CA-tracking-other-${randomUUID()}`,
          fromNumber: '+15550000009',
          status: PhoneCallStatus.completed,
          startedAt: new Date(),
        },
        {
          businessId,
          callSid: `CA-tracking-old-${randomUUID()}`,
          fromNumber: '+15550000008',
          status: PhoneCallStatus.completed,
          startedAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
        },
      ],
    });
  });

  afterAll(async () => {
    if (businessId) {
      await prisma.auditLog.deleteMany({ where: { businessId } });
      await prisma.phoneCall.deleteMany({ where: { businessId } });
      await prisma.adCampaign.deleteMany({ where: { businessId } });
      await prisma.appointment.deleteMany({ where: { businessId } });
      await prisma.phoneNumber.deleteMany({ where: { businessId } });
      await prisma.product.deleteMany({ where: { businessId } });
      await prisma.customer.deleteMany({ where: { businessId } });
    }
    if (otherBusinessId) {
      await prisma.phoneCall.deleteMany({
        where: { businessId: otherBusinessId },
      });
      await prisma.adCampaign.deleteMany({
        where: { businessId: otherBusinessId },
      });
      await prisma.business.delete({ where: { id: otherBusinessId } });
    }
    if (businessId) await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('uses only real tenant call and booking records and never infers marketing attribution', async () => {
    const result = await service.overview(businessId, '30');

    expect(result.windowDays).toBe(30);
    expect(result.line).toMatchObject({
      provider: 'Twilio',
      scope: 'Shared business voice line; not campaign-specific',
    });
    expect(result.metrics).toMatchObject({
      inboundCalls: 2,
      callLinkedBookings: 1,
      completedCallBookings: 1,
      manualAttributedCalls: 0,
      leads: null,
      qualifiedConversions: null,
      unknownSourceRate: 1,
      campaignRevenue: null,
      providerCharges: [{ unit: 'USD', amount: '0.03', checkedCallCount: 1 }],
    });
    expect(
      result.calls.find((call) => call.caller === '•••• 4567'),
    ).toMatchObject({
      marketingAttribution: null,
      booking: { status: 'completed', source: 'phone' },
    });
    expect(
      result.calls.find((call) => call.caller === '•••• 4321'),
    ).toMatchObject({
      booking: null,
    });
    expect(result.calls).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ caller: '•••• 0009' }),
        expect.objectContaining({ caller: '•••• 0008' }),
      ]),
    );
    expect(result.limitations.marketingAttribution).toContain('not configured');
    expect(result.limitations.campaignRevenue).toContain('not available');
    const unknown = result.sources.find((row) => row.source === 'Unknown');
    expect(unknown).toMatchObject({
      calls: 2,
      bookings: 1,
      completedBookings: 1,
      viaTrackingNumber: 0,
    });
  });

  it('stores manual source evidence, validates tenant campaigns and audits before/after', async () => {
    await expect(
      service.overrideAttribution(businessId, 'tracking-qa-user', callId, {
        source: 'Google Ads',
        channel: 'Paid search',
        campaignId: otherCampaignId,
        evidence: 'Caller confirmed the campaign landing page URL.',
        reason: 'Corrected from the caller statement.',
      }),
    ).rejects.toMatchObject({
      status: 404,
      response: {
        code: 'VOICE_ATTRIBUTION_CAMPAIGN_NOT_FOUND',
      },
    });

    const corrected = await service.overrideAttribution(
      businessId,
      'tracking-qa-user',
      callId,
      {
        source: 'Google Ads',
        channel: 'Paid search',
        campaignId,
        evidence: 'Caller confirmed the campaign landing page URL.',
        reason: 'Corrected from the caller statement.',
      },
    );
    expect(corrected.attribution).toMatchObject({
      source: 'Google Ads',
      channel: 'Paid search',
      campaignId,
      confidence: 'merchant-entered evidence; not provider-verified',
    });

    const audit = await prisma.auditLog.findFirst({
      where: {
        businessId,
        entity: 'PhoneCall',
        entityId: callId,
        action: 'voice.tracking.attribution_corrected',
      },
    });
    expect(audit?.actorUserId).toBe('tracking-qa-user');
    expect(audit?.before).toMatchObject({ source: null, campaignId: null });
    expect(audit?.after).toMatchObject({
      source: 'Google Ads',
      campaignId,
      reason: 'Corrected from the caller statement.',
    });

    const overview = await service.overview(businessId, '30');
    expect(overview.metrics.manualAttributedCalls).toBe(1);
    expect(overview.calls.find((call) => call.id === callId)).toMatchObject({
      marketingAttribution: {
        source: 'Google Ads',
        channel: 'Paid search',
        campaignLabel: 'google_ads · QA source campaign',
        confidence: 'Merchant-entered evidence; not provider-verified',
      },
    });
    expect(overview.campaignOptions).toEqual([
      expect.objectContaining({ id: campaignId, goal: 'QA source campaign' }),
    ]);
  });
});
