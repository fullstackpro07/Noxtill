import { ClsService } from 'nestjs-cls';
import { PurchaseOrderStatus } from '@prisma/client';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProcurementAnalyticsService } from './contracts/procurement-analytics.service';

class FakeClsService {
  private values: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.values[key] as T;
  }
  set(key: string, value: unknown) {
    this.values[key] = value;
  }
}

describe('Procurement spend-control data source (real MySQL)', () => {
  let prisma: PrismaService;
  let analytics: ProcurementAnalyticsService;
  let businessId: string;
  let supplierId: string;
  let productId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    businessId = (
      await prisma.business.create({
        data: {
          name: 'Procurement Spend Control Spec',
          slug: `proc-spend-${suffix}`,
          currency: 'USD',
        },
      })
    ).id;
    supplierId = (
      await prisma.supplier.create({
        data: { businessId, name: 'Spend Control Uncontracted Supplier' },
      })
    ).id;
    productId = (
      await prisma.product.create({
        data: {
          businessId,
          name: 'Spend Control Spec Product',
          costPrice: 7,
          sellingPrice: 14,
        },
      })
    ).id;
    const cls = new FakeClsService();
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    analytics = new ProcurementAnalyticsService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
      prisma,
    );
    await prisma.purchaseOrder.create({
      data: {
        businessId,
        supplierId,
        status: PurchaseOrderStatus.sent,
        items: {
          create: [{ productId, qtyOrdered: 6, unitCost: 7 }],
        },
      },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.purchaseOrderItem.deleteMany({
      where: { purchaseOrder: { businessId } },
    });
    await prisma.purchaseOrder.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.supplier.deleteMany({ where: { businessId } });
    await prisma.business.deleteMany({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('reuses ProcurementAnalyticsService off-contract and commitment totals', async () => {
    const result = await analytics.analytics(businessId, { days: 90 });

    // There is no contract for this supplier; the existing analytics service classifies the PO.
    expect(result.kpis.offContractSpend).toEqual({
      amount: 42,
      shareOfCommitted: 100,
    });
    expect(result.contractUtilization).toEqual({
      committed: 42,
      underContract: 0,
      percent: 0,
    });
    expect(result.kpis.matchExceptionRate).toMatchObject({
      value: null,
      availability: 'not_available',
    });
  });
});
