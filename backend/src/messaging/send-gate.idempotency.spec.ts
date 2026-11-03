import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { TemplateRegistryService } from './templates/template-registry.service';
import { SendGateService } from './send-gate.service';
import { Message } from '@prisma/client';
import { Queue } from 'bullmq';

describe('SendGateService workflow idempotency', () => {
  function setup(status: Message['status']) {
    const message = {
      id: 'message-existing',
      businessId: 'business-1',
      status,
      scheduledFor: null,
    } as Message;
    const client = {
      business: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'business-1' }),
      },
      message: { findFirst: jest.fn().mockResolvedValue(message) },
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const service = new SendGateService(
      { client } as unknown as TenantPrismaService,
      {} as TemplateRegistryService,
      queue as unknown as Queue,
    );
    return { service, client, queue, message };
  }

  const params = {
    businessId: 'business-1',
    templateKey: 'automation_message',
    variables: { body: 'Keep it single' },
    idempotencyKey: 'workflow-run:run-1:action:0',
  };

  it('reuses a queued message and re-adds only the same BullMQ job ID', async () => {
    const { service, client, queue, message } = setup('queued');

    await expect(service.send(params)).resolves.toBe(message);

    expect(client.message.findFirst).toHaveBeenCalledWith({
      where: {
        businessId: 'business-1',
        idempotencyKey: params.idempotencyKey,
      },
    });
    expect(queue.add).toHaveBeenCalledWith(
      'send',
      { messageId: 'message-existing' },
      expect.objectContaining({ jobId: 'message-existing' }),
    );
    expect(client.message).not.toHaveProperty('create');
  });

  it('does not requeue an already sent message', async () => {
    const { service, queue, message } = setup('sent');

    await expect(service.send(params)).resolves.toBe(message);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('does not silently reuse a terminally failed message', async () => {
    const { service, queue } = setup('failed');

    await expect(service.send(params)).rejects.toBeInstanceOf(AppException);
    expect(queue.add).not.toHaveBeenCalled();
  });
});
