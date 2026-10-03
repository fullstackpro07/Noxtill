import { ClsService } from 'nestjs-cls';
import { WorkflowTriggerKey } from '@prisma/client';
import { CLS_KEY_BUSINESS_ID } from '../../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../../prisma/prisma.service';
import { inboundBodyFields } from './workflow-context.util';
import { WorkflowEndpointsService } from './workflow-endpoints.service';
import type { WorkflowTriggerService } from './workflow-trigger.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('inboundBodyFields', () => {
  it('flattens top-level scalars only, with safe keys', () => {
    expect(
      inboundBodyFields({
        orderId: 'A1',
        total: 12.5,
        paid: true,
        'bad key!': 'x',
        nested: { a: 1 },
        list: [1],
      }),
    ).toEqual({
      body_orderId: 'A1',
      body_total: 12.5,
      body_paid: true,
      body_bad_key_: 'x',
    });
  });
});

describe('WorkflowEndpointsService (MySQL)', () => {
  let prisma: PrismaService;
  let service: WorkflowEndpointsService;
  let businessId: string;
  let workflowId: string;
  let otherWorkflowId: string;
  const runInbound = jest.fn();
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    service = new WorkflowEndpointsService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
      prisma,
      { runInbound } as unknown as WorkflowTriggerService,
    );
    businessId = (
      await prisma.business.create({
        data: { name: 'Hooks Co', slug: `hooks-${stamp}` },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    workflowId = (
      await prisma.workflow.create({
        data: {
          businessId,
          name: 'From Zapier',
          triggerKey: WorkflowTriggerKey.inbound_webhook,
          active: true,
        },
      })
    ).id;
    otherWorkflowId = (
      await prisma.workflow.create({
        data: {
          businessId,
          name: 'Sale flow',
          triggerKey: WorkflowTriggerKey.sale,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.workflowEndpointDelivery.deleteMany({ where: { businessId } });
    await prisma.workflowEndpoint.deleteMany({ where: { businessId } });
    await prisma.workflow.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('issues a URL token once, stores only its hash, and refuses other triggers', async () => {
    const issued = await service.issueToken(businessId, workflowId);
    expect(issued.token.length).toBeGreaterThan(20);
    const stored = await prisma.workflowEndpoint.findUniqueOrThrow({
      where: { workflowId },
    });
    expect(stored.tokenHash).not.toContain(issued.token);
    expect(stored.tokenHint).toBe(issued.token.slice(-4));
    await expect(
      service.issueToken(businessId, otherWorkflowId),
    ).rejects.toMatchObject({
      response: { code: 'WORKFLOW_ENDPOINT_WRONG_TRIGGER' },
    });
  });

  it('accepts, de-duplicates, rejects bad bodies, replays and stops after rotation', async () => {
    const { token } = await service.issueToken(businessId, workflowId);
    runInbound.mockResolvedValue('run-1');

    const first = await service.receive(token, { orderId: 'A1' }, 'key-1');
    expect(first).toMatchObject({ status: 'accepted', runId: 'run-1' });
    expect(runInbound).toHaveBeenCalledWith(
      businessId,
      workflowId,
      first.deliveryId,
      { orderId: 'A1' },
      expect.any(Date),
    );

    const again = await service.receive(token, { orderId: 'A1' }, 'key-1');
    expect(again).toMatchObject({ status: 'duplicate', runId: 'run-1' });
    expect(runInbound).toHaveBeenCalledTimes(1);

    await expect(
      service.receive(token, [1, 2], undefined),
    ).rejects.toMatchObject({
      response: { code: 'WORKFLOW_ENDPOINT_PAYLOAD_INVALID' },
    });
    await expect(
      service.receive(token, { blob: 'x'.repeat(40_000) }, undefined),
    ).rejects.toMatchObject({
      response: { code: 'WORKFLOW_ENDPOINT_PAYLOAD_TOO_LARGE' },
    });

    runInbound.mockResolvedValueOnce(null);
    const inactive = await service.receive(token, { orderId: 'B2' }, undefined);
    expect(inactive.status).toBe('workflow_inactive');

    runInbound.mockResolvedValueOnce('run-2');
    const replay = await service.replay(businessId, first.deliveryId);
    expect(replay).toMatchObject({ status: 'accepted', runId: 'run-2' });
    const replayRow = await prisma.workflowEndpointDelivery.findUniqueOrThrow({
      where: { id: replay.deliveryId },
    });
    expect(replayRow.replayOfId).toBe(first.deliveryId);

    const statuses = (await service.deliveries(businessId, workflowId))
      .map((row) => row.status)
      .sort();
    expect(statuses).toEqual([
      'accepted',
      'accepted',
      'duplicate',
      'payload_rejected',
      'payload_rejected',
      'workflow_inactive',
    ]);

    const rotated = await service.issueToken(businessId, workflowId);
    expect(rotated.rotated).toBe(true);
    await expect(
      service.receive(token, { orderId: 'C3' }, undefined),
    ).rejects.toMatchObject({
      response: { code: 'WORKFLOW_ENDPOINT_UNKNOWN_TOKEN' },
    });
    await service.setEnabled(businessId, workflowId, false);
    await expect(
      service.receive(rotated.token, { orderId: 'C3' }, undefined),
    ).rejects.toMatchObject({
      response: { code: 'WORKFLOW_ENDPOINT_UNKNOWN_TOKEN' },
    });
  });
});
