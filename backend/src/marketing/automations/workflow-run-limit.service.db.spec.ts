import { WorkflowRunStatus, WorkflowTriggerKey } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SendGateService } from '../../messaging/send-gate.service';
import { WorkflowTriggerService } from './workflow-trigger.service';

describe('WorkflowTriggerService monthly run limit (MySQL)', () => {
  let prisma: PrismaService;
  let service: WorkflowTriggerService;
  let businessId: string;
  let workflowId: string;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new WorkflowTriggerService(prisma, {
      send: jest.fn(),
    } as unknown as SendGateService);
    const business = await prisma.business.create({
      data: {
        name: 'Monthly run limit test',
        slug: `workflow-run-limit-${stamp}`,
        policies: { 'automations.maxRunsPerMonth': 1 },
      },
    });
    businessId = business.id;
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Run limit fixture',
        triggerKey: WorkflowTriggerKey.inbound_webhook,
        active: true,
        actions: [{ type: 'wait', durationMinutes: 5 }],
      },
    });
    workflowId = workflow.id;
  });

  afterAll(async () => {
    await prisma.workflowRun.deleteMany({ where: { businessId } });
    await prisma.workflow.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('allows the first monthly run and records later triggers as skipped with the limit reason', async () => {
    const now = new Date();
    const firstId = await service.runInbound(
      businessId,
      workflowId,
      `limit-first-${stamp}`,
      { test: 1 },
      now,
    );
    const secondId = await service.runInbound(
      businessId,
      workflowId,
      `limit-second-${stamp}`,
      { test: 2 },
      now,
    );

    const runs = await prisma.workflowRun.findMany({
      where: { businessId },
    });
    expect(runs).toHaveLength(2);
    expect(runs.find((run) => run.id === firstId)?.status).toBe(
      WorkflowRunStatus.waiting,
    );
    const blockedRun = runs.find((run) => run.id === secondId)!;
    expect(blockedRun).toMatchObject({
      status: WorkflowRunStatus.skipped,
      error:
        'Monthly workflow run limit reached (1). Raise it in Settings → Automations.',
    });
    expect(
      await prisma.workflowRunAttempt.findFirstOrThrow({
        where: { workflowRunId: secondId! },
      }),
    ).toMatchObject({
      status: WorkflowRunStatus.skipped,
      error: blockedRun.error,
    });
  });

  it('does not count runs skipped by their conditions toward the limit', async () => {
    const other = await prisma.business.create({
      data: {
        name: 'Run limit conditions test',
        slug: `workflow-run-limit-cond-${stamp}`,
        policies: { 'automations.maxRunsPerMonth': 1 },
      },
    });
    try {
      const workflow = await prisma.workflow.create({
        data: {
          businessId: other.id,
          name: 'Conditional fixture',
          triggerKey: WorkflowTriggerKey.inbound_webhook,
          active: true,
          conditions: [{ field: 'body_paid', operator: 'eq', value: 'yes' }],
          actions: [{ type: 'wait', durationMinutes: 5 }],
        },
      });
      const notMatched = await service.runInbound(
        other.id,
        workflow.id,
        `cond-no-${stamp}`,
        { paid: 'no' },
        new Date(),
      );
      const matched = await service.runInbound(
        other.id,
        workflow.id,
        `cond-yes-${stamp}`,
        { paid: 'yes' },
        new Date(),
      );
      const statusOf = async (id: string | null) =>
        (await prisma.workflowRun.findUniqueOrThrow({ where: { id: id! } }))
          .status;
      expect(await statusOf(notMatched)).toBe(WorkflowRunStatus.skipped);
      expect(await statusOf(matched)).toBe(WorkflowRunStatus.waiting);
    } finally {
      await prisma.workflowRunAttempt.deleteMany({
        where: { businessId: other.id },
      });
      await prisma.workflowRun.deleteMany({ where: { businessId: other.id } });
      await prisma.workflow.deleteMany({ where: { businessId: other.id } });
      await prisma.business.delete({ where: { id: other.id } });
    }
  });

  it('does not block runs when the policy is null', async () => {
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: { 'automations.maxRunsPerMonth': null } },
    });
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Unlimited fixture',
        triggerKey: WorkflowTriggerKey.inbound_webhook,
        active: true,
        actions: [],
      },
    });

    await service.runInbound(
      businessId,
      workflow.id,
      `unlimited-first-${stamp}`,
      {},
      new Date(),
    );
    await service.runInbound(
      businessId,
      workflow.id,
      `unlimited-second-${stamp}`,
      {},
      new Date(),
    );

    expect(
      await prisma.workflowRun.count({
        where: { businessId, workflowId: workflow.id },
      }),
    ).toBe(2);
  });
});
