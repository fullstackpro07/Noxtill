import { ClsService } from 'nestjs-cls';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_USER_ID,
} from '../common/tenancy/tenant.constants';
import { AppException } from '../common/filters/app.exception';
import { VoiceIvrService, type VoiceIvrGraph } from './voice-ivr.service';

class FakeClsService {
  private readonly store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('VoiceIvrService (real MySQL)', () => {
  let prisma: PrismaService;
  let service: VoiceIvrService;
  let cls: FakeClsService;
  let businessId: string;
  let userId: string;
  let otherBusinessId: string;
  let flowId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    const tenant = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new VoiceIvrService(
      tenant,
      new AuditService(tenant, cls as unknown as ClsService),
    );

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const business = await prisma.business.create({
      data: { name: 'Voice IVR Test', slug: `voice-ivr-${suffix}` },
    });
    businessId = business.id;
    const user = await prisma.user.create({
      data: {
        email: `voice-ivr-${suffix}@example.com`,
        passwordHash: 'x',
        name: 'IVR QA Owner',
      },
    });
    userId = user.id;
    await prisma.businessUser.create({
      data: { businessId, userId, role: Role.owner },
    });
    const otherBusiness = await prisma.business.create({
      data: {
        name: 'Other Voice IVR Test',
        slug: `voice-ivr-other-${suffix}`,
      },
    });
    otherBusinessId = otherBusiness.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, userId);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      if (businessId) await tx.business.delete({ where: { id: businessId } });
      if (otherBusinessId)
        await tx.business.delete({ where: { id: otherBusinessId } });
      if (userId) await tx.user.delete({ where: { id: userId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  const validGraph = (): VoiceIvrGraph => ({
    nodes: [
      { id: 'start', type: 'start', label: 'Start' },
      { id: 'greeting', type: 'greeting', label: 'Welcome' },
      { id: 'end', type: 'end', label: 'End' },
    ],
    edges: [
      { id: 's-g', from: 'start', to: 'greeting', condition: 'default' },
      { id: 'g-e', from: 'greeting', to: 'end', condition: 'default' },
    ],
  });

  it('persists drafts, validates and simulates them, then publishes and rolls back immutably', async () => {
    const flow = await service.create(businessId, userId, {
      name: 'QA versioned IVR flow',
    });
    flowId = flow.id;

    const firstValidation = await service.validate(businessId, userId, flow.id);
    expect(firstValidation.valid).toBe(true);
    const firstSimulation = await service.simulate(
      businessId,
      userId,
      flow.id,
      {},
    );
    expect(firstSimulation).toMatchObject({
      valid: true,
      outcome: 'reached_end',
    });
    expect(firstSimulation.trace.map((step) => step.type)).toEqual([
      'start',
      'end',
    ]);

    const firstPublished = await service.publish(businessId, userId, flow.id, {
      expectedRevision: 0,
      changeSummary: 'Initial validated IVR snapshot',
    });
    expect(firstPublished.publishedVersion).toBe(1);

    const saved = await service.saveDraft(businessId, userId, flow.id, {
      expectedRevision: 1,
      graph: validGraph(),
    });
    expect(saved.revision).toBe(2);
    const secondPublished = await service.publish(businessId, userId, flow.id, {
      expectedRevision: 2,
      changeSummary: 'Add a greeting before the end',
    });
    expect(secondPublished.publishedVersion).toBe(2);

    const rolledBack = await service.rollback(businessId, userId, flow.id, {
      version: 1,
      expectedRevision: 3,
      reason: 'Restore the previous safe IVR flow',
    });
    expect(rolledBack.publishedVersion).toBe(3);
    expect(rolledBack.draftGraph).toMatchObject({
      nodes: [
        { id: 'start', type: 'start' },
        { id: 'end', type: 'end' },
      ],
    });
    expect(rolledBack.versions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          version: 3,
          status: 'rollback',
          rollbackSourceVersion: 1,
        }),
      ]),
    );
  });

  it('blocks publishing a branching graph without a default route and rejects stale revisions', async () => {
    const flow = await service.create(businessId, userId, {
      name: 'QA invalid IVR graph',
    });
    const invalid: VoiceIvrGraph = {
      nodes: [
        { id: 'start', type: 'start', label: 'Start' },
        { id: 'intent', type: 'speech_intent', label: 'Intent' },
        { id: 'end', type: 'end', label: 'End' },
      ],
      edges: [
        { id: 's-i', from: 'start', to: 'intent', condition: 'default' },
        { id: 'i-e', from: 'intent', to: 'end', condition: 'intent:support' },
      ],
    };
    await service.saveDraft(businessId, userId, flow.id, {
      expectedRevision: 0,
      graph: invalid,
    });
    const validation = await service.validate(businessId, userId, flow.id);
    expect(validation.valid).toBe(false);
    expect(validation.errors.map((issue) => issue.code)).toContain(
      'fallback_missing',
    );
    await expect(
      service.publish(businessId, userId, flow.id, {
        expectedRevision: 1,
        changeSummary: 'Attempt invalid graph publish',
      }),
    ).rejects.toBeInstanceOf(AppException);
    let conflict: unknown;
    try {
      await service.saveDraft(businessId, userId, flow.id, {
        expectedRevision: 0,
        graph: validGraph(),
      });
    } catch (error) {
      conflict = error;
    }
    expect(conflict).toBeInstanceOf(AppException);
    expect((conflict as AppException).getResponse()).toMatchObject({
      code: 'VOICE_IVR_REVISION_CONFLICT',
    });
  });

  it('does not disclose a flow to another tenant', async () => {
    cls.set(CLS_KEY_BUSINESS_ID, otherBusinessId);
    let notFound: unknown;
    try {
      await service.detail(otherBusinessId, flowId);
    } catch (error) {
      notFound = error;
    }
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    expect(notFound).toBeInstanceOf(AppException);
    expect((notFound as AppException).getResponse()).toMatchObject({
      code: 'VOICE_IVR_FLOW_NOT_FOUND',
    });
  });
});
