import { ClsService } from 'nestjs-cls';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { VoiceOutboundSummaryService } from './voice-outbound-summary.service';

class FakeClsService {
  private readonly store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('VoiceOutboundSummaryService (real MySQL)', () => {
  let prisma: PrismaService;
  let service: VoiceOutboundSummaryService;
  let businessId: string;
  let userId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    service = new VoiceOutboundSummaryService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
    );
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    businessId = (
      await prisma.business.create({
        data: { name: 'Summary Test', slug: `voice-summary-${suffix}` },
      })
    ).id;
    userId = (
      await prisma.user.create({
        data: {
          email: `voice-summary-${suffix}@example.com`,
          passwordHash: 'x',
          name: 'Agent',
        },
      })
    ).id;
    const staff = await prisma.businessUser.create({
      data: { businessId, userId, role: Role.staff },
    });
    const profile = await prisma.voiceHumanAgentProfile.create({
      data: { businessId, staffUserId: staff.id, active: true },
    });
    const customer = await prisma.customer.create({
      data: { businessId, name: 'Summary Contact', phone: '+14155550191' },
    });
    const campaign = await prisma.voiceOutboundCampaign.create({
      data: {
        businessId,
        name: 'Summary campaign',
        purpose: 'callback',
        callerType: 'live_agent',
        countryCode: 'US',
        timeZone: 'UTC',
        openingScript: 'Calling back.',
        createdByUserId: userId,
      },
    });
    const member = await prisma.voiceOutboundCampaignMember.create({
      data: { businessId, campaignId: campaign.id, customerId: customer.id },
    });
    const base = {
      businessId,
      campaignId: campaign.id,
      memberId: member.id,
      agentProfileId: profile.id,
      createdByUserId: userId,
    };
    await prisma.voiceOutboundDialAttempt.createMany({
      data: [
        { ...base, status: 'answered', customerDialed: true, durationSec: 40 },
        { ...base, status: 'blocked', blockReasonCode: 'suppressed' },
        { ...base, status: 'no_answer', customerDialed: true },
        {
          ...base,
          status: 'answered',
          customerDialed: true,
          durationSec: 99,
          createdAt: new Date(Date.now() - 3 * 86_400_000),
        },
      ],
    });
    const call = await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA-sum-${suffix}`,
        fromNumber: '+14155550192',
        status: 'missed',
        transcript: [],
      },
    });
    const callback = await prisma.voiceCallback.create({
      data: { businessId, phoneCallId: call.id, phoneE164: '+14155550192' },
    });
    await prisma.voiceCallbackAttempt.create({
      data: {
        businessId,
        callbackId: callback.id,
        agentProfileId: profile.id,
        status: 'answered',
        customerDialed: true,
        durationSec: 20,
        placedByUserId: userId,
      },
    });
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.user.delete({ where: { id: userId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('counts dialer and call-back attempts since the given instant only', async () => {
    const summary = await service.since(
      businessId,
      new Date(Date.now() - 86_400_000).toISOString(),
    );
    expect(summary.powerDialer).toEqual({
      attempts: 3,
      blocked: 1,
      customerDialed: 2,
      connected: 1,
      talkSeconds: 40,
    });
    expect(summary.callbacks).toEqual({
      attempts: 1,
      blocked: 0,
      customerDialed: 1,
      connected: 1,
      talkSeconds: 20,
    });
  });
});
