import { ClsService } from 'nestjs-cls';
import { ProcurementRequestStatus, PurchaseOrderStatus } from '@prisma/client';
import { ActivityService } from '../activity/activity.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CommerceRfqsService } from '../commerce/commerce-rfqs.service';
import { PrismaService } from '../prisma/prisma.service';
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

describe('Procurement sourcing and receipt ledger (real MySQL)', () => {
  let prisma: PrismaService;
  let tenant: TenantPrismaService;
  let procurement: ProcurementService;
  let commerceRfqs: CommerceRfqsService;
  let businessId: string;
  let otherBusinessId: string;
  let userId: string;
  let supplierId: string;
  let productId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    businessId = (
      await prisma.business.create({
        data: {
          name: 'Procurement Operations Spec',
          slug: `proc-ops-${suffix}`,
          currency: 'USD',
        },
      })
    ).id;
    otherBusinessId = (
      await prisma.business.create({
        data: {
          name: 'Other Procurement Operations',
          slug: `proc-ops-other-${suffix}`,
        },
      })
    ).id;
    userId = (
      await prisma.user.create({
        data: {
          name: 'Procurement Operations Spec User',
          email: `proc-ops-${suffix}@example.test`,
          passwordHash: 'not-used-by-this-spec',
        },
      })
    ).id;
    supplierId = (
      await prisma.supplier.create({
        data: { businessId, name: 'Procurement Operations Supplier' },
      })
    ).id;
    productId = (
      await prisma.product.create({
        data: {
          businessId,
          name: 'Procurement Operations Product',
          sku: `PROC-OPS-${suffix}`,
          costPrice: 4,
          sellingPrice: 8,
        },
      })
    ).id;

    const cls = new FakeClsService();
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    tenant = new TenantPrismaService(prisma, cls as unknown as ClsService);
    procurement = new ProcurementService(tenant);
    commerceRfqs = new CommerceRfqsService(tenant, {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as ActivityService);
  });

  afterAll(async () => {
    if (!prisma) return;
    const ids = [businessId, otherBusinessId].filter(Boolean);
    const rfqs = await prisma.commerceRfq.findMany({
      where: { businessId: { in: ids } },
      select: { id: true },
    });
    const rfqIds = rfqs.map((rfq) => rfq.id);
    if (rfqIds.length) {
      await prisma.commerceRfqAudit.deleteMany({
        where: { rfqId: { in: rfqIds } },
      });
      await prisma.commerceRfqSupplier.deleteMany({
        where: { rfqId: { in: rfqIds } },
      });
      await prisma.commerceRfqItem.deleteMany({
        where: { rfqId: { in: rfqIds } },
      });
      await prisma.commerceRfq.deleteMany({ where: { id: { in: rfqIds } } });
    }
    await prisma.procurementRequestEvent.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.procurementRequestItem.deleteMany({
      where: { request: { businessId: { in: ids } } },
    });
    await prisma.procurementRequest.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.purchaseOrderItem.deleteMany({
      where: { purchaseOrder: { businessId: { in: ids } } },
    });
    await prisma.purchaseOrder.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.product.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.supplier.deleteMany({ where: { businessId: { in: ids } } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it('surfaces procurement requests and their canonical shared Commerce RFQ id', async () => {
    const request = await prisma.procurementRequest.create({
      data: {
        businessId,
        requesterUserId: userId,
        reason: 'QA procurement sourcing request',
        currency: 'USD',
        status: ProcurementRequestStatus.approved,
        supplierId,
        items: {
          create: [
            {
              productId,
              description: 'Procurement operations test product',
              quantity: 3,
              estimatedUnitCost: 4,
            },
          ],
        },
      },
    });

    const approvedQueue = await procurement.sourcing(businessId);
    expect(approvedQueue.requests).toContainEqual(
      expect.objectContaining({
        id: request.id,
        status: 'approved',
        sourcingSupported: true,
      }),
    );
    expect(approvedQueue.rfqs).toEqual([]);

    const rfq = await commerceRfqs.createFromProcurementRequest(
      businessId,
      userId,
      request.id,
    );
    const sourced = await procurement.sourcing(businessId);
    expect(sourced.requests).toContainEqual(
      expect.objectContaining({ id: request.id, status: 'sourcing' }),
    );
    const linkedRfq = sourced.rfqs.find((item) => item.id === rfq.id);
    expect(linkedRfq?.sourceProcurementRequestId).toBe(request.id);
    expect(linkedRfq?.sourceProcurementRequest?.id).toBe(request.id);
    expect(linkedRfq?.supplierCount).toBe(1);
    expect(
      (await procurement.overview(businessId)).metrics.openRfqs,
    ).toMatchObject({
      value: 1,
      availability: 'tracked',
    });
  });

  it('shows recorded PO and receipt quantities without inventing an invoice match', async () => {
    const po = await prisma.purchaseOrder.create({
      data: {
        businessId,
        supplierId,
        status: PurchaseOrderStatus.partially_received,
        items: {
          create: [{ productId, qtyOrdered: 5, qtyReceived: 2, unitCost: 4 }],
        },
      },
    });
    const otherSupplier = await prisma.supplier.create({
      data: { businessId: otherBusinessId, name: 'Other Tenant Supplier' },
    });
    const otherProduct = await prisma.product.create({
      data: {
        businessId: otherBusinessId,
        name: 'Other Tenant Product',
        costPrice: 1,
        sellingPrice: 2,
      },
    });
    await prisma.purchaseOrder.create({
      data: {
        businessId: otherBusinessId,
        supplierId: otherSupplier.id,
        status: PurchaseOrderStatus.sent,
        items: {
          create: [{ productId: otherProduct.id, qtyOrdered: 8, unitCost: 1 }],
        },
      },
    });

    const result = await procurement.threeWayMatch(businessId);
    expect(result.purchaseOrders).toHaveLength(1);
    expect(result.purchaseOrders[0]).toMatchObject({
      id: po.id,
      receiptStatus: 'partially_received',
      items: [{ qtyOrdered: 5, qtyReceived: 2, outstanding: 3, unitCost: 4 }],
    });
    expect(result.summary).toEqual({
      purchaseOrders: 1,
      awaitingReceipt: 1,
      fullyReceived: 0,
    });
    expect(result.invoiceAvailability).toBe('not_available');
    expect(result.invoiceDetail).toContain('Vendor bills are not recorded');
  });
});
