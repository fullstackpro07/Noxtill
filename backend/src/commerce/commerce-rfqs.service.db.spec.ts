import { ClsService } from 'nestjs-cls';
import {
  CommerceRfqStatus,
  CommerceRfqSupplierStatus,
  CommerceSupplierQuoteStatus,
  PurchaseOrderStatus,
} from '@prisma/client';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommerceRfqsService } from './commerce-rfqs.service';
import { ActivityService } from '../activity/activity.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('CommerceRfqsService (MySQL)', () => {
  let prisma: PrismaService;
  let service: CommerceRfqsService;
  let businessId: string;
  let foreignBusinessId: string;
  let productId: string;
  let supplierId: string;
  let foreignSupplierId: string;
  let cls: FakeClsService;
  let activityRecord: jest.MockedFunction<ActivityService['record']>;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    activityRecord = jest.fn().mockResolvedValue(undefined);
    service = new CommerceRfqsService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
      { record: activityRecord } as unknown as ActivityService,
    );
    const business = await prisma.business.create({
      data: {
        name: 'Commerce RFQ Test Biz',
        slug: 'commerce-rfq-test-' + Date.now(),
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const product = await prisma.product.create({
      data: {
        businessId,
        name: 'RFQ test product',
        sku: 'rfq-test-' + Date.now(),
        stockQty: 9,
      },
    });
    productId = product.id;
    const supplier = await prisma.supplier.create({
      data: { businessId, name: 'RFQ test supplier', phone: '+15550001000' },
    });
    supplierId = supplier.id;
    const foreignBusiness = await prisma.business.create({
      data: {
        name: 'Foreign Commerce RFQ Test Biz',
        slug: 'foreign-commerce-rfq-test-' + Date.now(),
      },
    });
    foreignBusinessId = foreignBusiness.id;
    const foreignSupplier = await prisma.supplier.create({
      data: {
        businessId: foreignBusinessId,
        name: 'Foreign RFQ supplier',
      },
    });
    foreignSupplierId = foreignSupplier.id;
  });

  afterEach(async () => {
    activityRecord.mockClear();
    const rfqs = await prisma.commerceRfq.findMany({
      where: { businessId },
      select: { id: true, purchaseOrderId: true },
    });
    const orderIds = rfqs.flatMap((rfq) =>
      rfq.purchaseOrderId ? [rfq.purchaseOrderId] : [],
    );
    const rfqIds = rfqs.map((rfq) => rfq.id);
    if (rfqIds.length) {
      await prisma.commerceSupplierQuoteItem.deleteMany({
        where: { quote: { rfqId: { in: rfqIds } } },
      });
      await prisma.commerceSupplierQuote.deleteMany({
        where: { rfqId: { in: rfqIds } },
      });
      await prisma.commerceRfqAudit.deleteMany({
        where: { rfqId: { in: rfqIds } },
      });
      await prisma.commerceRfqSupplier.deleteMany({
        where: { rfqId: { in: rfqIds } },
      });
      await prisma.commerceRfqItem.deleteMany({
        where: { rfqId: { in: rfqIds } },
      });
    }
    await prisma.commerceRfq.deleteMany({ where: { businessId } });
    if (orderIds.length) {
      await prisma.purchaseOrderItem.deleteMany({
        where: { purchaseOrderId: { in: orderIds } },
      });
      await prisma.purchaseOrder.deleteMany({
        where: { id: { in: orderIds }, businessId },
      });
    }
  });

  afterAll(async () => {
    await prisma.supplier.deleteMany({
      where: { businessId: foreignBusinessId },
    });
    await prisma.supplier.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: foreignBusinessId } });
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  async function createRfq(withCanonicalProduct = true) {
    return service.create(businessId, 'operator_1', {
      requirement: 'Source travel mugs from an approved supplier',
      currency: 'USD',
      market: 'US',
      destination: 'New York, US',
      terms: 'Quote freight and duties separately',
      items: [
        {
          productId: withCanonicalProduct ? productId : undefined,
          description: 'Insulated travel mug',
          qty: 4,
          minimumQty: 2,
          specifications: 'Stainless steel, 350 ml',
        },
      ],
      supplierIds: [supplierId],
    });
  }

  async function openAndQuote(
    rfq: Awaited<ReturnType<typeof createRfq>>,
    validUntil?: string,
  ) {
    let current = await service.open(businessId, 'operator_1', rfq.id, {
      expectedVersion: rfq.version,
    });
    current = await service.confirmManualSupplierSend(
      businessId,
      'operator_1',
      rfq.id,
      {
        expectedVersion: current.version,
        supplierIds: [supplierId],
      },
    );
    return service.recordQuote(businessId, 'operator_1', rfq.id, {
      invitationId: current.suppliers[0].id,
      expectedVersion: current.version,
      currency: 'USD',
      validUntil,
      paymentTerms: 'Net 30',
      freight: 12,
      duties: 3,
      leadTimeDays: 12,
      notes: 'Quote received by phone and entered by the operator',
      items: [
        {
          rfqItemId: current.items[0].id,
          quotedQty: 4,
          minimumQty: 2,
          unitPrice: 8.5,
        },
      ],
    });
  }

  it('records manually sourced quotes and awards to a draft canonical Purchase Order without changing stock', async () => {
    const rfq = await createRfq();
    expect(rfq.status).toBe(CommerceRfqStatus.draft);
    expect(rfq.suppliers[0].status).toBe(
      CommerceRfqSupplierStatus.pending_send,
    );

    const withQuote = await openAndQuote(rfq);
    expect(withQuote.quotes[0]).toMatchObject({
      status: CommerceSupplierQuoteStatus.submitted,
      currency: 'USD',
      landedTotal: 49,
    });

    const awarded = await service.award(businessId, 'operator_1', rfq.id, {
      expectedVersion: withQuote.version,
      quoteId: withQuote.quotes[0].id,
      reason: 'Best complete landed cost among current responses',
    });

    expect(awarded.status).toBe(CommerceRfqStatus.awarded);
    expect(awarded.purchaseOrder).toMatchObject({
      status: PurchaseOrderStatus.draft,
    });
    expect(awarded.quotes[0].status).toBe(CommerceSupplierQuoteStatus.awarded);
    const order = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: awarded.purchaseOrderId! },
      include: { items: true },
    });
    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({
      productId,
      qtyOrdered: 4,
      qtyReceived: 0,
    });
    expect(Number(order.items[0].unitCost)).toBe(8.5);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: productId } }))
        .stockQty,
    ).toBe(9);
    expect(await service.history(businessId, rfq.id)).toHaveLength(5);
    expect(activityRecord.mock.calls.map(([, event]) => event.type)).toEqual([
      'commerce_rfq_created',
      'commerce_rfq_response_received',
      'commerce_rfq_awarded',
    ]);
  });

  it('does not let an RFQ invite a supplier from another business', async () => {
    await expect(
      service.create(businessId, 'operator_1', {
        requirement: 'Try to source with a foreign supplier',
        currency: 'USD',
        items: [{ description: 'Unlinked sourcing item', qty: 1 }],
        supplierIds: [foreignSupplierId],
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_RFQ_SUPPLIER_NOT_FOUND' },
    });
    expect(await prisma.commerceRfq.count({ where: { businessId } })).toBe(0);
  });

  it('does not award expired quotes or create a purchase order', async () => {
    const rfq = await createRfq();
    const withExpiredQuote = await openAndQuote(
      rfq,
      '2020-01-01T00:00:00.000Z',
    );

    await expect(
      service.award(businessId, 'operator_1', rfq.id, {
        expectedVersion: withExpiredQuote.version,
        quoteId: withExpiredQuote.quotes[0].id,
        reason: 'Expired quote should not be accepted',
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_RFQ_EXPIRED_QUOTE' },
    });
    expect(await prisma.purchaseOrder.count({ where: { businessId } })).toBe(0);
  });

  it('closes open sourcing and withdraws unsent supplier invitations', async () => {
    const rfq = await createRfq();
    const opened = await service.open(businessId, 'operator_1', rfq.id, {
      expectedVersion: rfq.version,
    });
    const closed = await service.close(businessId, 'operator_1', rfq.id, {
      expectedVersion: opened.version,
      reason: 'Sourcing request is no longer needed',
    });

    expect(closed.status).toBe(CommerceRfqStatus.closed);
    expect(closed.suppliers[0].status).toBe(
      CommerceRfqSupplierStatus.withdrawn,
    );
    expect(await service.history(businessId, rfq.id)).toHaveLength(3);
    await expect(
      service.recordQuote(businessId, 'operator_1', rfq.id, {
        invitationId: closed.suppliers[0].id,
        expectedVersion: closed.version,
        currency: 'USD',
        freight: 0,
        duties: 0,
        items: [
          {
            rfqItemId: closed.items[0].id,
            quotedQty: 4,
            unitPrice: 8,
          },
        ],
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_RFQ_INVALID_STATE' },
    });
  });

  it('keeps supplier quantity breaks visible but blocks award when MOQ does not fit the request', async () => {
    const rfq = await createRfq();
    let current = await service.open(businessId, 'operator_1', rfq.id, {
      expectedVersion: rfq.version,
    });
    current = await service.confirmManualSupplierSend(
      businessId,
      'operator_1',
      rfq.id,
      { expectedVersion: current.version, supplierIds: [supplierId] },
    );
    const withQuote = await service.recordQuote(
      businessId,
      'operator_1',
      rfq.id,
      {
        invitationId: current.suppliers[0].id,
        expectedVersion: current.version,
        currency: 'USD',
        freight: 10,
        duties: 2,
        items: [
          {
            rfqItemId: current.items[0].id,
            quotedQty: 10,
            minimumQty: 10,
            unitPrice: 7.5,
          },
        ],
      },
    );

    expect(withQuote.quotes[0].items[0]).toMatchObject({
      quotedQty: 10,
      minimumQty: 10,
    });
    await expect(
      service.award(businessId, 'operator_1', rfq.id, {
        expectedVersion: withQuote.version,
        quoteId: withQuote.quotes[0].id,
        reason: 'MOQ is higher than the quantity requested',
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_RFQ_INVALID_QUOTE' },
    });
    expect(await prisma.purchaseOrder.count({ where: { businessId } })).toBe(0);
  });

  it('edits draft requirements and supplier selections with optimistic version checks', async () => {
    const rfq = await createRfq();
    const updated = await service.update(businessId, 'operator_1', rfq.id, {
      expectedVersion: rfq.version,
      requirement: 'Source six travel mugs',
      items: [
        {
          productId,
          description: 'Insulated travel mug',
          qty: 6,
          minimumQty: 2,
          specifications: 'Stainless steel, 350 ml',
        },
      ],
      supplierIds: [],
    });

    expect(updated.version).toBe(2);
    expect(updated.requirement).toBe('Source six travel mugs');
    expect(updated.items[0].qty).toBe(6);
    expect(updated.suppliers).toHaveLength(0);
    expect(await service.history(businessId, rfq.id)).toHaveLength(2);
    await expect(
      service.update(businessId, 'operator_1', rfq.id, {
        expectedVersion: 1,
        requirement: 'Stale edit',
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_RFQ_VERSION_CONFLICT' },
    });
  });

  it('revises an existing manual quote in place and preserves the negotiation audit trail', async () => {
    const rfq = await createRfq();
    const firstQuote = await openAndQuote(rfq);
    const invitation = firstQuote.suppliers[0];
    const revised = await service.recordQuote(
      businessId,
      'operator_1',
      rfq.id,
      {
        invitationId: invitation.id,
        expectedVersion: firstQuote.version,
        currency: 'USD',
        paymentTerms: 'Net 15',
        freight: 10,
        duties: 2,
        leadTimeDays: 10,
        notes: 'Revised manually after supplier negotiation',
        items: [
          {
            rfqItemId: firstQuote.items[0].id,
            quotedQty: 4,
            minimumQty: 2,
            unitPrice: 7.5,
          },
        ],
      },
    );

    expect(revised.quotes).toHaveLength(2);
    expect(revised.quotes[0]).toMatchObject({
      status: CommerceSupplierQuoteStatus.submitted,
      revisionNo: 2,
      landedTotal: 42,
      paymentTerms: 'Net 15',
    });
    expect(revised.quotes[1].status).toBe(
      CommerceSupplierQuoteStatus.superseded,
    );
    expect(await service.history(businessId, rfq.id)).toHaveLength(5);
    expect(
      await prisma.commerceRfqAudit.findFirstOrThrow({
        where: { businessId, rfqId: rfq.id, action: 'supplier_quote_revised' },
      }),
    ).toMatchObject({ actorUserId: 'operator_1' });
    await expect(
      service.award(businessId, 'operator_1', rfq.id, {
        expectedVersion: revised.version,
        quoteId: firstQuote.quotes[0].id,
        reason: 'The previous offer revision must not be awarded',
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_RFQ_INVALID_STATE' },
    });
  });

  it('requires canonical product links before award can hand off to Inventory Purchases', async () => {
    const rfq = await createRfq(false);
    const withQuote = await openAndQuote(rfq);

    await expect(
      service.award(businessId, 'operator_1', rfq.id, {
        expectedVersion: withQuote.version,
        quoteId: withQuote.quotes[0].id,
        reason: 'Product is not in the canonical catalog yet',
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_RFQ_PRODUCT_REQUIRED_FOR_AWARD' },
    });
    expect(await prisma.purchaseOrder.count({ where: { businessId } })).toBe(0);
  });
});
