import { ClsService } from 'nestjs-cls';
import { randomUUID } from 'crypto';
import { PhoneCallStatus, Prisma, VoiceKnowledgeKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_USER_ID,
} from '../common/tenancy/tenant.constants';
import { AppException } from '../common/filters/app.exception';
import type {
  CreateMessageParams,
  CreateMessageResult,
} from '../ai/claude.client';
import { VoiceCopilotService } from './voice-copilot.service';

class FakeClsService {
  private readonly values: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.values[key] as T;
  }
  set(key: string, value: unknown) {
    this.values[key] = value;
  }
}

describe('VoiceCopilotService (MySQL)', () => {
  let prisma: PrismaService;
  let service: VoiceCopilotService;
  let businessId: string;
  let otherBusinessId: string;
  let userId: string;
  let liveCallId: string;
  let completedCallId: string;
  let cls: FakeClsService;
  const aiInfra = {
    createMessage: jest
      .fn<
        Promise<CreateMessageResult>,
        [string | undefined, string, CreateMessageParams, unknown?]
      >()
      .mockResolvedValue({
        content: [
          {
            type: 'text',
            text: 'I can check that policy for you and confirm shortly.',
          },
        ],
        stopReason: null,
        inputTokens: 28,
        outputTokens: 12,
      }),
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
    service = new VoiceCopilotService(tenant, aiInfra as never, audit);

    const stamp = randomUUID();
    const [business, otherBusiness, user] = await Promise.all([
      prisma.business.create({
        data: { name: 'Voice Copilot QA', slug: `voice-copilot-${stamp}` },
      }),
      prisma.business.create({
        data: {
          name: 'Other Voice Copilot QA',
          slug: `voice-copilot-other-${stamp}`,
        },
      }),
      prisma.user.create({
        data: {
          email: `voice-copilot-${stamp}@example.com`,
          passwordHash: 'x',
          name: 'Copilot QA Owner',
        },
      }),
    ]);
    businessId = business.id;
    otherBusinessId = otherBusiness.id;
    userId = user.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, userId);

    const transcript = [
      { speaker: 'assistant', text: 'How can I help today?' },
      {
        speaker: 'caller',
        text: 'Can I book a haircut tomorrow? Email me at qa-caller@example.test or call +1 (415) 555-0101.',
      },
    ] as Prisma.InputJsonValue;
    const [liveCall, completedCall] = await Promise.all([
      prisma.phoneCall.create({
        data: {
          businessId,
          callSid: `CA-copilot-live-${stamp}`,
          fromNumber: '+14155550101',
          status: PhoneCallStatus.in_progress,
          transcript,
        },
      }),
      prisma.phoneCall.create({
        data: {
          businessId,
          callSid: `CA-copilot-completed-${stamp}`,
          fromNumber: '+14155550102',
          status: PhoneCallStatus.completed,
          transcript,
        },
      }),
    ]);
    liveCallId = liveCall.id;
    completedCallId = completedCall.id;

    await Promise.all([
      prisma.voiceKnowledgeEntry.create({
        data: {
          businessId,
          kind: VoiceKnowledgeKind.faq,
          title: 'Haircut booking policy',
          question: 'How do haircut bookings work?',
          content:
            'Haircut appointments are subject to the live booking calendar. Confirm a time only after the booking system accepts it.',
          sourceFilename: 'booking-policy.txt',
        },
      }),
      prisma.voiceKnowledgeEntry.create({
        data: {
          businessId: otherBusinessId,
          kind: VoiceKnowledgeKind.faq,
          title: 'Private other-business answer',
          question: 'Haircut booking',
          content: 'Secret data from another tenant must never be supplied.',
          sourceFilename: 'private.txt',
        },
      }),
    ]);
  });

  afterEach(() => jest.clearAllMocks());

  afterAll(async () => {
    if (businessId) {
      await prisma.auditLog.deleteMany({ where: { businessId } });
      await prisma.phoneCall.deleteMany({ where: { businessId } });
      await prisma.voiceKnowledgeEntry.deleteMany({ where: { businessId } });
      await prisma.business.delete({ where: { id: businessId } });
    }
    if (otherBusinessId) {
      await prisma.voiceKnowledgeEntry.deleteMany({
        where: { businessId: otherBusinessId },
      });
      await prisma.business.delete({ where: { id: otherBusinessId } });
    }
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, userId);
    aiInfra.createMessage.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: 'I can check that policy for you and confirm shortly.',
        },
      ],
      stopReason: null,
      inputTokens: 28,
      outputTokens: 12,
    });
  });

  it('uses a real live-call transcript and only same-business matching knowledge, then audits counts without transcript text', async () => {
    const result = await service.suggest(businessId, userId, liveCallId);
    expect(result.suggestion).toBe(
      'I can check that policy for you and confirm shortly.',
    );
    expect(result.contextSupplied).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'transcript',
          label: '2 recent call turns',
        }),
        expect.objectContaining({
          kind: 'faq',
          label: 'Haircut booking policy',
          sourceFilename: 'booking-policy.txt',
        }),
      ]),
    );
    expect(result.contextSupplied.map((source) => source.label)).not.toContain(
      'Private other-business answer',
    );
    const promptText =
      aiInfra.createMessage.mock.calls[0][2].messages[0].content;
    if (typeof promptText !== 'string')
      throw new Error('Expected a string prompt');
    const prompt = JSON.parse(promptText) as {
      transcript: Array<{ text: string }>;
      businessKnowledge: Array<{ content: string }>;
    };
    const suppliedText = JSON.stringify(prompt);
    expect(suppliedText).not.toContain('qa-caller@example.test');
    expect(suppliedText).not.toContain('+1 (415) 555-0101');
    expect(suppliedText).toContain('[email redacted]');
    expect(suppliedText).toContain('[phone redacted]');
    expect(suppliedText).not.toContain('Secret data from another tenant');

    const audit = await prisma.auditLog.findFirst({
      where: {
        businessId,
        entity: 'PhoneCall',
        entityId: liveCallId,
        action: 'voice.call_copilot_suggestion_generated',
      },
    });
    expect(audit?.after).toMatchObject({
      transcriptTurns: 2,
      knowledgeSources: 1,
      inputTokens: 28,
      outputTokens: 12,
    });
    expect(JSON.stringify(audit?.after)).not.toContain(
      'qa-caller@example.test',
    );
  });

  it('refuses a completed call and a call from another tenant before calling AI', async () => {
    const completedError = await service
      .suggest(businessId, userId, completedCallId)
      .catch((error: unknown) => error);
    expect(completedError).toBeInstanceOf(AppException);
    expect((completedError as AppException).getResponse()).toMatchObject({
      code: 'VOICE_COPILOT_CALL_NOT_LIVE',
    });
    cls.set(CLS_KEY_BUSINESS_ID, otherBusinessId);
    const tenantError = await service
      .suggest(otherBusinessId, userId, liveCallId)
      .catch((error: unknown) => error);
    expect(tenantError).toBeInstanceOf(AppException);
    expect(aiInfra.createMessage).not.toHaveBeenCalled();
  });

  it('returns a typed unavailable error when provider credentials are missing', async () => {
    aiInfra.createMessage.mockRejectedValueOnce(
      new Error('ANTHROPIC_API_KEY is not configured'),
    );
    const providerError = await service
      .suggest(businessId, userId, liveCallId)
      .catch((error: unknown) => error);
    expect(providerError).toBeInstanceOf(AppException);
    expect((providerError as AppException).getResponse()).toMatchObject({
      code: 'VOICE_COPILOT_PROVIDER_UNAVAILABLE',
      message:
        'The AI provider is not configured on the server. No suggestion was generated.',
    });
  });
});
