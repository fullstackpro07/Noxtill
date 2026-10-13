import { ClsService } from 'nestjs-cls';
import { Role, VoiceQualityReviewStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import type { AiInfraService } from '../ai/ai-infra.service';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_USER_ID,
} from '../common/tenancy/tenant.constants';
import { VoiceQualityService } from './voice-quality.service';

class FakeClsService {
  private readonly store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('VoiceQualityService (real MySQL)', () => {
  let prisma: PrismaService;
  let service: VoiceQualityService;
  let businessId: string;
  let userId: string;
  let businessUserId: string;
  let otherBusinessId: string | null = null;
  let otherUserId: string | null = null;
  let callCounter = 0;
  const aiInfra = {
    createMessage: jest.fn<
      ReturnType<AiInfraService['createMessage']>,
      Parameters<AiInfraService['createMessage']>
    >(),
  };

  const criteria = [
    {
      key: 'accuracy',
      label: 'Factual accuracy',
      weight: 60,
      guidance: 'Check the response against the call evidence.',
    },
    {
      key: 'handoff',
      label: 'Appropriate handoff',
      weight: 40,
      guidance:
        'Check whether the call was handled or escalated appropriately.',
    },
  ];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const audit = new AuditService(tenantPrisma, cls as unknown as ClsService);
    service = new VoiceQualityService(
      tenantPrisma,
      audit,
      aiInfra as unknown as AiInfraService,
    );

    const business = await prisma.business.create({
      data: { name: 'Voice Quality Test', slug: `voice-quality-${Date.now()}` },
    });
    businessId = business.id;
    const user = await prisma.user.create({
      data: {
        email: `voice-quality-${Date.now()}@example.com`,
        passwordHash: 'x',
        name: 'QA Reviewer',
      },
    });
    userId = user.id;
    const staff = await prisma.businessUser.create({
      data: { businessId, userId, role: Role.staff },
    });
    businessUserId = staff.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, userId);
  });

  afterAll(async () => {
    if (otherBusinessId && otherUserId) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
        await tx.business.delete({ where: { id: otherBusinessId! } });
        await tx.user.delete({ where: { id: otherUserId! } });
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
      });
    }
    if (businessId) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
        await tx.business.delete({ where: { id: businessId } });
        await tx.user.delete({ where: { id: userId } });
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
      });
    }
    await prisma.$disconnect();
  });

  async function createCall(
    transcript = [
      {
        speaker: 'caller',
        text: 'Can you tell me the opening time?',
        at: '2026-10-11T10:00:00.000Z',
      },
      {
        speaker: 'assistant',
        text: 'The saved business hours say nine AM.',
        at: '2026-10-11T10:00:03.000Z',
      },
    ],
  ) {
    callCounter += 1;
    return prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA-quality-${businessId}-${callCounter}`,
        fromNumber: '+15550000001',
        status: 'completed',
        outcome: 'message',
        transcript,
      },
    });
  }

  async function expectErrorCode(action: Promise<unknown>, code: string) {
    let caught: unknown;
    try {
      await action;
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppException);
    if (caught instanceof AppException) {
      expect(caught.getResponse()).toMatchObject({ code });
    }
  }

  async function publishedRubric(name = `QA rubric ${Date.now()}`) {
    const rubric = await service.createRubric(businessId, userId, {
      name,
      criteria,
    });
    const versionId = rubric.versions[0].id;
    await service.publishVersion(businessId, userId, versionId);
    return { rubric, versionId };
  }

  it('publishes immutable rubric versions and scores real transcript evidence', async () => {
    const { rubric, versionId } = await publishedRubric();
    const call = await createCall();
    const review = await service.startReview(businessId, userId, call.id);
    if (!review.rubric || !review.call)
      throw new Error('Review response omitted its sources.');
    expect(review.rubric.versionId).toBe(versionId);
    expect(review.call.transcript).toHaveLength(2);
    expect(review.call.transcript[0].text).toContain('opening time');

    const saved = await service.saveReview(businessId, userId, review.id, {
      scores: [
        {
          criterionKey: 'accuracy',
          score: 2,
          evidenceTurnIndexes: [1],
          note: 'Response needs verification.',
        },
        { criterionKey: 'handoff', score: 5, evidenceTurnIndexes: [] },
      ],
    });
    expect(saved.status).toBe(VoiceQualityReviewStatus.in_progress);

    const submitted = await service.submitReview(businessId, userId, review.id);
    expect(submitted.computedScore).toBe(64);
    expect(submitted.effectiveScore).toBe(64);
    expect(submitted.scores[0].evidenceTurnIndexes).toEqual([1]);

    const override = await service.overrideReview(
      businessId,
      userId,
      review.id,
      {
        score: 70,
        reason: 'Calibration meeting decision',
      },
    );
    expect(override.computedScore).toBe(64);
    expect(override.effectiveScore).toBe(70);
    expect(override.overrideReason).toBe('Calibration meeting decision');

    const audits = await prisma.auditLog.findMany({
      where: { entity: 'VoiceQualityReview', entityId: review.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audits.map((row) => row.action)).toEqual([
      'voice.quality_review_assigned',
      'voice.quality_review_saved',
      'voice.quality_review_submitted',
      'voice.quality_review_score_overridden',
    ]);

    const nextDraft = await service.createDraftVersion(
      businessId,
      userId,
      rubric.id,
      {
        name: rubric.name,
        criteria: [
          {
            key: 'accuracy',
            label: 'Factual accuracy',
            weight: 50,
            guidance: 'Compare against saved business records.',
          },
          {
            key: 'handoff',
            label: 'Appropriate handoff',
            weight: 50,
            guidance: 'Check transfer or resolution against the transcript.',
          },
        ],
      },
    );
    expect(nextDraft.version).toBe(2);
    const oldVersion = await prisma.voiceQualityRubricVersion.findUniqueOrThrow(
      { where: { id: versionId } },
    );
    expect(oldVersion.criteria).toEqual(criteria);
  });

  it('requires evidence for every below-maximum score and validates evidence indexes', async () => {
    await publishedRubric();
    const call = await createCall();
    const review = await service.startReview(businessId, userId, call.id);
    await expectErrorCode(
      service.saveReview(businessId, userId, review.id, {
        scores: [
          { criterionKey: 'accuracy', score: 4, evidenceTurnIndexes: [] },
        ],
      }),
      'VOICE_QUALITY_EVIDENCE_REQUIRED',
    );

    await expectErrorCode(
      service.saveReview(businessId, userId, review.id, {
        scores: [
          { criterionKey: 'accuracy', score: 3, evidenceTurnIndexes: [99] },
        ],
      }),
      'VOICE_QUALITY_EVIDENCE_INVALID',
    );

    await expectErrorCode(
      service.submitReview(businessId, userId, review.id),
      'VOICE_QUALITY_REVIEW_INCOMPLETE',
    );
  });

  it('returns transcript-cited AI score suggestions without saving them', async () => {
    await publishedRubric();
    const call = await createCall([
      {
        speaker: 'caller',
        text: 'Email me at qa-person@example.com or call +1 (415) 555-0123. Card 4111111111111111',
        at: '2026-10-11T10:00:00.000Z',
      },
      {
        speaker: 'assistant',
        text: 'I do not have the saved opening time available, so I will ask a staff member to confirm it.',
        at: '2026-10-11T10:00:03.000Z',
      },
    ]);
    const review = await service.startReview(businessId, userId, call.id);
    aiInfra.createMessage.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            scores: [
              {
                criterionKey: 'accuracy',
                score: 4,
                evidenceTurnIndexes: [1],
                note: 'The assistant did not guess and offered a staff follow-up.',
              },
              {
                criterionKey: 'handoff',
                score: 5,
                evidenceTurnIndexes: [],
                note: 'The answer states a clear next step.',
              },
            ],
          }),
        },
      ],
      stopReason: 'end_turn',
      inputTokens: 88,
      outputTokens: 34,
    });

    const result = await service.suggestReviewScores(
      businessId,
      userId,
      review.id,
    );
    expect(result.saved).toBe(false);
    expect(result.scores.map((score) => score.criterionKey)).toEqual([
      'accuracy',
      'handoff',
    ]);
    expect(result.scores[0].evidenceTurnIndexes).toEqual([1]);
    const aiCall = aiInfra.createMessage.mock.calls[0];
    expect(aiCall[0]).toBe(businessId);
    expect(aiCall[1]).toBe('voice_quality_assist');
    const prompt = JSON.stringify(aiCall[2]);
    expect(prompt).toContain('[email masked]');
    expect(prompt).toContain('[phone masked]');
    expect(prompt).toContain('[payment number masked]');
    expect(prompt).not.toContain('qa-person@example.com');
    expect(prompt).not.toContain('415) 555-0123');
    expect(prompt).not.toContain('4111111111111111');

    const persisted = await prisma.voiceQualityReview.findUniqueOrThrow({
      where: { id: review.id },
    });
    expect(persisted.criteriaScores).toEqual([]);
    expect(persisted.submittedAt).toBeNull();
    expect(
      await prisma.auditLog.findFirst({
        where: {
          entity: 'VoiceQualityReview',
          entityId: review.id,
          action: 'voice.quality_ai_suggestions_generated',
        },
      }),
    ).not.toBeNull();
  });

  it('rejects AI suggestions with transcript evidence that does not exist', async () => {
    await publishedRubric();
    const call = await createCall();
    const review = await service.startReview(businessId, userId, call.id);
    aiInfra.createMessage.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            scores: [
              {
                criterionKey: 'accuracy',
                score: 1,
                evidenceTurnIndexes: [99],
                note: 'Unsupported citation.',
              },
              {
                criterionKey: 'handoff',
                score: 5,
                evidenceTurnIndexes: [],
              },
            ],
          }),
        },
      ],
      stopReason: 'end_turn',
      inputTokens: 30,
      outputTokens: 20,
    });

    await expectErrorCode(
      service.suggestReviewScores(businessId, userId, review.id),
      'VOICE_QUALITY_AI_SUGGESTION_INVALID',
    );
    const persisted = await prisma.voiceQualityReview.findUniqueOrThrow({
      where: { id: review.id },
    });
    expect(persisted.criteriaScores).toEqual([]);
  });

  it('returns a typed provider error without changing the review', async () => {
    await publishedRubric();
    const call = await createCall();
    const review = await service.startReview(businessId, userId, call.id);
    aiInfra.createMessage.mockRejectedValueOnce(
      new Error('ANTHROPIC_API_KEY is not configured'),
    );

    await expectErrorCode(
      service.suggestReviewScores(businessId, userId, review.id),
      'VOICE_QUALITY_AI_PROVIDER_UNAVAILABLE',
    );
    const persisted = await prisma.voiceQualityReview.findUniqueOrThrow({
      where: { id: review.id },
    });
    expect(persisted.criteriaScores).toEqual([]);
  });

  it('rejects invalid rubric weights, missing source transcript and unjustified overrides', async () => {
    await expectErrorCode(
      service.createRubric(businessId, userId, {
        name: 'Invalid weights',
        criteria: [
          { ...criteria[0], weight: 30 },
          { ...criteria[1], weight: 30 },
        ],
      }),
      'VOICE_QUALITY_RUBRIC_WEIGHTS_INVALID',
    );

    const { versionId } = await publishedRubric();
    const noTranscript = await createCall([]);
    await expectErrorCode(
      service.startReview(businessId, userId, noTranscript.id),
      'VOICE_QUALITY_CALL_NOT_REVIEWABLE',
    );

    const call = await createCall();
    const review = await service.startReview(businessId, userId, call.id);
    await expectErrorCode(
      service.overrideReview(businessId, userId, review.id, {
        score: 80,
        reason: 'Too short',
      }),
      'VOICE_QUALITY_REVIEW_NOT_EDITABLE',
    );
    expect(versionId).toBeTruthy();
  });

  it('enforces business scope for calls, rubric access and reviewer assignment', async () => {
    const { rubric } = await publishedRubric();
    const call = await createCall();
    const review = await service.startReview(businessId, userId, call.id);
    await service.assignReview(businessId, userId, review.id, {
      assignedToUserId: userId,
    });
    expect(businessUserId).toBeTruthy();

    const otherBusiness = await prisma.business.create({
      data: {
        name: 'Other QA Business',
        slug: `voice-quality-other-${Date.now()}`,
      },
    });
    otherBusinessId = otherBusiness.id;
    const otherUser = await prisma.user.create({
      data: {
        email: `voice-quality-other-${Date.now()}@example.com`,
        passwordHash: 'x',
        name: 'Other reviewer',
      },
    });
    otherUserId = otherUser.id;
    const otherCls = new FakeClsService();
    otherCls.set(CLS_KEY_BUSINESS_ID, otherBusiness.id);
    otherCls.set(CLS_KEY_USER_ID, otherUser.id);
    const otherTenantPrisma = new TenantPrismaService(
      prisma,
      otherCls as unknown as ClsService,
    );
    const otherAudit = new AuditService(
      otherTenantPrisma,
      otherCls as unknown as ClsService,
    );
    const otherService = new VoiceQualityService(
      otherTenantPrisma,
      otherAudit,
      aiInfra as unknown as AiInfraService,
    );

    await expectErrorCode(
      otherService.startReview(otherBusiness.id, otherUser.id, call.id),
      'VOICE_QUALITY_CALL_NOT_REVIEWABLE',
    );
    await expectErrorCode(
      otherService.createDraftVersion(
        otherBusiness.id,
        otherUser.id,
        rubric.id,
        {
          name: rubric.name,
          criteria,
        },
      ),
      'VOICE_QUALITY_RUBRIC_NOT_FOUND',
    );

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: otherBusiness.id } });
      await tx.user.delete({ where: { id: otherUser.id } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    otherBusinessId = null;
    otherUserId = null;
  });

  it('erases quality score and evidence records when its source transcript is purged', async () => {
    await publishedRubric();
    const call = await createCall();
    const review = await service.startReview(businessId, userId, call.id);
    await service.saveReview(businessId, userId, review.id, {
      scores: [
        { criterionKey: 'accuracy', score: 1, evidenceTurnIndexes: [1] },
      ],
    });
    expect(await service.deleteForCall(businessId, call.id)).toBe(1);
    expect(
      await prisma.voiceQualityReview.count({ where: { callId: call.id } }),
    ).toBe(0);
    expect(await prisma.phoneCall.count({ where: { id: call.id } })).toBe(1);
  });
});
