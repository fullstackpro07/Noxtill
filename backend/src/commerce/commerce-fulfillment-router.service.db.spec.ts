import { ClsService } from 'nestjs-cls';
import {
  CommerceFulfillmentMappingRole,
  CommerceFulfillmentNodeType,
  CommerceRoutingDecisionStatus,
  CommerceRoutingMode,
  OrderStatus,
  OrderType,
  ProductKind,
} from '@prisma/client';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommerceFulfillmentRouterService } from './commerce-fulfillment-router.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('CommerceFulfillmentRouterService (MySQL)', () => {
  let prisma: PrismaService;
  let service: CommerceFulfillmentRouterService;
  let businessId: string;
  let branchId: string;
  let productA: string;
  let productB: string;
  let serviceProduct: string;
  let ownNode: string;
  let dropNode: string;
  let orderNo = 1;
  const stamp = Date.now();
  const skuA = `route-a-${stamp}`;
  const skuB = `route-b-${stamp}`;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    service = new CommerceFulfillmentRouterService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
      prisma,
    );
    businessId = (
      await prisma.business.create({
        data: { name: 'Router Root', slug: `router-root-${stamp}` },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    branchId = (
      await prisma.business.create({
        data: {
          name: 'Router Branch',
          slug: `router-branch-${stamp}`,
          parentId: businessId,
        },
      })
    ).id;
    productA = (
      await prisma.product.create({
        data: { businessId, name: 'Alpha', sku: skuA, stockQty: 0 },
      })
    ).id;
    productB = (
      await prisma.product.create({
        data: { businessId, name: 'Bravo', sku: skuB, stockQty: 0 },
      })
    ).id;
    serviceProduct = (
      await prisma.product.create({
        data: { businessId, name: 'Gift wrap', kind: ProductKind.service },
      })
    ).id;
    // The branch stocks 5 of Alpha and none of Bravo (no Bravo row at all).
    await prisma.product.create({
      data: { businessId: branchId, name: 'Alpha', sku: skuA, stockQty: 5 },
    });
    const supplier = await prisma.supplier.create({
      data: { businessId, name: 'Router Dropship' },
    });
    ownNode = (
      await prisma.commerceFulfillmentNode.create({
        data: {
          businessId,
          name: 'Branch warehouse',
          type: CommerceFulfillmentNodeType.own_location,
          branchBusinessId: branchId,
          serviceMarkets: ['US'],
          processingDays: 1,
        },
      })
    ).id;
    dropNode = (
      await prisma.commerceFulfillmentNode.create({
        data: {
          businessId,
          name: 'Dropship partner',
          type: CommerceFulfillmentNodeType.dropship_supplier,
          supplierId: supplier.id,
          serviceMarkets: ['US', 'GB'],
          processingDays: 3,
        },
      })
    ).id;
  });

  afterEach(async () => {
    await prisma.commerceFulfillmentAudit.deleteMany({ where: { businessId } });
    await prisma.commerceRoutingDecision.deleteMany({ where: { businessId } });
    await prisma.commerceFulfillmentMapping.deleteMany({
      where: { businessId },
    });
    const orders = await prisma.order.findMany({
      where: { businessId },
      select: { id: true },
    });
    await prisma.orderItem.deleteMany({
      where: { orderId: { in: orders.map((order) => order.id) } },
    });
    await prisma.order.deleteMany({ where: { businessId } });
  });

  afterAll(async () => {
    await prisma.commerceFulfillmentNode.deleteMany({ where: { businessId } });
    await prisma.supplier.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({
      where: { businessId: { in: [businessId, branchId] } },
    });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.deleteMany({
        where: { id: { in: [branchId, businessId] } },
      });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  function map(
    nodeId: string,
    productId: string,
    role: CommerceFulfillmentMappingRole,
  ) {
    return prisma.commerceFulfillmentMapping.create({
      data: { businessId, nodeId, productId, role },
    });
  }

  function order(
    lines: Array<{ productId: string; qty: number }>,
    overrides: { orderType?: OrderType; status?: OrderStatus } = {},
  ) {
    return prisma.order.create({
      data: {
        businessId,
        orderNo: orderNo++,
        orderType: overrides.orderType ?? OrderType.online,
        status: overrides.status ?? OrderStatus.confirmed,
        items: {
          create: lines.map((line) => ({
            productId: line.productId,
            name: line.productId,
            price: 10,
            cost: 4,
            qty: line.qty,
          })),
        },
      },
      include: { items: true },
    });
  }

  it('queues only open shipping orders with physical lines', async () => {
    const shipping = await order([{ productId: productA, qty: 1 }]);
    await order([{ productId: productA, qty: 1 }], {
      orderType: OrderType.counter,
    });
    await order([{ productId: productA, qty: 1 }], {
      status: OrderStatus.cancelled,
    });
    await order([{ productId: serviceProduct, qty: 1 }]);
    const queue = await service.queue(businessId);
    expect(queue.map((row) => row.orderId)).toEqual([shipping.id]);
  });

  it('recommends the primary own location with verified stock over an untracked backup', async () => {
    await map(ownNode, productA, CommerceFulfillmentMappingRole.primary);
    await map(dropNode, productA, CommerceFulfillmentMappingRole.backup);
    const created = await order([{ productId: productA, qty: 2 }]);
    const result = await service.candidates(businessId, created.id, 'us');
    expect(result.destinationCountry).toBe('US');
    expect(result.recommendation).toMatchObject({
      mode: CommerceRoutingMode.single,
      allocations: [{ orderItemId: created.items[0].id, nodeId: ownNode }],
    });
    const own = result.nodes.find((node) => node.nodeId === ownNode)!;
    expect(own.lines[0]).toMatchObject({ stock: 'available', eligible: true });
    const drop = result.nodes.find((node) => node.nodeId === dropNode)!;
    expect(drop.lines[0]).toMatchObject({
      stock: 'not_tracked',
      eligible: true,
    });
  });

  it('excludes a branch without enough stock or outside the destination market', async () => {
    await map(ownNode, productA, CommerceFulfillmentMappingRole.primary);
    await map(dropNode, productA, CommerceFulfillmentMappingRole.backup);
    const big = await order([{ productId: productA, qty: 9 }]);
    let result = await service.candidates(businessId, big.id, 'US');
    expect(result.recommendation?.allocations[0].nodeId).toBe(dropNode);
    expect(
      result.nodes.find((node) => node.nodeId === ownNode)!.lines[0].stock,
    ).toBe('insufficient');

    const small = await order([{ productId: productA, qty: 1 }]);
    result = await service.candidates(businessId, small.id, 'GB');
    expect(result.recommendation?.allocations[0].nodeId).toBe(dropNode);
    expect(result.nodes.find((node) => node.nodeId === ownNode)!.market).toBe(
      'not_served',
    );
  });

  it('proposes a split when no single node covers every line, and flags unmapped lines', async () => {
    await map(ownNode, productA, CommerceFulfillmentMappingRole.primary);
    await map(dropNode, productB, CommerceFulfillmentMappingRole.primary);
    const mixed = await order([
      { productId: productA, qty: 1 },
      { productId: productB, qty: 1 },
    ]);
    const result = await service.candidates(businessId, mixed.id);
    expect(result.recommendation?.mode).toBe(CommerceRoutingMode.split);
    expect(
      Object.fromEntries(
        result.recommendation!.allocations.map((row) => [
          row.orderItemId,
          row.nodeId,
        ]),
      ),
    ).toEqual({
      [mixed.items.find((item) => item.productId === productA)!.id]: ownNode,
      [mixed.items.find((item) => item.productId === productB)!.id]: dropNode,
    });

    await prisma.commerceFulfillmentMapping.deleteMany({
      where: { businessId, productId: productB },
    });
    const [row] = (await service.queue(businessId)).filter(
      (item) => item.orderId === mixed.id,
    );
    expect(row).toMatchObject({ recommendation: null, unroutable: true });
  });

  it('records the recommended route, requires a reason to override, and supersedes on reroute', async () => {
    await map(ownNode, productA, CommerceFulfillmentMappingRole.primary);
    await map(dropNode, productA, CommerceFulfillmentMappingRole.backup);
    const created = await order([{ productId: productA, qty: 1 }]);
    const itemId = created.items[0].id;

    const first = await service.assign(businessId, 'operator', created.id, {
      destinationCountry: 'US',
      allocations: [{ orderItemId: itemId, nodeId: ownNode }],
    });
    expect(first).toMatchObject({
      status: CommerceRoutingDecisionStatus.active,
      mode: CommerceRoutingMode.single,
      overrodeRecommendation: false,
      policyVersion: 'deterministic-v1',
    });

    await expect(
      service.assign(businessId, 'operator', created.id, {
        destinationCountry: 'US',
        allocations: [{ orderItemId: itemId, nodeId: dropNode }],
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_ROUTING_OVERRIDE_REASON_REQUIRED' },
    });
    const second = await service.assign(businessId, 'operator', created.id, {
      destinationCountry: 'US',
      allocations: [{ orderItemId: itemId, nodeId: dropNode }],
      reason: 'Branch team is at a trade show this week',
    });
    expect(second.overrodeRecommendation).toBe(true);
    const history = await service.history(businessId, created.id);
    expect(history.map((row) => row.status)).toEqual([
      CommerceRoutingDecisionStatus.active,
      CommerceRoutingDecisionStatus.superseded,
    ]);
    const [queued] = await service.queue(businessId);
    expect(queued.route?.allocations[0].node.id).toBe(dropNode);

    await service.cancel(
      businessId,
      'operator',
      second.id,
      'Customer asked to hold',
    );
    expect((await service.history(businessId, created.id))[0].status).toBe(
      CommerceRoutingDecisionStatus.cancelled,
    );
    expect(
      await prisma.commerceFulfillmentAudit.count({
        where: {
          businessId,
          action: { in: ['route_assigned', 'route_cancelled'] },
        },
      }),
    ).toBe(3);
  });

  it('rejects ineligible nodes and incomplete allocations', async () => {
    await map(ownNode, productA, CommerceFulfillmentMappingRole.primary);
    const created = await order([
      { productId: productA, qty: 1 },
      { productId: productB, qty: 1 },
    ]);
    const itemA = created.items.find((item) => item.productId === productA)!.id;
    const itemB = created.items.find((item) => item.productId === productB)!.id;
    await expect(
      service.assign(businessId, 'operator', created.id, {
        allocations: [{ orderItemId: itemA, nodeId: ownNode }],
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_ROUTING_INVALID_ALLOCATION' },
    });
    await expect(
      service.assign(businessId, 'operator', created.id, {
        allocations: [
          { orderItemId: itemA, nodeId: ownNode },
          { orderItemId: itemB, nodeId: ownNode },
        ],
        reason: 'forcing it',
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_ROUTING_NODE_NOT_ELIGIBLE' },
    });
  });
});
