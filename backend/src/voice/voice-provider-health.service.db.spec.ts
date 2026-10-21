import axios from 'axios';
import { ClsService } from 'nestjs-cls';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { VoiceProviderHealthService } from './voice-provider-health.service';

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

describe('VoiceProviderHealthService (real MySQL)', () => {
  let prisma: PrismaService;
  let service: VoiceProviderHealthService;
  let businessId: string;
  const config: Record<string, string | undefined> = {
    TWILIO_ACCOUNT_SID: 'AC_test',
    TWILIO_AUTH_TOKEN: 'token',
    BACKEND_URL: 'https://api.example.com/api/v1',
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    service = new VoiceProviderHealthService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
      { get: (key: string) => config[key] } as unknown as ConfigService,
    );
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    businessId = (
      await prisma.business.create({
        data: { name: 'Health Test', slug: `voice-health-${suffix}` },
      })
    ).id;
    await prisma.phoneNumber.create({
      data: {
        businessId,
        twilioSid: 'PN_health',
        phoneNumber: `+1415204${String(Date.now()).slice(-4)}`,
      },
    });
    const start = new Date();
    await prisma.phoneCall.createMany({
      data: [
        {
          businessId,
          callSid: `CA-h1-${suffix}`,
          fromNumber: '+14155550181',
          status: 'completed',
          startedAt: start,
          endedAt: new Date(start.getTime() + 120_000),
          transcript: [],
          providerCost: '0.0250',
          providerCostUnit: 'USD',
          providerCostCheckedAt: start,
        },
        {
          businessId,
          callSid: `CA-h2-${suffix}`,
          fromNumber: '+14155550182',
          status: 'missed',
          startedAt: start,
          transcript: [],
        },
      ],
    });
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.phoneCall.deleteMany({ where: { businessId } });
      await tx.phoneNumber.deleteMany({ where: { businessId } });
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  beforeEach(() => mockedAxios.get.mockReset());

  it('reports a live provider read, and flags a number routed away from Noxtill', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({ data: { status: 'active' } })
      .mockResolvedValueOnce({
        data: { voice_url: 'https://other.example.com/voice' },
      });
    const health = await service.health(businessId);
    const byKey = Object.fromEntries(
      health.checks.map((check) => [check.key, check]),
    );
    expect(byKey.twilio_account.status).toBe('ok');
    expect(byKey.webhook_url.status).toBe('ok');
    expect(byKey.business_line.status).toBe('error');
    expect(byKey.business_line.detail).toContain(
      'https://other.example.com/voice',
    );
    expect(health.overall).toBe('error');
    expect(health.lastCallAt).not.toBeNull();
  });

  it('reports rejected credentials as an error instead of assuming health', async () => {
    mockedAxios.isAxiosError.mockReturnValue(true);
    mockedAxios.get.mockRejectedValue({ response: { status: 401 } });
    const health = await service.health(businessId);
    const account = health.checks.find(
      (check) => check.key === 'twilio_account',
    );
    expect(account).toMatchObject({ status: 'error' });
    expect(account?.detail).toContain('rejected');
  });

  it('checks speech and AI reply configuration independently without paid requests', async () => {
    config.OPENAI_API_KEY = 'test-speech-key';
    delete config.ANTHROPIC_API_KEY;
    mockedAxios.get
      .mockResolvedValueOnce({ data: { status: 'active' } })
      .mockResolvedValueOnce({
        data: {
          voice_url: 'https://api.example.com/api/v1/voice/webhook/incoming',
        },
      });
    try {
      const health = await service.health(businessId);
      expect(health.checks.find((c) => c.key === 'speech_ai')).toMatchObject({
        label: 'Speech transcription',
        status: 'warning',
      });
      expect(health.checks.find((c) => c.key === 'ai_replies')).toMatchObject({
        status: 'not_configured',
      });
      expect(mockedAxios.post.mock.calls).toHaveLength(0);
    } finally {
      delete config.OPENAI_API_KEY;
    }
  });

  it('shows saved AI failures and distinguishes newer sandbox evidence from current billing', async () => {
    config.OPENAI_API_KEY = 'test-speech-key';
    config.ANTHROPIC_API_KEY = 'test-reply-key';
    mockedAxios.get.mockImplementation((url) =>
      Promise.resolve({
        data: String(url).includes('IncomingPhoneNumbers')
          ? {
              voice_url:
                'https://api.example.com/api/v1/voice/webhook/incoming',
            }
          : { status: 'active' },
      }),
    );
    const createdAt = new Date();
    const agent = await prisma.voiceAiAgent.create({
      data: {
        businessId,
        name: `Health evidence ${createdAt.getTime()}`,
        template: 'receptionist',
        versions: {
          create: {
            businessId,
            version: 1,
            config: {},
            checksum: 'a'.repeat(64),
          },
        },
      },
      include: { versions: true },
    });
    const versionId = agent.versions[0].id;
    const callSid = `CA-health-ai-failure-${createdAt.getTime()}`;
    try {
      await prisma.voiceAiAgentTestRun.create({
        data: {
          businessId,
          versionId,
          scenario: 'QA provider failure',
          passed: false,
          errorCode: 'AI_PROVIDER_INSUFFICIENT_CREDIT',
          errorMessage: 'The AI provider account has insufficient credit.',
          createdAt,
        },
      });
      const failed = await service.health(businessId);
      expect(failed.checks.find((c) => c.key === 'ai_replies')).toMatchObject({
        status: 'error',
      });
      expect(
        failed.checks.find((c) => c.key === 'ai_replies')?.detail,
      ).toContain('insufficient credit');

      await prisma.voiceAiAgentTestRun.create({
        data: {
          businessId,
          versionId,
          scenario: 'QA restored provider response',
          passed: true,
          response: 'QA controlled response',
          createdAt: new Date(createdAt.getTime() + 1000),
        },
      });
      const passed = await service.health(businessId);
      expect(passed.checks.find((c) => c.key === 'ai_replies')).toMatchObject({
        status: 'warning',
      });
      expect(
        passed.checks.find((c) => c.key === 'ai_replies')?.detail,
      ).toContain('Current provider access and credit');

      const failureAt = new Date(createdAt.getTime() + 2000);
      await prisma.phoneCall.create({
        data: {
          businessId,
          callSid,
          fromNumber: '+14155550184',
          startedAt: failureAt,
          transcript: [
            {
              speaker: 'assistant',
              text: 'The automated assistant is unavailable.',
              at: failureAt.toISOString(),
              serviceFailure: {
                stage: 'ai_reply',
                code: 'AI_PROVIDER_ACCESS_DENIED',
                message: 'The AI provider rejected server access.',
              },
            },
          ],
        },
      });
      const liveFailure = await service.health(businessId);
      expect(
        liveFailure.checks.find((c) => c.key === 'ai_replies'),
      ).toMatchObject({ status: 'error' });
      expect(
        liveFailure.checks.find((c) => c.key === 'ai_replies')?.detail,
      ).toContain('rejected server access');

      await prisma.phoneCall.update({
        where: { callSid },
        data: {
          transcript: [
            {
              speaker: 'assistant',
              text: 'QA controlled provider response',
              at: new Date(createdAt.getTime() + 3000).toISOString(),
              analysis: {
                intent: 'continue',
                confidence: null,
                sentiment: null,
                topic: null,
                answered: null,
                sources: [],
              },
            },
          ],
        },
      });
      const recovered = await service.health(businessId);
      expect(
        recovered.checks.find((c) => c.key === 'ai_replies'),
      ).toMatchObject({
        status: 'warning',
      });
      expect(mockedAxios.post.mock.calls).toHaveLength(0);
    } finally {
      delete config.OPENAI_API_KEY;
      delete config.ANTHROPIC_API_KEY;
      await prisma.phoneCall.deleteMany({ where: { businessId, callSid } });
      await prisma.voiceAiAgentTestRun.deleteMany({ where: { versionId } });
      await prisma.voiceAiAgentVersion.delete({ where: { id: versionId } });
      await prisma.voiceAiAgent.delete({ where: { id: agent.id } });
    }
  });

  it('measures this month’s usage from saved calls only', async () => {
    const usage = await service.usage(businessId);
    expect(usage).toMatchObject({
      inboundCalls: 2,
      missedCalls: 1,
      inboundMinutes: 2,
      outboundDials: 0,
      callbackDials: 0,
      providerCharges: [{ unit: 'USD', amount: '0.0250' }],
      limits: { usageCaps: 'not_configured' },
    });
  });

  it('keeps outbound minutes and prices out of inbound usage and caps', async () => {
    const callSid = `CA-health-outbound-${Date.now()}`;
    const startedAt = new Date();
    await prisma.phoneCall.create({
      data: {
        businessId,
        callSid,
        fromNumber: '+14155550185',
        direction: 'outbound',
        status: 'completed',
        startedAt,
        endedAt: new Date(startedAt.getTime() + 600_000),
        providerCost: '2.5000',
        providerCostUnit: 'USD',
        providerCostCheckedAt: startedAt,
      },
    });
    try {
      expect(await service.usage(businessId)).toMatchObject({
        inboundCalls: 2,
        inboundMinutes: 2,
        providerCharges: [{ unit: 'USD', amount: '0.0250' }],
        limits: { automatedCalls: 2 },
      });
    } finally {
      await prisma.phoneCall.delete({ where: { callSid } });
    }
  });

  it('reports the configured automated-call cap separately from rejected calls', async () => {
    const callSid = `CA-health-capped-${Date.now()}`;
    await prisma.phoneCall.create({
      data: {
        businessId,
        callSid,
        fromNumber: '+14155550183',
        status: 'missed',
        transcript: [],
        quotaRejectedAt: new Date(),
        quotaRejectedReason: 'Monthly automated-call limit reached (2).',
      },
    });
    const original = await prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { policies: true },
    });
    await prisma.business.update({
      where: { id: businessId },
      data: {
        policies: {
          ...((original.policies as Record<string, unknown> | null) ?? {}),
          'voice.maxInboundCallsPerMonth': 2,
        },
      },
    });

    try {
      const usage = await service.usage(businessId);
      expect(usage).toMatchObject({
        inboundCalls: 3,
        missedCalls: 2,
        limits: {
          usageCaps: 'inbound_calls_enforced',
          maxInboundCallsPerMonth: 2,
          automatedCalls: 2,
          quotaRejectedCalls: 1,
        },
      });
    } finally {
      await prisma.business.update({
        where: { id: businessId },
        data: { policies: original.policies as never },
      });
      await prisma.phoneCall.delete({ where: { callSid } });
    }
  });
});
