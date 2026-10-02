import { ClsService } from 'nestjs-cls';
import { WorkflowRunStatus, WorkflowTriggerKey } from '@prisma/client';
import type { Queue } from 'bullmq';
import { CLS_KEY_BUSINESS_ID } from '../../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AutomationCommandCenterService } from './automation-command-center.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('AutomationCommandCenterService (MySQL)', () => {
  let prisma: PrismaService;
  let tenant: TenantPrismaService;
  let businessId: string;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    tenant = new TenantPrismaService(prisma, cls as unknown as ClsService);
    businessId = (
      await prisma.business.create({
        data: { name: 'Command Center', slug: `command-center-${stamp}` },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const trigger = Object.values(WorkflowTriggerKey)[0];
    const scheduled = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Nightly digest',
        triggerKey: trigger,
        active: true,
        nextScheduleAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    await prisma.workflow.create({
      data: { businessId, name: 'Paused one', triggerKey: trigger },
    });
    const run = (
      status: WorkflowRunStatus,
      extra: Record<string, unknown> = {},
    ) =>
      prisma.workflowRun.create({
        data: {
          businessId,
          workflowId: scheduled.id,
          status,
          context: {},
          ...extra,
        },
      });
    await run(WorkflowRunStatus.success);
    await run(WorkflowRunStatus.success);
    await run(WorkflowRunStatus.failed, { error: 'SMS provider rejected' });
    await run(WorkflowRunStatus.waiting, {
      waitingUntil: new Date(Date.now() - 60 * 60 * 1000),
    });
    const approvalRun = await run(WorkflowRunStatus.waiting, {
      waitingUntil: new Date(Date.now() + 60 * 60 * 1000),
    });
    await prisma.workflowApproval.create({
      data: {
        businessId,
        workflowId: scheduled.id,
        workflowRunId: approvalRun.id,
        actionIndex: 0,
        title: 'Send discount SMS',
        description: 'd',
        payload: {},
        payloadHash: 'a'.repeat(64),
      },
    });
  });

  afterAll(async () => {
    await prisma.workflowApproval.deleteMany({ where: { businessId } });
    await prisma.workflowRun.deleteMany({ where: { businessId } });
    await prisma.workflow.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('summarises real workflow health and flags what needs attention', async () => {
    const service = new AutomationCommandCenterService(tenant, undefined);
    const overview = await service.overview(businessId);
    expect(overview.workflows).toEqual({ active: 1, paused: 1 });
    expect(overview.runs24h).toMatchObject({
      total: 5,
      success: 2,
      failed: 1,
      failureRatePct: 33.3,
    });
    expect(overview).toMatchObject({
      waiting: 2,
      overdueWaits: 1,
      pendingApprovals: 1,
    });
    expect(overview.oldestApprovals[0]).toMatchObject({
      title: 'Send discount SMS',
    });
    expect(overview.upcoming.map((row) => row.name)).toEqual([
      'Nightly digest',
    ]);
    expect(overview.recentFailures[0].error).toBe('SMS provider rejected');
    expect(overview.queue).toEqual({ reachable: false, counts: null });
    expect(overview.attention.map((row) => row.key).sort()).toEqual([
      'approvals',
      'failures',
      'queue',
      'waits',
    ]);
  });

  it('reads live queue counts when the queue answers', async () => {
    const queue = {
      getJobCounts: jest.fn().mockResolvedValue({
        waiting: 2,
        active: 1,
        delayed: 4,
        failed: 0,
        completed: 9,
      }),
    } as unknown as Queue;
    const overview = await new AutomationCommandCenterService(
      tenant,
      queue,
    ).overview(businessId);
    expect(overview.queue).toEqual({
      reachable: true,
      counts: { waiting: 2, active: 1, delayed: 4, failed: 0, completed: 9 },
    });
    expect(overview.attention.map((row) => row.key)).not.toContain('queue');
  });
});
