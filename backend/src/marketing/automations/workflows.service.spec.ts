import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../../common/tenancy/tenant.constants';
import { WorkflowsService } from './workflows.service';
import { ListWorkflowRunsDto } from './dto/list-workflow-runs.dto';
import { AppException } from '../../common/filters/app.exception';
import {
  ActivityEventType,
  WorkflowConditionMode,
  WorkflowRunStatus,
  WorkflowTriggerKey,
} from '@prisma/client';

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
  let cls: FakeClsService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    cls = new FakeClsService();
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
    await prisma.customerCustomField.deleteMany({ where: { businessId } });
    await prisma.activityEvent.deleteMany({ where: { businessId } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('creates, lists (filtered by trigger), updates, and archives a real workflow', async () => {
    const workflow = await service.create(businessId, {
      name: 'Big sale thank-you',
      triggerKey: WorkflowTriggerKey.sale,
      conditions: [{ field: 'orderTotal', operator: 'gt', value: 100 }],
      actions: [{ type: 'send_customer_message', messageBody: 'Thanks!' }],
    });
    expect(workflow.active).toBe(false);
    expect(workflow.version).toBe(1);
    expect(await service.listVersions(workflow.id)).toMatchObject([
      { version: 1, name: 'Big sale thank-you' },
    ]);

    const list = await service.list(WorkflowTriggerKey.sale);
    expect(list.some((w) => w.id === workflow.id)).toBe(true);
    expect(await service.list(WorkflowTriggerKey.birthday)).toHaveLength(0);

    const activated = await service.update(workflow.id, { active: true });
    expect(activated.active).toBe(true);
    expect(activated.version).toBe(1);

    const updated = await service.update(workflow.id, { active: false });
    expect(updated.active).toBe(false);
    expect(updated.version).toBe(1);

    const revised = await service.update(workflow.id, {
      name: 'Big sale thank-you v2',
    });
    expect(revised.version).toBe(2);
    expect(await service.listVersions(workflow.id)).toMatchObject([
      { version: 2, name: 'Big sale thank-you v2' },
      { version: 1, name: 'Big sale thank-you' },
    ]);

    const archived = await service.remove(workflow.id);
    expect(archived.active).toBe(false);
    expect(archived.archivedAt).toBeInstanceOf(Date);
    expect(await service.list(WorkflowTriggerKey.sale)).toHaveLength(0);
    const archivedWorkflows = await service.list(WorkflowTriggerKey.sale, true);
    expect(
      archivedWorkflows.some(
        (item) => item.id === workflow.id && item.archivedAt instanceof Date,
      ),
    ).toBe(true);
    await expect(
      service.update(workflow.id, { active: true }),
    ).rejects.toMatchObject({
      response: { code: 'workflow.archived' },
    });
  });

  it('installs a real built-in template as a paused workflow with an immutable version', async () => {
    const workflow = await service.installTemplate(
      businessId,
      'inventory-low-stock-owner-alert',
      'Inventory alert for review',
    );

    expect(workflow.name).toBe('Inventory alert for review');
    expect(workflow.triggerKey).toBe(WorkflowTriggerKey.low_stock);
    expect(workflow.active).toBe(false);
    expect(workflow.actions).toEqual([
      {
        type: 'notify_owner',
        messageBody: 'Low-stock alert: {{description}}',
      },
    ]);
    expect(await service.listVersions(workflow.id)).toMatchObject([
      {
        version: 1,
        name: 'Inventory alert for review',
        triggerKey: WorkflowTriggerKey.low_stock,
        actions: workflow.actions,
      },
    ]);
  });

  it('restores an earlier definition as a new version without changing in-flight run pins', async () => {
    const original = await service.create(businessId, {
      name: 'Version rollback sample',
      triggerKey: WorkflowTriggerKey.sale,
      conditions: [],
      actions: [{ type: 'notify_owner', messageBody: 'Original definition' }],
    });
    const edited = await service.update(original.id, {
      name: 'Version rollback sample edited',
      actions: [{ type: 'notify_owner', messageBody: 'New definition' }],
      expectedVersion: original.version,
      expectedUpdatedAt: original.updatedAt.toISOString(),
    });
    const active = await service.update(original.id, {
      active: true,
      expectedVersion: edited.version,
      expectedUpdatedAt: edited.updatedAt.toISOString(),
    });
    const inFlightRun = await prisma.workflowRun.create({
      data: {
        businessId,
        workflowId: original.id,
        workflowVersion: edited.version,
        status: WorkflowRunStatus.running,
        context: { event: 'already started' },
      },
    });

    await expect(
      service.restoreVersion(original.id, 1, {
        expectedVersion: active.version,
        expectedUpdatedAt: active.updatedAt.toISOString(),
        reason: '   ',
      }),
    ).rejects.toMatchObject({
      response: { code: 'workflow.version_restore_reason_required' },
    });

    const rollbackReason =
      'Restoring the last known good definition after a bad edit';
    const rolledBack = await service.restoreVersion(original.id, 1, {
      expectedVersion: active.version,
      expectedUpdatedAt: active.updatedAt.toISOString(),
      reason: rollbackReason,
    });

    expect(rolledBack).toMatchObject({
      version: 3,
      name: 'Version rollback sample',
      actions: [{ type: 'notify_owner', messageBody: 'Original definition' }],
      active: true,
    });
    const pinnedRun = await prisma.workflowRun.findUniqueOrThrow({
      where: { id: inFlightRun.id },
    });
    expect(pinnedRun).toMatchObject({
      workflowVersion: edited.version,
      status: WorkflowRunStatus.running,
    });

    const history = await service.listVersions(original.id);
    expect(history.map((version) => version.version)).toEqual([3, 2, 1]);
    expect(history[2]).toMatchObject({
      name: 'Version rollback sample',
      actions: [{ type: 'notify_owner', messageBody: 'Original definition' }],
    });
    expect(history[0].id).not.toBe(history[2].id);
    const rollbackAudit = await prisma.auditLog.findFirstOrThrow({
      where: {
        businessId,
        action: 'restore_version',
        entity: 'workflow',
        entityId: original.id,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(rollbackAudit.after).toMatchObject({
      restoredFromVersion: 1,
      reason: rollbackReason,
    });

    await expect(
      service.restoreVersion(original.id, 1, {
        expectedVersion: active.version,
        expectedUpdatedAt: active.updatedAt.toISOString(),
        reason: rollbackReason,
      }),
    ).rejects.toMatchObject({
      response: { code: 'workflow.version_conflict' },
    });

    const restoredAgain = await service.restoreVersion(original.id, 1, {
      expectedVersion: rolledBack.version,
      expectedUpdatedAt: rolledBack.updatedAt.toISOString(),
      reason: 'Restoring the same known-good version after another bad edit',
    });
    expect(restoredAgain.version).toBe(4);
    expect(restoredAgain.actions).toEqual(rolledBack.actions);
    await expect(
      service.restoreVersion(original.id, 4, {
        expectedVersion: restoredAgain.version,
        expectedUpdatedAt: restoredAgain.updatedAt.toISOString(),
        reason: 'This should fail because the selected version is current',
      }),
    ).rejects.toMatchObject({
      response: { code: 'workflow.version_restore_not_allowed' },
    });
  });

  it('returns a typed not-found error for unknown built-in templates', async () => {
    let thrown: unknown;
    try {
      await service.installTemplate(businessId, 'unknown-template-id');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      response: { code: 'workflow.template_not_found' },
    });
  });

  it('duplicates definitions as paused drafts and restores archived workflows without reactivating them', async () => {
    const source = await service.create(businessId, {
      name: 'Duplicate candidate',
      triggerKey: WorkflowTriggerKey.sale,
      conditions: [{ field: 'orderTotal', operator: 'gt', value: 50 }],
      conditionMode: WorkflowConditionMode.any,
      actions: [{ type: 'notify_owner', messageBody: 'New sale' }],
    });
    await service.update(source.id, { active: true });

    const copy = await service.duplicate(source.id);

    expect(copy.id).not.toBe(source.id);
    expect(copy.name).toBe('Duplicate candidate (copy)');
    expect(copy.active).toBe(false);
    expect(copy.archivedAt).toBeNull();
    expect(copy.conditions).toEqual(source.conditions);
    expect(copy.conditionMode).toBe(WorkflowConditionMode.any);
    expect(copy.actions).toEqual(source.actions);
    expect(await service.listVersions(copy.id)).toMatchObject([
      { version: 1, name: 'Duplicate candidate (copy)' },
    ]);

    await service.archive(source.id);
    const restored = await service.restore(source.id);
    expect(restored.archivedAt).toBeNull();
    expect(restored.active).toBe(false);
    expect(restored.nextScheduleAt).toBeNull();
  });

  it('rejects stale edits instead of overwriting a newer workflow version', async () => {
    const workflow = await service.create(businessId, {
      name: 'Concurrency check',
      triggerKey: WorkflowTriggerKey.sale,
      conditions: [],
      actions: [{ type: 'notify_owner', messageBody: 'Sale received' }],
    });

    const latest = await service.update(workflow.id, {
      name: 'Concurrency check updated',
      expectedVersion: workflow.version,
      expectedUpdatedAt: workflow.updatedAt.toISOString(),
    });
    expect(latest.version).toBe(workflow.version + 1);

    await expect(
      service.update(workflow.id, {
        name: 'Stale overwrite',
        expectedVersion: workflow.version,
        expectedUpdatedAt: workflow.updatedAt.toISOString(),
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'workflow.version_conflict',
      },
    });

    const persisted = await service.findOne(workflow.id);
    expect(persisted.name).toBe('Concurrency check updated');
    expect(persisted.version).toBe(latest.version);
  });

  it('persists interval schedules in immutable versions and schedules the first run on activation', async () => {
    const workflow = await service.create(businessId, {
      name: 'Hourly owner check-in',
      triggerKey: WorkflowTriggerKey.scheduled,
      scheduleEveryMinutes: 60,
      conditions: [],
      actions: [
        { type: 'notify_owner', messageBody: 'Scheduled at {{scheduledAt}}' },
      ],
    });

    expect(workflow.active).toBe(false);
    expect(workflow.nextScheduleAt).toBeNull();
    expect(await service.listVersions(workflow.id)).toMatchObject([
      { version: 1, scheduleEveryMinutes: 60 },
    ]);

    const beforeActivation = Date.now();
    const active = await service.update(workflow.id, { active: true });
    expect(active.nextScheduleAt?.getTime()).toBeGreaterThanOrEqual(
      beforeActivation + 60 * 60 * 1000,
    );

    const dryRun = await service.test(workflow.id);
    expect(dryRun.triggerKey).toBe(WorkflowTriggerKey.scheduled);
    expect(dryRun.foundRecentEvent).toBe(true);
    expect(dryRun.matched).toBe(true);
    expect(typeof dryRun.context?.scheduledAt).toBe('string');
    expect(dryRun.actionPreviews[0]?.body?.startsWith('Scheduled at')).toBe(
      true,
    );
    expect(dryRun.actionPreviews[0]?.error).toBeNull();

    const revised = await service.update(workflow.id, {
      scheduleEveryMinutes: 120,
      expectedVersion: active.version,
      expectedUpdatedAt: active.updatedAt.toISOString(),
    });
    expect(revised.version).toBe(active.version + 1);
    expect(revised.scheduleEveryMinutes).toBe(120);
    expect(revised.nextScheduleAt?.getTime()).toBeGreaterThanOrEqual(
      Date.now() + 120 * 60 * 1000 - 1000,
    );
    expect(await service.listVersions(workflow.id)).toMatchObject([
      { version: 2, scheduleEveryMinutes: 120 },
      { version: 1, scheduleEveryMinutes: 60 },
    ]);
  });

  it('persists cron schedules, starts at the next local-time occurrence, and can switch back to an interval', async () => {
    const workflow = await service.create(businessId, {
      name: 'Weekday morning owner summary',
      triggerKey: WorkflowTriggerKey.scheduled,
      scheduleCronExpression: '0 9 * * 1-5',
      scheduleTimezone: 'Asia/Karachi',
      conditions: [],
      actions: [{ type: 'notify_owner', messageBody: 'Scheduled summary' }],
    });

    expect(workflow.scheduleEveryMinutes).toBeNull();
    expect(workflow.scheduleCronExpression).toBe('0 9 * * 1-5');
    expect(workflow.scheduleTimezone).toBe('Asia/Karachi');
    expect(await service.listVersions(workflow.id)).toMatchObject([
      {
        version: 1,
        scheduleEveryMinutes: null,
        scheduleCronExpression: '0 9 * * 1-5',
        scheduleTimezone: 'Asia/Karachi',
      },
    ]);

    const activatedAt = new Date();
    const active = await service.update(workflow.id, { active: true });
    const nextParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(active.nextScheduleAt!);
    const nextPart = (type: string) =>
      nextParts.find((part) => part.type === type)?.value;
    expect(active.nextScheduleAt?.getTime()).toBeGreaterThan(
      activatedAt.getTime(),
    );
    expect(nextPart('hour')).toBe('09');
    expect(nextPart('minute')).toBe('00');

    const interval = await service.update(workflow.id, {
      scheduleEveryMinutes: 120,
      expectedVersion: active.version,
      expectedUpdatedAt: active.updatedAt.toISOString(),
    });
    expect(interval.scheduleEveryMinutes).toBe(120);
    expect(interval.scheduleCronExpression).toBeNull();
    expect(interval.nextScheduleAt?.getTime()).toBeGreaterThanOrEqual(
      Date.now() + 120 * 60 * 1000 - 1000,
    );
    expect(await service.listVersions(workflow.id)).toMatchObject([
      { version: 2, scheduleEveryMinutes: 120, scheduleCronExpression: null },
      {
        version: 1,
        scheduleEveryMinutes: null,
        scheduleCronExpression: '0 9 * * 1-5',
      },
    ]);
  });

  it('previews five upcoming scheduled runs in the configured timezone without storing a workflow', () => {
    const preview = service.previewSchedule({
      scheduleCronExpression: '0 9 * * 1-5',
      scheduleTimezone: 'Asia/Karachi',
    });
    expect(preview.mode).toBe('cron');
    expect(preview.timezone).toBe('Asia/Karachi');
    expect(preview.occurrences).toHaveLength(5);
    expect(preview.occurrences[0].getTime()).toBeGreaterThan(
      preview.generatedAt.getTime(),
    );
    for (const occurrence of preview.occurrences) {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: preview.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(occurrence);
      expect(parts.find((part) => part.type === 'hour')?.value).toBe('09');
      expect(parts.find((part) => part.type === 'minute')?.value).toBe('00');
    }
    for (let index = 1; index < preview.occurrences.length; index += 1) {
      expect(preview.occurrences[index].getTime()).toBeGreaterThan(
        preview.occurrences[index - 1].getTime(),
      );
    }
  });

  it('persists condition matching mode in live definitions and immutable versions', async () => {
    const workflow = await service.create(businessId, {
      name: 'Any sale qualification',
      triggerKey: WorkflowTriggerKey.sale,
      conditions: [{ field: 'orderTotal', operator: 'gt', value: 100 }],
      conditionMode: WorkflowConditionMode.any,
      actions: [{ type: 'notify_owner', messageBody: 'Qualified sale' }],
    });

    expect(workflow.conditionMode).toBe(WorkflowConditionMode.any);
    expect(await service.listVersions(workflow.id)).toMatchObject([
      { version: 1, conditionMode: WorkflowConditionMode.any },
    ]);

    const changed = await service.update(workflow.id, {
      conditionMode: WorkflowConditionMode.all,
      expectedVersion: workflow.version,
      expectedUpdatedAt: workflow.updatedAt.toISOString(),
    });

    expect(changed.conditionMode).toBe(WorkflowConditionMode.all);
    expect(changed.version).toBe(workflow.version + 1);
    expect(await service.listVersions(workflow.id)).toMatchObject([
      { version: 2, conditionMode: WorkflowConditionMode.all },
      { version: 1, conditionMode: WorkflowConditionMode.any },
    ]);
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
      actions: [
        {
          type: 'send_customer_message',
          messageBody: 'Hi {{customerName}}, thanks!',
        },
      ],
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
    expect(result.context).toMatchObject({
      customerId,
      customerName: 'Workflow Customer',
      orderTotal: 250,
    });
    expect(result.wouldExecuteActions).toEqual(workflow.actions);
    expect(result.actionPreviews).toEqual([
      {
        actionIndex: 0,
        body: 'Hi Workflow Customer, thanks!',
        error: null,
      },
    ]);

    const runCount = await prisma.workflowRun.count({
      where: { workflowId: workflow.id },
    });
    expect(runCount).toBe(0); // dry run — no side effects, ever
  });

  it('test() previews a typed trigger value for a mapped CRM field without saving it', async () => {
    const fieldName = `Dry run total ${Date.now()}`;
    await prisma.customerCustomField.create({
      data: { businessId, name: fieldName, type: 'number' },
    });
    const workflow = await service.create(businessId, {
      name: 'Preview last sale total',
      triggerKey: WorkflowTriggerKey.sale,
      conditions: [],
      actions: [
        {
          type: 'set_customer_custom_field',
          fieldName,
          value: '{{orderTotal}}',
        },
      ],
    });
    const order = await prisma.order.create({
      data: {
        businessId,
        orderNo: 19,
        customerId,
        total: 250.5,
      },
    });
    await prisma.activityEvent.create({
      data: {
        businessId,
        type: ActivityEventType.sale,
        description: `Sale #${order.orderNo} — 250.50`,
        entityType: 'Order',
        entityId: order.id,
      },
    });

    const result = await service.test(workflow.id);

    expect(result.actionPreviews).toEqual([
      {
        actionIndex: 0,
        body: `Dry run only: would set "${fieldName}" on the canonical CRM customer; no record is changed.`,
        error: null,
      },
    ]);
    expect(
      await prisma.customer.findUniqueOrThrow({ where: { id: customerId } }),
    ).toMatchObject({ customFieldValues: {} });
    expect(
      await prisma.workflowRun.count({ where: { workflowId: workflow.id } }),
    ).toBe(0);
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

  it('test() evaluates configured any-condition matching against real activity data', async () => {
    const workflow = await service.create(businessId, {
      name: 'Sale matches either rule',
      triggerKey: WorkflowTriggerKey.sale,
      conditions: [
        { field: 'orderTotal', operator: 'gt', value: 10000 },
        { field: 'orderTotal', operator: 'lte', value: 500 },
      ],
      conditionMode: WorkflowConditionMode.any,
      actions: [{ type: 'notify_owner', messageBody: 'Sale matched' }],
    });
    const order = await prisma.order.create({
      data: { businessId, orderNo: 3, customerId, total: 250 },
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

    expect(result.matched).toBe(true);
    expect(result.wouldExecuteActions).toEqual(workflow.actions);
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

  it('lists business executions with filters and stable cursor pagination', async () => {
    const firstWorkflow = await service.create(businessId, {
      name: 'Execution feed first workflow',
      triggerKey: WorkflowTriggerKey.sale,
    });
    const secondWorkflow = await service.create(businessId, {
      name: 'Execution feed second workflow',
      triggerKey: WorkflowTriggerKey.review,
    });
    const dates = [
      new Date('2026-09-28T10:00:00.000Z'),
      new Date('2026-09-28T11:00:00.000Z'),
      new Date('2026-09-28T12:00:00.000Z'),
    ];
    const runs = await Promise.all([
      prisma.workflowRun.create({
        data: {
          workflowId: firstWorkflow.id,
          businessId,
          triggerEventId: `exec-feed-${Date.now()}-1`,
          status: WorkflowRunStatus.success,
          context: { orderTotal: 12 },
          createdAt: dates[0],
        },
      }),
      prisma.workflowRun.create({
        data: {
          workflowId: firstWorkflow.id,
          businessId,
          triggerEventId: `exec-feed-${Date.now()}-2`,
          status: WorkflowRunStatus.failed,
          context: { orderTotal: 18 },
          createdAt: dates[1],
        },
      }),
      prisma.workflowRun.create({
        data: {
          workflowId: secondWorkflow.id,
          businessId,
          triggerEventId: `exec-feed-${Date.now()}-3`,
          status: WorkflowRunStatus.success,
          context: { rating: 5 },
          createdAt: dates[2],
        },
      }),
    ]);

    const firstPage = await service.listBusinessRuns(businessId, {
      take: 2,
      from: '2026-09-28T09:59:00.000Z',
      to: '2026-09-28T12:01:00.000Z',
    } satisfies ListWorkflowRunsDto);
    expect(firstPage.items.map((run) => run.id)).toEqual([
      runs[2].id,
      runs[1].id,
    ]);
    expect(firstPage.items[0].workflow).toMatchObject({
      id: secondWorkflow.id,
      name: secondWorkflow.name,
    });
    expect(firstPage.items[0]).not.toHaveProperty('context');
    expect(firstPage.items[0]).not.toHaveProperty('attempts');
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextCursor).toBe(runs[1].id);

    const secondPage = await service.listBusinessRuns(businessId, {
      take: 2,
      cursor: firstPage.nextCursor ?? undefined,
      from: '2026-09-28T09:59:00.000Z',
      to: '2026-09-28T12:01:00.000Z',
    } satisfies ListWorkflowRunsDto);
    expect(secondPage.items.map((run) => run.id)).toEqual([runs[0].id]);
    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.nextCursor).toBeNull();

    const failedForFirstWorkflow = await service.listBusinessRuns(businessId, {
      status: WorkflowRunStatus.failed,
      workflowId: firstWorkflow.id,
      from: '2026-09-28T00:00:00.000Z',
      to: '2026-09-28T23:59:59.999Z',
    } satisfies ListWorkflowRunsDto);
    expect(failedForFirstWorkflow.items.map((run) => run.id)).toEqual([
      runs[1].id,
    ]);

    const details = await service.findBusinessRun(businessId, runs[0].id);
    expect(details).toMatchObject({
      id: runs[0].id,
      context: { orderTotal: 12 },
    });
    expect(details.workflow).toMatchObject({ id: firstWorkflow.id });
    cls.set(CLS_KEY_BUSINESS_ID, `${businessId}-other`);
    try {
      await expect(
        service.findBusinessRun(businessId, runs[0].id),
      ).rejects.toBeInstanceOf(AppException);
    } finally {
      cls.set(CLS_KEY_BUSINESS_ID, businessId);
    }
  });
});
