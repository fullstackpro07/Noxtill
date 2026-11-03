import { ClsService } from 'nestjs-cls';
import { Prisma, PurchaseOrderStatus } from '@prisma/client';
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
    await prisma.finBill.deleteMany({ where: { businessId } });
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
    // No Finance bills are linked to these POs, so there is no rate yet (not "not available").
    expect(result.kpis.matchExceptionRate).toMatchObject({
      value: null,
      availability: 'available',
      billedPurchaseOrders: 0,
    });
    expect(result.exceptionTrend).toEqual([]);
    expect(result.kpis.billedSpend).toEqual({ bills: 0, billed: 0, paid: 0 });
  });

  it('reads Finance bills on the period’s POs for the exception rate and billed / paid spend', async () => {
    const po = await prisma.purchaseOrder.create({
      data: {
        businessId,
        supplierId,
        status: PurchaseOrderStatus.received,
        items: {
          create: [{ productId, qtyOrdered: 2, qtyReceived: 2, unitCost: 7 }],
        },
      },
    });
    const firstPo = await prisma.purchaseOrder.findFirstOrThrow({
      where: { businessId, id: { not: po.id } },
    });
    const bill = (
      over: Omit<
        Prisma.FinBillCreateManyInput,
        | 'businessId'
        | 'vendorName'
        | 'billDate'
        | 'dueDate'
        | 'currency'
        | 'status'
      > & { status?: string },
    ): Prisma.FinBillCreateManyInput => ({
      businessId,
      vendorName: 'Spend Control Uncontracted Supplier',
      billDate: new Date(),
      dueDate: new Date(),
      currency: 'EUR',
      fxRate: 2,
      status: 'Posted',
      ...over,
    });
    // One matched bill, one with a price exception, and a voided bill that must be ignored.
    await prisma.finBill.createMany({
      data: [
        bill({
          number: 'SC-1',
          purchaseOrderId: po.id,
          total: 14,
          amountPaid: 14,
          matchStatus: 'Matched',
        }),
        bill({
          number: 'SC-2',
          purchaseOrderId: firstPo.id,
          total: 50,
          amountPaid: 10,
          matchStatus: 'Variance',
          matchDetail: { rows: [{ result: 'Price Exception' }] },
        }),
        bill({
          number: 'SC-3',
          purchaseOrderId: firstPo.id,
          total: 999,
          status: 'Voided',
          matchStatus: 'Variance',
        }),
      ],
    });

    const result = await analytics.analytics(businessId, { days: 90 });
    expect(result.kpis.matchExceptionRate).toMatchObject({
      value: 50,
      availability: 'available',
      billedPurchaseOrders: 2,
    });
    expect(result.exceptionTrend).toEqual([
      {
        month: new Date().toISOString().slice(0, 7),
        billedPurchaseOrders: 2,
        withException: 1,
        rate: 50,
      },
    ]);
    // Base currency = bill amount × Finance FX rate (2).
    expect(result.kpis.billedSpend).toEqual({
      bills: 2,
      billed: 128,
      paid: 48,
    });
  });
});
