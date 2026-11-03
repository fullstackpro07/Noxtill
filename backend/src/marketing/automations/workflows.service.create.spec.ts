import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { WorkflowTriggerKey } from '@prisma/client';
import { WorkflowsService } from './workflows.service';

describe('WorkflowsService create safety', () => {
  it('creates a paused workflow and records its initial version', async () => {
    const businessId = 'business_1';
    const workflow = {
      id: 'workflow_1',
      businessId,
      name: 'Thank customers',
      triggerKey: WorkflowTriggerKey.sale,
      scheduleEveryMinutes: null,
      scheduleCronExpression: null,
      scheduleTimezone: 'UTC',
      nextScheduleAt: null,
      conditions: [],
      actions: [{ type: 'send_customer_message', messageBody: 'Thank you!' }],
      active: false,
      version: 1,
      createdAt: new Date('2026-09-27T10:00:00.000Z'),
      updatedAt: new Date('2026-09-27T10:00:00.000Z'),
    };
    const create = jest.fn().mockResolvedValue(workflow);
    const createVersion = jest
      .fn<Promise<Record<string, never>>, [{ data: Record<string, unknown> }]>()
      .mockResolvedValue({});
    const client = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          workflow: { create },
          workflowVersion: { create: createVersion },
        }),
    };
    const service = new WorkflowsService({
      client,
    } as unknown as TenantPrismaService);

    const result = await service.create(businessId, {
      name: workflow.name,
      triggerKey: WorkflowTriggerKey.sale,
      conditions: [],
      actions: workflow.actions,
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        businessId,
        name: workflow.name,
        triggerKey: WorkflowTriggerKey.sale,
        scheduleEveryMinutes: null,
        scheduleCronExpression: null,
        scheduleTimezone: 'UTC',
        nextScheduleAt: null,
        conditions: [],
        conditionMode: 'all',
        actions: workflow.actions,
        active: false,
      },
    });
    expect(createVersion).toHaveBeenCalledTimes(1);
    expect(createVersion.mock.calls[0]?.[0].data).toMatchObject({
      workflowId: workflow.id,
      businessId,
      version: 1,
    });
    expect(result).toMatchObject({ active: false, version: 1 });
  });

  it('stores the graph and action projection in an immutable initial version', async () => {
    const businessId = 'business_graph';
    const graph = {
      schemaVersion: 1,
      nodes: [
        { id: 'trigger', type: 'trigger' },
        {
          id: 'notify',
          type: 'action',
          action: { type: 'notify_owner', messageBody: 'A sale was made' },
        },
        { id: 'end', type: 'end' },
      ],
      edges: [
        { source: 'trigger', target: 'notify', port: 'next' },
        { source: 'notify', target: 'end', port: 'next' },
      ],
    };
    const actions = [{ type: 'notify_owner', messageBody: 'A sale was made' }];
    const workflow = {
      id: 'workflow_graph',
      businessId,
      name: 'Graph workflow',
      triggerKey: WorkflowTriggerKey.sale,
      scheduleEveryMinutes: null,
      scheduleCronExpression: null,
      scheduleTimezone: 'UTC',
      nextScheduleAt: null,
      conditions: [],
      conditionMode: 'all',
      actions,
      graph,
      active: false,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const create = jest
      .fn<Promise<typeof workflow>, [{ data: Record<string, unknown> }]>()
      .mockResolvedValue(workflow);
    const createVersion = jest
      .fn<
        Promise<Record<string, unknown>>,
        [{ data: Record<string, unknown> }]
      >()
      .mockResolvedValue({});
    const service = new WorkflowsService({
      client: {
        $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            workflow: { create },
            workflowVersion: { create: createVersion },
          }),
      },
    } as unknown as TenantPrismaService);

    await service.create(businessId, {
      name: workflow.name,
      triggerKey: WorkflowTriggerKey.sale,
      graph,
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0].data).toMatchObject({
      graph,
      conditions: [],
      actions,
      active: false,
    });
    expect(createVersion).toHaveBeenCalledTimes(1);
    expect(createVersion.mock.calls[0]?.[0].data).toMatchObject({
      graph,
      actions,
      version: 1,
    });
  });

  it('counts completed workflow runs as queued actions, not delivered messages', async () => {
    const workflow = {
      id: 'workflow_1',
      businessId: 'business_1',
      name: 'Notify owner',
      triggerKey: WorkflowTriggerKey.sale,
      conditions: [],
      actions: [{ type: 'notify_owner', messageBody: 'Sale received' }],
      active: true,
      version: 1,
      createdAt: new Date('2026-09-27T10:00:00.000Z'),
      updatedAt: new Date('2026-09-27T10:00:00.000Z'),
    };
    const lastRunAt = new Date('2026-09-27T11:00:00.000Z');
    const runCount = jest.fn().mockResolvedValue(2);
    const findLastRun = jest.fn().mockResolvedValue({ createdAt: lastRunAt });
    const service = new WorkflowsService({
      client: {
        workflow: { findMany: jest.fn().mockResolvedValue([workflow]) },
        workflowRun: { count: runCount, findFirst: findLastRun },
      },
    } as unknown as TenantPrismaService);

    const result = await service.list();

    expect(runCount).toHaveBeenCalledWith({
      where: { workflowId: workflow.id, status: 'success' },
    });
    expect(findLastRun).toHaveBeenCalledWith({
      where: { workflowId: workflow.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { createdAt: true },
    });
    expect(result[0]).toMatchObject({
      successfulRunCount: 2,
      lastFiredAt: lastRunAt,
    });
  });
});
