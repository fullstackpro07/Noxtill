import { PrismaService } from '../../prisma/prisma.service';
import { OutboundWebhookDispatchService } from './outbound-webhook-dispatch.service';
import type { QueueService } from '../../common/queue/queue.service';
import {
  ActivityEventType,
  IntegrationProvider,
  WorkflowTriggerKey,
} from '@prisma/client';

describe('OutboundWebhookDispatchService (UPD-BE-074)', () => {
  let prisma: PrismaService;
  let service: OutboundWebhookDispatchService;
  let businessId: string;
  const addJob = jest.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const queueService = { addJob };
    service = new OutboundWebhookDispatchService(
      prisma,
      queueService as unknown as QueueService,
      {} as never,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Outbound Dispatch Test Biz',
        slug: `outbound-dispatch-test-${Date.now()}`,
      },
    });
    businessId = business.id;
  });

  afterEach(() => {
    addJob.mockClear();
  });

  afterAll(async () => {
    await prisma.outboundWebhookDelivery.deleteMany({
      where: { webhook: { businessId } },
    });
    await prisma.outboundWebhook.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('creates a real delivery and enqueues a real job for a matching active subscription', async () => {
    const sub = await prisma.outboundWebhook.create({
      data: {
        businessId,
        provider: IntegrationProvider.zapier,
        triggerKey: WorkflowTriggerKey.sale,
        targetUrl: 'https://hooks.zapier.com/hooks/catch/1/a',
        secret: 'test-secret',
      },
    });

    await service.dispatch(businessId, ActivityEventType.sale, {
      description: 'Sale #1 — 10.00',
      entityType: 'Order',
      entityId: 'order_1',
      amount: 10,
    });

    const deliveries = await prisma.outboundWebhookDelivery.findMany({
      where: { webhookId: sub.id },
    });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].payload).toMatchObject({
      trigger: WorkflowTriggerKey.sale,
      description: 'Sale #1 — 10.00',
    });
    expect(addJob).toHaveBeenCalledWith(
      expect.anything(),
      'deliver',
      { deliveryId: deliveries[0].id },
      deliveries[0].id,
    );
  });

  it('an inactive subscription never gets dispatched to', async () => {
    await prisma.outboundWebhook.create({
      data: {
        businessId,
        provider: IntegrationProvider.make,
        triggerKey: WorkflowTriggerKey.review,
        targetUrl: 'https://hook.make.com/inactive',
        secret: 'test-secret',
        active: false,
      },
    });

    await service.dispatch(businessId, ActivityEventType.review, {
      description: '5-star review',
    });

    const deliveries = await prisma.outboundWebhookDelivery.findMany({
      where: { webhook: { businessId, provider: IntegrationProvider.make } },
    });
    expect(deliveries).toHaveLength(0);
    expect(addJob).not.toHaveBeenCalled();
  });

  it('an activity type with no real trigger mapping (e.g. a raw booking that is not a completion) dispatches nothing', async () => {
    await service.dispatch(businessId, ActivityEventType.booking, {
      description: 'Appointment rescheduled',
    });
    expect(addJob).not.toHaveBeenCalled();
  });
});
