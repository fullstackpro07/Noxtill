import {
  ActivityEventType,
  Role,
  WorkflowRunStatus,
  WorkflowTriggerKey,
} from '@prisma/client';
import { PrismaService as PrismaClientService } from '../../prisma/prisma.service';
import { SendGateService } from '../../messaging/send-gate.service';
import { WorkflowTriggerService } from './workflow-trigger.service';

function firstCallArgument(mock: { mock: { calls: unknown[][] } }): unknown {
  return mock.mock.calls[0]?.[0];
}

describe('WorkflowTriggerService event idempotency', () => {
  it('claims one run per workflow and activity event before sending', async () => {
    const duplicateError = Object.assign(new Error('duplicate event claim'), {
      code: 'P2002',
    });
    const createRun = jest
      .fn()
      .mockResolvedValueOnce({ id: 'run_1' })
      .mockRejectedValueOnce(duplicateError);
    const updateRun = jest.fn().mockResolvedValue({ id: 'run_1' });
    const workflow = {
      id: 'workflow_1',
      version: 3,
      conditions: [],
      actions: [{ type: 'notify_owner', messageBody: 'Sale received' }],
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (client: unknown) => Promise<unknown>) =>
          callback({ workflowRun: { update: updateRun } }),
      ),
      workflow: { findMany: jest.fn().mockResolvedValue([workflow]) },
      // Monthly run limit lookup (no policy set → unlimited).
      business: { findUnique: jest.fn().mockResolvedValue({ policies: {} }) },
      workflowRun: {
        create: createRun,
        update: updateRun,
        findFirst: jest.fn().mockResolvedValue({
          status: WorkflowRunStatus.running,
        }),
      },
      businessUser: {
        findFirst: jest.fn().mockResolvedValue({
          user: { phone: '+15550001111', email: 'owner@example.test' },
        }),
      },
    };
    const sendGate = { send: jest.fn().mockResolvedValue({ id: 'message_1' }) };
    const service = new WorkflowTriggerService(
      prisma as unknown as PrismaClientService,
      sendGate as unknown as SendGateService,
    );
    const event = {
      eventId: 'activity_event_1',
      description: 'Sale completed',
    };

    await Promise.all([
      service.dispatch('business_1', ActivityEventType.sale, event),
      service.dispatch('business_1', ActivityEventType.sale, event),
    ]);

    expect(sendGate.send).toHaveBeenCalledTimes(1);
    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'workflow-run:run_1:action:0',
      }),
    );
    expect(createRun).toHaveBeenCalledTimes(2);
    expect(firstCallArgument(createRun)).toMatchObject({
      data: {
        workflowId: workflow.id,
        businessId: 'business_1',
        workflowVersion: workflow.version,
        triggerEventId: event.eventId,
        status: WorkflowRunStatus.running,
        context: {
          eventId: event.eventId,
          description: event.description,
        },
      },
    });
    expect(updateRun).toHaveBeenCalledTimes(1);
    expect(prisma.workflow.findMany).toHaveBeenCalledWith({
      where: {
        businessId: 'business_1',
        triggerKey: WorkflowTriggerKey.sale,
        active: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(prisma.businessUser.findFirst).toHaveBeenCalledWith({
      where: { businessId: 'business_1', role: Role.owner },
      include: { user: true },
    });
  });
});
