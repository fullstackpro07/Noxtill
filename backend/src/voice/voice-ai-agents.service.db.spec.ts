import { ClsService } from 'nestjs-cls';
import { randomUUID } from 'crypto';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_USER_ID,
} from '../common/tenancy/tenant.constants';
import { AppException } from '../common/filters/app.exception';
import { VoiceAiAgentsService } from './voice-ai-agents.service';

class FakeClsService {
  private readonly values: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.values[key] as T;
  }
  set(key: string, value: unknown) {
    this.values[key] = value;
  }
}

describe('VoiceAiAgentsService (MySQL)', () => {
  let prisma: PrismaService;
  let service: VoiceAiAgentsService;
  let businessId: string;
  let otherBusinessId: string;
  let ownerUserId: string;
  let managerUserId: string;
  let cls: FakeClsService;
  const aiInfra = {
    createMessage: jest.fn().mockResolvedValue({
      content: [
        { type: 'text', text: 'I can help check the booking details.' },
      ],
      inputTokens: 17,
      outputTokens: 9,
    }),
  };
  const draft = {
    name: 'QA Receptionist',
    template: 'receptionist' as const,
    purpose: 'Answer the caller and route their request',
    voiceStyle: 'Warm and concise',
    instructions: 'Do not guess facts not provided by business records.',
    escalationGuidance: 'Offer to take a message when a person is needed.',
    languages: ['English', 'Urdu'],
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
    service = new VoiceAiAgentsService(tenant, audit, aiInfra as never);

    const stamp = randomUUID();
    const [business, otherBusiness] = await Promise.all([
      prisma.business.create({
        data: { name: 'Voice AI Agent QA', slug: `voice-ai-agent-${stamp}` },
      }),
      prisma.business.create({
        data: {
          name: 'Other Voice AI Agent QA',
          slug: `voice-ai-agent-other-${stamp}`,
        },
      }),
    ]);
    businessId = business.id;
    otherBusinessId = otherBusiness.id;
    const [owner, manager] = await Promise.all([
      prisma.user.create({
        data: {
          email: `voice-ai-owner-${stamp}@example.com`,
          passwordHash: 'x',
          name: 'Voice AI Owner',
        },
      }),
      prisma.user.create({
        data: {
          email: `voice-ai-manager-${stamp}@example.com`,
          passwordHash: 'x',
          name: 'Voice AI Manager',
        },
      }),
    ]);
    ownerUserId = owner.id;
    managerUserId = manager.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, ownerUserId);
  });

  afterAll(async () => {
    if (businessId) {
      await prisma.phoneCall.deleteMany({ where: { businessId } });
      await prisma.voiceAiAgentTestRun.deleteMany({ where: { businessId } });
      await prisma.voiceAiAgentVersion.deleteMany({ where: { businessId } });
      await prisma.voiceAiAgent.deleteMany({ where: { businessId } });
      await prisma.auditLog.deleteMany({ where: { businessId } });
      await prisma.business.delete({ where: { id: businessId } });
    }
    if (otherBusinessId)
      await prisma.business.delete({ where: { id: otherBusinessId } });
    if (ownerUserId) await prisma.user.delete({ where: { id: ownerUserId } });
    if (managerUserId)
      await prisma.user.delete({ where: { id: managerUserId } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, ownerUserId);
  });

  afterEach(() => jest.clearAllMocks());

  it('stores immutable draft versions, requires a successful test and owner publish, and rolls back with an audit reason', async () => {
    const created = await service.create(businessId, ownerUserId, draft);
    const first = await prisma.voiceAiAgentVersion.findFirstOrThrow({
      where: { businessId, agentId: created.id, version: 1 },
    });
    expect(first.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(first.config).toMatchObject({
      agentName: draft.name,
      template: draft.template,
    });

    const changed = { ...draft, voiceStyle: 'Calm, warm and concise' };
    const second = await service.saveDraft(
      businessId,
      ownerUserId,
      created.id,
      changed,
    );
    const secondVersion = await prisma.voiceAiAgentVersion.findUniqueOrThrow({
      where: { id: second.id },
    });
    expect(second.version).toBe(2);
    expect(secondVersion.config).toMatchObject({
      voiceStyle: changed.voiceStyle,
    });
    expect(first.config).toMatchObject({ voiceStyle: draft.voiceStyle });
    expect(first.id).not.toBe(secondVersion.id);

    await expect(
      service.publish(businessId, managerUserId, Role.manager, created.id),
    ).rejects.toBeInstanceOf(AppException);
    const publishBeforeTest = await service
      .publish(businessId, ownerUserId, Role.owner, created.id)
      .catch((error: unknown) => error);
    expect(publishBeforeTest).toBeInstanceOf(AppException);
    if (!(publishBeforeTest instanceof AppException)) {
      throw new Error('Publishing without test evidence should fail');
    }
    expect(publishBeforeTest.getResponse()).toEqual({
      code: 'VOICE_AI_AGENT_TEST_REQUIRED',
      message:
        'The latest sandbox test on the current draft must pass before publishing.',
    });
    expect(
      (
        await prisma.voiceAiAgent.findUniqueOrThrow({
          where: { id: created.id },
        })
      ).status,
    ).toBe('draft');

    const tested = await service.testDraft(
      businessId,
      ownerUserId,
      created.id,
      'A caller asks about a booking',
    );
    expect(tested).toMatchObject({
      passed: true,
      inputTokens: 17,
      outputTokens: 9,
    });
    expect(aiInfra.createMessage).toHaveBeenCalledWith(
      businessId,
      'voice_entry',
      expect.objectContaining({ maxTokens: 320 }),
    );
    aiInfra.createMessage.mockRejectedValueOnce(
      new Error('provider account unavailable'),
    );
    expect(
      (
        await service.testDraft(
          businessId,
          ownerUserId,
          created.id,
          'A new sandbox scenario',
        )
      ).passed,
    ).toBe(false);
    await expect(
      service.publish(businessId, ownerUserId, Role.owner, created.id),
    ).rejects.toBeInstanceOf(AppException);
    await service.testDraft(
      businessId,
      ownerUserId,
      created.id,
      'A caller asks about a booking',
    );
    await service.publish(businessId, ownerUserId, Role.owner, created.id);
    const publishedV2 = await prisma.voiceAiAgentVersion.findUniqueOrThrow({
      where: { id: second.id },
    });
    expect(publishedV2.publishedAt).toBeInstanceOf(Date);

    const third = await service.saveDraft(businessId, ownerUserId, created.id, {
      ...changed,
      instructions:
        'Use business records only and offer a transfer when needed.',
    });
    await service.testDraft(
      businessId,
      ownerUserId,
      created.id,
      'Caller asks for a staff member',
    );
    await service.publish(businessId, ownerUserId, Role.owner, created.id);
    const rolledBack = await service.rollback(
      businessId,
      ownerUserId,
      Role.owner,
      created.id,
      {
        versionId: second.id,
        reason: 'Restore the prior approved voice instructions',
      },
    );
    expect(rolledBack).toMatchObject({
      publishedVersionId: second.id,
      version: 2,
      status: 'active',
    });
    expect(third.version).toBe(3);
    expect(
      await prisma.voiceAiAgent.findUniqueOrThrow({
        where: { id: created.id },
      }),
    ).toMatchObject({
      publishedVersionId: second.id,
      status: 'active',
    });
    expect(
      await prisma.auditLog.count({
        where: { businessId, action: 'voice.ai_agent_rolled_back' },
      }),
    ).toBe(1);
  });

  it('does not expose another business agent and records provider failures without claiming a pass', async () => {
    const created = await service.create(businessId, ownerUserId, {
      ...draft,
      name: 'QA Provider Failure Agent',
    });
    cls.set(CLS_KEY_BUSINESS_ID, otherBusinessId);
    await expect(
      service.testDraft(
        otherBusinessId,
        ownerUserId,
        created.id,
        'A test scenario',
      ),
    ).rejects.toBeInstanceOf(AppException);

    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    aiInfra.createMessage.mockRejectedValueOnce(
      new Error('provider account unavailable'),
    );
    const result = await service.testDraft(
      businessId,
      ownerUserId,
      created.id,
      'A caller asks for a person',
    );
    expect(result).toMatchObject({
      passed: false,
      errorCode: 'AI_PROVIDER_REQUEST_FAILED',
    });
    expect(result.errorMessage).toContain('available credit');
    await expect(
      service.publish(businessId, ownerUserId, Role.owner, created.id),
    ).rejects.toBeInstanceOf(AppException);
    const current = await prisma.voiceAiAgent.findUniqueOrThrow({
      where: { id: created.id },
    });
    if (!current.currentDraftVersionId) {
      throw new Error(
        'The created agent should retain its current draft version',
      );
    }
    expect(
      await prisma.voiceAiAgentTestRun.count({
        where: {
          businessId,
          versionId: current.currentDraftVersionId,
          passed: false,
        },
      }),
    ).toBe(1);
  });
});
