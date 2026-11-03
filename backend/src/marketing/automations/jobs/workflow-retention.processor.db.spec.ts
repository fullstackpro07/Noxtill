import { WorkflowRunStatus, WorkflowTriggerKey } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkflowRetentionProcessor } from './workflow-retention.processor';

describe('WorkflowRetentionProcessor (MySQL)', () => {
  let prisma: PrismaService;
  let businessId: string;
  let workflowId: string;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const business = await prisma.business.create({
      data: {
        name: 'Workflow retention test',
        slug: `workflow-retention-${stamp}`,
      },
    });
    businessId = business.id;
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Retention fixture',
        triggerKey: Object.values(WorkflowTriggerKey)[0],
      },
    });
    workflowId = workflow.id;
  });

  afterAll(async () => {
    await prisma.workflowDeadLetter.deleteMany({ where: { businessId } });
    await prisma.workflowApproval.deleteMany({ where: { businessId } });
    await prisma.workflowRun.deleteMany({ where: { businessId } });
    await prisma.workflowRetentionCleanup.deleteMany({ where: { businessId } });
    await prisma.workflow.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('deletes only old finished runs without pending approvals or open Recovery items, with attempts', async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000);
    const createRun = (status: WorkflowRunStatus) =>
      prisma.workflowRun.create({
        data: {
          businessId,
          workflowId,
          status,
          context: {},
          createdAt: old,
          attempts: {
            create: {
              businessId,
              attemptNumber: 1,
              status,
              startedAt: old,
              finishedAt:
                status === WorkflowRunStatus.running ||
                status === WorkflowRunStatus.waiting
                  ? null
                  : old,
            },
          },
        },
      });

    const eligible = await Promise.all(
      [
        WorkflowRunStatus.success,
        WorkflowRunStatus.failed,
        WorkflowRunStatus.skipped,
        WorkflowRunStatus.cancelled,
      ].map(createRun),
    );
    const pendingApprovalRun = await createRun(WorkflowRunStatus.skipped);
    await prisma.workflowApproval.create({
      data: {
        businessId,
        workflowId,
        workflowRunId: pendingApprovalRun.id,
        actionIndex: 0,
        title: 'Pending approval fixture',
        description: 'Retention must preserve this run.',
        payload: {},
        payloadHash: 'b'.repeat(64),
      },
    });
    const recoveryRun = await createRun(WorkflowRunStatus.failed);
    await prisma.workflowDeadLetter.create({
      data: {
        businessId,
        workflowId,
        workflowRunId: recoveryRun.id,
        failureCode: 'workflow.action_failed',
        evidence: { source: 'retention test' },
      },
    });
    const running = await createRun(WorkflowRunStatus.running);
    const waiting = await createRun(WorkflowRunStatus.waiting);

    const processor = new WorkflowRetentionProcessor(prisma);
    const result = await processor.cleanupBusiness(businessId, 30, now);

    expect(result).toMatchObject({ deletedRuns: 4 });
    expect(
      await prisma.workflowRun.count({
        where: { id: { in: eligible.map((run) => run.id) } },
      }),
    ).toBe(0);
    expect(
      await prisma.workflowRunAttempt.count({
        where: { workflowRunId: { in: eligible.map((run) => run.id) } },
      }),
    ).toBe(0);
    expect(
      await prisma.workflowRun.count({
        where: {
          id: {
            in: [pendingApprovalRun.id, recoveryRun.id, running.id, waiting.id],
          },
        },
      }),
    ).toBe(4);
    expect(
      await prisma.workflowRetentionCleanup.findFirstOrThrow({
        where: { businessId },
        orderBy: { cleanedAt: 'desc' },
      }),
    ).toMatchObject({
      retentionDays: 30,
      deletedRuns: 4,
      cutoffAt: result.cutoffAt,
    });
  });
});
