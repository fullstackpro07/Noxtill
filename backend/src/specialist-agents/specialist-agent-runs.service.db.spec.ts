import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { AppException } from '../common/filters/app.exception';
import {
  recordSpecialistAgentRunCreatedEvent,
  recordSpecialistAgentRunTerminalEvent,
} from '../common/agents/specialist-agent-run-events.util';
import { SpecialistAgentRunsService } from './specialist-agent-runs.service';

jest.setTimeout(30_000);

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('SpecialistAgentRunsService (MySQL)', () => {
  let prisma: PrismaService;
  let service: SpecialistAgentRunsService;
  let cls: FakeClsService;
  let businessId: string;
  let otherBusinessId: string;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    service = new SpecialistAgentRunsService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
    );
    businessId = (
      await prisma.business.create({
        data: {
          name: 'Specialist Run Detail QA',
          slug: `specialist-run-detail-${stamp}`,
        },
      })
    ).id;
    otherBusinessId = (
      await prisma.business.create({
        data: {
          name: 'Specialist Run Detail Other QA',
          slug: `specialist-run-detail-other-${stamp}`,
        },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.business.deleteMany({
      where: { id: { in: [businessId, otherBusinessId] } },
    });
    await prisma.$disconnect();
  });

  it('returns safe run metadata and related counts without raw output or input references', async () => {
    const run = await prisma.specialistAgentRun.create({
      data: {
        businessId,
        agentKey: 'inventory_intelligence',
        agentVersion: '1.0.0',
        moduleId: '13',
        triggerType: 'manual',
        status: 'completed',
        errorMessage: 'Private diagnostic text must not be returned.',
        inputRefs: [{ source: 'qa', private: 'input reference' }],
        output: { summary: 'Private run output must not be returned.' },
      },
    });
    const recommendation = await prisma.specialistAgentRecommendation.create({
      data: {
        businessId,
        runId: run.id,
        agentKey: run.agentKey,
        title: 'QA recommendation',
        summary: 'Private recommendation text.',
        classification: 'review',
        confidenceMethod: 'not_calibrated',
        riskTier: 'low',
      },
    });
    await prisma.specialistAgentEvidence.create({
      data: {
        businessId,
        runId: run.id,
        recommendationId: recommendation.id,
        sourceType: 'inventory',
        resourceType: 'product',
        resourceId: 'internal-product-id',
        fieldRefs: ['stockQty'],
        observedValues: { private: 'evidence value' },
        observedAt: new Date(),
        freshness: 'fresh',
      },
    });
    await prisma.specialistAgentToolCall.create({
      data: {
        businessId,
        runId: run.id,
        agentKey: run.agentKey,
        moduleId: run.moduleId,
        toolKey: 'get_stock_summary',
        round: 1,
        sequence: 1,
        status: 'succeeded',
        inputSha256: 'a'.repeat(64),
        inputFields: ['branchId'],
        outputResourceType: 'InventorySnapshot',
        outputResourceId: 'internal-snapshot-id',
        correlationId: 'qa-tool-call-correlation',
      },
    });

    const result = await service.get(businessId, run.id);

    expect(result).toMatchObject({
      id: run.id,
      agentKey: 'inventory_intelligence',
      status: 'completed',
      relatedCounts: {
        recommendations: 1,
        evidence: 1,
        actions: 0,
        toolCalls: 1,
      },
      outputRedacted: true,
      detailLocation: 'canonical_module',
    });
    expect(result).not.toHaveProperty('output');
    expect(result).not.toHaveProperty('inputRefs');
    expect(result).not.toHaveProperty('errorMessage');
    expect(JSON.stringify(result)).not.toContain('Private');

    const evidence = await service.listEvidence(businessId, run.id);
    expect(evidence.items).toMatchObject([
      {
        sourceType: 'inventory',
        resourceType: 'product',
        resourceId: 'internal-product-id',
        fieldRefs: ['stockQty'],
        freshness: 'fresh',
      },
    ]);
    expect(evidence.observedValuesRedacted).toBe(true);
    expect(evidence.items[0]).not.toHaveProperty('observedValues');
    expect(JSON.stringify(evidence)).not.toContain('evidence value');

    const toolCalls = await service.listToolCalls(businessId, run.id);
    expect(toolCalls).toMatchObject({
      items: [
        {
          toolKey: 'get_stock_summary',
          status: 'succeeded',
          inputFields: ['branchId'],
          outputResourceType: 'InventorySnapshot',
          outputResourceId: 'internal-snapshot-id',
        },
      ],
      hasMore: false,
      inputValuesRedacted: true,
      outputValuesRedacted: true,
    });
    expect(JSON.stringify(toolCalls)).not.toContain('observed value');
  });

  it('persists a redacted run-created event atomically with the source run', async () => {
    const createdAt = new Date('2026-02-05T12:30:00.000Z');
    const run = await prisma.$transaction(async (tx) => {
      const created = await tx.specialistAgentRun.create({
        data: {
          businessId,
          agentKey: 'inventory_intelligence',
          agentVersion: '1.2.0',
          agentConfigVersion: 7,
          moduleId: '13',
          triggerType: 'event',
          status: 'running',
          initiatedByUserId: 'qa-operator',
          inputRefs: [{ secret: 'never copy input references into events' }],
          createdAt,
          startedAt: createdAt,
        },
      });
      await recordSpecialistAgentRunCreatedEvent(tx, created);
      return created;
    });

    const event = await prisma.specialistAgentRunEvent.findFirstOrThrow({
      where: { businessId, runId: run.id, eventName: 'agent.run.created' },
    });
    expect(event).toMatchObject({
      occurredAt: createdAt,
      sourceModule: '13',
      entityId: run.id,
      entityVersion: '1.2.0',
      correlationId: run.id,
      actorUserId: 'qa-operator',
      payload: {
        agentKey: 'inventory_intelligence',
        agentVersion: '1.2.0',
        agentConfigVersion: 7,
        triggerType: 'event',
      },
    });
    expect(JSON.stringify(event)).not.toContain('never copy input references');

    await prisma.$transaction((tx) =>
      recordSpecialistAgentRunCreatedEvent(tx, run),
    );
    expect(
      await prisma.specialistAgentRunEvent.count({
        where: { businessId, runId: run.id, eventName: 'agent.run.created' },
      }),
    ).toBe(1);

    const finishedAt = new Date('2026-02-05T12:32:00.000Z');
    await prisma.$transaction(async (tx) => {
      await tx.specialistAgentRun.update({
        where: { id: run.id },
        data: { status: 'completed', finishedAt },
      });
      await recordSpecialistAgentRunTerminalEvent(
        tx,
        run,
        'completed',
        finishedAt,
      );
    });
    const terminalEvent =
      await prisma.specialistAgentRunEvent.findFirstOrThrow({
        where: {
          businessId,
          runId: run.id,
          eventName: 'agent.run.completed',
        },
      });
    expect(terminalEvent).toMatchObject({
      occurredAt: finishedAt,
      sourceModule: '13',
      entityVersion: '1.2.0',
      payload: {
        agentKey: 'inventory_intelligence',
        status: 'completed',
        triggerType: 'event',
      },
    });
  });

  it('lists safe tenant-scoped runs with filters and cursor pagination', async () => {
    const older = await prisma.specialistAgentRun.create({
      data: {
        businessId,
        agentKey: 'inventory_intelligence',
        agentVersion: '1.0.0',
        moduleId: '13',
        triggerType: 'manual',
        status: 'failed',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        output: { secret: 'private-output' },
        inputRefs: [{ private: 'private-input' }],
      },
    });
    const newer = await prisma.specialistAgentRun.create({
      data: {
        businessId,
        agentKey: 'inventory_intelligence',
        agentVersion: '1.0.0',
        moduleId: '13',
        triggerType: 'event',
        status: 'failed',
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
      },
    });
    await prisma.specialistAgentRun.create({
      data: {
        businessId: otherBusinessId,
        agentKey: 'inventory_intelligence',
        agentVersion: '1.0.0',
        moduleId: '13',
        triggerType: 'manual',
        status: 'completed',
        createdAt: new Date('2026-01-04T00:00:00.000Z'),
      },
    });

    const firstPage = await service.list(businessId, {
      agentKey: 'inventory_intelligence',
      status: 'failed',
      limit: 1,
    });
    expect(firstPage.items.map((item) => item.id)).toEqual([newer.id]);
    expect(firstPage.nextCursor).toBe(newer.id);
    expect(firstPage.items[0]).not.toHaveProperty('output');
    expect(firstPage.items[0]).not.toHaveProperty('inputRefs');
    expect(JSON.stringify(firstPage)).not.toContain('private-');

    const secondPage = await service.list(businessId, {
      agentKey: 'inventory_intelligence',
      status: 'failed',
      limit: 1,
      cursor: firstPage.nextCursor ?? undefined,
    });
    expect(secondPage.items.map((item) => item.id)).toEqual([older.id]);
    expect(secondPage.nextCursor).toBeNull();
    await expect(
      service.list(businessId, { status: 'completed', cursor: older.id }),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_RUN_CURSOR_INVALID' },
    });
  });

  it('materializes safe, tenant-scoped lifecycle snapshots once from persisted run timestamps', async () => {
    const createdAt = new Date('2026-01-05T12:30:00.000Z');
    const finishedAt = new Date('2026-01-05T12:31:15.000Z');
    const terminalRun = await prisma.specialistAgentRun.create({
      data: {
        businessId,
        agentKey: 'inventory_intelligence',
        agentVersion: '1.2.0',
        agentConfigVersion: 7,
        moduleId: '13',
        triggerType: 'event',
        status: 'completed',
        createdAt,
        startedAt: createdAt,
        finishedAt,
        output: { secret: 'private model output' },
        inputRefs: [{ secret: 'private source reference' }],
      },
    });
    expect(terminalRun).toMatchObject({
      status: 'completed',
      finishedAt,
    });
    const runningRun = await prisma.specialistAgentRun.create({
      data: {
        businessId,
        agentKey: 'inventory_intelligence',
        agentVersion: '1.2.0',
        moduleId: '13',
        triggerType: 'scheduled',
        status: 'running',
        createdAt,
        startedAt: createdAt,
      },
    });
    const actionRecommendation =
      await prisma.specialistAgentRecommendation.create({
        data: {
          businessId,
          runId: terminalRun.id,
          agentKey: terminalRun.agentKey,
          title: 'QA action recommendation',
          summary: 'A persisted recommendation for lifecycle coverage.',
          classification: 'review',
          confidenceMethod: 'not_calibrated',
          riskTier: 'medium',
        },
      });
    const action = await prisma.specialistAgentAction.create({
      data: {
        businessId,
        runId: terminalRun.id,
        recommendationId: actionRecommendation.id,
        agentKey: terminalRun.agentKey,
        moduleId: terminalRun.moduleId,
        actionType: 'inventory_reorder_request',
        canonicalResourceType: 'ProcurementRequest',
        canonicalResourceId: 'qa-procurement-request',
        expectedVersion: 5,
        expectedPostcondition: { status: 'approved' },
        proposedPayload: { private: 'private proposed action payload' },
        reason: 'private action reason',
        evidenceRefs: [],
        assumptions: [],
        riskTier: 'medium',
        requiredApproval: true,
        idempotencyKeyHash: 'e'.repeat(64),
        correlationId: 'qa-action-correlation',
        state: 'verified',
      },
    });
    const revisedAction = await prisma.specialistAgentAction.create({
      data: {
        businessId,
        runId: terminalRun.id,
        recommendationId: actionRecommendation.id,
        agentKey: terminalRun.agentKey,
        moduleId: terminalRun.moduleId,
        actionType: 'inventory_reorder_request_revision',
        canonicalResourceType: 'ProcurementRequest',
        canonicalResourceId: 'qa-procurement-request-revision',
        expectedVersion: 6,
        expectedPostcondition: { status: 'approval_required' },
        proposedPayload: { private: 'private revised payload' },
        reason: 'private revised action reason',
        evidenceRefs: [],
        assumptions: [],
        riskTier: 'medium',
        requiredApproval: true,
        idempotencyKeyHash: 'f'.repeat(64),
        correlationId: 'qa-action-revision-correlation',
        state: 'proposed',
      },
    });
    await prisma.specialistAgentActionEvent.create({
      data: {
        businessId,
        actionId: revisedAction.id,
        eventType: 'proposal_updated',
        sequence: 1,
        fromState: 'proposed',
        toState: 'proposed',
        actorUserId: null,
        reason: 'private proposal revision reason',
        metadata: { private: 'private proposal revision data' },
        createdAt: new Date(createdAt.getTime() + 11_000),
      },
    });
    await prisma.specialistAgentActionEvent.createMany({
      data: [
        {
          businessId,
          actionId: action.id,
          eventType: 'created',
          sequence: 1,
          toState: 'approval_required',
          actorUserId: null,
          reason: 'private approval reason',
          metadata: { private: 'private event metadata' },
          createdAt: new Date(createdAt.getTime() + 10_000),
        },
        {
          businessId,
          actionId: action.id,
          eventType: 'approved',
          sequence: 2,
          fromState: 'approval_required',
          toState: 'approved',
          actorUserId: null,
          reason: 'private approval reason',
          metadata: { private: 'private approval metadata' },
          createdAt: new Date(createdAt.getTime() + 12_000),
        },
        {
          businessId,
          actionId: action.id,
          eventType: 'execution_started',
          sequence: 3,
          fromState: 'execution_queued',
          toState: 'executing',
          actorUserId: null,
          reason: 'private execution reason',
          metadata: { private: 'private execution metadata' },
          createdAt: new Date(createdAt.getTime() + 14_000),
        },
        {
          businessId,
          actionId: action.id,
          eventType: 'execution_failed',
          sequence: 4,
          fromState: 'executing',
          toState: 'failed',
          actorUserId: null,
          reason: 'private execution failure reason',
          metadata: { private: 'private failure metadata' },
          createdAt: new Date(createdAt.getTime() + 16_000),
        },
        {
          businessId,
          actionId: action.id,
          eventType: 'verification_requested',
          sequence: 5,
          fromState: 'succeeded',
          toState: 'verification_pending',
          actorUserId: null,
          reason: 'private verification request reason',
          metadata: { private: 'private verification request metadata' },
          createdAt: new Date(createdAt.getTime() + 18_000),
        },
        {
          businessId,
          actionId: action.id,
          eventType: 'verified',
          sequence: 6,
          fromState: 'verification_pending',
          toState: 'verified',
          actorUserId: null,
          reason: 'private verification reason',
          metadata: { private: 'private verification metadata' },
          createdAt: new Date(createdAt.getTime() + 20_000),
        },
      ],
    });

    const events = await service.listEvents(businessId, terminalRun.id);
    expect(
      events.items.map(({ eventName, occurredAt }) => ({
        eventName,
        occurredAt,
      })),
    ).toEqual([
      { eventName: 'agent.run.created', occurredAt: createdAt },
      {
        eventName: 'agent.action.awaiting_approval',
        occurredAt: new Date(createdAt.getTime() + 10_000),
      },
      {
        eventName: 'agent.action.proposal_updated',
        occurredAt: new Date(createdAt.getTime() + 11_000),
      },
      {
        eventName: 'agent.action.state_changed',
        occurredAt: new Date(createdAt.getTime() + 12_000),
      },
      {
        eventName: 'agent.action.state_changed',
        occurredAt: new Date(createdAt.getTime() + 14_000),
      },
      {
        eventName: 'agent.action.failed',
        occurredAt: new Date(createdAt.getTime() + 16_000),
      },
      {
        eventName: 'agent.action.state_changed',
        occurredAt: new Date(createdAt.getTime() + 18_000),
      },
      {
        eventName: 'agent.action.verified',
        occurredAt: new Date(createdAt.getTime() + 20_000),
      },
      { eventName: 'agent.run.completed', occurredAt: finishedAt },
    ]);
    expect(events.items[0]).toMatchObject({
      sourceModule: '13',
      entityId: terminalRun.id,
      entityVersion: '7',
      schemaVersion: 1,
      correlationId: terminalRun.id,
      actorUserId: null,
      payload: { agentKey: 'inventory_intelligence', triggerType: 'event' },
    });
    expect(events.items[1].payload).toMatchObject({
      actionType: 'inventory_reorder_request',
      fromState: null,
      state: 'approval_required',
      eventType: 'created',
    });
    expect(events.items[2].payload).toMatchObject({
      actionType: 'inventory_reorder_request_revision',
      fromState: 'proposed',
      state: 'proposed',
      eventType: 'proposal_updated',
    });
    expect(events.items[3].payload).toMatchObject({
      fromState: 'approval_required',
      state: 'approved',
      eventType: 'approved',
    });
    expect(events.items[4].payload).toMatchObject({
      fromState: 'execution_queued',
      state: 'executing',
      eventType: 'execution_started',
    });
    expect(events.items[5].payload).toMatchObject({
      fromState: 'executing',
      state: 'failed',
      eventType: 'execution_failed',
    });
    expect(events.items[6].payload).toMatchObject({
      fromState: 'succeeded',
      state: 'verification_pending',
      eventType: 'verification_requested',
    });
    expect(events.items[7].payload).toMatchObject({
      fromState: 'verification_pending',
      state: 'verified',
      eventType: 'verified',
    });
    expect(events.items[8]).toMatchObject({
      sourceModule: '13',
      entityId: terminalRun.id,
      entityVersion: '7',
      schemaVersion: 1,
      correlationId: terminalRun.id,
      actorUserId: null,
      payload: {
        agentKey: 'inventory_intelligence',
        status: 'completed',
        triggerType: 'event',
      },
    });
    expect(events.payloadValuesRedacted).toBe(true);
    expect(JSON.stringify(events)).not.toContain('private');

    const repeatedRead = await service.listEvents(businessId, terminalRun.id);
    expect(repeatedRead.items).toEqual(events.items);
    expect(events.items.map((event) => event.eventName)).toEqual([
      'agent.run.created',
      'agent.action.awaiting_approval',
      'agent.action.proposal_updated',
      'agent.action.state_changed',
      'agent.action.state_changed',
      'agent.action.failed',
      'agent.action.state_changed',
      'agent.action.verified',
      'agent.run.completed',
    ]);
    expect(
      await prisma.specialistAgentRunEvent.count({
        where: { businessId, runId: terminalRun.id },
      }),
    ).toBe(9);

    const recentPage = await service.listEvents(businessId, terminalRun.id, {
      limit: 5,
    });
    expect(recentPage.hasMore).toBe(true);
    expect(recentPage.items.map((event) => event.eventName)).toEqual([
      'agent.action.state_changed',
      'agent.action.failed',
      'agent.action.state_changed',
      'agent.action.verified',
      'agent.run.completed',
    ]);
    expect(recentPage.nextCursor).not.toBeNull();
    const earlierPage = await service.listEvents(businessId, terminalRun.id, {
      limit: 5,
      cursor: recentPage.nextCursor ?? undefined,
    });
    expect(earlierPage.hasMore).toBe(false);
    expect(earlierPage.nextCursor).toBeNull();
    expect(earlierPage.items.map((event) => event.eventName)).toEqual([
      'agent.run.created',
      'agent.action.awaiting_approval',
      'agent.action.proposal_updated',
      'agent.action.state_changed',
    ]);

    const runningEvents = await service.listEvents(businessId, runningRun.id);
    expect(runningEvents.items.map((event) => event.eventName)).toEqual([
      'agent.run.created',
    ]);
    expect(
      await prisma.specialistAgentRunEvent.count({
        where: { businessId, runId: runningRun.id },
      }),
    ).toBe(1);
  });

  it('does not return a run from another business', async () => {
    const otherRun = await prisma.specialistAgentRun.create({
      data: {
        businessId: otherBusinessId,
        agentKey: 'inventory_intelligence',
        agentVersion: '1.0.0',
        moduleId: '13',
        triggerType: 'manual',
        status: 'completed',
      },
    });

    await expect(service.get(businessId, otherRun.id)).rejects.toBeInstanceOf(
      AppException,
    );
    await expect(
      service.listEvidence(businessId, otherRun.id),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      service.listToolCalls(businessId, otherRun.id),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      service.listEvents(businessId, otherRun.id),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('labels each terminal run outcome accurately in its lifecycle timeline', async () => {
    const cases = [
      { status: 'failed', eventName: 'agent.run.failed' },
      { status: 'partial', eventName: 'agent.run.partial' },
      { status: 'partially_succeeded', eventName: 'agent.run.partial' },
      { status: 'cancelled', eventName: 'agent.run.cancelled' },
      { status: 'skipped', eventName: 'agent.run.skipped' },
    ];

    for (const [index, outcome] of cases.entries()) {
      const createdAt = new Date(Date.now() + index * 2_000);
      const run = await prisma.specialistAgentRun.create({
        data: {
          businessId,
          agentKey: 'inventory_intelligence',
          agentVersion: '1.0.0',
          moduleId: '13',
          triggerType: 'manual',
          status: outcome.status,
          createdAt,
          startedAt: createdAt,
          finishedAt: new Date(createdAt.getTime() + 1_000),
        },
      });

      const timeline = await service.listEvents(businessId, run.id);
      expect(timeline.items.at(-1)?.eventName).toBe(outcome.eventName);
      expect(timeline.items.at(-1)?.payload).toMatchObject({
        status: outcome.status,
      });
    }
  });

  it('rejects an evidence cursor from another run instead of falling back to an unscoped row', async () => {
    const currentRun = await prisma.specialistAgentRun.create({
      data: {
        businessId,
        agentKey: 'inventory_intelligence',
        agentVersion: '1.0.0',
        moduleId: '13',
        triggerType: 'manual',
        status: 'completed',
      },
    });
    const otherRun = await prisma.specialistAgentRun.create({
      data: {
        businessId,
        agentKey: 'inventory_intelligence',
        agentVersion: '1.0.0',
        moduleId: '13',
        triggerType: 'manual',
        status: 'completed',
      },
    });
    const otherEvidence = await prisma.specialistAgentEvidence.create({
      data: {
        businessId,
        runId: otherRun.id,
        sourceType: 'inventory',
        resourceType: 'product',
        resourceId: 'another-internal-id',
        fieldRefs: ['stockQty'],
        observedValues: {},
        observedAt: new Date(),
        freshness: 'fresh',
      },
    });

    await expect(
      service.listEvidence(businessId, currentRun.id, otherEvidence.id),
    ).rejects.toBeInstanceOf(AppException);
  });
});
