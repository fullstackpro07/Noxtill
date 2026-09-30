import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkflowTriggerService } from './workflow-trigger.service';
import { SendGateService } from '../../messaging/send-gate.service';
import { AiInfraService } from '../../ai/ai-infra.service';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../../common/tenancy/tenant.constants';
import { WorkflowApprovalsService } from './workflow-approvals.service';
import { WorkflowDeadLettersService } from './workflow-dead-letters.service';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import {
  ActivityEventType,
  ProductOpportunityRisk,
  ProductOpportunityStatus,
  ProductValidationDecision,
  Role,
  WorkflowConditionMode,
  WorkflowRunStatus,
  WorkflowTriggerKey,
} from '@prisma/client';

describe('WorkflowTriggerService (UPD-BE-028)', () => {
  let prisma: PrismaService;
  let service: WorkflowTriggerService;
  let approvalsService: WorkflowApprovalsService;
  let deadLettersService: WorkflowDeadLettersService;
  let tenantPrisma: TenantPrismaService;
  let businessId: string;
  let customerId: string;
  let ownerUserId: string;
  const sendGate = {
    send: jest.fn().mockResolvedValue({ id: 'message_test' }),
  };
  const aiInfra = {
    createMessage: jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Thank you for your order.' }],
      stopReason: 'end_turn',
      inputTokens: 18,
      outputTokens: 7,
    }),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new WorkflowTriggerService(
      prisma,
      sendGate as unknown as SendGateService,
      aiInfra as unknown as AiInfraService,
    );

    const business = await prisma.business.create({
      data: { name: 'Trigger Test Biz', slug: `trigger-test-${Date.now()}` },
    });
    businessId = business.id;

    const cls = new (class {
      private store: Record<string, unknown> = {};
      get<T>(key: string): T {
        return this.store[key] as T;
      }
      set(key: string, value: unknown) {
        this.store[key] = value;
      }
    })();
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    approvalsService = new WorkflowApprovalsService(tenantPrisma, service);
    deadLettersService = new WorkflowDeadLettersService(tenantPrisma, service);

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
    await prisma.workflowDeadLetter.deleteMany({ where: { businessId } });
    await prisma.workflowRun.deleteMany({ where: { businessId } });
    await prisma.workflowVariable.deleteMany({ where: { businessId } });
    await prisma.workflow.deleteMany({ where: { businessId } });
    await prisma.auditLog.deleteMany({
      where: {
        businessId,
        action: 'automation.customer_custom_field_set',
      },
    });
    await prisma.auditLog.deleteMany({
      where: {
        businessId,
        action: { startsWith: 'workflow_dead_letter.' },
      },
    });
    await prisma.customerCustomField.deleteMany({ where: { businessId } });
    await prisma.seoAuditRun.deleteMany({ where: { businessId } });
    await prisma.productValidationRun.deleteMany({ where: { businessId } });
    await prisma.productOpportunityAudit.deleteMany({ where: { businessId } });
    await prisma.productOpportunity.deleteMany({ where: { businessId } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.customerTag.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
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

  it('generates an AI draft using only explicitly referenced trigger values and saves it to run history', async () => {
    aiInfra.createMessage.mockClear();
    sendGate.send.mockClear();
    const actions = [
      {
        type: 'generate_ai_draft',
        prompt: 'Draft a thank-you note for {{customerName}}.',
      },
    ];
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'AI thank-you draft',
        triggerKey: WorkflowTriggerKey.sale,
        conditions: [],
        actions,
        active: true,
      },
    });
    await prisma.workflowVersion.create({
      data: {
        workflowId: workflow.id,
        businessId,
        version: workflow.version,
        name: workflow.name,
        triggerKey: workflow.triggerKey,
        conditions: [],
        actions,
      },
    });
    const order = await prisma.order.create({
      data: { businessId, orderNo: 901, customerId, total: 42 },
    });

    await service.dispatch(businessId, ActivityEventType.sale, {
      eventId: `ai-draft-sale-${Date.now()}`,
      description: `Sale #${order.orderNo} — 42`,
      entityType: 'Order',
      entityId: order.id,
    });

    const run = await prisma.workflowRun.findFirstOrThrow({
      where: { workflowId: workflow.id },
    });
    expect(run.status).toBe(WorkflowRunStatus.success);
    expect(run.result).toEqual([
      expect.objectContaining({
        actionIndex: 0,
        type: 'generate_ai_draft',
        completed: true,
        aiGenerated: true,
        provider: 'anthropic',
        output: 'Thank you for your order.',
        inputTokens: 18,
        outputTokens: 7,
      }),
    ]);
    expect(aiInfra.createMessage).toHaveBeenCalledWith(
      businessId,
      'workflow_agent',
      expect.objectContaining({
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              task: 'Draft a thank-you note for {{customerName}}.',
              triggerValues: { customerName: 'Trigger Customer' },
            }),
          },
        ],
        maxTokens: 512,
      }),
    );
    expect(sendGate.send).not.toHaveBeenCalled();
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { active: false },
    });
  });

  it('persists mapped event data and exposes it to later message actions', async () => {
    sendGate.send.mockClear();
    const actions = [
      {
        type: 'map_data',
        mappings: [
          {
            sourcePath: 'orderTotal',
            targetPath: 'amount',
            transform: 'number',
          },
        ],
      },
      {
        type: 'notify_owner',
        messageBody: 'Normalized order total: {{mappedData.amount}}',
      },
    ];
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Map sale event data',
        triggerKey: WorkflowTriggerKey.sale,
        conditions: [],
        actions,
        active: true,
      },
    });
    await prisma.workflowVersion.create({
      data: {
        workflowId: workflow.id,
        businessId,
        version: workflow.version,
        name: workflow.name,
        triggerKey: workflow.triggerKey,
        conditions: [],
        actions,
      },
    });
    const order = await prisma.order.create({
      data: { businessId, orderNo: 902, customerId, total: 84.5 },
    });

    await service.dispatch(businessId, ActivityEventType.sale, {
      eventId: `mapped-sale-${Date.now()}`,
      description: `Sale #${order.orderNo} — 84.5`,
      entityType: 'Order',
      entityId: order.id,
    });

    const run = await prisma.workflowRun.findFirstOrThrow({
      where: { workflowId: workflow.id },
    });
    expect(run.status).toBe(WorkflowRunStatus.success);
    expect(run.context).toMatchObject({
      mappedData: { amount: 84.5 },
    });
    expect(run.result).toEqual([
      expect.objectContaining({
        actionIndex: 0,
        type: 'map_data',
        completed: true,
        mappedFields: 1,
        output: { amount: 84.5 },
      }),
      expect.objectContaining({
        actionIndex: 1,
        type: 'notify_owner',
        queued: true,
      }),
    ]);
    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId,
        variables: { body: 'Normalized order total: 84.5' },
      }),
    );
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { active: false },
    });
  });

  it('reads a persisted Production variable into a run before rendering a later message', async () => {
    sendGate.send.mockClear();
    const variableName = `reply${Date.now()}`;
    await prisma.workflowVariable.create({
      data: {
        businessId,
        scope: 'business',
        scopeKey: '*',
        environment: 'production',
        name: variableName,
        valueType: 'string',
        value: 'Your order is ready',
      },
    });
    const actions = [
      { type: 'get_variable', name: variableName, scope: 'business' },
      {
        type: 'notify_owner',
        messageBody: '{{variables.' + variableName + '}}',
      },
    ];
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Read workflow variable',
        triggerKey: WorkflowTriggerKey.sale,
        conditions: [],
        actions,
        active: true,
      },
    });
    await prisma.workflowVersion.create({
      data: {
        workflowId: workflow.id,
        businessId,
        version: workflow.version,
        name: workflow.name,
        triggerKey: workflow.triggerKey,
        conditions: [],
        actions,
      },
    });
    const order = await prisma.order.create({
      data: { businessId, orderNo: 903, customerId, total: 12 },
    });

    await service.dispatch(businessId, ActivityEventType.sale, {
      eventId: `variable-sale-${Date.now()}`,
      description: `Sale #${order.orderNo} — 12`,
      entityType: 'Order',
      entityId: order.id,
    });

    const run = await prisma.workflowRun.findFirstOrThrow({
      where: { workflowId: workflow.id },
    });
    expect(run.status).toBe(WorkflowRunStatus.success);
    expect(run.context).toMatchObject({
      variables: { [variableName]: 'Your order is ready' },
    });
    expect(run.result).toEqual([
      expect.objectContaining({
        actionIndex: 0,
        type: 'get_variable',
        completed: true,
        variableName,
        valueType: 'string',
      }),
      expect.objectContaining({
        actionIndex: 1,
        type: 'notify_owner',
        queued: true,
      }),
    ]);
    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId,
        variables: { body: 'Your order is ready' },
      }),
    );

    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { active: false },
    });
    await prisma.workflowVariable.deleteMany({
      where: { businessId, name: variableName },
    });
  });

  it('executes each scheduled interval at most once for a stable due timestamp', async () => {
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Scheduled owner summary',
        triggerKey: WorkflowTriggerKey.scheduled,
        scheduleEveryMinutes: 60,
        conditions: [],
        actions: [
          {
            type: 'notify_owner',
            messageBody: 'Scheduled at {{scheduledAt}}',
          },
        ],
        active: true,
      },
    });
    const dueAt = new Date('2026-09-29T04:00:00.000Z');

    await service.runScheduled(businessId, workflow.id, dueAt);
    await service.runScheduled(businessId, workflow.id, dueAt);

    const runs = await prisma.workflowRun.findMany({
      where: { businessId, workflowId: workflow.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      status: WorkflowRunStatus.success,
      triggerEventId: `workflow-schedule:${workflow.id}:${dueAt.getTime()}`,
      context: { scheduledAt: dueAt.toISOString() },
    });
    expect(sendGate.send).toHaveBeenCalledTimes(1);
  });

  it('persists a wait and resumes later actions from the pinned workflow version', async () => {
    const actions = [
      { type: 'notify_owner', messageBody: 'Before waiting' },
      { type: 'wait', durationMinutes: 1 },
      { type: 'notify_owner', messageBody: 'After waiting' },
    ];
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Wait before follow-up',
        triggerKey: WorkflowTriggerKey.sale,
        conditions: [],
        actions,
        active: true,
      },
    });
    await prisma.workflowVersion.create({
      data: {
        workflowId: workflow.id,
        businessId,
        version: workflow.version,
        name: workflow.name,
        triggerKey: workflow.triggerKey,
        conditions: [],
        actions,
      },
    });
    const order = await prisma.order.create({
      data: { businessId, orderNo: 90, customerId, total: 250 },
    });

    await service.dispatch(businessId, ActivityEventType.sale, {
      eventId: `wait-sale-${Date.now()}`,
      description: `Sale #${order.orderNo} — 250`,
      entityType: 'Order',
      entityId: order.id,
    });

    const waiting = await prisma.workflowRun.findFirstOrThrow({
      where: { workflowId: workflow.id },
      include: { attempts: true },
    });
    expect(waiting.status).toBe(WorkflowRunStatus.waiting);
    expect(waiting.nextActionIndex).toBe(2);
    expect(waiting.waitingUntil).not.toBeNull();
    expect(waiting.result).toEqual([
      {
        actionIndex: 0,
        type: 'notify_owner',
        queued: true,
        messageId: 'message_test',
      },
      expect.objectContaining({ actionIndex: 1, type: 'wait', waiting: true }),
    ]);
    expect(waiting.attempts[0]).toMatchObject({
      attemptNumber: 1,
      status: WorkflowRunStatus.waiting,
      finishedAt: null,
    });
    expect(sendGate.send).toHaveBeenCalledTimes(1);

    const resumed = await service.resumeWaitingRun(
      businessId,
      workflow.id,
      waiting.id,
      new Date(waiting.waitingUntil!.getTime() + 1),
    );
    expect(resumed).toBe(true);

    const completed = await prisma.workflowRun.findUniqueOrThrow({
      where: { id: waiting.id },
      include: { attempts: true },
    });
    expect(completed.status).toBe(WorkflowRunStatus.success);
    expect(completed.waitingUntil).toBeNull();
    expect(completed.nextActionIndex).toBeNull();
    expect(completed.result).toEqual([
      {
        actionIndex: 0,
        type: 'notify_owner',
        queued: true,
        messageId: 'message_test',
      },
      expect.objectContaining({
        actionIndex: 1,
        type: 'wait',
        waiting: false,
        completed: true,
      }),
      {
        actionIndex: 2,
        type: 'notify_owner',
        queued: true,
        messageId: 'message_test',
      },
    ]);
    expect(completed.attempts[0]).toMatchObject({
      attemptNumber: 1,
      status: WorkflowRunStatus.success,
    });
    expect(completed.attempts[0].finishedAt).toBeInstanceOf(Date);
    expect(sendGate.send).toHaveBeenCalledTimes(2);
    expect(
      await service.resumeWaitingRun(
        businessId,
        workflow.id,
        waiting.id,
        new Date(waiting.waitingUntil!.getTime() + 1),
      ),
    ).toBe(false);
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { active: false },
    });
  });

  it('keeps a selected graph branch across a durable wait and records the skipped branch', async () => {
    const graph = {
      schemaVersion: 1,
      nodes: [
        { id: 'trigger', type: 'trigger' },
        {
          id: 'value-check',
          type: 'condition',
          conditions: [{ field: 'orderTotal', operator: 'gte', value: 100 }],
          conditionMode: 'all',
        },
        {
          id: 'high-before-wait',
          type: 'action',
          action: { type: 'notify_owner', messageBody: 'High value sale' },
        },
        {
          id: 'high-wait',
          type: 'action',
          action: { type: 'wait', durationMinutes: 1 },
        },
        {
          id: 'high-after-wait',
          type: 'action',
          action: { type: 'notify_owner', messageBody: 'Follow up high value' },
        },
        {
          id: 'standard-sale',
          type: 'action',
          action: { type: 'notify_owner', messageBody: 'Standard sale' },
        },
        { id: 'high-end', type: 'end' },
        { id: 'standard-end', type: 'end' },
      ],
      edges: [
        { source: 'trigger', target: 'value-check', port: 'next' },
        { source: 'value-check', target: 'high-before-wait', port: 'true' },
        { source: 'value-check', target: 'standard-sale', port: 'false' },
        { source: 'high-before-wait', target: 'high-wait', port: 'next' },
        { source: 'high-wait', target: 'high-after-wait', port: 'next' },
        { source: 'high-after-wait', target: 'high-end', port: 'next' },
        { source: 'standard-sale', target: 'standard-end', port: 'next' },
      ],
    };
    const actions = [
      { type: 'notify_owner', messageBody: 'High value sale' },
      { type: 'wait', durationMinutes: 1 },
      { type: 'notify_owner', messageBody: 'Follow up high value' },
      { type: 'notify_owner', messageBody: 'Standard sale' },
    ];
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Branch and wait',
        triggerKey: WorkflowTriggerKey.sale,
        conditions: [],
        actions,
        graph,
        active: true,
      },
    });
    await prisma.workflowVersion.create({
      data: {
        workflowId: workflow.id,
        businessId,
        version: workflow.version,
        name: workflow.name,
        triggerKey: workflow.triggerKey,
        conditions: [],
        actions,
        graph,
      },
    });
    const order = await prisma.order.create({
      data: {
        businessId,
        orderNo: 910_000 + (Date.now() % 10_000),
        customerId,
        total: 250,
      },
    });
    const eventId = `graph-wait-${Date.now()}`;

    await service.dispatch(businessId, ActivityEventType.sale, {
      eventId,
      description: `Sale #${order.orderNo} — 250`,
      entityType: 'Order',
      entityId: order.id,
    });
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { active: false },
    });

    const waiting = await prisma.workflowRun.findFirstOrThrow({
      where: { workflowId: workflow.id, triggerEventId: eventId },
    });
    expect(waiting.status).toBe(WorkflowRunStatus.waiting);
    expect(waiting.executionPlan).toMatchObject({
      actionIndexes: [0, 1, 2],
      decisions: [{ nodeId: 'value-check', result: 'true' }],
    });
    expect(waiting.nextPlanPosition).toBe(2);
    expect(waiting.result).toEqual([
      expect.objectContaining({ actionIndex: 0, queued: true }),
      expect.objectContaining({ actionIndex: 1, waiting: true }),
      expect.objectContaining({
        actionIndex: 3,
        skipped: true,
        reason: 'condition branch not selected for this run',
      }),
    ]);

    expect(
      await service.resumeWaitingRun(
        businessId,
        workflow.id,
        waiting.id,
        new Date(waiting.waitingUntil!.getTime() + 1),
      ),
    ).toBe(true);
    const completed = await prisma.workflowRun.findUniqueOrThrow({
      where: { id: waiting.id },
    });
    expect(completed.status).toBe(WorkflowRunStatus.success);
    expect(completed.nextPlanPosition).toBeNull();
    expect(completed.result).toEqual([
      expect.objectContaining({ actionIndex: 0, queued: true }),
      expect.objectContaining({ actionIndex: 1, completed: true }),
      expect.objectContaining({ actionIndex: 2, queued: true }),
      expect.objectContaining({ actionIndex: 3, skipped: true }),
    ]);
    expect(sendGate.send).toHaveBeenCalledTimes(2);
  });

  it('pauses before approval-gated actions and resumes the pinned payload only after approval', async () => {
    const actions = [
      {
        type: 'request_approval',
        title: 'Review order {{orderNo}}',
        description: 'Confirm the customer message before it is sent.',
      },
      { type: 'notify_owner', messageBody: 'Approved order follow-up.' },
    ];
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Approve customer follow-up',
        triggerKey: WorkflowTriggerKey.sale,
        conditions: [],
        actions,
        active: true,
      },
    });
    await prisma.workflowVersion.create({
      data: {
        workflowId: workflow.id,
        businessId,
        version: workflow.version,
        name: workflow.name,
        triggerKey: workflow.triggerKey,
        conditions: [],
        actions,
      },
    });
    const orderNo = 930_000 + (Date.now() % 10_000);
    const order = await prisma.order.create({
      data: { businessId, orderNo, customerId, total: 275 },
    });

    await service.dispatch(businessId, ActivityEventType.sale, {
      eventId: `approval-sale-${Date.now()}`,
      description: `Sale #${orderNo} — 275`,
      entityType: 'Order',
      entityId: order.id,
    });

    const waiting = await prisma.workflowRun.findFirstOrThrow({
      where: { workflowId: workflow.id },
      include: { attempts: true },
    });
    expect(waiting.status).toBe(WorkflowRunStatus.waiting);
    expect(waiting.waitingUntil).toBeNull();
    expect(waiting.nextActionIndex).toBe(1);
    expect(sendGate.send).not.toHaveBeenCalled();

    const approval = await prisma.workflowApproval.findFirstOrThrow({
      where: { workflowRunId: waiting.id },
    });
    expect(approval).toMatchObject({
      status: 'pending',
      title: `Review order ${orderNo}`,
      description: 'Confirm the customer message before it is sent.',
    });
    expect(approval.payload).toMatchObject({
      steps: [
        {
          summary: 'Notify owner: Approved order follow-up.',
        },
      ],
    });
    expect(await approvalsService.list(businessId)).toEqual([
      expect.objectContaining({ id: approval.id }),
    ]);

    const owner = {
      sub: ownerUserId,
      businessId,
      role: Role.owner,
      capabilities: [],
    } as AuthenticatedUser;
    const decided = await approvalsService.decide(
      owner,
      approval.id,
      'approve',
      'Preview checked',
    );
    expect(decided).toMatchObject({
      id: approval.id,
      status: 'approved',
      decidedByUserId: ownerUserId,
      decisionComment: 'Preview checked',
    });
    expect(sendGate.send).toHaveBeenCalledTimes(1);

    const completed = await prisma.workflowRun.findUniqueOrThrow({
      where: { id: waiting.id },
    });
    expect(completed.status).toBe(WorkflowRunStatus.success);
    expect(completed.result).toEqual([
      expect.objectContaining({
        type: 'request_approval',
        waiting: false,
        approvalStatus: 'approved',
      }),
      expect.objectContaining({ type: 'notify_owner', queued: true }),
    ]);
    expect(
      await approvalsService.decide(owner, approval.id, 'approve'),
    ).toMatchObject({ status: 'approved' });
    expect(sendGate.send).toHaveBeenCalledTimes(1);
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { active: false },
    });
  });

  it('rejection stops a waiting workflow before any gated action executes', async () => {
    const actions = [
      {
        type: 'request_approval',
        title: 'Review this change',
        description: 'The next step requires a human decision.',
      },
      { type: 'notify_owner', messageBody: 'This must not be sent.' },
    ];
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Reject guarded action',
        triggerKey: WorkflowTriggerKey.sale,
        conditions: [],
        actions,
        active: true,
      },
    });
    await prisma.workflowVersion.create({
      data: {
        workflowId: workflow.id,
        businessId,
        version: workflow.version,
        name: workflow.name,
        triggerKey: workflow.triggerKey,
        conditions: [],
        actions,
      },
    });
    const orderNo = 940_000 + (Date.now() % 10_000);
    const order = await prisma.order.create({
      data: { businessId, orderNo, customerId, total: 50 },
    });
    await service.dispatch(businessId, ActivityEventType.sale, {
      eventId: `approval-reject-sale-${Date.now()}`,
      description: `Sale #${orderNo} — 50`,
      entityType: 'Order',
      entityId: order.id,
    });
    const waiting = await prisma.workflowRun.findFirstOrThrow({
      where: { workflowId: workflow.id },
    });
    const approval = await prisma.workflowApproval.findFirstOrThrow({
      where: { workflowRunId: waiting.id },
    });
    const owner = {
      sub: ownerUserId,
      businessId,
      role: Role.owner,
      capabilities: [],
    } as AuthenticatedUser;

    await approvalsService.decide(owner, approval.id, 'reject', 'Not suitable');
    expect(sendGate.send).not.toHaveBeenCalled();
    expect(
      await prisma.workflowRun.findUniqueOrThrow({ where: { id: waiting.id } }),
    ).toMatchObject({ status: WorkflowRunStatus.skipped, waitingUntil: null });
    expect(
      await prisma.workflowApproval.findUniqueOrThrow({
        where: { id: approval.id },
      }),
    ).toMatchObject({ status: 'rejected', decisionComment: 'Not suitable' });
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { active: false },
    });
  });

  it('refuses to approve when the pinned downstream payload has changed', async () => {
    const actions = [
      {
        type: 'request_approval',
        title: 'Review the planned step',
        description: 'The step must remain exactly as reviewed.',
      },
      { type: 'notify_owner', messageBody: 'Original planned step.' },
    ];
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Protect approval payload',
        triggerKey: WorkflowTriggerKey.sale,
        conditions: [],
        actions,
        active: true,
      },
    });
    const version = await prisma.workflowVersion.create({
      data: {
        workflowId: workflow.id,
        businessId,
        version: workflow.version,
        name: workflow.name,
        triggerKey: workflow.triggerKey,
        conditions: [],
        actions,
      },
    });
    const order = await prisma.order.create({
      data: {
        businessId,
        orderNo: 950_000 + (Date.now() % 10_000),
        customerId,
        total: 75,
      },
    });
    await service.dispatch(businessId, ActivityEventType.sale, {
      eventId: `approval-tamper-sale-${Date.now()}`,
      description: `Sale #${order.orderNo} — 75`,
      entityType: 'Order',
      entityId: order.id,
    });
    const waiting = await prisma.workflowRun.findFirstOrThrow({
      where: { workflowId: workflow.id },
    });
    const approval = await prisma.workflowApproval.findFirstOrThrow({
      where: { workflowRunId: waiting.id },
    });
    await prisma.workflowVersion.update({
      where: { id: version.id },
      data: {
        actions: [
          ...actions.slice(0, 1),
          { type: 'notify_owner', messageBody: 'Changed after review.' },
        ],
      },
    });
    const owner = {
      sub: ownerUserId,
      businessId,
      role: Role.owner,
      capabilities: [],
    } as AuthenticatedUser;

    await expect(
      approvalsService.decide(owner, approval.id, 'approve'),
    ).rejects.toThrow('The approval payload has changed');
    expect(sendGate.send).not.toHaveBeenCalled();
    expect(
      await prisma.workflowRun.findUniqueOrThrow({ where: { id: waiting.id } }),
    ).toMatchObject({ status: WorkflowRunStatus.waiting, nextActionIndex: 1 });
    await approvalsService.decide(
      owner,
      approval.id,
      'reject',
      'Payload changed',
    );
    expect(
      await prisma.workflowRun.findUniqueOrThrow({ where: { id: waiting.id } }),
    ).toMatchObject({
      status: WorkflowRunStatus.skipped,
      nextActionIndex: null,
    });
    expect(sendGate.send).not.toHaveBeenCalled();
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { active: false },
    });
  });

  it('allows a waiting workflow run to be cancelled without later resuming', async () => {
    const actions = [{ type: 'wait', durationMinutes: 1 }];
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Wait then cancel',
        triggerKey: WorkflowTriggerKey.sale,
        conditions: [],
        actions,
        active: true,
      },
    });
    await prisma.workflowVersion.create({
      data: {
        workflowId: workflow.id,
        businessId,
        version: workflow.version,
        name: workflow.name,
        triggerKey: workflow.triggerKey,
        conditions: [],
        actions,
      },
    });
    const order = await prisma.order.create({
      data: { businessId, orderNo: 91, customerId, total: 250 },
    });
    await service.dispatch(businessId, ActivityEventType.sale, {
      eventId: `wait-cancel-sale-${Date.now()}`,
      description: `Sale #${order.orderNo} — 250`,
      entityType: 'Order',
      entityId: order.id,
    });
    const waiting = await prisma.workflowRun.findFirstOrThrow({
      where: { workflowId: workflow.id },
    });

    const cancelled = await service.cancelRun(
      businessId,
      workflow.id,
      waiting.id,
    );
    expect(cancelled?.status).toBe(WorkflowRunStatus.cancelled);
    expect(cancelled?.waitingUntil).toBeNull();
    expect(
      await service.resumeWaitingRun(
        businessId,
        workflow.id,
        waiting.id,
        new Date(Date.now() + 60 * 60_000),
      ),
    ).toBe(false);
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { active: false },
    });
  });

  it('runs a matching workflow end-to-end: queues the message and records a success run', async () => {
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Thank big spenders',
        triggerKey: WorkflowTriggerKey.sale,
        conditions: [{ field: 'orderTotal', operator: 'gt', value: 100 }],
        actions: [
          {
            type: 'send_customer_message',
            messageBody: 'Thanks {{customerName}}!',
          },
        ],
        active: true,
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
        variables: { body: 'Thanks Trigger Customer!' },
      }),
    );

    const runs = await prisma.workflowRun.findMany({
      where: { workflowId: workflow.id },
    });
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('success');
    expect(runs[0].workflowVersion).toBe(1);
    expect(runs[0].context).toMatchObject({
      customerId,
      customerName: 'Trigger Customer',
    });
    expect(runs[0].result).toEqual([
      {
        actionIndex: 0,
        type: 'send_customer_message',
        queued: true,
        messageId: 'message_test',
        customerId,
      },
    ]);
    const attempts = await prisma.workflowRunAttempt.findMany({
      where: { workflowRunId: runs[0].id },
      orderBy: { attemptNumber: 'asc' },
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      attemptNumber: 1,
      status: 'success',
      result: runs[0].result,
    });

    // Deactivate so later tests' dispatch() calls (same businessId+triggerKey) don't also match it.
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { active: false },
    });
  });

  it('dispatches when any configured workflow condition matches', async () => {
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Match either sale threshold',
        triggerKey: WorkflowTriggerKey.sale,
        conditions: [
          { field: 'orderTotal', operator: 'gt', value: 1000 },
          { field: 'orderTotal', operator: 'lte', value: 500 },
        ],
        conditionMode: WorkflowConditionMode.any,
        actions: [{ type: 'notify_owner', messageBody: 'Sale matched' }],
        active: true,
      },
    });
    const order = await prisma.order.create({
      data: { businessId, orderNo: 77, customerId, total: 250 },
    });

    await service.dispatch(businessId, ActivityEventType.sale, {
      eventId: `any-sale-${Date.now()}`,
      description: `Sale #${order.orderNo} — 250`,
      entityType: 'Order',
      entityId: order.id,
    });

    const run = await prisma.workflowRun.findFirst({
      where: { workflowId: workflow.id },
    });
    expect(run?.status).toBe('success');
    expect(sendGate.send).toHaveBeenCalledTimes(1);
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { active: false },
    });
  });

  it('cancels an in-flight run and does not start its next action', async () => {
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Stop remaining actions',
        triggerKey: WorkflowTriggerKey.sale,
        conditions: [],
        actions: [
          { type: 'send_customer_message', messageBody: 'First action' },
          { type: 'send_customer_message', messageBody: 'Second action' },
        ],
        active: true,
      },
    });
    const order = await prisma.order.create({
      data: { businessId, orderNo: 78, customerId, total: 250 },
    });
    let signalStarted!: () => void;
    let resolveMessage!: (message: { id: string }) => void;
    const firstActionStarted = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    sendGate.send.mockImplementationOnce(
      () =>
        new Promise<{ id: string }>((resolve) => {
          resolveMessage = resolve;
          signalStarted();
        }),
    );

    const dispatch = service.dispatch(businessId, ActivityEventType.sale, {
      eventId: `cancel-sale-${Date.now()}`,
      description: `Sale #${order.orderNo} — 250`,
      entityType: 'Order',
      entityId: order.id,
    });
    await firstActionStarted;

    const running = await prisma.workflowRun.findFirstOrThrow({
      where: { workflowId: workflow.id },
    });
    const cancelled = await service.cancelRun(
      businessId,
      workflow.id,
      running.id,
    );
    expect(cancelled?.status).toBe('cancelled');

    resolveMessage({ id: 'message_already_started' });
    await dispatch;

    const persisted = await prisma.workflowRun.findUniqueOrThrow({
      where: { id: running.id },
      include: { attempts: true },
    });
    expect(persisted.status).toBe('cancelled');
    expect(persisted.attempts[0]).toMatchObject({
      status: 'cancelled',
      error: 'Cancelled by an operator.',
    });
    expect(persisted.attempts[0].finishedAt).not.toBeNull();
    expect(sendGate.send).toHaveBeenCalledTimes(1);
    await expect(
      service.cancelRun(businessId, workflow.id, running.id),
    ).rejects.toMatchObject({
      response: { code: 'workflow.cancel_not_allowed' },
    });
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { active: false },
    });
  });

  it('adds a customer tag to the canonical CRM record once and registers it in the tag catalog', async () => {
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Tag high-value customers',
        triggerKey: WorkflowTriggerKey.sale,
        conditions: [],
        actions: [{ type: 'add_customer_tag', tagName: ' high value ' }],
        active: true,
      },
    });
    const order = await prisma.order.create({
      data: { businessId, orderNo: 2, customerId, total: 250 },
    });

    for (const eventId of ['tag-sale-1', 'tag-sale-2']) {
      await service.dispatch(businessId, ActivityEventType.sale, {
        eventId,
        description: `Sale #${order.orderNo} — 250`,
        entityType: 'Order',
        entityId: order.id,
      });
    }

    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
    });
    expect(customer.tags).toEqual(['high value']);
    expect(
      await prisma.customerTag.count({
        where: { businessId, name: 'high value' },
      }),
    ).toBe(1);

    const runs = await prisma.workflowRun.findMany({
      where: { workflowId: workflow.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(runs).toHaveLength(2);
    expect(runs.map((run) => run.status)).toEqual(['success', 'success']);
    expect(runs[0].result).toEqual([
      {
        actionIndex: 0,
        type: 'add_customer_tag',
        completed: true,
        added: true,
        customerId,
        tagName: 'high value',
      },
    ]);
    expect(runs[1].result).toEqual([
      {
        actionIndex: 0,
        type: 'add_customer_tag',
        completed: true,
        added: false,
        customerId,
        tagName: 'high value',
      },
    ]);
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { active: false },
    });
  });

  it('sets a configured canonical CRM custom field idempotently and audits without storing its value', async () => {
    const fieldName = `Preferred channel ${Date.now()}`;
    await prisma.customerCustomField.create({
      data: {
        businessId,
        name: fieldName,
        type: 'select',
        options: ['Email', 'WhatsApp'],
      },
    });
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Set customer preferred channel',
        triggerKey: WorkflowTriggerKey.sale,
        conditions: [],
        actions: [
          { type: 'set_customer_custom_field', fieldName, value: 'Email' },
        ],
        active: true,
      },
    });
    const order = await prisma.order.create({
      data: { businessId, orderNo: 33, customerId, total: 90 },
    });

    await service.dispatch(businessId, ActivityEventType.sale, {
      eventId: `customer-field-1-${Date.now()}`,
      description: `Sale #${order.orderNo} — 90`,
      entityType: 'Order',
      entityId: order.id,
    });
    await service.dispatch(businessId, ActivityEventType.sale, {
      eventId: `customer-field-2-${Date.now()}`,
      description: `Sale #${order.orderNo} — 90`,
      entityType: 'Order',
      entityId: order.id,
    });

    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
    });
    expect(customer.customFieldValues).toMatchObject({ [fieldName]: 'Email' });
    const runs = await prisma.workflowRun.findMany({
      where: { workflowId: workflow.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(runs.map((run) => run.status)).toEqual([
      WorkflowRunStatus.success,
      WorkflowRunStatus.success,
    ]);
    expect(runs[0].result).toEqual([
      {
        actionIndex: 0,
        type: 'set_customer_custom_field',
        completed: true,
        updated: true,
        customerId,
        fieldName,
      },
    ]);
    expect(runs[1].result).toEqual([
      {
        actionIndex: 0,
        type: 'set_customer_custom_field',
        completed: true,
        updated: false,
        customerId,
        fieldName,
      },
    ]);
    const audit = await prisma.auditLog.findMany({
      where: {
        businessId,
        entity: 'Customer',
        entityId: customerId,
        action: 'automation.customer_custom_field_set',
      },
    });
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit[0].after)).not.toContain('Email');
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { active: false },
    });
  });

  it('maps a numeric event value into a number custom field without string coercion', async () => {
    const fieldName = `Last sale total ${Date.now()}`;
    await prisma.customerCustomField.create({
      data: { businessId, name: fieldName, type: 'number' },
    });
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Record latest sale total',
        triggerKey: WorkflowTriggerKey.sale,
        conditions: [],
        actions: [
          {
            type: 'set_customer_custom_field',
            fieldName,
            value: '{{orderTotal}}',
          },
        ],
        active: true,
      },
    });
    const order = await prisma.order.create({
      data: {
        businessId,
        orderNo: 34,
        customerId,
        total: 91.5,
      },
    });

    await service.dispatch(businessId, ActivityEventType.sale, {
      eventId: `customer-field-map-${Date.now()}`,
      description: `Sale #${order.orderNo} — 91.50`,
      entityType: 'Order',
      entityId: order.id,
    });

    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
    });
    expect(customer.customFieldValues).toMatchObject({ [fieldName]: 91.5 });
    const run = await prisma.workflowRun.findFirstOrThrow({
      where: { workflowId: workflow.id },
    });
    expect(run.status).toBe(WorkflowRunStatus.success);
    expect(run.result).toEqual([
      {
        actionIndex: 0,
        type: 'set_customer_custom_field',
        completed: true,
        updated: true,
        customerId,
        fieldName,
      },
    ]);
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { active: false },
    });
  });

  it('runs an owner-notification workflow from a stored product validation decision', async () => {
    const opportunity = await prisma.productOpportunity.create({
      data: {
        businessId,
        title: 'Travel mug',
        source: 'Manual research',
        risk: ProductOpportunityRisk.medium,
        status: ProductOpportunityStatus.test_approved,
      },
    });
    const validation = await prisma.productValidationRun.create({
      data: {
        businessId,
        opportunityId: opportunity.id,
        decision: ProductValidationDecision.approve_test,
        reason: 'Demand and price evidence support a limited test',
        evidenceSnapshot: { evidenceCoverage: { recorded: 2, total: 9 } },
        actorUserId: ownerUserId,
      },
    });
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Notify owner about test approval',
        triggerKey: WorkflowTriggerKey.commerce_validation,
        conditions: [
          {
            field: 'validationDecision',
            operator: 'eq',
            value: 'approve_test',
          },
        ],
        actions: [
          {
            type: 'notify_owner',
            messageBody: 'A product was approved for a limited test',
          },
        ],
        active: true,
      },
    });

    await service.dispatch(businessId, ActivityEventType.commerce_validation, {
      eventId: 'activity_validation_1',
      description: 'Product validation approve test: Travel mug',
      entityType: 'ProductValidationRun',
      entityId: validation.id,
    });

    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId,
        templateKey: 'automation_message',
        variables: { body: 'A product was approved for a limited test' },
      }),
    );
    const run = await prisma.workflowRun.findFirstOrThrow({
      where: { workflowId: workflow.id },
    });
    expect(run.status).toBe('success');
    expect(run.context).toMatchObject({
      validationDecision: 'approve_test',
      candidateTitle: 'Travel mug',
      candidateRisk: 'medium',
      evidenceRecorded: 2,
    });
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { active: false },
    });
  });

  it('runs an owner-notification workflow from a persisted SEO audit finding', async () => {
    const auditRun = await prisma.seoAuditRun.create({
      data: {
        businessId,
        status: 'completed',
        siteUrl: 'https://shop.example.test/',
        pagesCrawled: 8,
        issuesFound: 2,
        issues: [
          { type: 'missing_title', severity: 'critical' },
          { type: 'missing_meta_description', severity: 'high' },
        ],
      },
    });
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Notify owner about critical SEO findings',
        triggerKey: WorkflowTriggerKey.seo_issue_detected,
        conditions: [{ field: 'criticalIssueCount', operator: 'gt', value: 0 }],
        actions: [
          {
            type: 'notify_owner',
            messageBody: 'Audit on {{siteHost}} found a critical SEO issue',
          },
        ],
        active: true,
      },
    });

    await service.dispatch(businessId, ActivityEventType.seo_issue_detected, {
      eventId: 'activity_seo_issue_1',
      description: 'SEO audit found 2 high-priority issues.',
      entityType: 'SeoAuditRun',
      entityId: auditRun.id,
    });

    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId,
        templateKey: 'automation_message',
        variables: {
          body: 'Audit on shop.example.test found a critical SEO issue',
        },
      }),
    );
    const run = await prisma.workflowRun.findFirstOrThrow({
      where: { workflowId: workflow.id },
    });
    expect(run.status).toBe('success');
    expect(run.context).toMatchObject({
      auditRunId: auditRun.id,
      siteHost: 'shop.example.test',
      highPriorityIssueCount: 2,
      criticalIssueCount: 1,
      topIssueType: 'missing_title',
    });
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { active: false },
    });
  });

  it('claims a persisted activity event once before performing external actions', async () => {
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Notify owner once per activity event',
        triggerKey: WorkflowTriggerKey.sale,
        conditions: [],
        actions: [{ type: 'notify_owner', messageBody: 'Sale received' }],
        active: true,
      },
    });
    const event = {
      eventId: `sale-event-${Date.now()}`,
      description: 'Sale #99 — 25',
    };

    await Promise.all([
      service.dispatch(businessId, ActivityEventType.sale, event),
      service.dispatch(businessId, ActivityEventType.sale, event),
    ]);

    expect(sendGate.send).toHaveBeenCalledTimes(1);
    const runs = await prisma.workflowRun.findMany({
      where: { workflowId: workflow.id },
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      triggerEventId: event.eventId,
      status: 'success',
    });
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
        active: true,
      },
    });
    const order = await prisma.order.create({
      data: { businessId, orderNo: 6, customerId, total: 250 },
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

  it('records a skipped run when every action is skipped because the event has no customer', async () => {
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Message the sale customer',
        triggerKey: WorkflowTriggerKey.sale,
        conditions: [],
        actions: [{ type: 'send_customer_message', messageBody: 'Thanks!' }],
        active: true,
      },
    });
    const order = await prisma.order.create({
      data: { businessId, orderNo: 5, total: 25 },
    });

    await service.dispatch(businessId, ActivityEventType.sale, {
      description: 'Sale #5 — 25',
      entityType: 'Order',
      entityId: order.id,
    });

    expect(sendGate.send).not.toHaveBeenCalled();
    const run = await prisma.workflowRun.findFirstOrThrow({
      where: { workflowId: workflow.id },
    });
    expect(run.status).toBe('skipped');
    expect(JSON.stringify(run.result)).toContain('no customer in context');

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

  it('records a failed run when an action send fails without throwing back to the caller', async () => {
    sendGate.send.mockRejectedValueOnce(new Error('quota exceeded'));
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Notify owner on every sale',
        triggerKey: WorkflowTriggerKey.sale,
        conditions: [],
        actions: [{ type: 'notify_owner', messageBody: 'A sale happened' }],
        active: true,
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
    expect(run.status).toBe('failed');
    expect(run.error).toBe('One or more workflow actions failed');
    expect(JSON.stringify(run.result)).toContain('quota exceeded');

    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { active: false },
    });
  });

  it('fails closed on an unsupported legacy action instead of silently skipping it', async () => {
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Legacy workflow with unsupported action',
        triggerKey: WorkflowTriggerKey.sale,
        conditions: [],
        actions: [{ type: 'legacy_unknown_action', value: 'do not run' }],
        active: true,
      },
    });
    const order = await prisma.order.create({
      data: { businessId, orderNo: 7, customerId, total: 25 },
    });

    await service.dispatch(businessId, ActivityEventType.sale, {
      description: `Sale #${order.orderNo} — 25`,
      entityType: 'Order',
      entityId: order.id,
    });

    const run = await prisma.workflowRun.findFirstOrThrow({
      where: { workflowId: workflow.id },
    });
    expect(run.status).toBe('failed');
    expect(run.result).toEqual([
      {
        actionIndex: 0,
        type: 'legacy_unknown_action',
        completed: false,
        retryable: false,
        unsupported: true,
        error:
          'Workflow action type is not supported by this runtime; nothing was executed.',
      },
    ]);
    expect(sendGate.send).not.toHaveBeenCalled();

    const deadLetter = await prisma.workflowDeadLetter.findUniqueOrThrow({
      where: { workflowRunId: run.id },
      include: { decisions: { orderBy: { createdAt: 'asc' } } },
    });
    expect(deadLetter).toMatchObject({
      businessId,
      workflowId: workflow.id,
      workflowRunId: run.id,
      ownerUserId,
      status: 'open',
      nextAction: 'manual_review',
      failureCode: 'non_retryable_action_failure',
      evidence: {
        workflowVersion: workflow.version,
        failedActions: [
          expect.objectContaining({
            actionIndex: 0,
            type: 'legacy_unknown_action',
            retryable: false,
          }),
        ],
      },
    });
    expect(deadLetter.decisions.map((decision) => decision.action)).toEqual([
      'created',
    ]);
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          entityId: deadLetter.id,
          action: 'workflow_dead_letter.created',
        },
      }),
    ).toBe(1);

    await deadLettersService.resolve(
      {
        sub: ownerUserId,
        businessId,
        role: Role.owner,
        capabilities: [],
      },
      deadLetter.id,
      {
        reason:
          'Unsupported action reviewed and corrected outside the workflow.',
      },
    );
    const resolved = await deadLettersService.findOne(
      businessId,
      deadLetter.id,
    );
    expect(resolved).toMatchObject({
      status: 'resolved',
      resolutionReason:
        'Unsupported action reviewed and corrected outside the workflow.',
    });
    expect(resolved.decisions.map((decision) => decision.action)).toEqual([
      'created',
      'resolved',
    ]);
    expect(resolved.decisions[1]).toMatchObject({
      actorUserId: ownerUserId,
      reason: 'Unsupported action reviewed and corrected outside the workflow.',
    });

    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { active: false },
    });
  });

  it('creates a dead letter after the retry budget is exhausted and audits its recovery retry', async () => {
    const actions = [{ type: 'notify_owner', messageBody: 'A sale happened' }];
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Retryable failure for recovery queue',
        triggerKey: WorkflowTriggerKey.sale,
        conditions: [],
        actions,
        active: true,
      },
    });
    await prisma.workflowVersion.create({
      data: {
        workflowId: workflow.id,
        businessId,
        version: workflow.version,
        name: workflow.name,
        triggerKey: workflow.triggerKey,
        conditions: [],
        actions,
      },
    });
    const eventId = `dead-letter-retry-${Date.now()}`;
    sendGate.send
      .mockRejectedValueOnce(new Error('temporary provider failure'))
      .mockRejectedValueOnce(new Error('temporary provider failure'))
      .mockRejectedValueOnce(new Error('temporary provider failure'));

    await service.dispatch(businessId, ActivityEventType.sale, {
      eventId,
      description: 'Sale available for recovery',
    });
    let run = await prisma.workflowRun.findFirstOrThrow({
      where: { workflowId: workflow.id, triggerEventId: eventId },
    });
    expect(run.retryCount).toBe(0);
    expect(
      await prisma.workflowDeadLetter.count({
        where: { workflowRunId: run.id },
      }),
    ).toBe(0);

    await service.retryFailedRun(businessId, workflow.id, run.id);
    run = await prisma.workflowRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(run.retryCount).toBe(1);
    expect(
      await prisma.workflowDeadLetter.count({
        where: { workflowRunId: run.id },
      }),
    ).toBe(0);

    await service.retryFailedRun(businessId, workflow.id, run.id);
    run = await prisma.workflowRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(run.retryCount).toBe(2);
    const deadLetter = await prisma.workflowDeadLetter.findUniqueOrThrow({
      where: { workflowRunId: run.id },
    });
    expect(deadLetter).toMatchObject({
      status: 'open',
      nextAction: 'retry',
      failureCode: 'retry_budget_exhausted',
    });

    const recovered = await deadLettersService.retry(
      {
        sub: ownerUserId,
        businessId,
        role: Role.owner,
        capabilities: [],
      },
      deadLetter.id,
      { reason: 'Provider issue is cleared and retry is approved.' },
    );
    expect(recovered).toMatchObject({
      status: 'resolved',
      nextAction: 'manual_review',
      operatorRetryCount: 1,
      resolutionReason: 'Provider issue is cleared and retry is approved.',
    });
    const decisions = await prisma.workflowDeadLetterDecision.findMany({
      where: { deadLetterId: deadLetter.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(decisions.map((decision) => decision.action)).toEqual([
      'created',
      'retry_started',
      'retry_succeeded',
    ]);
    expect(
      decisions
        .slice(1)
        .every((decision) => decision.actorUserId === ownerUserId),
    ).toBe(true);
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          entityId: deadLetter.id,
          action: { startsWith: 'workflow_dead_letter.' },
        },
      }),
    ).toBe(3);

    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { active: false },
    });
  });

  it('requires a reason to dismiss an open dead letter and audits the decision', async () => {
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Dismissed unsupported workflow',
        triggerKey: WorkflowTriggerKey.sale,
        conditions: [],
        actions: [{ type: 'legacy_unknown_action' }],
        active: true,
      },
    });
    await service.dispatch(businessId, ActivityEventType.sale, {
      eventId: `dead-letter-dismiss-${Date.now()}`,
      description: 'Unsupported legacy workflow',
    });
    const run = await prisma.workflowRun.findFirstOrThrow({
      where: { workflowId: workflow.id },
    });
    const deadLetter = await prisma.workflowDeadLetter.findUniqueOrThrow({
      where: { workflowRunId: run.id },
    });
    const user = {
      sub: ownerUserId,
      businessId,
      role: Role.owner,
      capabilities: [],
    };

    await expect(
      Promise.resolve().then(() =>
        deadLettersService.dismiss(user, deadLetter.id, { reason: '  ' }),
      ),
    ).rejects.toMatchObject({
      response: { code: 'workflow.dead_letter_decision_not_allowed' },
    });
    expect(
      await prisma.workflowDeadLetterDecision.count({
        where: { deadLetterId: deadLetter.id, action: 'dismissed' },
      }),
    ).toBe(0);

    const dismissed = await deadLettersService.dismiss(user, deadLetter.id, {
      reason: 'This obsolete workflow has been removed from operations.',
    });
    expect(dismissed.status).toBe('dismissed');
    expect(dismissed.resolutionReason).toBe(
      'This obsolete workflow has been removed from operations.',
    );
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          entityId: deadLetter.id,
          action: 'workflow_dead_letter.dismissed',
        },
      }),
    ).toBe(1);

    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { active: false },
    });
  });

  it('does not send a customer message when a required template value is missing', async () => {
    const customer = await prisma.customer.create({
      data: {
        businessId,
        phone: `+2${Date.now()}`,
        name: '',
      },
    });
    const workflow = await prisma.workflow.create({
      data: {
        businessId,
        name: 'Personalized message needs a customer name',
        triggerKey: WorkflowTriggerKey.sale,
        conditions: [],
        actions: [
          {
            type: 'send_customer_message',
            messageBody: 'Thanks {{customerName}}!',
          },
        ],
        active: true,
      },
    });
    const order = await prisma.order.create({
      data: { businessId, orderNo: 8, customerId: customer.id, total: 25 },
    });

    await service.dispatch(businessId, ActivityEventType.sale, {
      description: `Sale #${order.orderNo} — 25`,
      entityType: 'Order',
      entityId: order.id,
    });

    const run = await prisma.workflowRun.findFirstOrThrow({
      where: { workflowId: workflow.id },
    });
    expect(run.status).toBe('failed');
    expect(run.result).toMatchObject([
      {
        actionIndex: 0,
        type: 'send_customer_message',
        queued: false,
        retryable: false,
        error: 'Message template is missing trigger values: customerName.',
      },
    ]);
    expect(sendGate.send).not.toHaveBeenCalled();

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
        active: true,
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
