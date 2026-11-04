import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { AppException } from '../common/filters/app.exception';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';
import { createSpecialistAgentAction } from '../common/agents/specialist-agent-action.util';
import { SpecialistAgentActionsService } from './specialist-agent-actions.service';

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

describe('SpecialistAgentActionsService (MySQL)', () => {
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let service: SpecialistAgentActionsService;
  let cls: FakeClsService;
  let businessId: string;
  let otherBusinessId: string;
  let followUpActionCustomerId: string | undefined;
  let procurement: {
    decideRequest: jest.Mock;
    convertRequestToPurchaseOrder: jest.Mock;
    withdrawRequest: jest.Mock;
  };
  let commerceRfqs: { createFromProcurementRequest: jest.Mock };
  let customerSegments: {
    approve: jest.Mock;
    reject: jest.Mock;
    withdraw: jest.Mock;
  };
  let customerActions: { createTaskFromRecommendation: jest.Mock };
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    procurement = {
      decideRequest: jest.fn(),
      convertRequestToPurchaseOrder: jest.fn(),
      withdrawRequest: jest.fn(),
    };
    commerceRfqs = { createFromProcurementRequest: jest.fn() };
    customerSegments = {
      approve: jest.fn(),
      reject: jest.fn(),
      withdraw: jest.fn(),
    };
    customerActions = { createTaskFromRecommendation: jest.fn() };
    service = new SpecialistAgentActionsService(
      tenantPrisma,
      procurement as never,
      commerceRfqs as never,
      customerSegments as never,
      customerActions as never,
      new SpecialistAgentPolicyService(prisma, cls as unknown as ClsService),
    );
    businessId = (
      await prisma.business.create({
        data: {
          name: 'Specialist Action List QA',
          slug: `specialist-action-list-${stamp}`,
        },
      })
    ).id;
    otherBusinessId = (
      await prisma.business.create({
        data: {
          name: 'Specialist Action List Other QA',
          slug: `specialist-action-list-other-${stamp}`,
        },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    if (followUpActionCustomerId) {
      await prisma.customerFollowUpTask.deleteMany({
        where: { businessId, customerId: followUpActionCustomerId },
      });
      await prisma.customer.deleteMany({
        where: { id: followUpActionCustomerId, businessId },
      });
    }
    await prisma.business.deleteMany({
      where: { id: { in: [businessId, otherBusinessId] } },
    });
    await prisma.$disconnect();
  });

  async function createAction(input: {
    businessId: string;
    agentKey: string;
    actionType: string;
    state: string;
    createdAt: Date;
    reason?: string;
    proposedPayload?: object;
    errorMessage?: string;
    expectedVersion?: number;
    canonicalResourceType?: string;
    canonicalResourceId?: string;
  }) {
    const moduleIdByAgent: Record<string, string> = {
      inventory_intelligence: '13',
      financial_intelligence: '30',
      customer_intelligence: '7',
      seo_autopilot: '28',
      autonomous_commerce: '29',
    };
    const moduleId = moduleIdByAgent[input.agentKey] ?? 'shared';
    const run = await prisma.specialistAgentRun.create({
      data: {
        businessId: input.businessId,
        agentKey: input.agentKey,
        agentVersion: '1.0.0',
        moduleId,
        triggerType: 'manual',
        status: 'completed',
      },
    });
    const recommendation = await prisma.specialistAgentRecommendation.create({
      data: {
        businessId: input.businessId,
        runId: run.id,
        agentKey: input.agentKey,
        title: 'QA action proposal',
        summary: 'A test-only recommendation.',
        classification: 'review',
        confidenceMethod: 'not_calibrated',
        riskTier: 'low',
      },
    });
    return prisma.specialistAgentAction.create({
      data: {
        businessId: input.businessId,
        runId: run.id,
        recommendationId: recommendation.id,
        agentKey: input.agentKey,
        moduleId,
        actionType: input.actionType,
        canonicalResourceType: input.canonicalResourceType ?? 'qa_resource',
        canonicalResourceId: input.canonicalResourceId ?? `qa-${run.id}`,
        expectedVersion: input.expectedVersion ?? null,
        expectedPostcondition: { status: 'reviewed' },
        proposedPayload: input.proposedPayload ?? { private: 'do-not-return' },
        reason: input.reason ?? 'Private proposal rationale for QA.',
        idempotencyKeyHash: run.id
          .replaceAll('-', '')
          .padEnd(64, 'a')
          .slice(0, 64),
        correlationId: `qa-correlation-${run.id}`,
        riskTier: 'low',
        requiredApproval: true,
        state: input.state,
        errorMessage:
          input.errorMessage ?? 'Private provider diagnostic for QA.',
        createdAt: input.createdAt,
      },
    });
  }

  it('returns only this tenant actions and excludes proposal and free-text fields', async () => {
    const createdAt = new Date('2026-01-01T12:00:00.000Z');
    const own = await createAction({
      businessId,
      agentKey: 'inventory_intelligence',
      actionType: 'create_count_task',
      state: 'proposed',
      createdAt,
    });
    await createAction({
      businessId: otherBusinessId,
      agentKey: 'inventory_intelligence',
      actionType: 'create_count_task',
      state: 'proposed',
      createdAt,
    });

    const result = await service.list(businessId, { moduleId: '13' });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe(own.id);
    expect(result.items[0]).not.toHaveProperty('proposedPayload');
    expect(result.items[0]).not.toHaveProperty('reason');
    expect(result.items[0]).not.toHaveProperty('actualResult');
    expect(result.items[0]).not.toHaveProperty('errorMessage');
    expect(JSON.stringify(result)).not.toContain('Private');
  });

  it('returns an owner-safe action timeline without payloads, reasons or diagnostics', async () => {
    const action = await createAction({
      businessId,
      agentKey: 'inventory_intelligence',
      actionType: 'create_count_task',
      state: 'approved',
      createdAt: new Date('2026-01-04T12:00:00.000Z'),
    });
    await prisma.specialistAgentActionEvent.createMany({
      data: [
        {
          businessId,
          actionId: action.id,
          eventType: 'approved',
          sequence: 2,
          fromState: 'awaiting_approval',
          toState: 'approved',
          actorUserId: 'qa-approver',
          reason: 'Private approval reason must not be returned.',
          metadata: { private: 'approval metadata' },
        },
        {
          businessId,
          actionId: action.id,
          eventType: 'proposed',
          sequence: 1,
          toState: 'awaiting_approval',
          actorUserId: 'qa-creator',
          reason: 'Private proposal reason must not be returned.',
          metadata: { private: 'proposal metadata' },
        },
      ],
    });

    const result = await service.get(businessId, action.id);

    expect(result.id).toBe(action.id);
    expect(result.eventHistory.map((event) => event.sequence)).toEqual([1, 2]);
    expect(result.eventHistory[1]).toMatchObject({
      eventType: 'approved',
      fromState: 'awaiting_approval',
      toState: 'approved',
      actorUserId: 'qa-approver',
    });
    for (const privateField of [
      'proposedPayload',
      'expectedPostcondition',
      'reason',
      'approvalReason',
      'rejectionReason',
      'actualResult',
      'verificationResult',
      'errorMessage',
      'events',
    ]) {
      expect(result).not.toHaveProperty(privateField);
    }
    expect(result.eventHistory[1]).not.toHaveProperty('reason');
    expect(result.eventHistory[1]).not.toHaveProperty('metadata');
    expect(JSON.stringify(result)).not.toContain('Private');
    expect(JSON.stringify(result)).not.toContain('private');

    cls.set(CLS_KEY_BUSINESS_ID, otherBusinessId);
    await expect(service.get(otherBusinessId, action.id)).rejects.toMatchObject(
      {
        response: { code: 'SPECIALIST_ACTION_NOT_FOUND' },
      },
    );
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  it('filters actions and paginates deterministically with a scoped cursor', async () => {
    const older = await createAction({
      businessId,
      agentKey: 'inventory_intelligence',
      actionType: 'pagination_review',
      state: 'proposed',
      createdAt: new Date('2026-01-01T12:00:00.000Z'),
    });
    const newer = await createAction({
      businessId,
      agentKey: 'inventory_intelligence',
      actionType: 'pagination_review',
      state: 'approved',
      createdAt: new Date('2026-01-02T12:00:00.000Z'),
    });
    await createAction({
      businessId,
      agentKey: 'seo_autopilot',
      actionType: 'pagination_review',
      state: 'proposed',
      createdAt: new Date('2026-01-03T12:00:00.000Z'),
    });

    const first = await service.list(businessId, {
      agentKey: 'inventory_intelligence',
      actionType: 'pagination_review',
      limit: 1,
    });
    expect(first.items.map((item) => item.id)).toEqual([newer.id]);
    expect(first.nextCursor).toBe(newer.id);

    const second = await service.list(businessId, {
      agentKey: 'inventory_intelligence',
      actionType: 'pagination_review',
      limit: 1,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.items.map((item) => item.id)).toEqual([older.id]);
    expect(second.nextCursor).toBeNull();
  });

  it('rejects a cursor from another tenant or outside the active filter', async () => {
    const foreign = await createAction({
      businessId: otherBusinessId,
      agentKey: 'inventory_intelligence',
      actionType: 'create_count_task',
      state: 'proposed',
      createdAt: new Date(),
    });
    const wrongFilter = await createAction({
      businessId,
      agentKey: 'seo_autopilot',
      actionType: 'create_content_brief',
      state: 'proposed',
      createdAt: new Date(),
    });

    async function expectInvalidCursor(cursor: string, agentKey?: string) {
      try {
        await service.list(businessId, {
          cursor,
          ...(agentKey ? { agentKey } : {}),
        });
        fail('Expected the cursor to be refused.');
      } catch (error) {
        expect(error).toBeInstanceOf(AppException);
        expect((error as AppException).getResponse()).toEqual(
          expect.objectContaining({ code: 'SPECIALIST_ACTION_CURSOR_INVALID' }),
        );
      }
    }

    await expectInvalidCursor(foreign.id);
    await expectInvalidCursor(wrongFilter.id, 'inventory_intelligence');
  });

  it('enforces the per-run action ceiling and keeps retries idempotent', async () => {
    const run = await prisma.specialistAgentRun.create({
      data: {
        businessId,
        agentKey: 'inventory_intelligence',
        agentVersion: '1.0.0',
        moduleId: '13',
        triggerType: 'manual',
        status: 'completed',
      },
    });
    const recommendation = await prisma.specialistAgentRecommendation.create({
      data: {
        businessId,
        runId: run.id,
        agentKey: run.agentKey,
        title: 'QA action budget proposal',
        summary: 'Test-only material action.',
        classification: 'review',
        confidenceMethod: 'not_calibrated',
        riskTier: 'low',
      },
    });
    const priorBusiness = await prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { policies: true },
    });
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: { 'agents.maxMaterialActionsPerRun': 1 } },
    });

    const makeInput = (suffix: string) => ({
      data: {
        businessId,
        runId: run.id,
        recommendationId: recommendation.id,
        agentKey: run.agentKey,
        moduleId: '13',
        actionType: 'qa_review',
        canonicalResourceType: 'qa_resource',
        canonicalResourceId: `qa-action-budget-${suffix}`,
        expectedPostcondition: { status: 'reviewed' },
        proposedPayload: { value: suffix },
        reason: 'Created only to test the specialist action ceiling.',
        evidenceRefs: [],
        assumptions: [],
        riskTier: 'low',
        requiredApproval: true,
        idempotencyKeyHash: `${run.id.replaceAll('-', '')}${suffix}`
          .padEnd(64, 'a')
          .slice(0, 64),
        correlationId: `qa-action-budget-${suffix}`,
        state: 'proposed',
      },
      actorUserId: 'qa-owner',
      reason: 'QA action budget verification.',
    });

    try {
      const first = await tenantPrisma.client.$transaction((tx) =>
        createSpecialistAgentAction(tx, makeInput('first')),
      );
      const retry = await tenantPrisma.client.$transaction((tx) =>
        createSpecialistAgentAction(tx, makeInput('first')),
      );
      expect(retry.id).toBe(first.id);
      expect(
        await prisma.specialistAgentAction.count({ where: { runId: run.id } }),
      ).toBe(1);
      await expect(
        tenantPrisma.client.$transaction((tx) =>
          createSpecialistAgentAction(tx, makeInput('second')),
        ),
      ).rejects.toMatchObject({
        response: { code: 'SPECIALIST_AGENT_ACTION_RUN_LIMIT_REACHED' },
      });

      const event = await prisma.specialistAgentActionEvent.findFirstOrThrow({
        where: { actionId: first.id },
      });
      expect(event.metadata).toMatchObject({
        maxActionsPerRun: 1,
        actionCountForRun: 1,
      });
    } finally {
      await prisma.business.update({
        where: { id: businessId },
        data: { policies: priorBusiness.policies ?? {} },
      });
    }
  });

  it('serializes concurrent action proposals so they cannot exceed the run ceiling', async () => {
    const run = await prisma.specialistAgentRun.create({
      data: {
        businessId,
        agentKey: 'inventory_intelligence',
        agentVersion: '1.0.0',
        moduleId: '13',
        triggerType: 'manual',
        status: 'completed',
      },
    });
    const recommendation = await prisma.specialistAgentRecommendation.create({
      data: {
        businessId,
        runId: run.id,
        agentKey: run.agentKey,
        title: 'Concurrent action cap QA',
        summary: 'Test-only concurrency proposal.',
        classification: 'review',
        confidenceMethod: 'not_calibrated',
        riskTier: 'low',
      },
    });
    const priorBusiness = await prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { policies: true },
    });
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: { 'agents.maxMaterialActionsPerRun': 1 } },
    });
    const makeInput = (suffix: string) => ({
      data: {
        businessId,
        runId: run.id,
        recommendationId: recommendation.id,
        agentKey: run.agentKey,
        moduleId: '13',
        actionType: 'qa_concurrent_review',
        canonicalResourceType: 'qa_resource',
        canonicalResourceId: `qa-action-concurrent-${suffix}`,
        expectedPostcondition: { status: 'reviewed' },
        proposedPayload: { value: suffix },
        reason: 'Created only to test concurrent action proposals.',
        evidenceRefs: [],
        assumptions: [],
        riskTier: 'low',
        requiredApproval: true,
        idempotencyKeyHash: `${run.id.replaceAll('-', '')}${suffix}`
          .padEnd(64, 'b')
          .slice(0, 64),
        correlationId: `qa-action-concurrent-${suffix}`,
        state: 'proposed',
      },
      actorUserId: 'qa-owner',
      reason: 'QA concurrent action ceiling verification.',
    });

    try {
      const results = await Promise.allSettled([
        tenantPrisma.client.$transaction((tx) =>
          createSpecialistAgentAction(tx, makeInput('first')),
        ),
        tenantPrisma.client.$transaction((tx) =>
          createSpecialistAgentAction(tx, makeInput('second')),
        ),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      const refused = results.find((result) => result.status === 'rejected');
      expect(refused?.status).toBe('rejected');
      if (refused?.status === 'rejected') {
        expect(refused.reason).toMatchObject({
          response: { code: 'SPECIALIST_AGENT_ACTION_RUN_LIMIT_REACHED' },
        });
      }
      expect(
        await prisma.specialistAgentAction.count({ where: { runId: run.id } }),
      ).toBe(1);
    } finally {
      await prisma.business.update({
        where: { id: businessId },
        data: { policies: priorBusiness.policies ?? {} },
      });
    }
  });

  it('routes supported inventory decisions to canonical Procurement and refuses stale state', async () => {
    procurement.decideRequest.mockResolvedValue({ status: 'approved' });
    const pending = await createAction({
      businessId,
      agentKey: 'inventory_intelligence',
      actionType: 'inventory_reorder_request',
      state: 'approval_required',
      createdAt: new Date(),
      expectedVersion: 1,
      canonicalResourceType: 'ProcurementRequest',
      canonicalResourceId: 'canonical-request-1',
    });

    await expect(
      service.approve(businessId, 'reviewer-id', pending.id, {
        expectedVersion: 1,
      }),
    ).resolves.toEqual({ status: 'approved' });
    expect(procurement.decideRequest).toHaveBeenCalledWith(
      businessId,
      'reviewer-id',
      'canonical-request-1',
      { decision: 'approve', expectedVersion: 1 },
    );

    const stale = await createAction({
      businessId,
      agentKey: 'inventory_intelligence',
      actionType: 'inventory_reorder_request',
      state: 'proposed',
      createdAt: new Date(),
      canonicalResourceType: 'ProcurementRequest',
      canonicalResourceId: 'canonical-request-2',
    });
    await expect(
      service.approve(businessId, 'reviewer-id', stale.id, {}),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_ACTION_STATE_CONFLICT' },
    });
    expect(procurement.decideRequest).toHaveBeenCalledTimes(1);
  });

  it('rechecks the agent switch before approval but allows a safe cancellation while disabled', async () => {
    const pending = await createAction({
      businessId,
      agentKey: 'inventory_intelligence',
      actionType: 'inventory_reorder_request',
      state: 'approval_required',
      createdAt: new Date(),
      expectedVersion: 1,
      canonicalResourceType: 'ProcurementRequest',
      canonicalResourceId: 'canonical-request-disabled-approval',
    });
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: { 'agents.inventoryEnabled': false } },
    });
    procurement.decideRequest.mockClear();
    procurement.withdrawRequest.mockResolvedValue({ status: 'cancelled' });

    try {
      await expect(
        service.approve(businessId, 'reviewer-id', pending.id, {}),
      ).rejects.toMatchObject({
        response: { code: 'SPECIALIST_AGENT_DISABLED' },
      });
      expect(procurement.decideRequest).not.toHaveBeenCalled();
      await expect(
        service.cancel(businessId, 'reviewer-id', pending.id, {
          reason: 'The agent was turned off before approval.',
          expectedVersion: 1,
        }),
      ).resolves.toEqual({ status: 'cancelled' });
    } finally {
      await prisma.business.update({
        where: { id: businessId },
        data: { policies: {} },
      });
    }
  });

  it('refuses canonical execution when the agent is disabled after approval', async () => {
    const approved = await createAction({
      businessId,
      agentKey: 'inventory_intelligence',
      actionType: 'inventory_reorder_request',
      state: 'approved',
      createdAt: new Date(),
      canonicalResourceType: 'ProcurementRequest',
      canonicalResourceId: 'canonical-request-disabled-execution',
    });
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: { 'agents.inventoryEnabled': false } },
    });
    procurement.convertRequestToPurchaseOrder.mockClear();

    try {
      await expect(
        service.execute(businessId, 'reviewer-id', approved.id, {}),
      ).rejects.toMatchObject({
        response: { code: 'SPECIALIST_AGENT_DISABLED' },
      });
      expect(procurement.convertRequestToPurchaseOrder).not.toHaveBeenCalled();
    } finally {
      await prisma.business.update({
        where: { id: businessId },
        data: { policies: {} },
      });
    }
  });

  it('requires exact Customer segment version and hashes before canonical approval', async () => {
    customerSegments.approve.mockResolvedValue({ state: 'applied' });
    const pending = await createAction({
      businessId,
      agentKey: 'customer_intelligence',
      actionType: 'customer_segment_draft_v2',
      state: 'approval_required',
      createdAt: new Date(),
      canonicalResourceType: 'specialist_agent_recommendation',
      canonicalResourceId: 'canonical-recommendation-1',
    });
    const hashes = {
      expectedPayloadHash: 'a'.repeat(64),
      expectedCountsHash: 'b'.repeat(64),
    };

    await expect(
      service.approve(businessId, 'reviewer-id', pending.id, {
        expectedVersion: 2,
        ...hashes,
      }),
    ).resolves.toEqual({ state: 'applied' });
    expect(customerSegments.approve).toHaveBeenCalledWith(
      'reviewer-id',
      'canonical-recommendation-1',
      { expectedVersion: 2, ...hashes },
    );

    await expect(
      service.approve(businessId, 'reviewer-id', pending.id, {
        expectedVersion: 1,
        ...hashes,
      }),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_ACTION_APPROVAL_EVIDENCE_REQUIRED' },
    });
    expect(customerSegments.approve).toHaveBeenCalledTimes(1);
  });

  it('withdraws the exact pending Customer segment version through its canonical service', async () => {
    customerSegments.withdraw.mockResolvedValue({ state: 'draft' });
    const pending = await createAction({
      businessId,
      agentKey: 'customer_intelligence',
      actionType: 'customer_segment_draft_v3',
      state: 'approval_required',
      createdAt: new Date(),
      canonicalResourceType: 'specialist_agent_recommendation',
      canonicalResourceId: 'customer-segment-withdrawal-review',
    });

    await expect(
      service.cancel(businessId, 'owner-id', pending.id, {
        expectedVersion: 3,
        reason: 'The audience rules need another review.',
      }),
    ).resolves.toEqual({ state: 'draft' });
    expect(customerSegments.withdraw).toHaveBeenCalledWith(
      'owner-id',
      'customer-segment-withdrawal-review',
      {
        expectedVersion: 3,
        reason: 'The audience rules need another review.',
      },
    );

    await expect(
      service.cancel(businessId, 'owner-id', pending.id, {
        expectedVersion: 2,
        reason: 'Stale version should not withdraw this proposal.',
      }),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_ACTION_VERSION_REQUIRED' },
    });
    expect(customerSegments.withdraw).toHaveBeenCalledTimes(1);
  });

  it('does not route a different agent action through the Customer segment adapter', async () => {
    customerSegments.withdraw.mockClear();
    const unrelated = await createAction({
      businessId,
      agentKey: 'inventory_intelligence',
      actionType: 'customer_segment_draft_v3',
      state: 'approval_required',
      createdAt: new Date(),
      canonicalResourceType: 'specialist_agent_recommendation',
      canonicalResourceId: 'unrelated-agent-action',
    });

    await expect(
      service.cancel(businessId, 'owner-id', unrelated.id, {
        expectedVersion: 3,
        reason: 'This is not a Customer segment action.',
      }),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_ACTION_CANONICAL_FLOW_REQUIRED' },
    });
    expect(customerSegments.withdraw).not.toHaveBeenCalled();
  });

  it('approves and executes a Customer follow-up only through the canonical CRM task service', async () => {
    const customer = await prisma.customer.create({
      data: {
        businessId,
        name: 'Specialist follow-up action QA',
        phone: '+15555550123',
      },
      select: { id: true },
    });
    followUpActionCustomerId = customer.id;
    const pending = await createAction({
      businessId,
      agentKey: 'customer_intelligence',
      actionType: 'customer_follow_up_task',
      state: 'approval_required',
      createdAt: new Date(),
      expectedVersion: 1,
      canonicalResourceType: 'specialist_agent_recommendation',
      canonicalResourceId: 'customer-follow-up-recommendation-1',
    });
    const task = await prisma.customerFollowUpTask.create({
      data: {
        businessId,
        customerId: customer.id,
        title: 'Review customer follow-up',
        reason: 'An owner-approved internal follow-up task.',
        idempotencyKey: 'qa-specialist-follow-up-action',
        payloadHash: 'a'.repeat(64),
        createdByUserId: 'reviewer-id',
      },
    });
    customerActions.createTaskFromRecommendation.mockResolvedValue(task);

    const approval = await service.approve(
      businessId,
      'reviewer-id',
      pending.id,
      { expectedVersion: 1 },
    );
    expect(approval).toMatchObject({ state: 'approved' });
    await expect(
      service.execute(businessId, 'reviewer-id', pending.id, {
        expectedVersion: 1,
      }),
    ).resolves.toMatchObject({
      actionId: pending.id,
      state: 'verified',
      canonicalOperationId: task.id,
      taskStatus: 'open',
      sendsMessage: false,
      providerConfirmed: false,
    });

    expect(customerActions.createTaskFromRecommendation).toHaveBeenCalledWith(
      businessId,
      'reviewer-id',
      'customer-follow-up-recommendation-1',
    );
    const persisted = await prisma.specialistAgentAction.findFirstOrThrow({
      where: { id: pending.id, businessId },
      include: { events: { orderBy: { sequence: 'asc' } } },
    });
    expect(persisted).toMatchObject({
      state: 'verified',
      canonicalOperationId: task.id,
      actualResult: {
        taskStatus: 'open',
        sendsMessage: false,
        providerConfirmed: false,
      },
      verificationResult: { exists: true, taskStatus: 'open' },
    });
    expect(persisted.events.map((event) => event.toState)).toEqual([
      'approved',
      'execution_queued',
      'executing',
      'succeeded',
      'verification_pending',
      'verified',
    ]);
  });

  it('executes approved inventory proposals only through canonical Procurement', async () => {
    procurement.convertRequestToPurchaseOrder.mockResolvedValue({
      id: 'canonical-po-1',
    });
    const approved = await createAction({
      businessId,
      agentKey: 'inventory_intelligence',
      actionType: 'inventory_reorder_request',
      state: 'approved',
      createdAt: new Date(),
      expectedVersion: 3,
      canonicalResourceType: 'ProcurementRequest',
      canonicalResourceId: 'canonical-request-3',
    });

    await expect(
      service.execute(businessId, 'reviewer-id', approved.id, {
        expectedVersion: 2,
      }),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_ACTION_VERSION_CONFLICT' },
    });
    expect(procurement.convertRequestToPurchaseOrder).not.toHaveBeenCalled();

    await expect(
      service.execute(businessId, 'reviewer-id', approved.id, {
        expectedVersion: 3,
      }),
    ).resolves.toEqual({ id: 'canonical-po-1' });
    expect(procurement.convertRequestToPurchaseOrder).toHaveBeenCalledWith(
      businessId,
      'reviewer-id',
      'canonical-request-3',
      3,
    );
  });

  it('refuses an Inventory approval when the proposal version is missing or stale', async () => {
    const pending = await createAction({
      businessId,
      agentKey: 'inventory_intelligence',
      actionType: 'inventory_reorder_request',
      state: 'approval_required',
      createdAt: new Date(),
      expectedVersion: 4,
      canonicalResourceType: 'ProcurementRequest',
      canonicalResourceId: 'canonical-request-version-bound',
    });
    procurement.decideRequest.mockClear();

    await expect(
      service.approve(businessId, 'reviewer-id', pending.id, {}),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_ACTION_VERSION_CONFLICT' },
    });
    await expect(
      service.approve(businessId, 'reviewer-id', pending.id, {
        expectedVersion: 3,
      }),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_ACTION_VERSION_CONFLICT' },
    });
    expect(procurement.decideRequest).not.toHaveBeenCalled();

    procurement.decideRequest.mockResolvedValue({ status: 'approved' });
    await expect(
      service.approve(businessId, 'reviewer-id', pending.id, {
        expectedVersion: 4,
      }),
    ).resolves.toEqual({ status: 'approved' });
    expect(procurement.decideRequest).toHaveBeenCalledWith(
      businessId,
      'reviewer-id',
      'canonical-request-version-bound',
      { decision: 'approve', expectedVersion: 4 },
    );
  });

  it('cancels only pending inventory actions through canonical Procurement with a reason', async () => {
    procurement.withdrawRequest.mockResolvedValue({ status: 'cancelled' });
    const pending = await createAction({
      businessId,
      agentKey: 'inventory_intelligence',
      actionType: 'inventory_reorder_request',
      state: 'approval_required',
      createdAt: new Date(),
      expectedVersion: 2,
      canonicalResourceType: 'ProcurementRequest',
      canonicalResourceId: 'canonical-request-4',
    });

    await expect(
      service.cancel(businessId, 'reviewer-id', pending.id, {
        reason: 'Supplier terms changed.',
        expectedVersion: 2,
      }),
    ).resolves.toEqual({ status: 'cancelled' });
    expect(procurement.withdrawRequest).toHaveBeenCalledWith(
      businessId,
      'reviewer-id',
      'canonical-request-4',
      true,
      'Supplier terms changed.',
      2,
    );
  });
});
