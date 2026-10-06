import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ProcurementService } from './procurement.service';

class FakeClsService {
  private values: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.values[key] as T;
  }

  set(key: string, value: unknown) {
    this.values[key] = value;
  }
}

describe('ProcurementService (real MySQL)', () => {
  let prisma: PrismaService;
  let service: ProcurementService;
  let businessId: string;
  let otherBusinessId: string;
  const createdBusinessIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    const business = await prisma.business.create({
      data: {
        name: 'Procurement Overview Spec',
        slug: `procurement-overview-${Date.now()}`,
      },
    });
    businessId = business.id;
    createdBusinessIds.push(business.id);
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    service = new ProcurementService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
    );

    const otherBusiness = await prisma.business.create({
      data: {
        name: 'Other Procurement Tenant',
        slug: `other-procurement-${Date.now()}`,
      },
    });
    otherBusinessId = otherBusiness.id;
    createdBusinessIds.push(otherBusiness.id);

    const [supplierA, supplierB, otherSupplier] = await Promise.all([
      prisma.supplier.create({ data: { businessId, name: 'Spec Supplier A' } }),
      prisma.supplier.create({ data: { businessId, name: 'Spec Supplier B' } }),
      prisma.supplier.create({
        data: { businessId: otherBusinessId, name: 'Other Tenant Supplier' },
      }),
    ]);
    const [rawProductA, packageProduct, rawProductB, otherProduct] =
      await Promise.all([
        prisma.product.create({
          data: {
            businessId,
            name: 'Spec Raw Product A',
            category: 'Raw materials',
            costPrice: 1,
            sellingPrice: 2,
          },
        }),
        prisma.product.create({
          data: {
            businessId,
            name: 'Spec Packaging Product',
            category: 'Packaging',
            costPrice: 1,
            sellingPrice: 2,
          },
        }),
        prisma.product.create({
          data: {
            businessId,
            name: 'Spec Raw Product B',
            category: 'Raw materials',
            costPrice: 1,
            sellingPrice: 2,
          },
        }),
        prisma.product.create({
          data: {
            businessId: otherBusinessId,
            name: 'Other Tenant Product',
            costPrice: 1,
            sellingPrice: 2,
          },
        }),
      ]);

    await prisma.purchaseOrder.create({
      data: {
        businessId,
        supplierId: supplierA.id,
        status: 'confirmed',
        items: {
          create: [
            {
              productId: rawProductA.id,
              qtyOrdered: 3,
              qtyReceived: 1,
              unitCost: 5,
            },
            {
              productId: packageProduct.id,
              qtyOrdered: 2,
              qtyReceived: 2,
              unitCost: 5,
            },
          ],
        },
      },
    });
    await prisma.purchaseOrder.create({
      data: {
        businessId,
        supplierId: supplierB.id,
        status: 'sent',
        items: {
          create: [{ productId: rawProductB.id, qtyOrdered: 4, unitCost: 10 }],
        },
      },
    });
    await prisma.purchaseOrder.create({
      data: {
        businessId: otherBusinessId,
        supplierId: otherSupplier.id,
        status: 'confirmed',
        items: {
          create: [
            { productId: otherProduct.id, qtyOrdered: 100, unitCost: 100 },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    for (const id of createdBusinessIds) {
      await prisma.purchaseOrderItem.deleteMany({
        where: { purchaseOrder: { businessId: id } },
      });
      await prisma.purchaseOrder.deleteMany({ where: { businessId: id } });
      await prisma.supplier.deleteMany({ where: { businessId: id } });
      await prisma.product.deleteMany({ where: { businessId: id } });
      await prisma.business.delete({ where: { id } });
    }
    await prisma.$disconnect();
  });

  it("summarizes only this business's open commitments and discloses untracked sources", async () => {
    const result = await service.overview(businessId);

    expect(result.currency).toBe('USD');
    expect(result.metrics.committedPoValue.value).toBe(65);
    expect(result.metrics.receiptsPending.value).toBe(1);
    expect(result.metrics.supplierConcentration.value).toBeCloseTo(
      (40 / 65) * 100,
    );
    expect(result.openPurchaseOrderCount).toBe(2);
    expect(result.topCategories).toEqual([
      { category: 'Raw materials', committedValue: 55 },
      { category: 'Packaging', committedValue: 10 },
    ]);
    expect(
      result.supplierCommitments.map((supplier) => supplier.supplierName),
    ).toEqual(['Spec Supplier B', 'Spec Supplier A']);
    expect(result.metrics.openRequests).toMatchObject({
      value: 0,
      availability: 'tracked',
    });
    expect(result.metrics.pendingApprovalValue).toMatchObject({
      value: 0,
      availability: 'tracked',
    });
    expect(result.metrics.spendVsBudget).toMatchObject({
      value: null,
      availability: 'not_available',
    });
    expect(result.recentPurchaseOrders).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain('Other Tenant');
  });
});
