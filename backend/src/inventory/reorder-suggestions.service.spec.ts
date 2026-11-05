import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ReorderSuggestionsService } from './reorder-suggestions.service';
import { StockMovementKind } from '@prisma/client';
import { PoliciesService } from '../common/policies/policies.service';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('ReorderSuggestionsService (UPD-BE-077)', () => {
  let prisma: PrismaService;
  let service: ReorderSuggestionsService;
  let businessId: string;
  const purchaseOrderIds: string[] = [];
  const branchBusinessIds: string[] = [];
  const stockTransferIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const business = await prisma.business.create({
      data: { name: 'Reorder Test Biz', slug: `reorder-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    service = new ReorderSuggestionsService(
      tenantPrisma,
      new PoliciesService(
        prisma,
        cls as unknown as ClsService,
        {} as CapabilitiesService,
      ),
      prisma,
    );
  });

  afterAll(async () => {
    if (stockTransferIds.length > 0) {
      await prisma.stockTransferItem.deleteMany({
        where: { transferId: { in: stockTransferIds } },
      });
      await prisma.stockTransfer.deleteMany({
        where: { id: { in: stockTransferIds } },
      });
    }
    if (purchaseOrderIds.length > 0) {
      await prisma.purchaseOrderItem.deleteMany({
        where: { purchaseOrderId: { in: purchaseOrderIds } },
      });
      await prisma.purchaseOrder.deleteMany({
        where: { id: { in: purchaseOrderIds }, businessId },
      });
    }
    await prisma.stockMovement.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({
      where: { businessId: { in: [businessId, ...branchBusinessIds] } },
    });
    await prisma.supplier.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      if (branchBusinessIds.length > 0) {
        await tx.business.deleteMany({
          where: { id: { in: branchBusinessIds } },
        });
      }
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('suggests a real reorder quantity for a fast-selling, low-stock product, grouped under its real most-recent supplier', async () => {
    const supplier = await prisma.supplier.create({
      data: { businessId, name: 'Real Supplier Co' },
    });
    const product = await prisma.product.create({
      data: {
        businessId,
        name: 'Fast Mover',
        stockQty: 5,
        lowStockThreshold: 10,
      },
    });
    // A real purchase from this supplier, establishing the "last bought from" inference.
    await prisma.stockMovement.create({
      data: {
        businessId,
        productId: product.id,
        supplierId: supplier.id,
        kind: StockMovementKind.purchase,
        qty: 50,
      },
    });
    // Real sales over the last 30 days: 60 units sold -> velocity 2/day.
    await prisma.stockMovement.create({
      data: {
        businessId,
        productId: product.id,
        kind: StockMovementKind.sale,
        qty: -60,
      },
    });

    const groups = await service.list(businessId);
    expect(groups).toHaveLength(1);
    expect(groups[0].supplierId).toBe(supplier.id);
    expect(groups[0].supplierName).toBe('Real Supplier Co');

    const item = groups[0].items.find((i) => i.productId === product.id);
    expect(item).toBeDefined();
    // velocity 2/day * 14-day lead time = 28, + threshold 10 - current stock 5 = 33
    expect(item?.suggestedQty).toBe(33);
    expect(item?.velocityPerDay).toBe(2);
  });

  it('subtracts open supply, applies a product minimum to the remaining shortage, then rounds to packs', async () => {
    const supplier = await prisma.supplier.create({
      data: { businessId, name: 'Minimum floor supplier' },
    });
    const product = await prisma.product.create({
      data: {
        businessId,
        name: 'Pack-rounded fast mover',
        stockQty: 5,
        lowStockThreshold: 10,
        stockUnitLabel: 'bottle',
        purchaseUnitLabel: 'case',
        purchasePackSize: 12,
        minimumReorderQty: 30,
      },
    });
    await prisma.stockMovement.create({
      data: {
        businessId,
        productId: product.id,
        kind: StockMovementKind.sale,
        qty: -60,
      },
    });
    const order = await prisma.purchaseOrder.create({
      data: {
        businessId,
        supplierId: supplier.id,
        status: 'sent',
        sentAt: new Date(),
        items: { create: { productId: product.id, qtyOrdered: 9, unitCost: 2 } },
      },
    });
    purchaseOrderIds.push(order.id);

    const groups = await service.list(businessId);
    const item = groups.flatMap((group) => group.items).find((row) => row.productId === product.id);
    expect(item).toMatchObject({
      baseSuggestedQty: 33,
      incomingPurchaseQty: 9,
      unroundedAdditionalQty: 24,
      minimumReorderQty: 30,
      suggestedQty: 36,
      purchasePackSize: 12,
      purchasePackCount: 3,
      stockUnitLabel: 'bottle',
      purchaseUnitLabel: 'case',
    });
  });

  it('does not apply a product minimum when open supply covers the calculated need', async () => {
    const supplier = await prisma.supplier.create({
      data: { businessId, name: 'Covered floor supplier' },
    });
    const product = await prisma.product.create({
      data: {
        businessId,
        name: 'Covered minimum reorder product',
        stockQty: 5,
        lowStockThreshold: 10,
        minimumReorderQty: 50,
      },
    });
    await prisma.stockMovement.create({
      data: {
        businessId,
        productId: product.id,
        kind: StockMovementKind.sale,
        qty: -60,
      },
    });
    const order = await prisma.purchaseOrder.create({
      data: {
        businessId,
        supplierId: supplier.id,
        status: 'confirmed',
        sentAt: new Date(),
        items: { create: { productId: product.id, qtyOrdered: 33, unitCost: 2 } },
      },
    });
    purchaseOrderIds.push(order.id);

    const groups = await service.list(businessId);
    expect(groups.flatMap((group) => group.items)).not.toContainEqual(
      expect.objectContaining({ productId: product.id }),
    );
  });

  it('adjusts reorder quantities for committed outbound and mapped approved or shipped inbound branch transfers', async () => {
    const stamp = Date.now();
    const sourceBranch = await prisma.business.create({
      data: {
        name: 'Reorder Transfer Source',
        slug: `reorder-transfer-source-${stamp}`,
        parentId: businessId,
      },
    });
    const otherBranch = await prisma.business.create({
      data: {
        name: 'Reorder Transfer Other',
        slug: `reorder-transfer-other-${stamp}`,
        parentId: businessId,
      },
    });
    branchBusinessIds.push(sourceBranch.id, otherBranch.id);
    const sku = `TRANSFER-${stamp}`;
    const destinationProduct = await prisma.product.create({
      data: {
        businessId,
        name: 'Transfer-aware reorder product',
        sku,
        stockQty: 10,
        lowStockThreshold: 10,
      },
    });
    const incomingSource = await prisma.product.create({
      data: {
        businessId: sourceBranch.id,
        name: 'Matching inbound source product',
        sku,
        stockQty: 20,
      },
    });
    const pendingSource = await prisma.product.create({
      data: {
        businessId: otherBranch.id,
        name: 'Pending inbound source product',
        sku,
        stockQty: 20,
      },
    });
    const committedOutbound = await prisma.stockTransfer.create({
      data: {
        sourceBusinessId: businessId,
        destBusinessId: otherBranch.id,
        status: 'approved',
        items: {
          create: { sourceProductId: destinationProduct.id, qty: 4 },
        },
      },
    });
    const shippedInbound = await prisma.stockTransfer.create({
      data: {
        sourceBusinessId: sourceBranch.id,
        destBusinessId: businessId,
        status: 'shipped',
        items: { create: { sourceProductId: incomingSource.id, qty: 3 } },
      },
    });
    const pendingInbound = await prisma.stockTransfer.create({
      data: {
        sourceBusinessId: otherBranch.id,
        destBusinessId: businessId,
        status: 'pending',
        items: { create: { sourceProductId: pendingSource.id, qty: 20 } },
      },
    });
    stockTransferIds.push(
      committedOutbound.id,
      shippedInbound.id,
      pendingInbound.id,
    );
    await prisma.stockMovement.create({
      data: {
        businessId,
        productId: destinationProduct.id,
        kind: StockMovementKind.sale,
        qty: -60,
      },
    });

    const groups = await service.list(businessId);
    const suggestion = groups
      .flatMap((group) => group.items)
      .find((item) => item.productId === destinationProduct.id);
    expect(suggestion).toMatchObject({
      currentStock: 10,
      committedOutboundTransferQty: 4,
      availableStockAfterOutboundTransfers: 6,
      incomingTransferQty: 3,
      baseSuggestedQty: 32,
      unroundedAdditionalQty: 29,
      suggestedQty: 29,
    });
  });

  it('groups a product with no real purchase history under "no supplier on record"', async () => {
    const product = await prisma.product.create({
      data: {
        businessId,
        name: 'No Supplier Product',
        stockQty: 1,
        lowStockThreshold: 10,
      },
    });
    await prisma.stockMovement.create({
      data: {
        businessId,
        productId: product.id,
        kind: StockMovementKind.sale,
        qty: -30,
      },
    });

    const groups = await service.list(businessId);
    const unassigned = groups.find((g) => g.supplierId === 'unassigned');
    expect(unassigned).toBeDefined();
    expect(unassigned?.items.some((i) => i.productId === product.id)).toBe(
      true,
    );
  });

  it('never suggests reordering a well-stocked, slow-moving product', async () => {
    const product = await prisma.product.create({
      data: {
        businessId,
        name: 'Well Stocked',
        stockQty: 500,
        lowStockThreshold: 5,
      },
    });
    await prisma.stockMovement.create({
      data: {
        businessId,
        productId: product.id,
        kind: StockMovementKind.sale,
        qty: -1,
      },
    });

    const groups = await service.list(businessId);
    const allItems = groups.flatMap((g) => g.items);
    expect(allItems.some((i) => i.productId === product.id)).toBe(false);
  });

  it('uses the business-configured reorder lead-time baseline', async () => {
    const product = await prisma.product.create({
      data: {
        businessId,
        name: 'Configured lead-time product',
        stockQty: 5,
        lowStockThreshold: 10,
      },
    });
    await prisma.stockMovement.create({
      data: {
        businessId,
        productId: product.id,
        kind: StockMovementKind.sale,
        qty: -60,
      },
    });
    await prisma.business.update({
      where: { id: businessId },
      data: {
        policies: { 'inventory.agentReorderLeadTimeDays': 21 },
      },
    });

    const groups = await service.list(businessId);
    const item = groups.flatMap((group) => group.items).find((row) => row.productId === product.id);

    expect(item?.baselineLeadTimeDays).toBe(21);
    expect(item?.suggestedQty).toBe(47);
  });
});
