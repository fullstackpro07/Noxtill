import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { AppException } from '../common/filters/app.exception';
import { ProcurementService } from './procurement.service';
import { ActionCenterService } from '../dashboard/action-center.service';
import { ActionItemType, Role } from '@prisma/client';
import { CommerceRfqsService } from '../commerce/commerce-rfqs.service';
import { ActivityService } from '../activity/activity.service';

class FakeClsService {
  private values: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.values[key] as T;
  }

  set(key: string, value: unknown) {
    this.values[key] = value;
  }
}

describe('Procurement requests (real MySQL)', () => {
  let prisma: PrismaService;
  let service: ProcurementService;
  let commerceRfqs: CommerceRfqsService;
  let actionCenter: ActionCenterService;
  let businessId: string;
  let branchId: string;
  let otherBusinessId: string;
  let userId: string;
  let productId: string;
  let supplierId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const business = await prisma.business.create({
      data: { name: 'Procurement Request Spec', slug: `pr-req-${suffix}` },
    });
    businessId = business.id;
    const branch = await prisma.business.create({
      data: {
        name: 'Procurement Request Spec Branch',
        slug: `pr-req-branch-${suffix}`,
        parentId: businessId,
      },
    });
    branchId = branch.id;
    const otherBusiness = await prisma.business.create({
      data: {
        name: 'Other Procurement Request Tenant',
        slug: `other-pr-req-${suffix}`,
      },
    });
    otherBusinessId = otherBusiness.id;
    const user = await prisma.user.create({
      data: {
        name: 'Procurement Request Spec Owner',
        email: `procurement-request-${suffix}@example.test`,
        passwordHash: 'not-used-by-this-spec',
      },
    });
    userId = user.id;
    const product = await prisma.product.create({
      data: {
        businessId,
        name: 'Procurement Spec Product',
        category: 'Office supplies',
        costPrice: 9,
        sellingPrice: 20,
      },
    });
    productId = product.id;
    const supplier = await prisma.supplier.create({
      data: { businessId, name: 'Procurement Spec Supplier' },
    });
    supplierId = supplier.id;
    const cls = new FakeClsService();
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new ProcurementService(tenantPrisma);
    commerceRfqs = new CommerceRfqsService(tenantPrisma, {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as ActivityService);
    actionCenter = new ActionCenterService(tenantPrisma, service);
  });

  afterAll(async () => {
    const cleanupBusinessIds = [businessId, otherBusinessId].filter(Boolean);
    const rfqs = await prisma.commerceRfq.findMany({
      where: { businessId: { in: cleanupBusinessIds } },
      select: { id: true },
    });
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
      await prisma.commerceRfq.deleteMany({ where: { id: { in: rfqIds } } });
    }
    await prisma.procurementRequestEvent.deleteMany({
      where: { businessId: { in: cleanupBusinessIds } },
    });
    await prisma.procurementRequestItem.deleteMany({
      where: { request: { businessId: { in: cleanupBusinessIds } } },
    });
    await prisma.procurementRequest.deleteMany({
      where: { businessId: { in: cleanupBusinessIds } },
    });
    await prisma.purchaseOrderItem.deleteMany({
      where: { purchaseOrder: { businessId } },
    });
    await prisma.purchaseOrder.deleteMany({ where: { businessId } });
    await prisma.supplier.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: branchId } });
    await prisma.business.delete({ where: { id: otherBusinessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('records request, approval and conversion history without touching stock', async () => {
    const request = await service.createRequest(businessId, userId, {
      branchBusinessId: branchId,
      department: 'Operations',
      costCenter: 'OPS-01',
      neededBy: '2026-10-20T12:00:00.000Z',
      reason: 'Replace a worn-out stock item',
      urgency: 'high',
      budgetCode: 'OPS-SUPPLIES',
      currency: 'USD',
      supplierId,
      attachmentUrls: ['https://files.example.test/quote.pdf'],
      items: [
        {
          lineType: 'stock',
          productId,
          description: 'Spec product replenishment',
          category: 'Office supplies',
          quantity: 2,
          estimatedUnitCost: 12.5,
        },
      ],
    });
    expect(request.status).toBe('draft');
    expect(request.totalEstimate).toBe(25);
    expect(request.branch?.id).toBe(branchId);
    expect(request.events.map((event) => event.type)).toEqual(['created']);

    const submitted = await service.submitRequest(
      businessId,
      userId,
      request.id,
    );
    expect(submitted.status).toBe('submitted');

    const rejectedDecision = await service
      .decideRequest(businessId, userId, request.id, {
        decision: 'reject',
      })
      .catch((error: unknown) => error);
    expect(rejectedDecision).toBeInstanceOf(AppException);
    expect((rejectedDecision as AppException).getResponse()).toMatchObject({
      code: 'PROCUREMENT_REJECTION_REASON_REQUIRED',
    });

    const approved = await service.decideRequest(
      businessId,
      userId,
      request.id,
      {
        decision: 'approve',
        reason: 'Within approved operating needs',
      },
    );
    expect(approved.status).toBe('approved');
    const converted = await service.convertRequestToPurchaseOrder(
      businessId,
      userId,
      request.id,
    );
    expect(converted.request.status).toBe('converted');
    expect(converted.request.convertedPurchaseOrder?.id).toBe(
      converted.purchaseOrder.id,
    );
    expect(converted.purchaseOrder.status).toBe('draft');
    expect(converted.request.events.map((event) => event.type)).toEqual([
      'created',
      'submitted',
      'approved',
      'converted',
    ]);

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
      select: { stockQty: true },
    });
    expect(product.stockQty).toBe(0);

    const otherTenant = await prisma.procurementRequest.create({
      data: {
        businessId: otherBusinessId,
        requesterUserId: userId,
        reason: 'Other tenant request',
        currency: 'USD',
        items: {
          create: [
            {
              description: 'Other tenant line',
              quantity: 1,
              estimatedUnitCost: 1,
            },
          ],
        },
      },
    });
    const page = await service.listRequests(businessId, { limit: 20 });
    expect(page.items.map((item) => item.id)).toContain(request.id);
    expect(page.items.map((item) => item.id)).not.toContain(otherTenant.id);
    await prisma.procurementRequestItem.deleteMany({
      where: { requestId: otherTenant.id },
    });
    await prisma.procurementRequest.delete({ where: { id: otherTenant.id } });
  });

  it('surfaces submitted requests in Action Center and approves them there', async () => {
    const request = await service.createRequest(businessId, userId, {
      reason: 'Action Center approval flow check',
      urgency: 'normal',
      currency: 'USD',
      items: [
        {
          lineType: 'service',
          description: 'Independent equipment inspection',
          quantity: 1,
          estimatedUnitCost: 80,
        },
      ],
    });
    await service.submitRequest(businessId, userId, request.id);
    const requestToReject = await service.createRequest(businessId, userId, {
      reason: 'Action Center rejection flow check',
      urgency: 'normal',
      currency: 'USD',
      items: [
        {
          lineType: 'service',
          description: 'Optional advisory service',
          quantity: 1,
          estimatedUnitCost: 40,
        },
      ],
    });
    await service.submitRequest(businessId, userId, requestToReject.id);

    const pending = await actionCenter.list(businessId, Role.owner, null, {
      type: ActionItemType.procurement_request,
    });
    const action = pending.items.find(
      (item) => item.id === `procurement_request:${request.id}`,
    );
    expect(action).toBeDefined();
    expect(action!.title).toContain('Purchase request from');
    expect(action!.deepLink).toBe('/procurement/requests');
    expect(action!.reason).toContain('80.00 USD');

    const approved = await actionCenter.approveProcurementRequestAction(
      businessId,
      userId,
      action!.id,
    );
    expect(approved.status).toBe('approved');
    const rejectionAction = pending.items.find(
      (item) => item.id === `procurement_request:${requestToReject.id}`,
    );
    expect(rejectionAction).toBeDefined();
    const rejected = await actionCenter.rejectProcurementRequestAction(
      businessId,
      userId,
      rejectionAction!.id,
      'This is not in the approved operating budget',
    );
    expect(rejected.status).toBe('rejected');
    expect(rejected.decisionReason).toBe(
      'This is not in the approved operating budget',
    );
    const afterDecision = await actionCenter.list(
      businessId,
      Role.owner,
      null,
      { type: ActionItemType.procurement_request },
    );
    expect(afterDecision.items).toEqual([]);
  });

  it('hands an approved stock request to the shared RFQ flow and converts it only when a quote is awarded', async () => {
    const request = await service.createRequest(businessId, userId, {
      reason: 'Source an approved replenishment from suppliers',
      urgency: 'normal',
      currency: 'USD',
      supplierId,
      items: [
        {
          lineType: 'stock',
          productId,
          description: 'Procurement RFQ handoff product',
          quantity: 3,
          estimatedUnitCost: 11,
        },
      ],
    });
    await service.submitRequest(businessId, userId, request.id);
    await service.decideRequest(businessId, userId, request.id, {
      decision: 'approve',
      reason: 'Approved for competitive sourcing',
    });

    const firstRfq = await commerceRfqs.createFromProcurementRequest(
      businessId,
      userId,
      request.id,
    );
    const repeated = await commerceRfqs.createFromProcurementRequest(
      businessId,
      userId,
      request.id,
    );
    expect(repeated.id).toBe(firstRfq.id);
    expect(firstRfq.sourceProcurementRequestId).toBe(request.id);
    expect(firstRfq.items).toMatchObject([
      { productId, qty: 3, description: 'Procurement RFQ handoff product' },
    ]);
    expect((await service.getRequest(businessId, request.id)).status).toBe(
      'sourcing',
    );

    const cancelled = await commerceRfqs.cancel(
      businessId,
      userId,
      firstRfq.id,
      {
        expectedVersion: firstRfq.version,
        reason: 'Restart supplier outreach',
      },
    );
    expect(cancelled.status).toBe('cancelled');
    const approvedAgain = await service.getRequest(businessId, request.id);
    expect(approvedAgain.status).toBe('approved');
    expect(approvedAgain.events.map((event) => event.type)).toContain(
      'sourcing_closed',
    );

    const secondRfq = await commerceRfqs.createFromProcurementRequest(
      businessId,
      userId,
      request.id,
    );
    let open = await commerceRfqs.open(businessId, userId, secondRfq.id, {
      expectedVersion: secondRfq.version,
    });
    open = await commerceRfqs.confirmManualSupplierSend(
      businessId,
      userId,
      secondRfq.id,
      { expectedVersion: open.version, supplierIds: [supplierId] },
    );
    const quoted = await commerceRfqs.recordQuote(
      businessId,
      userId,
      secondRfq.id,
      {
        invitationId: open.suppliers[0].id,
        expectedVersion: open.version,
        currency: 'USD',
        freight: 4,
        duties: 0,
        items: open.items.map((item) => ({
          rfqItemId: item.id,
          quotedQty: item.qty,
          unitPrice: 10.5,
        })),
      },
    );
    const awarded = await commerceRfqs.award(businessId, userId, secondRfq.id, {
      quoteId: quoted.quotes[0].id,
      expectedVersion: quoted.version,
      reason: 'Lowest complete quote for the requested quantity',
    });
    const converted = await service.getRequest(businessId, request.id);
    expect(awarded.purchaseOrder?.status).toBe('draft');
    expect(converted.status).toBe('converted');
    expect(converted.convertedPurchaseOrder?.id).toBe(
      awarded.purchaseOrder?.id,
    );
    expect(converted.events.map((event) => event.type)).toEqual([
      'created',
      'submitted',
      'approved',
      'sourcing_started',
      'sourcing_closed',
      'sourcing_started',
      'converted',
    ]);
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
      select: { stockQty: true },
    });
    expect(product.stockQty).toBe(0);
  });

  it('refuses sourcing for non-stock lines and currencies that cannot become canonical purchase orders', async () => {
    const serviceRequest = await service.createRequest(businessId, userId, {
      reason: 'Request a service outside the stock RFQ handoff',
      urgency: 'normal',
      currency: 'USD',
      items: [
        {
          lineType: 'service',
          description: 'Equipment inspection service',
          quantity: 1,
          estimatedUnitCost: 80,
        },
      ],
    });
    await service.submitRequest(businessId, userId, serviceRequest.id);
    await service.decideRequest(businessId, userId, serviceRequest.id, {
      decision: 'approve',
      reason: 'Approved for the test',
    });
    const serviceError = await commerceRfqs
      .createFromProcurementRequest(businessId, userId, serviceRequest.id)
      .catch((error: unknown) => error);
    expect(serviceError).toBeInstanceOf(AppException);
    expect((serviceError as AppException).getResponse()).toMatchObject({
      code: 'PROCUREMENT_REQUEST_SOURCING_UNAVAILABLE',
    });
    expect(
      (await service.getRequest(businessId, serviceRequest.id)).status,
    ).toBe('approved');

    const currencyRequest = await service.createRequest(businessId, userId, {
      reason: 'Request in a currency without a PO conversion path',
      urgency: 'normal',
      currency: 'EUR',
      items: [
        {
          lineType: 'stock',
          productId,
          description: 'Currency mismatch stock line',
          quantity: 1,
          estimatedUnitCost: 10,
        },
      ],
    });
    await service.submitRequest(businessId, userId, currencyRequest.id);
    await service.decideRequest(businessId, userId, currencyRequest.id, {
      decision: 'approve',
      reason: 'Approved for the test',
    });
    const currencyError = await commerceRfqs
      .createFromProcurementRequest(businessId, userId, currencyRequest.id)
      .catch((error: unknown) => error);
    expect(currencyError).toBeInstanceOf(AppException);
    expect((currencyError as AppException).getResponse()).toMatchObject({
      code: 'PROCUREMENT_REQUEST_SOURCING_CURRENCY_MISMATCH',
    });
    expect(
      (await service.getRequest(businessId, currencyRequest.id)).status,
    ).toBe('approved');
    expect(
      await prisma.commerceRfq.count({
        where: {
          businessId,
          sourceProcurementRequestId: {
            in: [serviceRequest.id, currencyRequest.id],
          },
        },
      }),
    ).toBe(0);
  });

  it('supports versioned draft edits and audited withdrawal before approval', async () => {
    const draft = await service.createRequest(businessId, userId, {
      reason: 'Draft before edit',
      urgency: 'normal',
      currency: 'USD',
      items: [
        {
          lineType: 'service',
          description: 'Initial work',
          quantity: 1,
          estimatedUnitCost: 25,
        },
      ],
    });
    const editInput = {
      reason: 'Updated purchase need',
      urgency: 'high' as const,
      currency: 'USD',
      department: 'Facilities',
      items: [
        {
          lineType: 'service' as const,
          description: 'Revised inspection scope',
          quantity: 2,
          estimatedUnitCost: 30,
        },
      ],
      expectedVersion: draft.version,
    };
    const updated = await service.updateDraftRequest(
      businessId,
      userId,
      draft.id,
      editInput,
      false,
    );
    expect(updated).toMatchObject({
      status: 'draft',
      version: draft.version + 1,
      reason: 'Updated purchase need',
      department: 'Facilities',
      totalEstimate: 60,
    });
    expect(updated.items).toMatchObject([
      { description: 'Revised inspection scope', quantity: 2 },
    ]);
    expect(updated.events.map((event) => event.type)).toEqual([
      'created',
      'updated',
    ]);

    const staleEdit = await service
      .updateDraftRequest(businessId, userId, draft.id, editInput, false)
      .catch((error: unknown) => error);
    expect(staleEdit).toBeInstanceOf(AppException);
    expect((staleEdit as AppException).getStatus()).toBe(409);

    await service.submitRequest(businessId, userId, draft.id);
    const withdrawn = await service.withdrawRequest(
      businessId,
      userId,
      draft.id,
      false,
    );
    expect(withdrawn.status).toBe('cancelled');
    expect(withdrawn.events.map((event) => event.type)).toEqual([
      'created',
      'updated',
      'submitted',
      'cancelled',
    ]);
    expect(withdrawn.events.at(-1)?.reason).toBe('Withdrawn by requester.');
  });
});
