import { ClsService } from 'nestjs-cls';
import { WorkflowRunStatus, WorkflowTriggerKey } from '@prisma/client';
import type { AiInfraService } from '../../ai/ai-infra.service';
import type { CreateMessageResult } from '../../ai/claude.client';
import { CLS_KEY_BUSINESS_ID } from '../../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import type { SendGateService } from '../../messaging/send-gate.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AutomationCommandCenterService } from './automation-command-center.service';
import { validateWorkflowDefinition } from './workflow-definition.util';
import { WorkflowTriggerService } from './workflow-trigger.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

const toolUse = (id: string, name: string): CreateMessageResult => ({
  content: [{ type: 'tool_use', id, name, input: {} }],
  stopReason: 'tool_use',
  inputTokens: 100,
  outputTokens: 10,
});
const text = (value: string): CreateMessageResult => ({
  content: [{ type: 'text', text: value }],
  stopReason: 'end_turn',
  inputTokens: 120,
  outputTokens: 20,
});

describe('AI agent step validation', () => {
  it('checks goal, tools and step limit, and exposes {{agentAnswer}} to later steps', () => {
    const agent = {
      type: 'ai_agent',
      goal: 'Is {{customerName}} a regular?',
      tools: ['get_customer_orders'],
      maxSteps: 3,
    };
    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'Agent',
        [],
        [
          agent,
          { type: 'notify_owner', messageBody: 'Agent says: {{agentAnswer}}' },
        ],
      ),
    ).toBeNull();
    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'Agent',
        [],
        [
          { type: 'notify_owner', messageBody: 'Too early: {{agentAnswer}}' },
          agent,
        ],
      ),
    ).toMatch(/not provided by this trigger/);
    for (const bad of [
      { ...agent, tools: ['send_email'] },
      { ...agent, maxSteps: 6 },
      { ...agent, goal: ' ' },
    ]) {
      expect(
        validateWorkflowDefinition(WorkflowTriggerKey.sale, 'Agent', [], [bad]),
      ).toMatch(/needs a goal/);
    }
  });
});

describe('AI agent step (MySQL)', () => {
  let prisma: PrismaService;
  let trigger: WorkflowTriggerService;
  let commandCenter: AutomationCommandCenterService;
  let businessId: string;
  let workflowId: string;
  let customerId: string;
  const createMessage = jest.fn();
  const stamp = Date.now();

  type AgentRunner = {
    runAgentStep: (...args: unknown[]) => Promise<Record<string, unknown>>;
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    trigger = new WorkflowTriggerService(
      prisma,
      { send: jest.fn() } as unknown as SendGateService,
      { createMessage } as unknown as AiInfraService,
    );
    commandCenter = new AutomationCommandCenterService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
    );
    businessId = (
      await prisma.business.create({
        data: { name: 'Agent Co', slug: `agent-${stamp}` },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    customerId = (
      await prisma.customer.create({
        data: { businessId, name: 'Ana', phone: `+1555${stamp % 10_000_000}` },
      })
    ).id;
    await prisma.order.create({
      data: {
        businessId,
        customerId,
        orderNo: 1,
        total: 42,
        subtotal: 42,
      },
    });
    workflowId = (
      await prisma.workflow.create({
        data: {
          businessId,
          name: 'Regulars',
          triggerKey: WorkflowTriggerKey.sale,
          actions: [
            {
              type: 'ai_agent',
              goal: 'Is {{customerName}} a regular?',
              tools: ['get_customer_orders'],
              maxSteps: 3,
            },
          ],
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.workflowRunAttempt.deleteMany({ where: { businessId } });
    await prisma.workflowRun.deleteMany({ where: { businessId } });
    await prisma.workflow.deleteMany({ where: { businessId } });
    await prisma.orderItem.deleteMany({ where: { order: { businessId } } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  const newRun = (context: Record<string, unknown>) =>
    prisma.workflowRun.create({
      data: {
        businessId,
        workflowId,
        status: WorkflowRunStatus.running,
        context: context as never,
      },
    });

  it('uses only allowed read-only tools, records them, and saves the answer', async () => {
    const context: Record<string, unknown> = {
      customerId,
      customerName: 'Ana',
    };
    const run = await newRun(context);
    createMessage
      .mockResolvedValueOnce(toolUse('t1', 'get_customer_orders'))
      .mockResolvedValueOnce(toolUse('t2', 'get_run_values'))
      .mockResolvedValueOnce(text('Ana has 1 order totalling 42.'));

    const result = await (trigger as unknown as AgentRunner).runAgentStep(
      businessId,
      {
        type: 'ai_agent',
        goal: 'Is {{customerName}} a regular?',
        tools: ['get_customer_orders'],
        maxSteps: 3,
      },
      context,
      run.id,
      0,
    );

    expect(result).toMatchObject({
      completed: true,
      output: 'Ana has 1 order totalling 42.',
      toolCalls: [
        { step: 1, tool: 'get_customer_orders', allowed: true },
        { step: 2, tool: 'get_run_values', allowed: false },
      ],
      inputTokens: 320,
      outputTokens: 40,
    });
    // The real order data went back to the model; the disallowed tool returned an error only.
    const calls = createMessage.mock.calls as Array<
      [unknown, string, { messages: unknown }]
    >;
    const secondCall = calls[1][2];
    expect(JSON.stringify(secondCall.messages)).toContain('lifetimeOrders');
    const thirdCall = calls[2][2];
    expect(JSON.stringify(thirdCall.messages)).toContain('not allowed');
    expect(JSON.stringify(thirdCall.messages)).not.toContain('"customerName"');
    expect(calls[0][1]).toBe('workflow_agent');

    const saved = await prisma.workflowRun.findUniqueOrThrow({
      where: { id: run.id },
    });
    expect(saved.context).toMatchObject({
      agentAnswer: 'Ana has 1 order totalling 42.',
    });
    await prisma.workflowRun.update({
      where: { id: run.id },
      data: { status: WorkflowRunStatus.success, result: [result] as never },
    });

    const overview = await commandCenter.agents(businessId);
    expect(overview.enabledInAiSettings).toBe(true);
    expect(overview.agents).toHaveLength(1);
    expect(overview.agents[0]).toMatchObject({
      workflowId,
      steps: [{ maxSteps: 3, tools: [{ key: 'get_customer_orders' }] }],
      last30Days: {
        agentRuns: 1,
        completed: 1,
        toolCalls: 2,
        blockedToolCalls: 1,
        inputTokens: 320,
      },
    });
  });

  it('stops at the step limit without saving an answer', async () => {
    const context: Record<string, unknown> = { customerId };
    const run = await newRun(context);
    createMessage.mockReset();
    createMessage.mockResolvedValue(toolUse('t', 'get_customer_orders'));
    const result = await (trigger as unknown as AgentRunner).runAgentStep(
      businessId,
      {
        type: 'ai_agent',
        goal: 'Keep looking',
        tools: ['get_customer_orders'],
        maxSteps: 2,
      },
      context,
      run.id,
      0,
    );
    expect(createMessage).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ completed: false });
    expect(String(result.error)).toMatch(/did not finish within 2/);
    expect(context.agentAnswer).toBeUndefined();
  });
});
