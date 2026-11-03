import { ClsService } from 'nestjs-cls';
import {
  Role,
  WorkflowDeadLetterNextAction,
  WorkflowDeadLetterStatus,
  WorkflowRunStatus,
  WorkflowTriggerKey,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import { CLS_KEY_BUSINESS_ID } from '../../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../../prisma/prisma.service';
import { captureWorkflowDeadLetter } from './workflow-dead-letter.util';
import { WorkflowDeadLettersService } from './workflow-dead-letters.service';
import { MAX_WORKFLOW_RETRIES } from './workflows.constants';
import type { WorkflowTriggerService } from './workflow-trigger.service';

jest.setTimeout(60_000);

class FakeClsService {
  private readonly store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('WorkflowDeadLettersService (MySQL)', () => {
  let prisma: PrismaService;
  let service: WorkflowDeadLettersService;
  let businessId: string;
  let ownerUserId: string;
  let actor: AuthenticatedUser;
  let retryFailedRunMock!: jest.Mock;
  const cls = new FakeClsService();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const business = await prisma.business.create({
      data: {
        name: 'Workflow DLQ Test',
        slug: `workflow-dlq-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const owner = await prisma.user.create({
      data: {
        email: `workflow-dlq-${Date.now()}@example.test`,
        passwordHash: 'test-hash',
        name: 'DLQ Owner',
      },
    });
    ownerUserId = owner.id;
    await prisma.businessUser.create({
      data: { businessId, userId: ownerUserId, role: Role.owner },
    });
    actor = {
      sub: ownerUserId,
      businessId,
      role: Role.owner,
      capabilities: [],
    };

    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    retryFailedRunMock = jest.fn();
    const workflowTrigger = {
      retryFailedRun: retryFailedRunMock,
    } as unknown as WorkflowTriggerService;
    service = new WorkflowDeadLettersService(tenantPrisma, workflowTrigger);
  });

  afterAll(async () => {
    if (businessId) {
      await prisma.workflowDeadLetterDecision.deleteMany({
        where: { businessId },
      });
      await prisma.workflowDeadLetter.deleteMany({ where: { businessId } });
      await prisma.auditLog.deleteMany({ where: { businessId } });
      await prisma.workflowRunAttempt.deleteMany({ where: { businessId } });
      await prisma.workflowRun.deleteMany({ where: { businessId } });
      await prisma.workflowVersion.deleteMany({ where: { businessId } });
      await prisma.workflow.deleteMany({ where: { businessId } });
      await prisma.businessUser.deleteMany({ where: { businessId } });
      await prisma.business.delete({ where: { id: businessId } });
    }
    if (ownerUserId) {
      await prisma.user.delete({ where: { id: ownerUserId } });
    }
    await prisma.$disconnect();
  });

  async function createFailedRun(label: string) {
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: `DLQ ${label}`,
        triggerKey: WorkflowTriggerKey.sale,
        actions: [{ type: 'notify_owner', messageBody: 'A test message' }],
      },
    });
    const result = [
      {
        actionIndex: 0,
        type: 'notify_owner',
        queued: false,
        error: 'Temporary provider failure',
      },
    ];
    const run = await prisma.workflowRun.create({
      data: {
        businessId,
        workflowId: workflow.id,
        status: WorkflowRunStatus.failed,
        context: { customerId: 'trigger-payload-must-not-copy' },
        result,
        error: 'Temporary provider failure',
      },
    });
    await prisma.workflowRunAttempt.create({
      data: {
        businessId,
        workflowRunId: run.id,
        attemptNumber: 1,
        status: WorkflowRunStatus.failed,
        result,
        error: 'Temporary provider failure',
        finishedAt: new Date(),
      },
    });
    return { workflow, run };
  }

  async function createDeadLetter(
    workflowId: string,
    workflowRunId: string,
    nextAction: WorkflowDeadLetterNextAction = WorkflowDeadLetterNextAction.manual_review,
    operatorRetryCount = 0,
  ) {
    return prisma.workflowDeadLetter.create({
      data: {
        businessId,
        workflowId,
        workflowRunId,
        ownerUserId,
        ownerRole: Role.owner,
        nextAction,
        failureCode: 'provider_failure',
        evidence: {
          schemaVersion: 1,
          workflowRunId,
          workflowVersion: 1,
          retryCount: 2,
          attemptNumber: 1,
          failureCode: 'provider_failure',
          error: 'Temporary provider failure',
          failedActions: [
            {
              actionIndex: 0,
              type: 'notify_owner',
              retryable: true,
              error: 'Temporary provider failure',
            },
          ],
        },
        operatorRetryCount,
      },
    });
  }

  it('retains sanitized terminal failure evidence and assigns the active owner', async () => {
    const { workflow, run } = await createFailedRun('capture');

    await prisma.$transaction((tx) =>
      captureWorkflowDeadLetter(tx, {
        businessId,
        workflowId: workflow.id,
        workflowRunId: run.id,
        workflowVersion: 1,
        retryCount: MAX_WORKFLOW_RETRIES,
        attemptNumber: 3,
        result: [
          {
            actionIndex: 0,
            type: 'notify_owner',
            queued: false,
            error: 'Temporary provider failure',
          },
        ],
        error: 'provider returned token=private-test-value',
      }),
    );

    const record = await prisma.workflowDeadLetter.findUniqueOrThrow({
      where: { workflowRunId: run.id },
      include: { decisions: true },
    });
    const evidenceText = JSON.stringify(record.evidence);
    expect(record).toMatchObject({
      businessId,
      workflowId: workflow.id,
      workflowRunId: run.id,
      ownerUserId,
      ownerRole: Role.owner,
      status: WorkflowDeadLetterStatus.open,
      nextAction: WorkflowDeadLetterNextAction.retry,
    });
    expect(evidenceText).toContain('[REDACTED]');
    expect(evidenceText).not.toContain('private-test-value');
    expect(evidenceText).not.toContain('trigger-payload-must-not-copy');
    expect(record.decisions).toHaveLength(1);
    expect(record.decisions[0].action).toBe('created');

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        businessId,
        entity: 'workflow-dead-letter',
        entityId: record.id,
      },
    });
    expect(audit.action).toBe('workflow_dead_letter.created');
  });

  it('keeps the retry claim while evidence refreshes and prevents competing decisions', async () => {
    const { workflow, run } = await createFailedRun('retry-race');
    const record = await createDeadLetter(
      workflow.id,
      run.id,
      WorkflowDeadLetterNextAction.retry,
    );
    let finishRetry!: (value: { status: WorkflowRunStatus }) => void;
    let signalRetryStarted!: () => void;
    const retryStarted = new Promise<void>((resolve) => {
      signalRetryStarted = resolve;
    });
    const retryResult = new Promise<{ status: WorkflowRunStatus }>(
      (resolve) => {
        finishRetry = resolve;
      },
    );
    retryFailedRunMock.mockImplementation(() => {
      signalRetryStarted();
      return retryResult;
    });

    const retry = service.retry(actor, record.id, {
      reason: 'Retry after provider recovery',
    });
    await retryStarted;
    await prisma.$transaction((tx) =>
      captureWorkflowDeadLetter(tx, {
        businessId,
        workflowId: workflow.id,
        workflowRunId: run.id,
        workflowVersion: 1,
        retryCount: MAX_WORKFLOW_RETRIES,
        attemptNumber: 2,
        result: [
          {
            actionIndex: 0,
            type: 'notify_owner',
            queued: false,
            error: 'Provider still unavailable during retry',
          },
        ],
        error: 'Provider still unavailable during retry',
      }),
    );
    await expect(
      prisma.workflowDeadLetter.findUniqueOrThrow({
        where: { id: record.id },
      }),
    ).resolves.toMatchObject({
      status: WorkflowDeadLetterStatus.open,
      nextAction: WorkflowDeadLetterNextAction.retry,
      operatorRetryCount: 1,
    });

    await expect(
      service.resolve(actor, record.id, { reason: 'Concurrent resolve' }),
    ).rejects.toMatchObject({
      response: { code: 'workflow.dead_letter_decision_not_allowed' },
    });
    await expect(
      service.dismiss(actor, record.id, { reason: 'Concurrent dismiss' }),
    ).rejects.toMatchObject({
      response: { code: 'workflow.dead_letter_decision_not_allowed' },
    });
    await expect(
      service.retry(actor, record.id, { reason: 'Second concurrent retry' }),
    ).rejects.toMatchObject({
      response: { code: 'workflow.dead_letter_retry_not_allowed' },
    });

    finishRetry({ status: WorkflowRunStatus.failed });
    await retry;

    const updated = await prisma.workflowDeadLetter.findUniqueOrThrow({
      where: { id: record.id },
    });
    expect(updated).toMatchObject({
      status: WorkflowDeadLetterStatus.open,
      operatorRetryCount: 1,
      nextAction: WorkflowDeadLetterNextAction.manual_review,
    });
    const decisions = await prisma.workflowDeadLetterDecision.findMany({
      where: { businessId, deadLetterId: record.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(decisions.map((decision) => decision.action).sort()).toEqual(
      ['retry_started', 'refreshed', 'retry_failed'].sort(),
    );
    expect(
      decisions.find((decision) => decision.action === 'retry_started')
        ?.actorUserId,
    ).toBe(ownerUserId);
  });

  it('resolves and audits the dead letter after a successful operator retry', async () => {
    const { workflow, run } = await createFailedRun('retry-success');
    const record = await createDeadLetter(
      workflow.id,
      run.id,
      WorkflowDeadLetterNextAction.retry,
    );
    retryFailedRunMock.mockReset().mockResolvedValue({
      status: WorkflowRunStatus.success,
    });

    await service.retry(actor, record.id, {
      reason: 'Provider recovered and the run completed',
    });

    const updated = await prisma.workflowDeadLetter.findUniqueOrThrow({
      where: { id: record.id },
    });
    expect(updated).toMatchObject({
      status: WorkflowDeadLetterStatus.resolved,
      operatorRetryCount: 1,
      nextAction: WorkflowDeadLetterNextAction.manual_review,
      resolutionReason: 'Provider recovered and the run completed',
    });
    const retrySuccess =
      await prisma.workflowDeadLetterDecision.findFirstOrThrow({
        where: {
          businessId,
          deadLetterId: record.id,
          action: 'retry_succeeded',
        },
      });
    expect(retrySuccess.actorUserId).toBe(ownerUserId);
    expect(retrySuccess.reason).toBe(
      'Provider recovered and the run completed',
    );
  });

  it('requires a reason and audits operator resolve and dismiss decisions', async () => {
    const resolvedFixture = await createFailedRun('resolve');
    const resolved = await createDeadLetter(
      resolvedFixture.workflow.id,
      resolvedFixture.run.id,
    );
    await expect(
      service.resolve(actor, resolved.id, { reason: '   ' }),
    ).rejects.toMatchObject({
      response: { code: 'workflow.dead_letter_decision_not_allowed' },
    });
    await service.resolve(actor, resolved.id, {
      reason: 'Failure was corrected and the run was verified manually',
    });

    const dismissedFixture = await createFailedRun('dismiss');
    const dismissed = await createDeadLetter(
      dismissedFixture.workflow.id,
      dismissedFixture.run.id,
    );
    await service.dismiss(actor, dismissed.id, {
      reason: 'Reviewed and confirmed this event should not be replayed',
    });

    const decisions = await prisma.workflowDeadLetterDecision.findMany({
      where: { businessId, deadLetterId: { in: [resolved.id, dismissed.id] } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(decisions.map((decision) => decision.action)).toEqual([
      'resolved',
      'dismissed',
    ]);
    expect(
      decisions.every((decision) => decision.actorUserId === ownerUserId),
    ).toBe(true);
    expect(decisions[0].reason).toContain('verified manually');
    expect(decisions[1].reason).toContain('should not be replayed');

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        businessId,
        entity: 'workflow-dead-letter',
        entityId: { in: [resolved.id, dismissed.id] },
      },
    });
    expect(auditLogs.map((entry) => entry.action).sort()).toEqual([
      'workflow_dead_letter.dismissed',
      'workflow_dead_letter.resolved',
    ]);
    expect(JSON.stringify(auditLogs.map((entry) => entry.after))).toContain(
      'should not be replayed',
    );
  });
});
