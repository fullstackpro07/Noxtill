import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../../common/tenancy/tenant.constants';
import { WorkflowsService } from './workflows.service';
import { AppException } from '../../common/filters/app.exception';
import {
  ActivityEventType,
  WorkflowRunStatus,
  WorkflowTriggerKey,
} from '../../../generated/prisma';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('WorkflowsService (UPD-BE-028)', () => {
  let prisma: PrismaService;
  let service: WorkflowsService;
  let businessId: string;
  let customerId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new WorkflowsService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Workflows Test Biz',
        slug: `workflows-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const customer = await prisma.customer.create({
      data: { businessId, phone: `+1${Date.now()}`, name: 'Workflow Customer' },
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    await prisma.workflowRun.deleteMany({ where: { businessId } });
    await prisma.workflow.deleteMany({ where: { businessId } });
    await prisma.activityEvent.deleteMany({ where: { businessId } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('creates, lists (filtered by trigger), updates, and deletes a real workflow', async () => {
    const workflow = await service.create(businessId, {
      name: 'Big sale thank-you',
      triggerKey: WorkflowTriggerKey.sale,
      conditions: [{ field: 'orderTotal', operator: 'gt', value: 100 }],
      actions: [{ type: 'send_customer_message', messageBody: 'Thanks!' }],
    });
    expect(workflow.active).toBe(true);

    const list = await service.list(WorkflowTriggerKey.sale);
    expect(list.some((w) => w.id === workflow.id)).toBe(true);
    expect(await service.list(WorkflowTriggerKey.birthday)).toHaveLength(0);

    const updated = await service.update(workflow.id, { active: false });
    expect(updated.active).toBe(false);

    await service.remove(workflow.id);
    await expect(service.findOne(workflow.id)).rejects.toBeInstanceOf(
      AppException,
    );
  });

  it('rejects operations against an unknown workflow id', async () => {
    await expect(service.findOne('not-a-real-id')).rejects.toBeInstanceOf(
      AppException,
    );
  });

  it('test() dry-runs against the most recent real matching event without writing a WorkflowRun', async () => {
    const workflow = await service.create(businessId, {
      name: 'Sale over 100',
      triggerKey: WorkflowTriggerKey.sale,
      conditions: [{ field: 'orderTotal', operator: 'gt', value: 100 }],
      actions: [{ type: 'send_customer_message', messageBody: 'Thanks!' }],
    });

    const noEventResult = await service.test(workflow.id);
    expect(noEventResult.foundRecentEvent).toBe(false);
    expect(noEventResult.matched).toBe(false);

    const order = await prisma.order.create({
      data: { businessId, orderNo: 1, customerId, total: 250 },
    });
    await prisma.activityEvent.create({
      data: {
        businessId,
        type: ActivityEventType.sale,
        description: `Sale #${order.orderNo} — 250`,
        entityType: 'Order',
        entityId: order.id,
      },
    });

    const result = await service.test(workflow.id);
    expect(result.foundRecentEvent).toBe(true);
    expect(result.matched).toBe(true);
    expect(result.context).toMatchObject({ customerId, orderTotal: 250 });
    expect(result.wouldExecuteActions).toEqual(workflow.actions);

    const runCount = await prisma.workflowRun.count({
      where: { workflowId: workflow.id },
    });
    expect(runCount).toBe(0); // dry run — no side effects, ever
  });

  it('test() reports matched=false when the real event fails the condition', async () => {
    const workflow = await service.create(businessId, {
      name: 'Sale over 10000',
      triggerKey: WorkflowTriggerKey.sale,
      conditions: [{ field: 'orderTotal', operator: 'gt', value: 10000 }],
      actions: [{ type: 'notify_owner', messageBody: 'Huge sale!' }],
    });

    const order = await prisma.order.create({
      data: { businessId, orderNo: 2, customerId, total: 250 },
    });
    await prisma.activityEvent.create({
      data: {
        businessId,
        type: ActivityEventType.sale,
        description: `Sale #${order.orderNo} — 250`,
        entityType: 'Order',
        entityId: order.id,
      },
    });

    const result = await service.test(workflow.id);
    expect(result.foundRecentEvent).toBe(true);
    expect(result.matched).toBe(false);
    expect(result.wouldExecuteActions).toEqual([]);
  });

  it('listRuns returns real WorkflowRun rows for a workflow', async () => {
    const workflow = await service.create(businessId, {
      name: 'Run history test',
      triggerKey: WorkflowTriggerKey.review,
    });
    await prisma.workflowRun.create({
      data: {
        workflowId: workflow.id,
        businessId,
        status: WorkflowRunStatus.success,
        context: { customerId },
      },
    });

    const runs = await service.listRuns(workflow.id);
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('success');
  });
});
