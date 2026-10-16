import axios from 'axios';
import { ClsService } from 'nestjs-cls';
import { ConfigService } from '@nestjs/config';
import { Role, VoicePolicyCallerType } from '@prisma/client';
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
import { VoiceAiOutboundService } from './voice-ai-outbound.service';
import { VoiceCallService } from './voice-call.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

class FakeClsService {
  private readonly values: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.values[key] as T;
  }
  set(key: string, value: unknown) {
    this.values[key] = value;
  }
}

describe('VoiceAiOutboundService (real MySQL)', () => {
  let prisma: PrismaService;
  let tenant: TenantPrismaService;
  let campaigns: VoiceOutboundCampaignService;
  let dialer: VoiceOutboundDialerService;
  let aiOutbound: VoiceAiOutboundService;
  let voiceCall: VoiceCallService;
  let cls: FakeClsService;
  let businessId: string;
  let userId: string;
  let agentId: string;
  let versionId: string;
  let customerIds: string[];
  let policyVersionId: string;
  const configValues: Record<string, string | undefined> = {
    TWILIO_ACCOUNT_SID: '',
    TWILIO_AUTH_TOKEN: '',
    BACKEND_URL: '',
  };
  const config = {
    get: (key: string) => configValues[key],
  } as unknown as ConfigService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    tenant = new TenantPrismaService(prisma, cls as unknown as ClsService);
    const audit = new AuditService(tenant, cls as unknown as ClsService);
    const compliance = new VoiceComplianceService(tenant, audit);
    campaigns = new VoiceOutboundCampaignService(tenant, compliance, audit);
    dialer = new VoiceOutboundDialerService(
      tenant,
      prisma,
      campaigns,
      compliance,
      audit,
      config,
    );
    aiOutbound = new VoiceAiOutboundService(
      tenant,
      prisma,
      campaigns,
      audit,
      config,
    );
    const business = await prisma.business.create({
      data: {
        name: 'AI Campaign Integration Test',
        slug: `ai-campaign-${Date.now()}`,
      },
    });
    businessId = business.id;
    await prisma.phoneNumber.create({
      data: {
        businessId,
        twilioSid: `PN-ai-${Date.now()}`,
        phoneNumber: `+1415555${String(Date.now()).slice(-4)}`,
      },
    });
    const user = await prisma.user.create({
      data: {
        email: `ai-campaign-${Date.now()}@example.com`,
        passwordHash: 'x',
        name: 'AI Campaign QA',
      },
    });
    userId = user.id;
    await prisma.businessUser.create({
      data: { businessId, userId, role: Role.owner },
    });
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, userId);

    const agent = await prisma.voiceAiAgent.create({
      data: {
        businessId,
        name: 'QA outbound agent',
        template: 'sales',
        status: 'active',
      },
    });
    agentId = agent.id;
    const version = await prisma.voiceAiAgentVersion.create({
      data: {
        businessId,
        agentId,
        version: 1,
        config: {
          agentName: 'QA outbound agent',
          template: 'sales',
          purpose: 'Service follow-up',
          toolPermissions: ['message', 'end'],
          monthlyBudgetUsd: null,
        },
        checksum: 'a'.repeat(64),
        createdByUserId: userId,
        publishedAt: new Date(),
        approvedAt: new Date(),
        approvedByUserId: userId,
      },
    });
    versionId = version.id;
    await prisma.voiceAiAgent.update({
      where: { id: agentId },
      data: { publishedVersionId: versionId },
    });

    const policy = await compliance.createPolicy(businessId, userId, {
      countryCode: 'US',
      purpose: 'callback',
      callerType: VoicePolicyCallerType.ai_voice,
      aiDisclosureText: 'This call uses an automated AI assistant.',
      recordingAllowed: false,
    });
    if (!policy) throw new Error('The QA compliance policy was not created.');
    policyVersionId = policy.versions[0].id;
    await compliance.publishPolicyVersion(businessId, userId, policyVersionId, {
      legalReviewReference: 'QA integration test only',
      confirmLegalReview: true,
    });

    customerIds = [];
    for (const [index, phone] of ['+14155550171', '+14155550172'].entries()) {
      const customer = await prisma.customer.create({
        data: { businessId, name: `AI campaign contact ${index + 1}`, phone },
      });
      customerIds.push(customer.id);
      await compliance.recordConsent(businessId, userId, {
        customerId: customer.id,
        phoneE164: phone,
        purpose: 'callback',
        callerType: VoicePolicyCallerType.ai_voice,
        source: 'qa_manual_review',
        noticeText: 'QA-only test consent notice.',
        evidenceReference: `QA-only-${index + 1}`,
        legalBasis: 'QA integration test',
        grantedAt: new Date(Date.now() - 60_000).toISOString(),
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        evidenceReviewed: true,
      });
    }

    voiceCall = new VoiceCallService(
      prisma,
      config,
      {} as never,
      {} as never,
      {
        complete: jest.fn().mockResolvedValue(
          JSON.stringify({
            reply: 'I will book that for you.',
            intent: 'book',
            service: 'Consultation',
            startsAt: '2026-10-20T10:00:00.000Z',
          }),
        ),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
        if (businessId) await tx.business.delete({ where: { id: businessId } });
        if (userId) await tx.user.delete({ where: { id: userId } });
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
      });
      await prisma.$disconnect();
    }
  });

  beforeEach(() => {
    mockedAxios.post.mockReset();
    let callNumber = 0;
    mockedAxios.post.mockImplementation(() =>
      Promise.resolve({
        data: { sid: `CA${Date.now()}${++callNumber}`, status: 'queued' },
      } as never),
    );
    configValues.TWILIO_ACCOUNT_SID = '';
    configValues.TWILIO_AUTH_TOKEN = '';
    configValues.BACKEND_URL = '';
  });

  async function createApprovedCampaign() {
    const campaign = await campaigns.create(businessId, userId, {
      name: `QA approved AI campaign ${Date.now()}`,
      purpose: 'callback',
      callerType: 'ai_voice',
      countryCode: 'US',
      timeZone: 'America/Los_Angeles',
      openingScript: 'I am calling about your requested service follow-up.',
      aiAgentId: agentId,
      maxAttemptsPerContact: 1,
      retryCooldownHours: 24,
      customerIds,
    });
    await campaigns.eligibilityPreview(businessId, userId, campaign.id);
    await dialer.requestApproval(businessId, userId, campaign.id);
    await dialer.approve(businessId, userId, true, campaign.id);
    return campaign.id;
  }

  it('keeps the approved campaign idle until provider configuration is present', async () => {
    const campaignId = await createApprovedCampaign();
    let caught: unknown;
    try {
      await aiOutbound.start(businessId, userId, campaignId);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppException);
    if (caught instanceof AppException) {
      expect(caught.getResponse()).toMatchObject({
        code: 'VOICE_PROVIDER_NOT_CONFIGURED',
      });
    }
    expect(mockedAxios.post.mock.calls).toHaveLength(0);
    expect(
      await prisma.voiceOutboundCampaign.findUniqueOrThrow({
        where: { id: campaignId },
        select: { status: true },
      }),
    ).toEqual({ status: 'approved' });
  });

  it('starts sequentially, rechecks eligibility, pins one agent version, and enforces its tool allowlist', async () => {
    const campaignId = await createApprovedCampaign();
    configValues.TWILIO_ACCOUNT_SID = 'AC-test';
    configValues.TWILIO_AUTH_TOKEN = 'test-token';
    configValues.BACKEND_URL = 'https://api.example.test/api/v1';

    const initial = await aiOutbound.start(businessId, userId, campaignId);
    expect(initial).toMatchObject({ status: 'running' });
    expect(mockedAxios.post.mock.calls).toHaveLength(1);
    const first = await prisma.voiceAiOutboundAttempt.findFirstOrThrow({
      where: { businessId, campaignId },
      orderBy: { createdAt: 'asc' },
    });
    expect(first).toMatchObject({ versionId, status: 'initiating' });
    expect(first.callSid).toMatch(/^CA/);
    const twilioForm = mockedAxios.post.mock.calls[0][1] as URLSearchParams;
    expect(twilioForm.get('To')).toMatch(/^\+1415555017[12]$/);
    expect(twilioForm.get('Url')).toContain(
      '/voice/webhook/outbound/ai-answer',
    );

    const secondVersion = await prisma.voiceAiAgentVersion.create({
      data: {
        businessId,
        agentId,
        version: 2,
        config: {
          agentName: 'Updated agent',
          template: 'sales',
          toolPermissions: ['book'],
        },
        checksum: 'b'.repeat(64),
        createdByUserId: userId,
        publishedAt: new Date(),
        approvedAt: new Date(),
        approvedByUserId: userId,
      },
    });
    await prisma.voiceAiAgent.update({
      where: { id: agentId },
      data: { publishedVersionId: secondVersion.id },
    });

    await aiOutbound.providerStatus(first.id, first.callSid!, 'no-answer');
    const attemptsAfterRetry = await prisma.voiceAiOutboundAttempt.findMany({
      where: { businessId, campaignId, status: 'initiating' },
      orderBy: { createdAt: 'asc' },
    });
    expect(attemptsAfterRetry).toHaveLength(1);
    const second = attemptsAfterRetry[0];
    expect(second.versionId).toBe(versionId);
    expect(mockedAxios.post.mock.calls).toHaveLength(2);

    const secondCallSid = second.callSid!;
    await prisma.voiceAiOutboundAttempt.update({
      where: { id: second.id },
      data: { callSid: null },
    });
    const opening = await voiceCall.handleOutboundAiAnswer(
      second.id,
      secondCallSid,
    );
    expect(opening).toContain('<Gather input="speech"');
    expect(
      await prisma.voiceAiOutboundAttempt.findUniqueOrThrow({
        where: { id: second.id },
        select: { callSid: true },
      }),
    ).toEqual({ callSid: secondCallSid });
    const call = await prisma.phoneCall.findUniqueOrThrow({
      where: { callSid: secondCallSid },
    });
    expect(call).toMatchObject({
      direction: 'outbound',
      voiceAgentVersionId: versionId,
      recordingConsentStatus: 'not_configured',
      recordingKey: null,
    });

    const speech = await voiceCall.handleOutboundAiSpeech(
      second.id,
      secondCallSid,
      'Please book me a consultation',
    );
    expect(speech).toContain('<Hangup/>');
    const afterSpeech = await prisma.phoneCall.findUniqueOrThrow({
      where: { callSid: secondCallSid },
    });
    expect(afterSpeech.bookingAttempts).toEqual([]);
    expect(JSON.stringify(afterSpeech.transcript)).toContain(
      "can't complete that action",
    );

    await aiOutbound.providerStatus(second.id, secondCallSid, 'completed', 12);
    await aiOutbound.providerStatus(second.id, secondCallSid, 'completed', 12);
    expect(mockedAxios.post.mock.calls).toHaveLength(2);
    const report = await aiOutbound.report(businessId, campaignId);
    expect(report).toMatchObject({
      status: 'completed',
      customerDialed: 2,
      attempts: 2,
      talkSeconds: 12,
      voicemails: 'not_available',
    });
    expect(policyVersionId).toBeTruthy();
  });
});
