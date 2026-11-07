import { ClsService } from 'nestjs-cls';
import type { Prisma } from '@prisma/client';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommerceAgentToolsService } from './commerce-agent-tools.service';
import type { CommerceFulfillmentRouterService } from './commerce-fulfillment-router.service';
import type { CommerceRfqsService } from './commerce-rfqs.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('CommerceAgentToolsService (MySQL)', () => {
  let prisma: PrismaService;
  let service: CommerceAgentToolsService;
  let businessId: string;
  let productId: string;
  const candidates = jest.fn();
  const stamp = Date.now();

  const setPolicies = (policies: Prisma.InputJsonObject) =>
    prisma.business.update({ where: { id: businessId }, data: { policies } });

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    service = new CommerceAgentToolsService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
      {} as CommerceRfqsService,
      { candidates } as unknown as CommerceFulfillmentRouterService,
    );
    businessId = (
      await prisma.business.create({
        data: { name: 'Agent Tools', slug: `agent-tools-${stamp}` },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    productId = (
      await prisma.product.create({
        data: { businessId, name: 'Kettle', stockQty: 2, lowStockThreshold: 5 },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.commerceAgentToolRun.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('defaults to observe: read tools run and are audited, write tools are refused and audited', async () => {
    const registry = await service.registry(businessId);
    expect(registry.autonomyLevel).toBe(1);
    const tool = (key: string) =>
      registry.tools.find((row) => row.key === key)!;
    expect(tool('get_product').blockedReason).toBeNull();
    expect(tool('publish_listing')).toMatchObject({
      approvalRequired: true,
      minLevel: 4,
    });
    expect(tool('publish_listing').blockedReason).toMatch(/level 4 or higher/);

    const read = await service.run(businessId, 'owner', 'get_product', {
      productId,
    });
    expect(read.run).toMatchObject({
      outcome: 'succeeded',
      riskClass: 'READ_ONLY',
      autonomyLevel: 1,
    });
    expect(read.result).toMatchObject({ name: 'Kettle', stockQty: 2 });

    const low = await service.run(businessId, 'owner', 'get_inventory', {});
    expect((low.result as unknown[]).length).toBe(1);

    const write = await service.run(businessId, 'owner', 'create_rfq', {
      productId,
    });
    expect(write).toMatchObject({ result: null, run: { outcome: 'refused' } });
    expect(write.run.refusalReason).toMatch(/does not allow medium risk write/);
  });

  it('refuses everything at level 0 and non-read tools while paused, and never executes unbuilt writes', async () => {
    await setPolicies({ 'commerce.autonomyLevel': 0 });
    const disabled = await service.run(businessId, 'owner', 'get_product', {
      productId,
    });
    expect(disabled.run.outcome).toBe('refused');

    await setPolicies({
      'commerce.autonomyLevel': 5,
      'commerce.actionsPaused': true,
    });
    expect(
      (await service.run(businessId, 'owner', 'publish_listing', {})).run
        .refusalReason,
    ).toMatch(/paused/);
    expect(
      (await service.run(businessId, 'owner', 'get_product', { productId })).run
        .outcome,
    ).toBe('succeeded');

    await setPolicies({ 'commerce.autonomyLevel': 5 });
    expect(
      (await service.run(businessId, 'owner', 'publish_listing', {})).run
        .refusalReason,
    ).toMatch(/not yet executable/);

    candidates.mockResolvedValueOnce({ orderId: 'o1', recommended: null });
    const route = await service.run(
      businessId,
      'owner',
      'calculate_fulfillment_route',
      {
        orderId: 'o1',
        destinationCountry: 'us',
      },
    );
    expect(candidates).toHaveBeenCalledWith(businessId, 'o1', 'us');
    expect(route.run.outcome).toBe('succeeded');

    await expect(
      service.run(businessId, 'owner', 'get_order', {}),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_AGENT_INPUT_REQUIRED' },
    });
    const runs = await service.runs(businessId);
    expect(runs[0]).toMatchObject({ toolKey: 'get_order', outcome: 'failed' });
    expect(new Set(runs.map((run) => run.outcome))).toEqual(
      new Set(['succeeded', 'refused', 'failed']),
    );
  });
});
