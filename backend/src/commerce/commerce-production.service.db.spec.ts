import { ClsService } from 'nestjs-cls';
import {
  CommerceBomStatus,
  CommerceWorkOrderStatus,
  ProductKind,
  StockMovementKind,
} from '@prisma/client';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CommerceProductionService,
  requiredComponentQty,
} from './commerce-production.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('requiredComponentQty', () => {
  it('applies scrap allowance and rounds up to whole units', () => {
    expect(requiredComponentQty(10, 2, 5)).toBe(21);
    expect(requiredComponentQty(3, 0.5, 0)).toBe(2);
    expect(requiredComponentQty(4, 0.25, 0)).toBe(1);
  });
});

describe('CommerceProductionService (MySQL)', () => {
  let prisma: PrismaService;
  let service: CommerceProductionService;
  let businessId: string;
  let finished: string;
  let wood: string;
  let screws: string;
  let serviceProduct: string;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    service = new CommerceProductionService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
    );
    businessId = (
      await prisma.business.create({
        data: { name: 'Production Test', slug: `production-${stamp}` },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    finished = (
      await prisma.product.create({
        data: { businessId, name: 'Stool', sku: `stool-${stamp}` },
      })
    ).id;
    wood = (
      await prisma.product.create({
        data: { businessId, name: 'Wood plank', costPrice: 4 },
      })
    ).id;
    screws = (
      await prisma.product.create({
        data: { businessId, name: 'Screw', costPrice: 0.1 },
      })
    ).id;
    serviceProduct = (
      await prisma.product.create({
        data: { businessId, name: 'Assembly help', kind: ProductKind.service },
      })
    ).id;
  });

  beforeEach(async () => {
    await prisma.product.update({
      where: { id: finished },
      data: { stockQty: 0 },
    });
    await prisma.product.update({
      where: { id: wood },
      data: { stockQty: 100 },
    });
    await prisma.product.update({
      where: { id: screws },
      data: { stockQty: 500 },
    });
  });

  afterEach(async () => {
    await prisma.commerceWorkOrderAudit.deleteMany({ where: { businessId } });
    await prisma.commerceWorkOrder.deleteMany({ where: { businessId } });
    await prisma.commerceBom.deleteMany({ where: { businessId } });
    await prisma.stockMovement.deleteMany({ where: { businessId } });
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  function createBom(scrapAllowancePct = 0) {
    return service.createBom(businessId, 'operator', {
      productId: finished,
      scrapAllowancePct,
      laborCostPerUnit: 2,
      items: [
        { componentProductId: wood, qtyPerUnit: 3 },
        { componentProductId: screws, qtyPerUnit: 8 },
      ],
    });
  }

  async function startedWorkOrder(qtyPlanned: number) {
    const bom = await createBom();
    const workOrder = await service.createWorkOrder(businessId, 'operator', {
      bomId: bom.id,
      qtyPlanned,
    });
    await service.start(businessId, 'operator', workOrder.id);
    return workOrder;
  }

  const stock = async (id: string) =>
    (await prisma.product.findUniqueOrThrow({ where: { id } })).stockQty;

  it('versions BOMs, archiving the previous active version', async () => {
    const first = await createBom();
    const second = await createBom(5);
    expect(second.version).toBe(first.version + 1);
    const boms = await service.listBoms(businessId);
    expect(
      Object.fromEntries(boms.map((bom) => [bom.version, bom.status])),
    ).toEqual({
      [first.version]: CommerceBomStatus.archived,
      [second.version]: CommerceBomStatus.active,
    });
    // (3 × 4 + 8 × 0.1) × 1.05 + 2 labour = 15.44
    expect(boms.find((bom) => bom.id === second.id)?.estimatedUnitCost).toBe(
      15.44,
    );
  });

  it('rejects self-components, duplicates and services', async () => {
    const base = { productId: finished };
    await expect(
      service.createBom(businessId, 'op', {
        ...base,
        items: [{ componentProductId: finished, qtyPerUnit: 1 }],
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_PRODUCTION_INVALID_BOM' },
    });
    await expect(
      service.createBom(businessId, 'op', {
        ...base,
        items: [
          { componentProductId: wood, qtyPerUnit: 1 },
          { componentProductId: wood, qtyPerUnit: 2 },
        ],
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_PRODUCTION_INVALID_BOM' },
    });
    await expect(
      service.createBom(businessId, 'op', {
        ...base,
        items: [{ componentProductId: serviceProduct, qtyPerUnit: 1 }],
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_PRODUCTION_PRODUCT_NOT_FOUND' },
    });
  });

  it('consumes components and receives finished goods as canonical stock movements', async () => {
    const workOrder = await startedWorkOrder(10);
    expect(Number(workOrder.estimatedCost)).toBe(10 * 3 * 4 + 80 * 0.1 + 20);

    await service.complete(businessId, 'operator', workOrder.id, {
      qtyGood: 9,
      qtyScrap: 1,
      qualityPassed: true,
    });
    expect(await stock(wood)).toBe(70);
    expect(await stock(screws)).toBe(420);
    expect(await stock(finished)).toBe(9);

    const movements = await prisma.stockMovement.findMany({
      where: { businessId },
      orderBy: { qty: 'asc' },
    });
    expect(movements.map((movement) => [movement.kind, movement.qty])).toEqual([
      [StockMovementKind.production_consume, -80],
      [StockMovementKind.production_consume, -30],
      [StockMovementKind.production_output, 9],
    ]);
    // actual = 30 × 4 + 80 × 0.1 + 10 × 2 labour = 148, spread over 9 good units
    const output = movements.find(
      (movement) => movement.kind === StockMovementKind.production_output,
    )!;
    expect(Number(output.unitCost)).toBe(16.44);

    const summary = await service.summary(businessId);
    expect(summary).toMatchObject({
      completedCount: 1,
      scrapRatePct: 10,
      costVariance: 0,
      openWorkOrders: 0,
    });
  });

  it('refuses completion on a shortage and rolls back every component', async () => {
    const workOrder = await startedWorkOrder(10);
    await prisma.product.update({
      where: { id: screws },
      data: { stockQty: 5 },
    });
    const [listed] = await service.listWorkOrders(businessId);
    expect(listed.materialsReady).toBe(false);

    await expect(
      service.complete(businessId, 'operator', workOrder.id, {
        qtyGood: 10,
        qtyScrap: 0,
        qualityPassed: true,
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_PRODUCTION_MATERIAL_SHORTAGE' },
    });
    expect(await stock(wood)).toBe(100);
    expect(await stock(finished)).toBe(0);
    expect(await prisma.stockMovement.count({ where: { businessId } })).toBe(0);
  });

  it('keeps failed-quality output out of stock until released', async () => {
    const workOrder = await startedWorkOrder(5);
    await service.complete(businessId, 'operator', workOrder.id, {
      qtyGood: 5,
      qtyScrap: 0,
      qualityPassed: false,
      qualityNotes: 'Wobbly legs on inspection',
    });
    expect(await stock(finished)).toBe(0);
    expect(await stock(wood)).toBe(85);
    expect((await service.summary(businessId)).qualityHolds).toBe(1);

    await expect(
      service.release(businessId, 'operator', workOrder.id, {
        qtyReleased: 6,
        reason: 'too many',
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_PRODUCTION_INVALID_QUANTITY' },
    });
    const released = await service.release(
      businessId,
      'operator',
      workOrder.id,
      {
        qtyReleased: 3,
        reason: 'Three re-glued and passed re-inspection',
      },
    );
    expect(released).toMatchObject({
      status: CommerceWorkOrderStatus.completed,
      qtyGood: 3,
      qtyScrap: 2,
    });
    expect(await stock(finished)).toBe(3);
  });

  it('enforces the lifecycle', async () => {
    const bom = await createBom();
    const workOrder = await service.createWorkOrder(businessId, 'operator', {
      bomId: bom.id,
      qtyPlanned: 2,
    });
    await expect(
      service.complete(businessId, 'operator', workOrder.id, {
        qtyGood: 2,
        qtyScrap: 0,
        qualityPassed: true,
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_PRODUCTION_INVALID_STATE' },
    });
    await service.start(businessId, 'operator', workOrder.id);
    await expect(
      service.complete(businessId, 'operator', workOrder.id, {
        qtyGood: 1,
        qtyScrap: 0,
        qualityPassed: true,
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_PRODUCTION_INVALID_QUANTITY' },
    });
    await service.cancel(businessId, 'operator', workOrder.id, 'Order dropped');
    await expect(
      service.cancel(businessId, 'operator', workOrder.id, 'again'),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_PRODUCTION_INVALID_STATE' },
    });
    const numbers = (
      await service.createWorkOrder(businessId, 'operator', {
        bomId: bom.id,
        qtyPlanned: 1,
      })
    ).number;
    expect(numbers).toBe(workOrder.number + 1);
  });
});
