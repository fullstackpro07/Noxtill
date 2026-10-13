import axios from 'axios';
import { ClsService } from 'nestjs-cls';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_USER_ID,
} from '../common/tenancy/tenant.constants';
import { VoiceComplianceService } from './voice-compliance.service';
import { VoiceOutboundCampaignService } from './voice-outbound-campaign.service';
import { VoiceOutboundDialerService } from './voice-outbound-dialer.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

class FakeClsService {
  private readonly store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

const AGENT_PHONE = '+14155550190';

describe('VoiceOutboundDialerService (real MySQL)', () => {
  let prisma: PrismaService;
  let campaigns: VoiceOutboundCampaignService;
  let dialer: VoiceOutboundDialerService;
  let cls: FakeClsService;
  let businessId: string;
  let userId: string;
  let otherUserId: string;
  let profileId: string;
  let otherProfileId: string;
  let customerIds: string[];
  const config: Record<string, string | undefined> = {
    TWILIO_ACCOUNT_SID: 'AC_test',
    TWILIO_AUTH_TOKEN: 'token',
    BACKEND_URL: 'https://api.example.com/api/v1',
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    const tenant = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const audit = new AuditService(tenant, cls as unknown as ClsService);
    const compliance = new VoiceComplianceService(tenant, audit);
    campaigns = new VoiceOutboundCampaignService(tenant, compliance, audit);
    dialer = new VoiceOutboundDialerService(
      tenant,
      prisma,
      campaigns,
      compliance,
      audit,
      { get: (key: string) => config[key] } as unknown as ConfigService,
    );

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const business = await prisma.business.create({
      data: { name: 'Voice Dialer Test', slug: `voice-dialer-${suffix}` },
    });
    businessId = business.id;
    await prisma.phoneNumber.create({
      data: {
        businessId,
        twilioSid: `PN${suffix}`,
        phoneNumber: `+1415555${String(Date.now()).slice(-4)}`,
      },
    });
    const user = await prisma.user.create({
      data: {
        email: `voice-dialer-${suffix}@example.com`,
        passwordHash: 'x',
        name: 'Dialer Agent',
        phone: AGENT_PHONE,
      },
    });
    userId = user.id;
    const staff = await prisma.businessUser.create({
      data: { businessId, userId, role: Role.staff },
    });
    profileId = (
      await prisma.voiceHumanAgentProfile.create({
        data: { businessId, staffUserId: staff.id, active: true },
      })
    ).id;
    const otherUser = await prisma.user.create({
      data: {
        email: `voice-dialer-other-${suffix}@example.com`,
        passwordHash: 'x',
        name: 'Unassigned Agent',
        phone: '+14155550191',
      },
    });
    otherUserId = otherUser.id;
    const otherStaff = await prisma.businessUser.create({
      data: { businessId, userId: otherUserId, role: Role.staff },
    });
    otherProfileId = (
      await prisma.voiceHumanAgentProfile.create({
        data: { businessId, staffUserId: otherStaff.id, active: true },
      })
    ).id;

    const pack = await prisma.voiceCompliancePolicyPack.create({
      data: {
        businessId,
        countryCode: 'US',
        purpose: 'callback',
        callerType: 'live_agent',
      },
    });
    await prisma.voiceCompliancePolicyVersion.create({
      data: {
        businessId,
        packId: pack.id,
        version: 1,
        aiDisclosureText: 'Live agent callback.',
        status: 'published',
        publishedAt: new Date(),
      },
    });
    const phones = ['+14155550131', '+14155550132', '+14155550133'];
    customerIds = [];
    for (const [index, phone] of phones.entries()) {
      const customer = await prisma.customer.create({
        data: { businessId, name: `Dialer Contact ${index + 1}`, phone },
      });
      customerIds.push(customer.id);
      await prisma.voiceConsentEvidence.create({
        data: {
          businessId,
          customerId: customer.id,
          phoneE164: phone,
          purpose: 'callback',
          source: 'web_form',
          noticeText: 'You may call me back about my request.',
          evidenceReference: `form-${index}`,
          legalBasis: 'requested_callback',
          grantedAt: new Date(Date.now() - 60_000),
          verifiedAt: new Date(),
          verifiedByUserId: userId,
        },
      });
    }
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, userId);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
        if (businessId) await tx.business.delete({ where: { id: businessId } });
        if (userId) await tx.user.delete({ where: { id: userId } });
        if (otherUserId) await tx.user.delete({ where: { id: otherUserId } });
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
      });
      await prisma.$disconnect();
    }
  });

  beforeEach(() => {
    mockedAxios.post.mockReset();
    let sid = 0;
    mockedAxios.post.mockImplementation(() =>
      Promise.resolve({ data: { sid: `CA${Date.now()}${(sid += 1)}` } }),
    );
  });

  async function expectAppError(promise: Promise<unknown>, code: string) {
    let caught: unknown;
    try {
      await promise;
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppException);
    expect((caught as AppException).getResponse()).toMatchObject({ code });
  }

  async function setAvailable(available: boolean) {
    await prisma.voiceHumanAgentProfile.update({
      where: { id: profileId },
      data: {
        presenceStatus: available ? 'available' : 'offline',
        lastHeartbeatAt: new Date(),
      },
    });
  }

  async function runningCampaign(ids: string[], maxAttempts = 2) {
    const campaign = await campaigns.create(businessId, userId, {
      name: 'Dialer QA callbacks',
      purpose: 'callback',
      callerType: 'live_agent',
      countryCode: 'US',
      timeZone: 'America/Los_Angeles',
      openingScript: 'Calling back about your request.',
      humanAgentProfileId: profileId,
      maxAttemptsPerContact: maxAttempts,
      retryCooldownHours: 0,
      customerIds: ids,
    });
    await expectAppError(
      dialer.start(businessId, userId, campaign.id),
      'VOICE_OUTBOUND_CAMPAIGN_PREVIEW_REQUIRED',
    );
    const preview = await campaigns.eligibilityPreview(
      businessId,
      userId,
      campaign.id,
    );
    expect(preview.eligibleCount).toBe(ids.length);
    await dialer.start(businessId, userId, campaign.id);
    return campaign.id;
  }

  it('refuses AI campaigns and non-assigned agents, and never dials an unavailable agent', async () => {
    const ai = await prisma.voiceOutboundCampaign.create({
      data: {
        businessId,
        name: 'AI campaign',
        purpose: 'callback',
        callerType: 'ai_voice',
        countryCode: 'US',
        timeZone: 'UTC',
        openingScript: 'x',
        createdByUserId: userId,
        eligibilityCheckedAt: new Date(),
      },
    });
    await expectAppError(
      dialer.start(businessId, userId, ai.id),
      'VOICE_OUTBOUND_AI_NOT_AVAILABLE',
    );

    const campaignId = await runningCampaign([customerIds[0]]);
    await expectAppError(
      dialer.next(businessId, otherUserId, campaignId),
      'VOICE_DIALER_NOT_ASSIGNED',
    );
    await setAvailable(false);
    const next = await dialer.next(businessId, userId, campaignId);
    expect(next.agentAvailable).toBe(false);
    await expectAppError(
      dialer.attempt(businessId, userId, campaignId, next.contact!.memberId),
      'VOICE_DIALER_AGENT_UNAVAILABLE',
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).not.toHaveBeenCalled();
    expect(otherProfileId).toBeTruthy();
  });

  it('blocks a contact suppressed after the preview without ever calling the provider', async () => {
    await setAvailable(true);
    const campaignId = await runningCampaign([customerIds[1]]);
    await prisma.voiceSuppressionEntry.create({
      data: {
        businessId,
        phoneE164: '+14155550132',
        source: 'customer_request',
        reason: 'Asked not to be called',
        effectiveAt: new Date(Date.now() - 1000),
      },
    });
    const next = await dialer.next(businessId, userId, campaignId);
    const result = await dialer.attempt(
      businessId,
      userId,
      campaignId,
      next.contact!.memberId,
    );
    expect(result).toMatchObject({
      placed: false,
      status: 'blocked',
      reasonCode: 'suppressed',
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).not.toHaveBeenCalled();
    const member = await prisma.voiceOutboundCampaignMember.findUniqueOrThrow({
      where: { id: next.contact!.memberId },
    });
    expect(member.status).toBe('opted_out');
    expect(member.attemptCount).toBe(0);
  });

  it('rings the agent first, dials the customer only on answer, retries, and records a do-not-call outcome', async () => {
    await setAvailable(true);
    const campaignId = await runningCampaign([customerIds[2]], 2);
    const next = await dialer.next(businessId, userId, campaignId);
    const memberId = next.contact!.memberId;

    const first = await dialer.attempt(
      businessId,
      userId,
      campaignId,
      memberId,
    );
    expect(first).toMatchObject({ placed: true, status: 'agent_ringing' });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);

    const body = mockedAxios.post.mock.calls[0][1] as URLSearchParams;
    expect(body.get('To')).toBe(AGENT_PHONE);
    expect(body.get('Url')).toBe(
      `https://api.example.com/api/v1/voice/webhook/outbound/agent-answered?attemptId=${first.attemptId}`,
    );
    // Second click while the first leg is live: no second provider call.
    await expectAppError(
      dialer.attempt(businessId, userId, campaignId, memberId),
      'VOICE_DIALER_AGENT_UNAVAILABLE',
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);

    const xml = await dialer.agentAnsweredTwiml(first.attemptId);
    expect(xml).toContain('<Number>+14155550133</Number>');
    expect(xml).toContain('outbound/customer-result');
    await dialer.customerResult(first.attemptId, 'no-answer');
    let member = await prisma.voiceOutboundCampaignMember.findUniqueOrThrow({
      where: { id: memberId },
    });
    expect(member).toMatchObject({ status: 'retry', attemptCount: 1 });
    await expectAppError(
      dialer.disposition(businessId, userId, first.attemptId, {
        disposition: 'completed',
      }),
      'VOICE_OUTBOUND_CAMPAIGN_STATE',
    );

    const second = await dialer.attempt(
      businessId,
      userId,
      campaignId,
      memberId,
    );
    expect(second.placed).toBe(true);
    await dialer.agentAnsweredTwiml(second.attemptId);
    await dialer.customerResult(second.attemptId, 'completed', 42);
    const answered = await prisma.voiceOutboundDialAttempt.findUniqueOrThrow({
      where: { id: second.attemptId },
    });
    expect(answered).toMatchObject({
      status: 'answered',
      durationSec: 42,
      customerDialed: true,
    });

    expect(
      (await dialer.next(businessId, userId, campaignId)).awaitingDisposition,
    ).toMatchObject({ id: second.attemptId, status: 'answered' });
    await dialer.disposition(businessId, userId, second.attemptId, {
      disposition: 'do_not_call',
      notes: 'Asked to be removed',
    });
    member = await prisma.voiceOutboundCampaignMember.findUniqueOrThrow({
      where: { id: memberId },
    });
    expect(member).toMatchObject({
      status: 'opted_out',
      attemptCount: 2,
      disposition: 'do_not_call',
    });
    expect(
      await prisma.voiceSuppressionEntry.count({
        where: {
          businessId,
          phoneE164: '+14155550133',
          source: 'outbound_disposition',
        },
      }),
    ).toBe(1);

    const status = await dialer.status(businessId, campaignId);
    expect(status.attemptCounts).toMatchObject({ no_answer: 1, answered: 1 });
    expect(status.attempts[0].phone).toBe('•••• 0133');
  });

  it('does not dial the customer when the campaign is paused before the agent answers', async () => {
    await setAvailable(true);
    const extra = await prisma.customer.create({
      data: { businessId, name: 'Pause Contact', phone: '+14155550134' },
    });
    await prisma.voiceConsentEvidence.create({
      data: {
        businessId,
        customerId: extra.id,
        phoneE164: '+14155550134',
        purpose: 'callback',
        source: 'web_form',
        noticeText: 'Call me back.',
        evidenceReference: 'form-pause',
        legalBasis: 'requested_callback',
        grantedAt: new Date(Date.now() - 60_000),
        verifiedAt: new Date(),
        verifiedByUserId: userId,
      },
    });
    const campaignId = await runningCampaign([extra.id]);
    const next = await dialer.next(businessId, userId, campaignId);
    const attempt = await dialer.attempt(
      businessId,
      userId,
      campaignId,
      next.contact!.memberId,
    );
    await dialer.pause(businessId, userId, campaignId);
    const xml = await dialer.agentAnsweredTwiml(attempt.attemptId);
    expect(xml).not.toContain('<Number>');
    expect(xml).toContain('<Hangup/>');
    const row = await prisma.voiceOutboundDialAttempt.findUniqueOrThrow({
      where: { id: attempt.attemptId },
    });
    expect(row).toMatchObject({ status: 'canceled', customerDialed: false });
    const member = await prisma.voiceOutboundCampaignMember.findUniqueOrThrow({
      where: { id: next.contact!.memberId },
    });
    expect(member).toMatchObject({ status: 'eligible', attemptCount: 0 });
    await expectAppError(
      dialer.attempt(businessId, userId, campaignId, next.contact!.memberId),
      'VOICE_OUTBOUND_CAMPAIGN_STATE',
    );
    await dialer.stop(businessId, userId, campaignId);
    await expectAppError(
      dialer.start(businessId, userId, campaignId),
      'VOICE_OUTBOUND_CAMPAIGN_STATE',
    );
  });
});
