import { ClsService } from 'nestjs-cls';
import { WorkflowTriggerKey, type Prisma } from '@prisma/client';
import { CLS_KEY_BUSINESS_ID } from '../../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../../prisma/prisma.service';
import { messageWithoutApproval } from './automation-governance.util';
import type { WorkflowGraph } from './workflow-graph.util';
import { WorkflowsService } from './workflows.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('messageWithoutApproval', () => {
  it('checks step lists in order', () => {
    expect(
      messageWithoutApproval([{ type: 'send_customer_message' }], null),
    ).toBe(true);
    expect(
      messageWithoutApproval(
        [{ type: 'request_approval' }, { type: 'send_customer_message' }],
        null,
      ),
    ).toBe(false);
    expect(messageWithoutApproval([{ type: 'notify_owner' }], null)).toBe(
      false,
    );
  });

  it('flags a graph where one branch skips approval', () => {
    const graph = {
      schemaVersion: 1,
      nodes: [
        { id: 't', type: 'trigger' },
        { id: 'c', type: 'condition', conditions: [], conditionMode: 'all' },
        { id: 'a', type: 'action', action: { type: 'request_approval' } },
        { id: 'm1', type: 'action', action: { type: 'send_customer_message' } },
        { id: 'm2', type: 'action', action: { type: 'send_customer_message' } },
        { id: 'e1', type: 'end' },
        { id: 'e2', type: 'end' },
      ],
      edges: [
        { source: 't', target: 'c', port: 'next' },
        { source: 'c', target: 'a', port: 'true' },
        { source: 'a', target: 'm1', port: 'next' },
        { source: 'm1', target: 'e1', port: 'next' },
        { source: 'c', target: 'm2', port: 'false' },
        { source: 'm2', target: 'e2', port: 'next' },
      ],
    } as unknown as WorkflowGraph;
    expect(messageWithoutApproval([], graph)).toBe(true);
    graph.edges = graph.edges.filter((edge) => edge.port !== 'false');
    graph.nodes = graph.nodes.filter(
      (node) => node.id !== 'm2' && node.id !== 'e2',
    );
    expect(messageWithoutApproval([], graph)).toBe(false);
  });
});

describe('Automation governance in WorkflowsService (MySQL)', () => {
  let prisma: PrismaService;
  let service: WorkflowsService;
  let businessId: string;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    service = new WorkflowsService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
    );
    businessId = (
      await prisma.business.create({
        data: { name: 'Governance Co', slug: `governance-${stamp}` },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.workflowVersion.deleteMany({ where: { businessId } });
    await prisma.workflow.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  const setPolicies = (policies: Prisma.InputJsonObject) =>
    prisma.business.update({ where: { id: businessId }, data: { policies } });

  const make = (name: string, actions: unknown[]) =>
    service.create(businessId, {
      name,
      triggerKey: WorkflowTriggerKey.sale,
      conditions: [],
      actions,
    } as never);

  it('refuses switching on past the active-workflow limit', async () => {
    await setPolicies({ 'automations.maxActiveWorkflows': 1 });
    const first = await make('First', [
      { type: 'notify_owner', messageBody: 'Sale!' },
    ]);
    const second = await make('Second', [
      { type: 'notify_owner', messageBody: 'Sale!' },
    ]);
    await service.update(first.id, { active: true });
    await expect(
      service.update(second.id, { active: true }),
    ).rejects.toMatchObject({
      response: { code: 'AUTOMATION_ACTIVE_LIMIT_REACHED' },
    });
    await setPolicies({});
    await expect(
      service.update(second.id, { active: true }),
    ).resolves.toMatchObject({
      active: true,
    });
  });

  it('requires approval before customer messages when the rule is on', async () => {
    await setPolicies({
      'automations.requireApprovalBeforeCustomerMessages': true,
    });
    const risky = await make('Thank you', [
      {
        type: 'send_customer_message',
        messageBody: 'Thanks for your order!',
      },
    ]);
    await expect(
      service.update(risky.id, { active: true }),
    ).rejects.toMatchObject({
      response: { code: 'AUTOMATION_APPROVAL_REQUIRED_BEFORE_MESSAGE' },
    });
    const safe = await make('Approved thank you', [
      {
        type: 'request_approval',
        title: 'Check message',
        description: 'Review first',
      },
      {
        type: 'send_customer_message',
        messageBody: 'Thanks for your order!',
      },
    ]);
    await expect(
      service.update(safe.id, { active: true }),
    ).resolves.toMatchObject({
      active: true,
    });
    await setPolicies({});
  });

  it('accepts the inbound webhook trigger in the workflow editor', async () => {
    const hook = await service.create(businessId, {
      name: 'From Zapier',
      triggerKey: WorkflowTriggerKey.inbound_webhook,
      conditions: [{ field: 'body_status', operator: 'eq', value: 'paid' }],
      actions: [{ type: 'notify_owner', messageBody: 'Webhook received' }],
    });
    await expect(
      service.update(hook.id, { active: true }),
    ).resolves.toMatchObject({ active: true });
  });
});
