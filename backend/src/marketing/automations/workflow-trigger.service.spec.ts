import { PrismaService } from '../../prisma/prisma.service';
import { WorkflowTriggerService } from './workflow-trigger.service';
import { SendGateService } from '../../messaging/send-gate.service';
import { ActivityEventType, Role, WorkflowTriggerKey } from '@prisma/client';

describe('WorkflowTriggerService (UPD-BE-028)', () => {
  let prisma: PrismaService;
  let service: WorkflowTriggerService;
  let businessId: string;
  let customerId: string;
  let ownerUserId: string;
  const sendGate = { send: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new WorkflowTriggerService(
      prisma,
      sendGate as unknown as SendGateService,
    );

    const business = await prisma.business.create({
      data: { name: 'Trigger Test Biz', slug: `trigger-test-${Date.now()}` },
    });
    businessId = business.id;

    const customer = await prisma.customer.create({
      data: { businessId, phone: `+1${Date.now()}`, name: 'Trigger Customer' },
    });
    customerId = customer.id;

    const user = await prisma.user.create({
      data: {
        phone: `+1${Date.now()}9`,
        name: 'Owner',
        passwordHash: 'test-hash',
      },
    });
    ownerUserId = user.id;
    await prisma.businessUser.create({
      data: { businessId, userId: user.id, role: Role.owner },
    });
  });

  afterEach(() => {
    sendGate.send.mockClear();
  });

  afterAll(async () => {
    await prisma.workflowRun.deleteMany({ where: { businessId } });
    await prisma.workflow.deleteMany({ where: { businessId } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.user.delete({ where: { id: ownerUserId } });
    await prisma.$disconnect();
  });

  it('no-ops when no active workflow matches the trigger — never writes a WorkflowRun', async () => {
    await service.dispatch(businessId, ActivityEventType.sale, {
      description: 'Sale #1 — 50',
    });
    const count = await prisma.workflowRun.count({ where: { businessId } });
    expect(count).toBe(0);
    expect(sendGate.send).not.toHaveBeenCalled();
  });

  it('runs a matching workflow end-to-end: sends the real message and records a success run', async () => {
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Thank big spenders',
        triggerKey: WorkflowTriggerKey.sale,
        conditions: [{ field: 'orderTotal', operator: 'gt', value: 100 }],
        actions: [{ type: 'send_customer_message', messageBody: 'Thanks!' }],
      },
    });
    const order = await prisma.order.create({
      data: { businessId, orderNo: 1, customerId, total: 250 },
    });

    await service.dispatch(businessId, ActivityEventType.sale, {
      description: `Sale #${order.orderNo} — 250`,
      entityType: 'Order',
      entityId: order.id,
    });

    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId,
        customerId,
        templateKey: 'automation_message',
      }),
    );

    const runs = await prisma.workflowRun.findMany({
      where: { workflowId: workflow.id },
    });
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('success');

    // Deactivate so later tests' dispatch() calls (same businessId+triggerKey) don't also match it.
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { active: false },
    });
  });

  it('records a skipped run without sending anything when conditions do not match', async () => {
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Thank huge spenders only',
        triggerKey: WorkflowTriggerKey.sale,
        conditions: [{ field: 'orderTotal', operator: 'gt', value: 10000 }],
        actions: [{ type: 'send_customer_message', messageBody: 'Wow!' }],
      },
    });
    const order = await prisma.order.create({
      data: { businessId, orderNo: 2, customerId, total: 250 },
    });

    await service.dispatch(businessId, ActivityEventType.sale, {
      description: `Sale #${order.orderNo} — 250`,
      entityType: 'Order',
      entityId: order.id,
    });

    expect(sendGate.send).not.toHaveBeenCalled();
    const runs = await prisma.workflowRun.findMany({
      where: { workflowId: workflow.id },
    });
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('skipped');

    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { active: false },
    });
  });

  it('never fires for an inactive workflow', async () => {
    await prisma.workflow.create({
      data: {
        businessId,
        name: 'Disabled automation',
        triggerKey: WorkflowTriggerKey.sale,
        conditions: [],
        actions: [{ type: 'send_customer_message', messageBody: 'Hi' }],
        active: false,
      },
    });
    const order = await prisma.order.create({
      data: { businessId, orderNo: 3, customerId, total: 5 },
    });

    await service.dispatch(businessId, ActivityEventType.sale, {
      description: `Sale #${order.orderNo} — 5`,
      entityType: 'Order',
      entityId: order.id,
    });

    expect(sendGate.send).not.toHaveBeenCalled();
  });

  it('records a real send failure inside the run result without ever throwing back to the caller', async () => {
    sendGate.send.mockRejectedValueOnce(new Error('quota exceeded'));
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Notify owner on every sale',
        triggerKey: WorkflowTriggerKey.sale,
        conditions: [],
        actions: [{ type: 'notify_owner', messageBody: 'A sale happened' }],
      },
    });
    const order = await prisma.order.create({
      data: { businessId, orderNo: 4, customerId, total: 5 },
    });

    await expect(
      service.dispatch(businessId, ActivityEventType.sale, {
        description: `Sale #${order.orderNo} — 5`,
        entityType: 'Order',
        entityId: order.id,
      }),
    ).resolves.toBeUndefined();

    const run = await prisma.workflowRun.findFirstOrThrow({
      where: { workflowId: workflow.id },
    });
    expect(run.status).toBe('success');
    expect(JSON.stringify(run.result)).toContain('quota exceeded');

    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { active: false },
    });
  });

  it('maps a "booking" ActivityEvent to a trigger only when its description is "Appointment completed"', async () => {
    await prisma.workflow.create({
      data: {
        businessId,
        name: 'Should never fire',
        triggerKey: WorkflowTriggerKey.booking_completed,
        conditions: [],
        actions: [{ type: 'notify_owner', messageBody: 'test' }],
      },
    });

    await service.dispatch(businessId, ActivityEventType.booking, {
      description: 'Appointment cancelled',
    });
    expect(sendGate.send).not.toHaveBeenCalled();

    const count = await prisma.workflowRun.count({ where: { businessId } });
    const before = count;

    await service.dispatch(businessId, ActivityEventType.booking, {
      description: 'Appointment completed',
    });
    const after = await prisma.workflowRun.count({ where: { businessId } });
    expect(after).toBe(before + 1);
  });
});
