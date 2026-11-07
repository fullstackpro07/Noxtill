import { AppException } from '../../common/filters/app.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { SendGateService } from '../../messaging/send-gate.service';
import { WorkflowTriggerService } from './workflow-trigger.service';
import { WorkflowRunStatus } from '@prisma/client';

type WorkflowRunUpdateCall = {
  where: {
    id: string;
    businessId: string;
    status: WorkflowRunStatus;
  };
  data: {
    status: WorkflowRunStatus;
    result: Array<Record<string, unknown>>;
    error: string | null;
    attempts: Record<string, unknown>;
  };
};

describe('WorkflowTriggerService failed-run retries', () => {
  const priorRun = {
    id: 'run-1',
    workflowId: 'workflow-1',
    businessId: 'business-1',
    workflowVersion: 4,
    status: WorkflowRunStatus.failed,
    retryCount: 0,
    context: { customerId: 'customer-1' },
    result: [
      {
        actionIndex: 0,
        type: 'notify_owner',
        queued: true,
        messageId: 'message-already-queued',
      },
      {
        actionIndex: 1,
        type: 'notify_owner',
        queued: false,
        error: 'Redis unavailable',
      },
    ],
  };
  const version = {
    actions: [
      { type: 'notify_owner', messageBody: 'Already queued' },
      { type: 'notify_owner', messageBody: 'Retry this one' },
    ],
  };

  type RunSnapshot = Omit<typeof priorRun, 'status' | 'result'> & {
    status: WorkflowRunStatus;
    result: unknown;
  };

  function setup(claimCount = 1) {
    let runSnapshot: RunSnapshot = priorRun;
    const findRun = jest.fn().mockImplementation(() => {
      const snapshot = runSnapshot;
      if (snapshot.status === WorkflowRunStatus.failed) {
        runSnapshot = { ...snapshot, status: WorkflowRunStatus.running };
      }
      return Promise.resolve(snapshot);
    });
    const updateRun = jest
      .fn<Promise<Record<string, unknown>>, [WorkflowRunUpdateCall]>()
      .mockImplementation(({ data }) =>
        Promise.resolve({
          ...priorRun,
          ...data,
          retryCount: 1,
        }),
      );
    const updateMany = jest.fn().mockResolvedValue({ count: claimCount });
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ tags: [] }]),
      workflowRun: { update: updateRun },
      customerTag: { upsert: jest.fn().mockResolvedValue({}) },
      customer: { update: jest.fn().mockResolvedValue({}) },
    };
    const transaction = jest.fn(
      async (callback: (client: unknown) => Promise<unknown>) => callback(tx),
    );
    const prisma = {
      $transaction: transaction,
      workflowRun: {
        findFirst: findRun,
        updateMany,
        update: updateRun,
      },
      workflowVersion: {
        findUnique: jest.fn().mockResolvedValue(version),
      },
      workflowRunAttempt: {
        create: jest.fn().mockResolvedValue({ id: 'attempt-2' }),
      },
      businessUser: {
        findFirst: jest.fn().mockResolvedValue({
          user: { phone: '+15550001111', email: 'owner@example.test' },
        }),
      },
    };
    const sendGate = {
      send: jest.fn().mockResolvedValue({ id: 'message-retried' }),
    };
    const service = new WorkflowTriggerService(
      prisma as unknown as PrismaService,
      sendGate as unknown as SendGateService,
    );
    return {
      service,
      prisma,
      sendGate,
      updateMany,
      updateRun,
      transaction,
      tx,
      setRunSnapshot: (run: RunSnapshot) => {
        runSnapshot = run;
      },
    };
  }

  it('retries only the recorded failed action and keeps the stable action key', async () => {
    const { service, prisma, sendGate, updateRun } = setup();

    const result = await service.retryFailedRun(
      'business-1',
      'workflow-1',
      'run-1',
    );

    expect(sendGate.send).toHaveBeenCalledTimes(1);
    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'business-1',
        idempotencyKey: 'workflow-run:run-1:action:1',
        variables: { body: 'Retry this one' },
      }),
    );
    expect(prisma.workflowRunAttempt.create).toHaveBeenCalledWith({
      data: {
        workflowRunId: 'run-1',
        businessId: 'business-1',
        attemptNumber: 2,
        status: WorkflowRunStatus.running,
      },
    });
    const recordedUpdate = updateRun.mock.calls[0]?.[0];
    expect(recordedUpdate?.where).toEqual({
      id: 'run-1',
      businessId: 'business-1',
      status: WorkflowRunStatus.running,
    });
    expect(recordedUpdate?.data.status).toBe(WorkflowRunStatus.success);
    expect(recordedUpdate?.data.result).toEqual([
      priorRun.result[0],
      {
        actionIndex: 1,
        type: 'notify_owner',
        queued: true,
        messageId: 'message-retried',
      },
    ]);
    expect(result.status).toBe(WorkflowRunStatus.success);
  });

  it('refuses legacy action results that cannot prove what already queued', async () => {
    const { service, prisma, sendGate, setRunSnapshot } = setup();
    setRunSnapshot({
      ...priorRun,
      result: [{ type: 'notify_owner', queued: false }],
    });

    await expect(
      service.retryFailedRun('business-1', 'workflow-1', 'run-1'),
    ).rejects.toBeInstanceOf(AppException);
    expect(prisma.workflowRun.updateMany).not.toHaveBeenCalled();
    expect(sendGate.send).not.toHaveBeenCalled();
  });

  it('does not retry unsupported saved actions that cannot succeed in this runtime', async () => {
    const { service, prisma, sendGate, setRunSnapshot } = setup();
    setRunSnapshot({
      ...priorRun,
      result: [
        {
          actionIndex: 0,
          type: 'legacy_unknown_action',
          completed: false,
          retryable: false,
          unsupported: true,
          error: 'Unsupported action',
        },
      ],
    });
    prisma.workflowVersion.findUnique.mockResolvedValue({
      actions: [{ type: 'legacy_unknown_action', value: 'do not run' }],
    });

    await expect(
      service.retryFailedRun('business-1', 'workflow-1', 'run-1'),
    ).rejects.toMatchObject({
      message:
        'This run contains an unsupported saved action and cannot be retried. Fix the workflow definition and start a new run.',
    });
    expect(prisma.workflowRun.updateMany).not.toHaveBeenCalled();
    expect(sendGate.send).not.toHaveBeenCalled();
  });

  it('recognizes and retries an explicitly failed customer-tag action', async () => {
    const { service, prisma, transaction, tx, updateRun, setRunSnapshot } =
      setup();
    setRunSnapshot({
      ...priorRun,
      result: [
        {
          actionIndex: 0,
          type: 'add_customer_tag',
          completed: false,
          error: 'Temporary database error',
        },
      ],
    });
    prisma.workflowVersion.findUnique.mockResolvedValue({
      actions: [{ type: 'add_customer_tag', tagName: 'vip' }],
    });

    const result = await service.retryFailedRun(
      'business-1',
      'workflow-1',
      'run-1',
    );

    // One transaction applies the customer-tag side effect; another atomically
    // records the terminal run status and any resulting dead letter.
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(tx.customerTag.upsert).toHaveBeenCalledWith({
      where: { businessId_name: { businessId: 'business-1', name: 'vip' } },
      create: { businessId: 'business-1', name: 'vip', kind: 'manual' },
      update: {},
    });
    expect(tx.customer.update).toHaveBeenCalledWith({
      where: { id: 'customer-1' },
      data: { tags: ['vip'] },
    });
    const recordedUpdate = updateRun.mock.calls[0]?.[0];
    expect(recordedUpdate?.data.status).toBe(WorkflowRunStatus.success);
    expect(recordedUpdate?.data.result).toEqual([
      {
        actionIndex: 0,
        type: 'add_customer_tag',
        completed: true,
        added: true,
        customerId: 'customer-1',
        tagName: 'vip',
      },
    ]);
    expect(result.status).toBe(WorkflowRunStatus.success);
  });

  it('records the action index when an owner notification is skipped because no owner exists', async () => {
    const { service, prisma, updateRun } = setup();
    prisma.businessUser.findFirst.mockResolvedValue(null);

    await service.retryFailedRun('business-1', 'workflow-1', 'run-1');

    expect(updateRun.mock.calls[0]?.[0].data.result).toEqual([
      priorRun.result[0],
      {
        actionIndex: 1,
        type: 'notify_owner',
        skipped: true,
        reason: 'no owner found',
      },
    ]);
  });

  it('allows only one concurrent retry claim', async () => {
    const { service, sendGate, updateRun, updateMany } = setup(0);

    await expect(
      service.retryFailedRun('business-1', 'workflow-1', 'run-1'),
    ).rejects.toBeInstanceOf(AppException);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateRun).not.toHaveBeenCalled();
    expect(sendGate.send).not.toHaveBeenCalled();
  });

  it('stops after the configured retry limit', async () => {
    const { service, prisma, sendGate } = setup();
    prisma.workflowRun.findFirst.mockResolvedValue({
      ...priorRun,
      retryCount: 2,
    });

    await expect(
      service.retryFailedRun('business-1', 'workflow-1', 'run-1'),
    ).rejects.toBeInstanceOf(AppException);
    expect(prisma.workflowVersion.findUnique).not.toHaveBeenCalled();
    expect(prisma.workflowRun.updateMany).not.toHaveBeenCalled();
    expect(sendGate.send).not.toHaveBeenCalled();
  });
});
