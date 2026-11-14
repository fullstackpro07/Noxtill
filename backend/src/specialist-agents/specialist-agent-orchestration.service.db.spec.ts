import { ClsService } from 'nestjs-cls';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { createSpecialistAgentParentRunRef } from '../common/agents/specialist-agent-run-options';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';
import {
  SpecialistAgentOrchestrationJobData,
  SpecialistOrchestrationChild,
  SpecialistAgentOrchestrationService,
} from './specialist-agent-orchestration.service';

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

describe('SpecialistAgentOrchestrationService (MySQL)', () => {
  let prisma: PrismaService;
  let service: SpecialistAgentOrchestrationService;
  let businessId: string;
  let otherBusinessId: string;
  let disabledBusinessId: string;
  let cls: FakeClsService;
  const inventoryRuns = jest.fn();
  const inventoryRunKeys: string[] = [];
  const financeRuns = jest.fn();
  const queueAdd = jest.fn((_name: string, _data: unknown, _options: unknown) =>
    Promise.resolve({ id: 'queued-job' }),
  );
  let failNextInventoryRun = false;
  let cancelParentRunId: string | null = null;
  let disableFinanceAfterInventory = false;
  let disableFinanceModuleAfterInventory = false;
  const stamp = Date.now();
  const ownerUserId = `specialist-orchestration-owner-${stamp}`;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    const tenant = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const inventory = {
      run: async (
        childBusinessId: string,
        actorUserId: string,
        idempotencyKey: string,
        options: { parentRunId?: string },
      ) => {
        inventoryRuns(idempotencyKey);
        inventoryRunKeys.push(idempotencyKey);
        const shouldFail = failNextInventoryRun;
        failNextInventoryRun = false;
        const childRun = await prisma.specialistAgentRun.create({
          data: {
            businessId: childBusinessId,
            agentKey: 'inventory_intelligence',
            agentVersion: '1.0.0',
            moduleId: '13',
            triggerType: 'manual',
            status: shouldFail ? 'failed' : 'completed',
            errorCode: shouldFail ? 'FIXTURE_TRANSIENT_FAILURE' : null,
            initiatedByUserId: actorUserId,
            inputRefs: options.parentRunId
              ? [createSpecialistAgentParentRunRef(options.parentRunId)]
              : [],
            output: { summary: 'Saved child run fixture' },
          },
        });
        const requestedParentRunId = cancelParentRunId;
        if (
          requestedParentRunId &&
          requestedParentRunId === options.parentRunId
        ) {
          cancelParentRunId = null;
          await service.cancelRun(childBusinessId, requestedParentRunId, ownerUserId);
        }
        if (disableFinanceAfterInventory) {
          disableFinanceAfterInventory = false;
          const business = await prisma.business.findUniqueOrThrow({
            where: { id: childBusinessId },
            select: { policies: true },
          });
          await prisma.business.update({
            where: { id: childBusinessId },
            data: {
              policies: {
                ...((business.policies as Prisma.JsonObject | null) ?? {}),
                'agents.financeEnabled': false,
              },
            },
          });
        }
        if (disableFinanceModuleAfterInventory) {
          disableFinanceModuleAfterInventory = false;
          await prisma.business.update({
            where: { id: childBusinessId },
            data: { disabledModules: ['profit'] },
          });
        }
        return childRun;
      },
    };
    const finance = {
      run: (...args: unknown[]) => {
        financeRuns(...args);
        return Promise.reject(
          new Error(
            'Finance review should not start after its switch is disabled.',
          ),
        );
      },
    };
    service = new SpecialistAgentOrchestrationService(
      tenant,
      prisma,
      cls as unknown as ClsService,
      inventory as never,
      finance as never,
      {} as never,
      {} as never,
      {} as never,
      new SpecialistAgentPolicyService(prisma, cls as unknown as ClsService),
      { add: queueAdd } as never,
    );
    businessId = (
      await prisma.business.create({
        data: {
          name: 'Specialist Orchestration QA',
          slug: `specialist-orchestration-${stamp}`,
          policies: {
            'agents.inventoryEnabled': true,
            'agents.financeEnabled': false,
            'agents.customerEnabled': false,
            'agents.seoEnabled': false,
            'agents.commerceEnabled': false,
            'commerce.autonomyLevel': 0,
          },
        },
      })
    ).id;
    await prisma.user.create({
      data: {
        id: ownerUserId,
        email: `${ownerUserId}@example.test`,
        name: 'Specialist Orchestration Owner',
        passwordHash: 'unused-test-password-hash',
      },
    });
    await prisma.businessUser.create({
      data: { businessId, userId: ownerUserId, role: 'owner' },
    });
    otherBusinessId = (
      await prisma.business.create({
        data: {
          name: 'Specialist Orchestration Other QA',
          slug: `specialist-orchestration-other-${stamp}`,
        },
      })
    ).id;
    disabledBusinessId = (
      await prisma.business.create({
        data: {
          name: 'Specialist Orchestration Disabled QA',
          slug: `specialist-orchestration-disabled-${stamp}`,
          policies: {
            'agents.inventoryEnabled': false,
            'agents.financeEnabled': false,
            'agents.customerEnabled': false,
            'agents.seoEnabled': false,
            'agents.commerceEnabled': true,
            'commerce.autonomyLevel': 0,
          },
          disabledModules: ['inventory'],
        },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: {
        businessId: { in: [businessId, otherBusinessId, disabledBusinessId] },
        action: 'specialist_agent.orchestration_cross_tenant_access_denied',
      },
    });
    await prisma.businessUser.deleteMany({ where: { userId: ownerUserId } });
    await prisma.business.deleteMany({
      where: { id: { in: [businessId, otherBusinessId, disabledBusinessId] } },
    });
    await prisma.user.deleteMany({ where: { id: ownerUserId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.business.update({
      where: { id: businessId },
      data: { active: true },
    });
    await prisma.businessUser.update({
      where: { businessId_userId: { businessId, userId: ownerUserId } },
      data: { active: true },
    });
    inventoryRuns.mockClear();
    financeRuns.mockClear();
    inventoryRunKeys.length = 0;
    failNextInventoryRun = false;
    cancelParentRunId = null;
    disableFinanceAfterInventory = false;
    disableFinanceModuleAfterInventory = false;
    queueAdd.mockClear();
  });

  async function processLastQueuedJob() {
    const queued = queueAdd.mock.calls.at(-1);
    if (!queued) throw new Error('Expected a queued orchestration job');
    await service.processQueuedRun(
      queued[1] as SpecialistAgentOrchestrationJobData,
    );
  }

  it('persists an idempotent parent run and a real linked child run', async () => {
    const first = await service.run(
      businessId,
      ownerUserId,
      'orchestration-qa-0001',
    );
    const retry = await service.run(
      businessId,
      ownerUserId,
      'orchestration-qa-0001',
    );

    expect(first.status).toBe('running');
    expect(first.result?.summary).toContain('queued');
    expect(first.result?.correlationId).toBe(first.id);
    expect(retry.id).toBe(first.id);
    expect(retry.reused).toBe(true);
    await processLastQueuedJob();
    const completed = (await service.listRuns(businessId)).runs[0];
    expect(completed.status).toBe('completed');
    expect(completed.result?.completedCount).toBe(1);
    expect(completed.result?.skippedCount).toBe(4);
    expect(inventoryRuns).toHaveBeenCalledTimes(1);
    const childLifecycleEvents = await prisma.specialistAgentRunEvent.findMany({
      where: {
        businessId,
        runId: first.id,
        eventName: {
          in: [
            'agent.run.child_started',
            'agent.run.child_completed',
            'agent.run.child_partial',
            'agent.run.child_failed',
            'agent.run.child_skipped',
          ],
        },
      },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      select: { eventName: true, payload: true },
    });
    expect(childLifecycleEvents.map((event) => event.eventName)).toEqual(
      expect.arrayContaining([
        'agent.run.child_started',
        'agent.run.child_completed',
        'agent.run.child_skipped',
      ]),
    );
    const completedChildEvent = childLifecycleEvents.find(
      (event) => event.eventName === 'agent.run.child_completed',
    );
    expect(completedChildEvent?.payload).toMatchObject({
      agentKey: 'inventory_intelligence',
      status: 'completed',
    });
    const skippedChildEvent = childLifecycleEvents.find(
      (event) => event.eventName === 'agent.run.child_skipped',
    );
    expect(skippedChildEvent?.payload).toMatchObject({
      agentKey: 'financial_intelligence',
      status: 'skipped',
      reasonCode: 'AGENT_DISABLED',
    });

    const child = await prisma.specialistAgentRun.findFirstOrThrow({
      where: { businessId, agentKey: 'inventory_intelligence' },
    });
    expect(JSON.stringify(childLifecycleEvents)).not.toContain(child.id);
    expect(child.inputRefs).toEqual([
      createSpecialistAgentParentRunRef(first.id),
    ]);
    expect((child.inputRefs as Prisma.JsonArray)[0]).toMatchObject({
      correlationId: first.id,
    });
    const savedParent = await prisma.specialistAgentRun.findFirstOrThrow({
      where: { id: first.id, businessId },
    });
    expect(savedParent.workerStartedAt).toBeInstanceOf(Date);
    expect(savedParent.startedAt.getTime()).toBe(
      savedParent.workerStartedAt?.getTime(),
    );
    expect(
      await prisma.specialistAgentRunEvent.count({
        where: {
          businessId,
          runId: first.id,
          eventName: 'agent.run.worker_started',
        },
      }),
    ).toBe(1);
    const firstWorkerPickup = savedParent.workerStartedAt?.getTime();
    await service.processQueuedRun(
      queueAdd.mock.calls.at(-1)?.[1] as SpecialistAgentOrchestrationJobData,
    );
    const retriedParent = await prisma.specialistAgentRun.findFirstOrThrow({
      where: { id: first.id, businessId },
    });
    expect(retriedParent.workerStartedAt?.getTime()).toBe(firstWorkerPickup);
    expect((savedParent.output as Prisma.JsonObject).children).toEqual(
      completed.result?.children,
    );
  });

  it('fails a queued review when its initiating owner is deactivated', async () => {
    const queued = await service.run(
      businessId,
      ownerUserId,
      'orchestration-qa-owner-revoked-0001',
    );
    await prisma.businessUser.update({
      where: { businessId_userId: { businessId, userId: ownerUserId } },
      data: { active: false },
    });

    await processLastQueuedJob();

    const finished = await prisma.specialistAgentRun.findFirstOrThrow({
      where: { id: queued.id, businessId },
    });
    expect(finished.status).toBe('failed');
    expect(finished.errorCode).toBe(
      'SPECIALIST_ORCHESTRATION_ACTOR_PERMISSION_REVOKED',
    );
    expect(inventoryRuns).not.toHaveBeenCalled();
  });

  it('refuses direct review admission without an active owner membership', async () => {
    await expect(
      service.run(
        businessId,
        'not-an-active-owner',
        'orchestration-qa-direct-service-unauthorized-0001',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'SPECIALIST_ORCHESTRATION_ACTOR_PERMISSION_REVOKED',
      },
    });
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('does not start a queued review after its business is deactivated', async () => {
    const queued = await service.run(
      businessId,
      ownerUserId,
      'orchestration-qa-business-deactivated-0001',
    );
    await prisma.business.update({
      where: { id: businessId },
      data: { active: false },
    });

    await processLastQueuedJob();

    const finished = await prisma.specialistAgentRun.findFirstOrThrow({
      where: { id: queued.id, businessId },
    });
    expect(finished.status).toBe('failed');
    expect(finished.errorCode).toBe(
      'SPECIALIST_ORCHESTRATION_BUSINESS_INACTIVE',
    );
    expect(inventoryRuns).not.toHaveBeenCalled();
  });

  it('lists only rows from the active tenant even when passed another business id', async () => {
    cls.set(CLS_KEY_BUSINESS_ID, otherBusinessId);
    const result = await service.listRuns(businessId);
    expect(result.scope).toBe('current_business');
    expect(result.runs).toEqual([]);
  });

  it('audits confirmed cross-tenant run ID probes without revealing the owner', async () => {
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const foreignRun = await prisma.specialistAgentRun.create({
      data: {
        businessId: otherBusinessId,
        agentKey: 'specialist_agent_orchestrator',
        agentVersion: '1.0.0',
        moduleId: 'shared',
        triggerType: 'manual',
        status: 'running',
        initiatedByUserId: 'other-business-owner',
        inputRefs: [],
        output: {
          summary: 'Cross-agent review queued.',
          observedAt: new Date().toISOString(),
          execution: 'sequential_read_only',
          children: [],
        },
        policyResult: { readOnly: true },
      },
    });

    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    await expect(
      service.cancelRun(businessId, foreignRun.id, ownerUserId),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_ORCHESTRATION_NOT_FOUND' },
    });
    await expect(
      service.retryFailed(
        businessId,
        ownerUserId,
        foreignRun.id,
        'cross-tenant-probe-retry-01',
      ),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_ORCHESTRATION_NOT_FOUND' },
    });

    const auditRows = await prisma.auditLog.findMany({
      where: {
        businessId,
        entityId: foreignRun.id,
        action: 'specialist_agent.orchestration_cross_tenant_access_denied',
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { actorUserId: true, after: true },
    });
    expect(auditRows).toHaveLength(2);
    expect(auditRows.map((row) => row.after)).toEqual([
      { operation: 'cancel', denied: true },
      { operation: 'retry_failed', denied: true },
    ]);
    expect(
      auditRows.every((row) => row.actorUserId === ownerUserId),
    ).toBe(true);
    expect(JSON.stringify(auditRows)).not.toContain(otherBusinessId);

    const unchanged = await prisma.specialistAgentRun.findFirstOrThrow({
      where: { id: foreignRun.id, businessId: otherBusinessId },
      select: { status: true },
    });
    expect(unchanged.status).toBe('running');
  });

  it('requires an idempotency key before it creates any orchestration state', async () => {
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const before = await prisma.specialistAgentRun.count({
      where: { businessId, agentKey: 'specialist_agent_orchestrator' },
    });
    await expect(
      service.run(businessId, ownerUserId),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_ORCHESTRATION_IDEMPOTENCY_REQUIRED' },
    });
    expect(
      await prisma.specialistAgentRun.count({
        where: { businessId, agentKey: 'specialist_agent_orchestrator' },
      }),
    ).toBe(before);
  });

  it('cancels a queued review before any specialist starts', async () => {
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const queued = await service.run(
      businessId,
      ownerUserId,
      'orchestration-cancel-before-start-01',
    );

    const requested = await service.cancelRun(businessId, queued.id, ownerUserId);
    expect(requested.status).toBe('cancel_requested');
    await processLastQueuedJob();

    const cancelled = (await service.listRuns(businessId)).runs.find(
      (run) => run.id === queued.id,
    );
    expect(cancelled?.status).toBe('cancelled');
    expect(cancelled?.result?.completedCount).toBe(0);
    expect(cancelled?.result?.skippedCount).toBe(5);
    expect(cancelled?.result?.summary).toContain('Stopped by the owner');
    expect(inventoryRuns).not.toHaveBeenCalled();
    expect(
      await prisma.specialistAgentRunEvent.count({
        where: {
          businessId,
          runId: queued.id,
          eventName: 'agent.run.cancel_requested',
        },
      }),
    ).toBe(1);
    expect(
      await prisma.specialistAgentRunEvent.count({
        where: {
          businessId,
          runId: queued.id,
          eventName: 'agent.run.cancelled',
        },
      }),
    ).toBe(1);
  });

  it('does not start a child when cancellation wins the admission race', async () => {
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const queued = await service.run(
      businessId,
      ownerUserId,
      'orchestration-cancel-admission-race-01',
    );
    await service.cancelRun(businessId, queued.id, ownerUserId);
    const internals = service as unknown as {
      saveProgress: (
        runId: string,
        childBusinessId: string,
        children: SpecialistOrchestrationChild[],
      ) => Promise<boolean>;
    };
    const admitted = await internals.saveProgress(queued.id, businessId, [
      {
        agentKey: 'inventory_intelligence',
        moduleId: '13',
        name: 'Inventory Intelligence',
        status: 'running',
        runId: null,
        reasonCode: null,
      },
    ]);
    expect(admitted).toBe(false);

    await processLastQueuedJob();

    const cancelled = (await service.listRuns(businessId)).runs.find(
      (run) => run.id === queued.id,
    );
    expect(cancelled?.status).toBe('cancelled');
    expect(cancelled?.result?.skippedCount).toBe(5);
    expect(
      cancelled?.result?.children.find(
        (child) => child.agentKey === 'inventory_intelligence',
      ),
    ).toMatchObject({
      status: 'skipped',
      reasonCode: 'CANCELLED_BY_OWNER',
    });
    expect(inventoryRuns).not.toHaveBeenCalled();
  });

  it('finishes the current read-only child then stops before starting another', async () => {
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const queued = await service.run(
      businessId,
      ownerUserId,
      'orchestration-cancel-after-current-01',
    );
    cancelParentRunId = queued.id;

    await processLastQueuedJob();

    const cancelled = (await service.listRuns(businessId)).runs.find(
      (run) => run.id === queued.id,
    );
    expect(cancelled?.status).toBe('cancelled');
    expect(cancelled?.result?.completedCount).toBe(1);
    expect(cancelled?.result?.skippedCount).toBe(4);
    expect(
      cancelled?.result?.children.find(
        (child) => child.agentKey === 'inventory_intelligence',
      ),
    ).toMatchObject({ status: 'completed' });
    expect(inventoryRuns).toHaveBeenCalledTimes(1);
  });

  it('records disabled specialists and zero-autonomy Commerce as skipped', async () => {
    cls.set(CLS_KEY_BUSINESS_ID, disabledBusinessId);
    const result = await service.run(
      disabledBusinessId,
      ownerUserId,
      'orchestration-qa-disabled-0001',
    );
    await processLastQueuedJob();
    const completed = (await service.listRuns(disabledBusinessId)).runs[0];
    expect(result.status).toBe('running');
    expect(completed.status).toBe('completed');
    expect(completed.result?.completedCount).toBe(0);
    expect(completed.result?.skippedCount).toBe(5);
    expect(
      await prisma.specialistAgentRunEvent.count({
        where: {
          businessId: disabledBusinessId,
          runId: completed.id,
          eventName: 'agent.run.completed',
        },
      }),
    ).toBe(1);
    expect(
      completed.result?.children.find(
        (child) => child.agentKey === 'autonomous_commerce',
      ),
    ).toMatchObject({
      status: 'skipped',
      reasonCode: 'COMMERCE_AUTONOMY_DISABLED',
    });
    expect(
      completed.result?.children.find(
        (child) => child.agentKey === 'inventory_intelligence',
      ),
    ).toMatchObject({ status: 'skipped', reasonCode: 'MODULE_DISABLED' });
    expect(inventoryRuns).not.toHaveBeenCalled();
  });

  it('rechecks live specialist switches before starting every queued review', async () => {
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const business = await prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { policies: true },
    });
    await prisma.business.update({
      where: { id: businessId },
      data: {
        policies: {
          ...((business.policies as Prisma.JsonObject | null) ?? {}),
          'agents.inventoryEnabled': true,
          'agents.financeEnabled': true,
          'agents.customerEnabled': false,
          'agents.seoEnabled': false,
          'agents.commerceEnabled': false,
          'commerce.autonomyLevel': 0,
        },
      },
    });
    disableFinanceAfterInventory = true;

    const queued = await service.run(
      businessId,
      ownerUserId,
      'orchestration-live-policy-0001',
    );
    await processLastQueuedJob();

    const completed = (await service.listRuns(businessId)).runs.find(
      (run) => run.id === queued.id,
    );
    expect(completed?.status).toBe('completed');
    expect(completed?.result?.completedCount).toBe(1);
    expect(completed?.result?.failedCount).toBe(0);
    expect(completed?.result?.skippedCount).toBe(4);
    expect(
      completed?.result?.children.find(
        (child) => child.agentKey === 'financial_intelligence',
      ),
    ).toMatchObject({
      status: 'skipped',
      reasonCode: 'AGENT_DISABLED',
    });
    expect(inventoryRuns).toHaveBeenCalledTimes(1);
    expect(financeRuns).not.toHaveBeenCalled();
  });

  it('skips a child when its canonical module is disabled during the parent run', async () => {
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    await prisma.business.update({
      where: { id: businessId },
      data: {
        disabledModules: [],
        policies: {
          'agents.inventoryEnabled': true,
          'agents.financeEnabled': true,
          'agents.customerEnabled': false,
          'agents.seoEnabled': false,
          'agents.commerceEnabled': false,
          'commerce.autonomyLevel': 0,
        },
      },
    });
    disableFinanceModuleAfterInventory = true;

    const queued = await service.run(
      businessId,
      ownerUserId,
      'orchestration-live-module-policy-0001',
    );
    await processLastQueuedJob();

    const completed = (await service.listRuns(businessId)).runs.find(
      (run) => run.id === queued.id,
    );
    expect(completed?.result?.completedCount).toBe(1);
    expect(completed?.result?.failedCount).toBe(0);
    expect(completed?.result?.skippedCount).toBe(4);
    expect(
      completed?.result?.children.find(
        (child) => child.agentKey === 'financial_intelligence',
      ),
    ).toMatchObject({ status: 'skipped', reasonCode: 'MODULE_DISABLED' });
    expect(financeRuns).not.toHaveBeenCalled();
  });

  it('re-enqueues a persisted running parent after the request-to-queue crash window', async () => {
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const orphan = await prisma.specialistAgentRun.create({
      data: {
        businessId,
        agentKey: 'specialist_agent_orchestrator',
        agentVersion: '1.0.0',
        moduleId: 'shared',
        triggerType: 'manual',
        status: 'running',
        initiatedByUserId: ownerUserId,
        inputRefs: [
          {
            source: 'enabled_specialist_agent_policies',
            scope: 'current_business',
            agentKeys: ['inventory_intelligence'],
          },
        ],
        output: {
          summary:
            'Cross-agent review queued. No specialist data has been read yet.',
          observedAt: new Date().toISOString(),
          execution: 'sequential_read_only',
          children: [],
          aiProviderCalls: 0,
        },
        policyResult: { readOnly: true, invokesAiProvider: false },
      },
    });

    const recovered = await service.recoverPendingRuns();
    const recoveredJob = queueAdd.mock.calls
      .map((call) => call[1] as SpecialistAgentOrchestrationJobData)
      .find((job) => job.parentRunId === orphan.id);
    expect(recovered.scanned).toBeGreaterThanOrEqual(1);
    expect(recoveredJob).toMatchObject({
      businessId,
      parentRunId: orphan.id,
      actorUserId: ownerUserId,
      mode: 'run',
    });

    await service.processQueuedRun(recoveredJob!);
    const finished = await prisma.specialistAgentRun.findFirstOrThrow({
      where: { id: orphan.id, businessId },
    });
    expect(finished.status).toBe('completed');
    expect((finished.output as Prisma.JsonObject).completedCount).toBe(1);
  });

  it('retries only failed children once per key and preserves successful/skip results', async () => {
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    failNextInventoryRun = true;
    const first = await service.run(
      businessId,
      ownerUserId,
      'orchestration-retry-start-01',
    );
    expect(first.status).toBe('running');
    await processLastQueuedJob();
    const firstCompleted = (await service.listRuns(businessId)).runs[0];
    expect(firstCompleted.status).toBe('failed');
    expect(firstCompleted.result?.failedCount).toBe(1);
    expect(firstCompleted.result?.skippedCount).toBe(4);
    expect(
      await prisma.specialistAgentRunEvent.count({
        where: {
          businessId,
          runId: firstCompleted.id,
          eventName: 'agent.run.failed',
        },
      }),
    ).toBe(1);

    const retry = await service.retryFailed(
      businessId,
      ownerUserId,
      firstCompleted.id,
      'orchestration-retry-key-01',
    );
    expect(retry.status).toBe('running');
    expect(
      await prisma.specialistAgentRunEvent.count({
        where: {
          businessId,
          runId: firstCompleted.id,
          eventName: 'agent.run.retry_queued',
        },
      }),
    ).toBe(1);
    await processLastQueuedJob();
    const repeatedRetry = await service.retryFailed(
      businessId,
      ownerUserId,
      firstCompleted.id,
      'orchestration-retry-key-01',
    );

    const retryCompleted = (await service.listRuns(businessId)).runs[0];
    expect(retryCompleted.status).toBe('completed');
    expect(retryCompleted.result?.completedCount).toBe(1);
    expect(retryCompleted.result?.failedCount).toBe(0);
    expect(retryCompleted.result?.skippedCount).toBe(4);
    expect(
      await prisma.specialistAgentRunEvent.count({
        where: {
          businessId,
          runId: retryCompleted.id,
          eventName: 'agent.run.completed',
        },
      }),
    ).toBe(1);
    expect(repeatedRetry.reused).toBe(true);
    expect(repeatedRetry.id).toBe(firstCompleted.id);
    expect(inventoryRuns).toHaveBeenCalledTimes(2);
    expect(inventoryRunKeys[1]).not.toBe(inventoryRunKeys[0]);

    const inventoryChild = retryCompleted.result?.children.find(
      (child) => child.agentKey === 'inventory_intelligence',
    );
    expect(inventoryChild).toMatchObject({ status: 'completed' });
    expect(inventoryChild?.runId).toBeTruthy();
    const retryChild = await prisma.specialistAgentRun.findFirstOrThrow({
      where: {
        id: inventoryChild!.runId!,
        businessId,
        agentKey: 'inventory_intelligence',
      },
    });
    expect(retryChild.inputRefs).toEqual([
      createSpecialistAgentParentRunRef(first.id),
    ]);
    const savedParent = await prisma.specialistAgentRun.findFirstOrThrow({
      where: {
        id: first.id,
        businessId,
        agentKey: 'specialist_agent_orchestrator',
      },
    });
    expect(JSON.stringify(savedParent.inputRefs)).not.toContain(
      'orchestration-retry-key-01',
    );
  });
});
