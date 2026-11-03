import { ClsService } from 'nestjs-cls';
import { WorkflowTriggerKey } from '@prisma/client';
import { CLS_KEY_BUSINESS_ID } from '../../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { SendGateService } from '../../messaging/send-gate.service';
import { subWorkflowContext } from './workflow-context.util';
import { validateWorkflowDefinition } from './workflow-definition.util';
import { WorkflowTriggerService } from './workflow-trigger.service';
import { WorkflowsService } from './workflows.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('subWorkflowContext', () => {
  it('passes scalar caller values as parent_<key> and keeps the customer', () => {
    expect(
      subWorkflowContext(
        {
          eventId: 'e1',
          customerId: 'c1',
          customerName: 'Ana',
          amount: 12,
          body_orderId: 'A1',
          nested: { a: 1 },
          callDepth: 1,
        },
        {
          eventId: 'subflow:r1:0',
          parentRunId: 'r1',
          parentWorkflowId: 'w1',
          callDepth: 2,
        },
      ),
    ).toEqual({
      eventId: 'subflow:r1:0',
      description: 'Started by another workflow',
      parentRunId: 'r1',
      parentWorkflowId: 'w1',
      callDepth: 2,
      customerId: 'c1',
      customerName: 'Ana',
      parent_customerId: 'c1',
      parent_customerName: 'Ana',
      parent_amount: 12,
      parent_body_orderId: 'A1',
    });
  });

  it('lets sub-workflow conditions use parent_<key> fields', () => {
    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sub_workflow,
        'Reusable',
        [{ field: 'parent_amount', operator: 'gt', value: 10 }],
        [
          {
            type: 'notify_owner',
            messageBody: 'Order {{parent_body_orderId}}',
          },
        ],
      ),
    ).toBeNull();
    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'Caller',
        [],
        [{ type: 'run_workflow', workflowId: '' }],
      ),
    ).toMatch(/needs a workflow to run/);
  });
});

describe('Sub-workflows (MySQL)', () => {
  let prisma: PrismaService;
  let workflows: WorkflowsService;
  let trigger: WorkflowTriggerService;
  let businessId: string;
  let otherBusinessId: string;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    workflows = new WorkflowsService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
    );
    trigger = new WorkflowTriggerService(prisma, {
      send: jest.fn(),
    } as unknown as SendGateService);
    businessId = (
      await prisma.business.create({
        data: { name: 'Subflow Co', slug: `subflow-${stamp}` },
      })
    ).id;
    otherBusinessId = (
      await prisma.business.create({
        data: { name: 'Other Co', slug: `subflow-other-${stamp}` },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    const ids = [businessId, otherBusinessId];
    await prisma.workflowRunAttempt.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.workflowRun.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.workflowVersion.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.workflow.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  const sub = (name: string, actions: unknown[]) =>
    workflows.create(businessId, {
      name,
      triggerKey: WorkflowTriggerKey.sub_workflow,
      conditions: [],
      actions,
    } as never);

  it('refuses targets that are not sub-workflows of this business, or itself', async () => {
    const saleFlow = await workflows.create(businessId, {
      name: 'Sale flow',
      triggerKey: WorkflowTriggerKey.sale,
      conditions: [],
      actions: [{ type: 'notify_owner', messageBody: 'Sale' }],
    });
    const foreign = await prisma.workflow.create({
      data: {
        businessId: otherBusinessId,
        name: 'Foreign',
        triggerKey: WorkflowTriggerKey.sub_workflow,
      },
    });
    for (const workflowId of [saleFlow.id, foreign.id, 'missing']) {
      await expect(
        sub('Bad caller', [{ type: 'run_workflow', workflowId }]),
      ).rejects.toMatchObject({
        response: { code: 'workflow.invalid_definition' },
      });
    }
    const selfish = await sub('Selfish', [
      { type: 'notify_owner', messageBody: 'x' },
    ]);
    await expect(
      workflows.update(selfish.id, {
        actions: [{ type: 'run_workflow', workflowId: selfish.id }],
      }),
    ).rejects.toMatchObject({
      response: { code: 'workflow.invalid_definition' },
    });
  });

  it('starts each child once, passes values, and stops at the depth limit', async () => {
    const leaf = await sub('Leaf', [{ type: 'wait', durationMinutes: 5 }]);
    const level3 = await sub('Level 3', [
      { type: 'run_workflow', workflowId: leaf.id },
    ]);
    const level2 = await sub('Level 2', [
      { type: 'run_workflow', workflowId: level3.id },
    ]);
    const level1 = await sub('Level 1', [
      { type: 'run_workflow', workflowId: level2.id },
    ]);
    const caller = await workflows.create(businessId, {
      name: 'Caller',
      triggerKey: WorkflowTriggerKey.inbound_webhook,
      conditions: [],
      actions: [{ type: 'run_workflow', workflowId: level1.id }],
    });
    for (const workflow of [leaf, level3, level2, level1, caller]) {
      await workflows.update(workflow.id, { active: true });
    }

    const callerRunId = await trigger.runInbound(
      businessId,
      caller.id,
      `delivery-${stamp}`,
      { orderId: 'A1' },
      new Date(),
    );
    expect(callerRunId).toBeTruthy();
    // The same delivery again never starts a second caller run.
    await trigger.runInbound(
      businessId,
      caller.id,
      `delivery-${stamp}`,
      { orderId: 'A1' },
      new Date(),
    );

    const runsOf = (workflowId: string) =>
      prisma.workflowRun.findMany({
        where: { businessId, workflowId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
    expect(await runsOf(caller.id)).toHaveLength(1);
    const [level1Run] = await runsOf(level1.id);
    expect(await runsOf(level1.id)).toHaveLength(1);
    expect(await runsOf(level2.id)).toHaveLength(1);
    const level3Runs = await runsOf(level3.id);
    expect(level3Runs).toHaveLength(1);
    expect(await runsOf(leaf.id)).toHaveLength(0);

    expect(level1Run.triggerEventId).toBe(`subflow:${callerRunId}:0`);
    expect(level1Run.context).toMatchObject({
      callDepth: 1,
      parentRunId: callerRunId,
      parentWorkflowId: caller.id,
      parent_body_orderId: 'A1',
    });
    expect(JSON.stringify(level3Runs[0].result)).toContain('levels deep');

    // Retrying the caller's step reuses the child run it already started.
    const retried = (await (
      trigger as unknown as {
        runSubWorkflow: (
          ...args: unknown[]
        ) => Promise<Record<string, unknown>>;
      }
    ).runSubWorkflow(
      businessId,
      level1.id,
      { callDepth: 0 },
      callerRunId,
      caller.id,
      0,
    )) as { childRunId: string };
    expect(retried.childRunId).toBe(level1Run.id);
    expect(await runsOf(level1.id)).toHaveLength(1);
  });

  it('skips a paused target and reports it', async () => {
    const paused = await sub('Paused', [
      { type: 'notify_owner', messageBody: 'x' },
    ]);
    const result = await (
      trigger as unknown as {
        runSubWorkflow: (
          ...args: unknown[]
        ) => Promise<Record<string, unknown>>;
      }
    ).runSubWorkflow(businessId, paused.id, {}, 'run-x', 'caller-x', 0);
    expect(result).toMatchObject({ skipped: true });
  });
});
