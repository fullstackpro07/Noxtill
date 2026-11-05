import { Prisma, Role } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_ROLE,
  CLS_KEY_USER_ID,
} from '../common/tenancy/tenant.constants';
import { PoliciesService } from '../common/policies/policies.service';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';
import { SpecialistAgentToolGatewayService } from '../common/agents/specialist-agent-tool-gateway.service';
import { InventoryIntelligenceService } from '../inventory/inventory-intelligence.service';
import { StockTransfersService } from '../branches/stock-transfers.service';
import { InventoryService } from '../inventory/inventory.service';
import { ReorderSuggestionsService } from '../inventory/reorder-suggestions.service';
import { StockCountService } from '../inventory/stock-count.service';
import { PurchaseOrdersService } from '../inventory/purchase-orders.service';
import { ActionCenterService } from '../dashboard/action-center.service';
import { ProcurementService } from './procurement.service';
import { CommerceRfqsService } from '../commerce/commerce-rfqs.service';
import { SpecialistAgentActionsService } from '../specialist-agents/specialist-agent-actions.service';

class FakeClsService {
  values: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.values[key] as T;
  }
  set(key: string, value: unknown) {
    this.values[key] = value;
  }
}

describe('Inventory agent → canonical Procurement handoff (MySQL)', () => {
  const cls = new FakeClsService();
  let prisma: PrismaService;
  let procurement: ProcurementService;
  let inventory: InventoryIntelligenceService;
  let actionCenter: ActionCenterService;
  let sourcing: CommerceRfqsService;
  let specialistActions: SpecialistAgentActionsService;
  let purchaseOrders: PurchaseOrdersService;
  let businessId: string;
  let otherBusinessId: string;
  let userId: string;
  let productId: string;
  let productSku: string;
  let supplierId: string;
  const extraMovementIds: string[] = [];
  const testPurchaseOrderIds: string[] = [];
  const branchBusinessIds: string[] = [];
  const stockTransferIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const stamp = Date.now();
    productSku = `HANDOFF-${stamp}`;
    businessId = (
      await prisma.business.create({
        data: {
          name: 'Agent Handoff QA',
          slug: `agent-handoff-${stamp}`,
          currency: 'USD',
        },
      })
    ).id;
    otherBusinessId = (
      await prisma.business.create({
        data: {
          name: 'Other Agent Handoff QA',
          slug: `agent-handoff-other-${stamp}`,
        },
      })
    ).id;
    userId = (
      await prisma.user.create({
        data: {
          name: 'Agent Handoff Manager',
          email: `agent-handoff-${stamp}@example.test`,
          passwordHash: 'unused-test-password',
        },
      })
    ).id;
    await prisma.businessUser.create({
      data: { businessId, userId, role: Role.manager },
    });
    supplierId = (
      await prisma.supplier.create({
        data: { businessId, name: 'Agent Handoff Supplier' },
      })
    ).id;
    productId = (
      await prisma.product.create({
        data: {
          businessId,
          name: 'Agent Handoff Product',
          sku: productSku,
          stockQty: 5,
          lowStockThreshold: 10,
          costPrice: 9,
        },
      })
    ).id;
    await prisma.stockMovement.createMany({
      data: [
        { businessId, productId, kind: 'sale', qty: -60 },
        { businessId, productId, kind: 'purchase', qty: 5, supplierId },
      ],
    });
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, userId);
    cls.set(CLS_KEY_ROLE, Role.manager);
    const tenant = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const policies = new PoliciesService(
      prisma,
      cls as unknown as ClsService,
      new CapabilitiesService(prisma),
    );
    procurement = new ProcurementService(tenant, policies);
    actionCenter = new ActionCenterService(
      tenant,
      procurement,
      new StockTransfersService(prisma),
    );
    const activity = {
      record: jest.fn().mockResolvedValue(undefined),
    } as never;
    purchaseOrders = new PurchaseOrdersService(
      tenant,
      activity,
      {} as never,
      {} as never,
    );
    sourcing = new CommerceRfqsService(tenant, activity, policies);
    specialistActions = new SpecialistAgentActionsService(
      tenant,
      procurement,
      sourcing,
      {} as never,
      {} as never,
      new SpecialistAgentPolicyService(prisma, cls as unknown as ClsService),
    );
    inventory = new InventoryIntelligenceService(
      tenant,
      new ReorderSuggestionsService(tenant, policies, prisma),
      new InventoryService(tenant, activity),
      new StockCountService(tenant, activity),
      {
        createMessage: jest
          .fn()
          .mockResolvedValue({ content: [], inputTokens: 0, outputTokens: 0 }),
      } as never,
      cls as unknown as ClsService,
      new SpecialistAgentPolicyService(prisma, cls as unknown as ClsService),
      prisma,
      new StockTransfersService(prisma),
      new SpecialistAgentToolGatewayService(tenant),
    );
  });

  beforeEach(async () => {
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_ROLE, Role.manager);
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: {} },
    });
    await prisma.roleCapabilityOverride.deleteMany({ where: { businessId } });
    await prisma.product.update({
      where: { id: productId },
      data: { stockQty: 5, lowStockThreshold: 10, costPrice: 9 },
    });
    if (extraMovementIds.length)
      await prisma.stockMovement.deleteMany({
        where: { id: { in: extraMovementIds.splice(0) } },
      });
    if (testPurchaseOrderIds.length) {
      const orderIds = testPurchaseOrderIds.splice(0);
      await prisma.purchaseOrderItem.deleteMany({
        where: { purchaseOrderId: { in: orderIds } },
      });
      await prisma.purchaseOrder.deleteMany({
        where: { businessId, id: { in: orderIds } },
      });
    }
    await prisma.purchaseOrder.updateMany({
      where: {
        businessId,
        status: { in: ['sent', 'confirmed', 'partially_received'] },
      },
      data: { status: 'cancelled' },
    });
  });

  afterAll(async () => {
    const ids = [businessId, otherBusinessId, ...branchBusinessIds];
    if (stockTransferIds.length > 0) {
      await prisma.stockTransferItem.deleteMany({
        where: { transferId: { in: stockTransferIds } },
      });
      await prisma.stockTransfer.deleteMany({
        where: { id: { in: stockTransferIds } },
      });
    }
    const rfqs = await prisma.commerceRfq.findMany({
      where: { businessId: { in: ids } },
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
    await prisma.procurementRequest.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.purchaseOrderItem.deleteMany({
      where: { purchaseOrder: { businessId: { in: ids } } },
    });
    await prisma.purchaseOrder.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.specialistAgentRun.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.stockMovement.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.product.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.supplier.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.roleCapabilityOverride.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.actionItemState.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.auditLog.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.activityEvent.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.notification.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.aiInsight.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.healthScoreSnapshot.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.businessUser.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  async function recommendation() {
    const run = await inventory.run(businessId, userId);
    const row = run.recommendations.find((item) => {
      const details = item.details as Prisma.JsonObject;
      return (
        details.signalType === 'reorder' && details.productId === productId
      );
    });
    if (!row) throw new Error('Missing fixture reorder recommendation');
    return row;
  }

  it('hands off once, revalidates an edited proposal, approves it and creates one canonical shared RFQ without contacting suppliers', async () => {
    const source = await recommendation();
    const drafts = await Promise.all([
      procurement.createInventoryAgentRequest(userId, source.id),
      procurement.createInventoryAgentRequest(userId, source.id),
    ]);
    expect(drafts[0].id).toBe(drafts[1].id);
    expect(drafts[0]).toMatchObject({
      status: 'draft',
      currency: 'USD',
      supplier: { id: supplierId },
      totalEstimate: 297,
      items: [
        expect.objectContaining({
          productId,
          quantity: 33,
          estimatedUnitCost: 9,
        }),
      ],
      agentSource: {
        recommendationId: source.id,
        agentKey: 'inventory_intelligence',
      },
    });
    const actionBeforeEdit =
      await prisma.specialistAgentAction.findFirstOrThrow({
        where: {
          businessId,
          recommendationId: source.id,
          canonicalResourceType: 'ProcurementRequest',
          canonicalResourceId: drafts[0].id,
        },
      });
    expect(actionBeforeEdit).toMatchObject({
      agentKey: 'inventory_intelligence',
      moduleId: '13',
      actionType: 'inventory_reorder_request',
      state: 'proposed',
      expectedVersion: 1,
      requiredApproval: true,
      canonicalResourceId: drafts[0].id,
      correlationId: source.runId,
    });
    expect(actionBeforeEdit.proposedPayload).toMatchObject({
      requestId: drafts[0].id,
      items: [expect.objectContaining({ productId, quantity: 33 })],
    });
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          entityId: drafts[0].id,
          action: 'inventory_agent.purchase_request_prepared',
        },
      }),
    ).toBe(1);
    const revised = await procurement.updateDraftRequest(
      businessId,
      userId,
      drafts[0].id,
      {
        expectedVersion: 1,
        reason: 'Manager reviewed quantity and cost. '.repeat(15),
        currency: 'USD',
        supplierId,
        items: [
          {
            lineType: 'stock',
            productId,
            description: 'Reviewed stock request',
            quantity: 30,
            estimatedUnitCost: 10,
          },
        ],
      },
      true,
    );
    expect(revised.version).toBe(2);
    const revisedAction = await prisma.specialistAgentAction.findUniqueOrThrow({
      where: { id: actionBeforeEdit.id },
      include: { events: { orderBy: { sequence: 'asc' } } },
    });
    expect(revisedAction).toMatchObject({
      state: 'proposed',
      expectedVersion: 2,
      proposedPayload: {
        requestId: revised.id,
        items: [
          expect.objectContaining({ quantity: 30, estimatedUnitCost: 10 }),
        ],
      },
    });
    expect(revisedAction.events.map((event) => event.eventType)).toEqual([
      'created',
      'proposal_updated',
    ]);
    await procurement.submitRequest(businessId, userId, revised.id);
    expect(
      await prisma.specialistAgentAction.findUniqueOrThrow({
        where: { id: actionBeforeEdit.id },
        select: { state: true },
      }),
    ).toEqual({ state: 'approval_required' });
    const actions = await actionCenter.list(businessId, Role.manager, null, {
      type: 'procurement_request',
    });
    const action = actions.items.find(
      (item) => item.id === `procurement_request:${revised.id}`,
    );
    expect(action).toBeDefined();
    await actionCenter.approveProcurementRequestAction(
      businessId,
      userId,
      `procurement_request:${revised.id}`,
    );
    const approvedAction = await prisma.specialistAgentAction.findFirstOrThrow({
      where: {
        businessId,
        recommendationId: source.id,
        canonicalResourceType: 'ProcurementRequest',
        canonicalResourceId: revised.id,
      },
      select: { id: true, expectedVersion: true },
    });
    expect(approvedAction.expectedVersion).toBe(revised.version);
    const approved = await procurement.getRequest(businessId, revised.id);
    expect(
      await prisma.specialistAgentAction.findUniqueOrThrow({
        where: { id: actionBeforeEdit.id },
        select: { state: true, approvedByUserId: true },
      }),
    ).toEqual({ state: 'approved', approvedByUserId: userId });
    expect(
      approved.events.find((event) => event.type === 'approved')?.reason,
    ).toContain('Approved exact Inventory proposal');
    const sourced = await specialistActions.sourceRfq(
      businessId,
      userId,
      approvedAction.id,
      { expectedVersion: approvedAction.expectedVersion! },
    );
    expect(sourced).toMatchObject({
      actionId: approvedAction.id,
      state: 'verified',
      rfqStatus: 'draft',
      supplierContacted: false,
      purchaseOrderCreated: false,
    });
    const repeatedRfq = await specialistActions.sourceRfq(
      businessId,
      userId,
      approvedAction.id,
      { expectedVersion: approvedAction.expectedVersion! },
    );
    expect(repeatedRfq.canonicalOperationId).toBe(sourced.canonicalOperationId);
    expect(
      await prisma.commerceRfq.count({
        where: { sourceProcurementRequestId: revised.id },
      }),
    ).toBe(1);
    expect((await procurement.getRequest(businessId, revised.id)).status).toBe(
      'sourcing',
    );
    const storedRfq = await prisma.commerceRfq.findUniqueOrThrow({
      where: { id: sourced.canonicalOperationId },
      select: {
        status: true,
        sourceProcurementRequestId: true,
        purchaseOrderId: true,
        suppliers: { select: { status: true } },
      },
    });
    expect(storedRfq).toMatchObject({
      status: 'draft',
      sourceProcurementRequestId: revised.id,
    });
    expect(storedRfq.purchaseOrderId).toBeNull();
    expect(storedRfq.suppliers.map((supplier) => supplier.status)).toEqual([
      'pending_send',
    ]);
    expect(approved.reason).toBe(
      'Manager reviewed quantity and cost. '.repeat(15).trim(),
    );
    const verifiedAction = await prisma.specialistAgentAction.findUniqueOrThrow(
      {
        where: { id: approvedAction.id },
        include: { events: { orderBy: { sequence: 'asc' } } },
      },
    );
    expect(verifiedAction).toMatchObject({
      state: 'verified',
      canonicalOperationId: sourced.canonicalOperationId,
      actualResult: {
        rfqStatus: 'draft',
        supplierContacted: false,
        purchaseOrderCreated: false,
      },
      verificationResult: {
        exists: true,
        sourceProcurementRequestId: revised.id,
        rfqStatus: 'draft',
        supplierContacted: false,
        purchaseOrderCreated: false,
      },
    });
    expect(
      verifiedAction.events.map((event) => event.toState).slice(-5),
    ).toEqual([
      'execution_queued',
      'executing',
      'succeeded',
      'verification_pending',
      'verified',
    ]);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: productId } }))
        .stockQty,
    ).toBe(5);
  });

  it('records and verifies the full Inventory action lifecycle when Procurement creates a canonical purchase order', async () => {
    const source = await recommendation();
    const request = await procurement.createInventoryAgentRequest(
      userId,
      source.id,
    );
    const action = await prisma.specialistAgentAction.findFirstOrThrow({
      where: { businessId, recommendationId: source.id },
    });

    await procurement.submitRequest(businessId, userId, request.id);
    await procurement.decideRequest(businessId, userId, request.id, {
      decision: 'approve',
    });
    const converted = await procurement.convertRequestToPurchaseOrder(
      businessId,
      userId,
      request.id,
    );
    testPurchaseOrderIds.push(converted.purchaseOrder.id);

    const savedAction = await prisma.specialistAgentAction.findUniqueOrThrow({
      where: { id: action.id },
      include: {
        events: {
          orderBy: { sequence: 'asc' },
        },
      },
    });
    expect(savedAction.state).toBe('outcome_monitoring');
    expect(savedAction.executionAttemptCount).toBe(1);
    expect(savedAction.canonicalOperationId).toBe(converted.purchaseOrder.id);
    expect(savedAction.verificationResult).toMatchObject({
      verified: true,
      postcondition: 'canonical_purchase_order_linked',
      procurementRequestId: request.id,
      purchaseOrderId: converted.purchaseOrder.id,
    });
    expect(savedAction.events.map((event) => event.toState)).toEqual([
      'proposed',
      'approval_required',
      'approved',
      'execution_queued',
      'executing',
      'succeeded',
      'verification_pending',
      'verified',
      'outcome_monitoring',
    ]);
    expect(
      savedAction.events.every((event) => event.businessId === businessId),
    ).toBe(true);

    const outcome = (await inventory.listActionOutcomes(businessId)).find(
      (item) => item.recommendationId === source.id,
    );
    expect(outcome?.specialistAction).toMatchObject({
      id: action.id,
      state: 'outcome_monitoring',
      executionAttemptCount: 1,
      canonicalOperationId: converted.purchaseOrder.id,
    });
  });

  it('keeps the same action trace through the canonical shared RFQ award and verifies its draft purchase order', async () => {
    const source = await recommendation();
    const request = await procurement.createInventoryAgentRequest(
      userId,
      source.id,
    );
    await procurement.submitRequest(businessId, userId, request.id);
    await procurement.decideRequest(businessId, userId, request.id, {
      decision: 'approve',
    });
    const rfq = await sourcing.createFromProcurementRequest(
      businessId,
      userId,
      request.id,
    );
    const opened = await sourcing.open(businessId, userId, rfq.id, {
      expectedVersion: rfq.version,
    });
    const sent = await sourcing.confirmManualSupplierSend(
      businessId,
      userId,
      rfq.id,
      { expectedVersion: opened.version, supplierIds: [supplierId] },
    );
    const quoted = await sourcing.recordQuote(businessId, userId, rfq.id, {
      invitationId: sent.suppliers[0].id,
      expectedVersion: sent.version,
      currency: 'USD',
      freight: 0,
      duties: 0,
      items: [
        {
          rfqItemId: sent.items[0].id,
          quotedQty: sent.items[0].qty,
          minimumQty: 1,
          unitPrice: 9,
        },
      ],
    });
    const awarded = await sourcing.award(businessId, userId, rfq.id, {
      expectedVersion: quoted.version,
      quoteId: quoted.quotes[0].id,
      reason: 'Operator reviewed the recorded quote and approved the draft PO.',
    });
    const purchaseOrderId = awarded.purchaseOrderId;
    expect(purchaseOrderId).toBeTruthy();
    testPurchaseOrderIds.push(purchaseOrderId!);

    const savedAction = await prisma.specialistAgentAction.findFirstOrThrow({
      where: { businessId, recommendationId: source.id },
      include: { events: { orderBy: { sequence: 'asc' } } },
    });
    expect(savedAction).toMatchObject({
      state: 'outcome_monitoring',
      executionAttemptCount: 1,
      canonicalOperationId: purchaseOrderId,
      verificationResult: {
        verified: true,
        postcondition: 'canonical_purchase_order_linked',
        procurementRequestId: request.id,
        commerceRfqId: rfq.id,
        purchaseOrderId,
      },
    });
    expect(savedAction.events.map((event) => event.toState)).toEqual([
      'proposed',
      'approval_required',
      'approved',
      'execution_queued',
      'executing',
      'succeeded',
      'verification_pending',
      'verified',
      'outcome_monitoring',
    ]);
  });

  it('reports the canonical request, actual PO receipt and later stock snapshot without causal attribution', async () => {
    const uniqueProduct = await prisma.product.create({
      data: {
        businessId,
        name: 'Outcome evidence product',
        sku: `OUTCOME-${Date.now()}`,
        stockQty: 4,
        lowStockThreshold: 8,
        costPrice: 7,
      },
    });
    await prisma.stockMovement.createMany({
      data: [
        {
          businessId,
          productId: uniqueProduct.id,
          supplierId,
          kind: 'purchase',
          qty: 1,
          createdAt: new Date(Date.now() - 60 * 60 * 1000),
        },
        {
          businessId,
          productId: uniqueProduct.id,
          kind: 'sale',
          qty: -60,
        },
      ],
    });

    const run = await inventory.run(businessId, userId);
    const recommendation = run.recommendations.find((item) => {
      const details = item.details as Prisma.JsonObject;
      return (
        details.signalType === 'reorder' &&
        details.productId === uniqueProduct.id
      );
    });
    if (!recommendation)
      throw new Error('Expected the outcome fixture reorder recommendation');
    const details = recommendation.details as Prisma.JsonObject;
    const suggestedQty = Number(details.suggestedQty);
    expect(suggestedQty).toBeGreaterThan(2);

    const beforeHandoff = await inventory.listActionOutcomes(businessId);
    expect(
      beforeHandoff.find((item) => item.recommendationId === recommendation.id),
    ).toMatchObject({
      recommendedQuantity: suggestedQty,
      recommendationStatus: 'proposed',
      procurementRequest: null,
      purchaseOrder: null,
      recordedSalesComparison: {
        status: 'not_received',
        baseline: null,
        followUp: null,
      },
      product: { id: uniqueProduct.id, currentStock: 4, lowStockThreshold: 8 },
    });

    const request = await procurement.createInventoryAgentRequest(
      userId,
      recommendation.id,
    );
    await procurement.submitRequest(businessId, userId, request.id);
    await procurement.decideRequest(businessId, userId, request.id, {
      decision: 'approve',
    });
    const converted = await procurement.convertRequestToPurchaseOrder(
      businessId,
      userId,
      request.id,
    );
    testPurchaseOrderIds.push(converted.purchaseOrder.id);
    const order = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: converted.purchaseOrder.id },
      include: { items: true },
    });
    await prisma.purchaseOrder.update({
      where: { id: order.id },
      data: { status: 'confirmed', confirmedAt: new Date() },
    });
    await purchaseOrders.receive(businessId, order.id, {
      items: [{ itemId: order.items[0].id, qtyReceived: 2 }],
    });

    const partiallyReceived = (
      await inventory.listActionOutcomes(businessId)
    ).find((item) => item.recommendationId === recommendation.id);
    expect(partiallyReceived).toMatchObject({
      recommendationStatus: 'handed_off',
      recommendedQuantity: suggestedQty,
      procurementRequest: {
        id: request.id,
        status: 'converted',
        requestedQuantity: suggestedQty,
      },
      purchaseOrder: {
        id: order.id,
        status: 'partially_received',
        orderedQuantity: suggestedQty,
        receivedQuantity: 2,
      },
      product: { id: uniqueProduct.id, currentStock: 6, lowStockThreshold: 8 },
      recordedSalesComparison: {
        status: 'awaiting_receipt',
        baseline: null,
        followUp: null,
      },
    });
    expect(partiallyReceived?.measurementNote).toContain('not attributed');

    const receivedAt = new Date(Date.now() - 57 * 24 * 60 * 60 * 1000);
    await prisma.purchaseOrderItem.update({
      where: { id: order.items[0].id },
      data: { qtyReceived: suggestedQty },
    });
    await prisma.purchaseOrder.update({
      where: { id: order.id },
      data: { status: 'received', receivedAt },
    });
    await prisma.product.update({
      where: { id: uniqueProduct.id },
      data: { stockQty: 4 + suggestedQty },
    });
    const baselineSale = await prisma.stockMovement.create({
      data: {
        businessId,
        productId: uniqueProduct.id,
        kind: 'sale',
        qty: -80,
        createdAt: new Date(receivedAt.getTime() - 7 * 24 * 60 * 60 * 1000),
      },
    });
    extraMovementIds.push(baselineSale.id);
    const followUpSale = await prisma.stockMovement.create({
      data: {
        businessId,
        productId: uniqueProduct.id,
        kind: 'sale',
        qty: -56,
        createdAt: new Date(receivedAt.getTime() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    extraMovementIds.push(followUpSale.id);

    const measured = (await inventory.listActionOutcomes(businessId)).find(
      (item) => item.recommendationId === recommendation.id,
    );
    expect(measured?.recordedSalesComparison).toMatchObject({
      status: 'available',
      windowDays: 56,
      baseline: {
        recordedUnits: 80,
        activeWeeks: 1,
        totalWeeks: 8,
        recordedUnitsPerWeek: 10,
      },
      followUp: {
        recordedUnits: 56,
        activeWeeks: 1,
        totalWeeks: 8,
        recordedUnitsPerWeek: 7,
      },
    });
    expect(measured?.recordedSalesComparison.note).toContain(
      'not attributed to the recommendation',
    );
    expect(measured?.product?.currentStock).toBe(4 + suggestedQty);

    const advanced = await inventory.advancePendingActionOutcomes(
      businessId,
      new Date(receivedAt.getTime() + 56 * 24 * 60 * 60 * 1000 + 1),
    );
    expect(advanced).toMatchObject({ measured: 1 });
    const measuredAction = await prisma.specialistAgentAction.findFirstOrThrow({
      where: { businessId, recommendationId: recommendation.id },
      include: { events: { orderBy: { sequence: 'asc' } } },
    });
    expect(measuredAction.state).toBe('outcome_measured');
    expect(measuredAction.closedAt).toBeNull();
    expect(measuredAction.events.at(-1)).toMatchObject({
      fromState: 'outcome_monitoring',
      toState: 'outcome_measured',
      metadata: {
        source: 'Noxtill stock movements (kind=sale)',
        windowDays: 56,
        causalAttribution: false,
        baseline: { recordedUnits: 80, activeWeeks: 1, totalWeeks: 8 },
        followUp: { recordedUnits: 56, activeWeeks: 1, totalWeeks: 8 },
      },
    });
    const persistedOutcome = (
      await inventory.listActionOutcomes(businessId)
    ).find((item) => item.recommendationId === recommendation.id);
    expect(
      persistedOutcome?.specialistAction?.outcomeMeasurement,
    ).toMatchObject({
      result: 'measured',
      source: 'Noxtill stock movements (kind=sale)',
      windowDays: 56,
      causalAttribution: false,
      baseline: { recordedUnits: 80, activeWeeks: 1, totalWeeks: 8 },
      followUp: { recordedUnits: 56, activeWeeks: 1, totalWeeks: 8 },
    });
  });

  it('marks the action inconclusive when the elapsed sales windows contain no recorded sale weeks', async () => {
    const source = await recommendation();
    const request = await procurement.createInventoryAgentRequest(
      userId,
      source.id,
    );
    await procurement.submitRequest(businessId, userId, request.id);
    await procurement.decideRequest(businessId, userId, request.id, {
      decision: 'approve',
    });
    const converted = await procurement.convertRequestToPurchaseOrder(
      businessId,
      userId,
      request.id,
    );
    testPurchaseOrderIds.push(converted.purchaseOrder.id);
    const receivedAt = new Date(Date.now() - 57 * 24 * 60 * 60 * 1000);
    const order = await prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: converted.purchaseOrder.id },
      include: { items: true },
    });
    await Promise.all(
      order.items.map((item) =>
        prisma.purchaseOrderItem.update({
          where: { id: item.id },
          data: { qtyReceived: item.qtyOrdered },
        }),
      ),
    );
    await prisma.purchaseOrder.update({
      where: { id: converted.purchaseOrder.id },
      data: { status: 'received', receivedAt },
    });

    const advanced = await inventory.advancePendingActionOutcomes(businessId);
    expect(advanced.inconclusive).toBeGreaterThan(0);
    const action = await prisma.specialistAgentAction.findFirstOrThrow({
      where: { businessId, recommendationId: source.id },
      include: { events: { orderBy: { sequence: 'asc' } } },
    });
    expect(action.state).toBe('outcome_inconclusive');
    expect(action.closedAt).toBeNull();
    expect(action.events.at(-1)).toMatchObject({
      fromState: 'outcome_monitoring',
      toState: 'outcome_inconclusive',
      metadata: {
        causalAttribution: false,
        baseline: { activeWeeks: 0, totalWeeks: 8 },
        followUp: { activeWeeks: 0, totalWeeks: 8 },
      },
    });
    expect(action.events.at(-1)?.reason).toContain(
      'absent movements do not establish zero real-world demand',
    );
  });

  it('subtracts outstanding canonical purchase quantities and refuses a stale handoff', async () => {
    const openOrder = await prisma.purchaseOrder.create({
      data: {
        businessId,
        supplierId,
        status: 'confirmed',
        items: {
          create: {
            productId,
            qtyOrdered: 12,
            qtyReceived: 4,
            unitCost: 9,
          },
        },
      },
      include: { items: true },
    });
    testPurchaseOrderIds.push(openOrder.id);

    const firstRun = await inventory.run(businessId, userId);
    const firstRecommendation = firstRun.recommendations.find(
      (item) =>
        (item.details as Prisma.JsonObject).signalType === 'reorder' &&
        (item.details as Prisma.JsonObject).productId === productId,
    );
    expect(firstRecommendation?.details).toMatchObject({
      baseSuggestedQty: 33,
      incomingPurchaseQty: 8,
      suggestedQty: 25,
      coveredByIncoming: false,
    });
    expect(firstRecommendation?.evidence[0].calculation).toContain(
      'Displayed base reorder quantity = max(0, ceil(',
    );
    expect(firstRecommendation?.evidence[0].calculation).toContain(
      'Uncovered need = max(0, base quantity - unreceived quantities on eligible open purchase orders - approved/shipped inbound transfer quantities',
    );
    if (!firstRecommendation)
      throw new Error('Expected a net reorder recommendation');

    await prisma.purchaseOrderItem.update({
      where: { id: openOrder.items[0].id },
      data: { qtyReceived: 5 },
    });
    await expect(
      procurement.createInventoryAgentRequest(userId, firstRecommendation.id),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_ACTION_SOURCE_CHANGED' },
    });

    const refreshedRun = await inventory.run(businessId, userId);
    const refreshedRecommendation = refreshedRun.recommendations.find(
      (item) =>
        (item.details as Prisma.JsonObject).signalType === 'reorder' &&
        (item.details as Prisma.JsonObject).productId === productId,
    );
    if (!refreshedRecommendation)
      throw new Error('Expected a refreshed net reorder recommendation');
    const draft = await procurement.createInventoryAgentRequest(
      userId,
      refreshedRecommendation.id,
    );
    expect(draft.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productId, quantity: 26 }),
      ]),
    );

    await prisma.purchaseOrderItem.update({
      where: { id: openOrder.items[0].id },
      data: { qtyOrdered: 50 },
    });
    const coveredRun = await inventory.run(businessId, userId);
    const coveredRecommendation = coveredRun.recommendations.find(
      (item) =>
        (item.details as Prisma.JsonObject).signalType === 'reorder' &&
        (item.details as Prisma.JsonObject).productId === productId,
    );
    expect(coveredRecommendation?.details).toMatchObject({
      baseSuggestedQty: 33,
      incomingPurchaseQty: 45,
      suggestedQty: 0,
      coveredByIncoming: true,
    });
    if (!coveredRecommendation)
      throw new Error('Expected a covered reorder finding');
    await expect(
      procurement.createInventoryAgentRequest(userId, coveredRecommendation.id),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_ACTION_QUANTITY_INVALID' },
    });
  });

  it('refuses RFQ sourcing if stock or sales evidence changes after approval', async () => {
    const source = await recommendation();
    const draft = await procurement.createInventoryAgentRequest(
      userId,
      source.id,
    );
    await procurement.submitRequest(businessId, userId, draft.id);
    await procurement.decideRequest(businessId, userId, draft.id, {
      decision: 'approve',
    });
    const action = await prisma.specialistAgentAction.findFirstOrThrow({
      where: {
        businessId,
        canonicalResourceType: 'ProcurementRequest',
        canonicalResourceId: draft.id,
      },
      select: { id: true, expectedVersion: true },
    });
    extraMovementIds.push(
      (
        await prisma.stockMovement.create({
          data: { businessId, productId, kind: 'sale', qty: -1 },
        })
      ).id,
    );
    await prisma.product.update({
      where: { id: productId },
      data: { stockQty: 4 },
    });

    await expect(
      specialistActions.sourceRfq(businessId, userId, action.id, {
        expectedVersion: action.expectedVersion!,
      }),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_ACTION_SOURCE_CHANGED' },
    });
    expect(
      await prisma.specialistAgentAction.findUniqueOrThrow({
        where: { id: action.id },
        select: { state: true, errorCode: true },
      }),
    ).toEqual({
      state: 'failed',
      errorCode: 'SPECIALIST_ACTION_SOURCE_CHANGED',
    });
    expect((await procurement.getRequest(businessId, draft.id)).status).toBe(
      'approved',
    );
    expect(
      await prisma.commerceRfq.count({
        where: { sourceProcurementRequestId: draft.id },
      }),
    ).toBe(0);
  });

  it('refuses stale source data before preparing a canonical draft', async () => {
    const source = await recommendation();
    await prisma.product.update({
      where: { id: productId },
      data: { stockQty: 6 },
    });
    await expect(
      procurement.createInventoryAgentRequest(userId, source.id),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_ACTION_SOURCE_CHANGED' },
    });
    expect(
      await prisma.procurementRequest.count({
        where: { sourceAgentRecommendationId: source.id },
      }),
    ).toBe(0);
  });

  it('rechecks Inventory evidence before a sourced RFQ award can create a purchase order', async () => {
    const source = await recommendation();
    const request = await procurement.createInventoryAgentRequest(
      userId,
      source.id,
    );
    await procurement.submitRequest(businessId, userId, request.id);
    await procurement.decideRequest(businessId, userId, request.id, {
      decision: 'approve',
    });

    const rfq = await sourcing.createFromProcurementRequest(
      businessId,
      userId,
      request.id,
    );
    const opened = await sourcing.open(businessId, userId, rfq.id, {
      expectedVersion: rfq.version,
    });
    const supplierSent = await sourcing.confirmManualSupplierSend(
      businessId,
      userId,
      rfq.id,
      { expectedVersion: opened.version, supplierIds: [supplierId] },
    );
    const quoted = await sourcing.recordQuote(businessId, userId, rfq.id, {
      invitationId: supplierSent.suppliers[0].id,
      expectedVersion: supplierSent.version,
      currency: 'USD',
      freight: 0,
      duties: 0,
      items: [
        {
          rfqItemId: supplierSent.items[0].id,
          quotedQty: supplierSent.items[0].qty,
          minimumQty: 1,
          unitPrice: 9,
        },
      ],
    });

    extraMovementIds.push(
      (
        await prisma.stockMovement.create({
          data: { businessId, productId, kind: 'sale', qty: -1 },
        })
      ).id,
    );
    await prisma.product.update({
      where: { id: productId },
      data: { stockQty: 4 },
    });

    await expect(
      sourcing.award(businessId, userId, rfq.id, {
        expectedVersion: quoted.version,
        quoteId: quoted.quotes[0].id,
        reason: 'Award should stop because the reviewed inventory changed',
      }),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_ACTION_SOURCE_CHANGED' },
    });
    expect(await prisma.purchaseOrder.count({ where: { businessId } })).toBe(0);
    expect((await sourcing.getOne(businessId, rfq.id)).status).toBe('open');
    expect((await procurement.getRequest(businessId, request.id)).status).toBe(
      'sourcing',
    );
  });

  it('refuses approval after a new sale, but allows a reasoned rejection', async () => {
    const source = await recommendation();
    const draft = await procurement.createInventoryAgentRequest(
      userId,
      source.id,
    );
    await procurement.submitRequest(businessId, userId, draft.id);
    extraMovementIds.push(
      (
        await prisma.stockMovement.create({
          data: { businessId, productId, kind: 'sale', qty: -1 },
        })
      ).id,
    );
    await prisma.product.update({
      where: { id: productId },
      data: { stockQty: 4 },
    });
    await expect(
      procurement.decideRequest(businessId, userId, draft.id, {
        decision: 'approve',
      }),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_ACTION_SOURCE_CHANGED' },
    });
    expect((await procurement.getRequest(businessId, draft.id)).status).toBe(
      'submitted',
    );
    const rejected = await procurement.decideRequest(
      businessId,
      userId,
      draft.id,
      { decision: 'reject', reason: 'Source changed; rerun required' },
    );
    expect(rejected.status).toBe('rejected');
    const action = await prisma.specialistAgentAction.findFirstOrThrow({
      where: { businessId, canonicalResourceId: draft.id },
    });
    expect(action).toMatchObject({
      state: 'rejected',
      rejectionReason: 'Source changed; rerun required',
    });
    expect(action.closedAt).toBeInstanceOf(Date);
  });

  it('blocks an approved handoff when outstanding purchases change', async () => {
    const source = await recommendation();
    const draft = await procurement.createInventoryAgentRequest(
      userId,
      source.id,
    );
    await procurement.submitRequest(businessId, userId, draft.id);
    await procurement.decideRequest(businessId, userId, draft.id, {
      decision: 'approve',
    });
    await prisma.purchaseOrder.create({
      data: {
        businessId,
        supplierId,
        status: 'sent',
        items: { create: { productId, qtyOrdered: 5, unitCost: 9 } },
      },
    });
    await expect(
      procurement.convertRequestToPurchaseOrder(businessId, userId, draft.id),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_ACTION_SOURCE_CHANGED' },
    });
    expect(
      (await procurement.getRequest(businessId, draft.id))
        .convertedPurchaseOrder,
    ).toBeNull();
  });

  it('rechecks the kill switch and current role permissions on subsequent transitions', async () => {
    const source = await recommendation();
    const draft = await procurement.createInventoryAgentRequest(
      userId,
      source.id,
    );
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: { 'agents.inventoryEnabled': false } },
    });
    await expect(
      procurement.submitRequest(businessId, userId, draft.id),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_AGENT_DISABLED' },
    });
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: {} },
    });
    await procurement.submitRequest(businessId, userId, draft.id);
    await prisma.roleCapabilityOverride.create({
      data: {
        businessId,
        role: Role.manager,
        capabilities: [CAPABILITIES.PURCHASES_MANAGE],
      },
    });
    await expect(
      procurement.decideRequest(businessId, userId, draft.id, {
        decision: 'approve',
      }),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_ACTION_FORBIDDEN' },
    });
  });

  it('rejects expired or changed previews instead of silently approving them', async () => {
    const source = await recommendation();
    const draft = await procurement.createInventoryAgentRequest(
      userId,
      source.id,
    );
    await prisma.procurementRequestItem.update({
      where: { id: draft.items[0].id },
      data: { quantity: 99 },
    });
    await expect(
      procurement.submitRequest(businessId, userId, draft.id),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_ACTION_PREVIEW_CHANGED' },
    });
    await prisma.procurementRequestItem.update({
      where: { id: draft.items[0].id },
      data: { quantity: 33 },
    });
    const canonical = await prisma.procurementRequest.findUniqueOrThrow({
      where: { id: draft.id },
    });
    await prisma.procurementRequest.update({
      where: { id: draft.id },
      data: {
        agentContext: {
          ...(canonical.agentContext as Prisma.JsonObject),
          expiresAt: new Date(0).toISOString(),
        },
      },
    });
    await expect(
      procurement.submitRequest(businessId, userId, draft.id),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_ACTION_EXPIRED' },
    });
  });

  it('rounds the remaining stock need to configured packs and rejects a draft after pack rules change', async () => {
    const packProduct = await prisma.product.create({
      data: {
        businessId,
        name: 'Pack conversion handoff product',
        stockQty: 5,
        lowStockThreshold: 10,
        costPrice: 9,
        stockUnitLabel: 'bottle',
        purchaseUnitLabel: 'case',
        purchasePackSize: 12,
      },
    });
    const sale = await prisma.stockMovement.create({
      data: {
        businessId,
        productId: packProduct.id,
        kind: 'sale',
        qty: -60,
      },
    });
    const openOrder = await prisma.purchaseOrder.create({
      data: {
        businessId,
        supplierId,
        status: 'sent',
        sentAt: new Date(),
        items: {
          create: {
            productId: packProduct.id,
            qtyOrdered: 9,
            unitCost: 2,
          },
        },
      },
      include: { items: { select: { id: true } } },
    });
    let runId: string | null = null;
    let requestId: string | null = null;
    try {
      const run = await inventory.run(
        businessId,
        userId,
        'inventory-agent-pack-handoff-test',
        { includeAiSummary: false },
      );
      runId = run.id;
      const source = run.recommendations.find(
        (item) =>
          (item.details as Prisma.JsonObject).signalType === 'reorder' &&
          (item.details as Prisma.JsonObject).productId === packProduct.id,
      );
      if (!source) throw new Error('Pack-rounded recommendation was not saved');
      expect(source.details).toMatchObject({
        suggestedQty: 24,
        purchaseUnitConversion: {
          unitsPerPurchaseUnit: 12,
          suggestedPurchaseUnits: 2,
        },
      });

      const request = await procurement.createInventoryAgentRequest(
        userId,
        source.id,
      );
      requestId = request.id;
      expect(request.items[0].quantity).toBe(24);
      expect(request.agentSource).toMatchObject({
        stockUnitLabel: 'bottle',
        purchaseUnitLabel: 'case',
        purchasePackSize: 12,
        purchaseUnitCount: 2,
      });

      await prisma.product.update({
        where: { id: packProduct.id },
        data: { purchasePackSize: 6 },
      });
      await expect(
        procurement.submitRequest(businessId, userId, request.id),
      ).rejects.toMatchObject({
        response: { code: 'SPECIALIST_ACTION_SOURCE_CHANGED' },
      });
    } finally {
      if (requestId) {
        await prisma.procurementRequest.deleteMany({
          where: { id: requestId, businessId },
        });
      }
      if (runId) {
        await prisma.specialistAgentRun.deleteMany({
          where: { id: runId, businessId },
        });
      }
      await prisma.purchaseOrderItem.deleteMany({
        where: { id: { in: openOrder.items.map((item) => item.id) } },
      });
      await prisma.purchaseOrder.delete({ where: { id: openOrder.id } });
      await prisma.stockMovement.delete({ where: { id: sale.id } });
      await prisma.product.delete({ where: { id: packProduct.id } });
    }
  });

  it('rejects a prepared reorder draft after the product minimum changes, even when the draft quantity is unchanged', async () => {
    let runId: string | null = null;
    let requestId: string | null = null;
    try {
      const run = await inventory.run(
        businessId,
        userId,
        'inventory-agent-minimum-reorder-handoff-test',
        { includeAiSummary: false },
      );
      runId = run.id;
      const source = run.recommendations.find(
        (item) =>
          (item.details as Prisma.JsonObject).signalType === 'reorder' &&
          (item.details as Prisma.JsonObject).productId === productId,
      );
      if (!source) {
        throw new Error('Minimum-reorder recommendation was not saved');
      }
      const draft = await procurement.createInventoryAgentRequest(
        userId,
        source.id,
      );
      requestId = draft.id;
      expect(draft.items[0].quantity).toBe(33);

      await prisma.product.update({
        where: { id: productId },
        data: { minimumReorderQty: 25 },
      });
      await expect(
        procurement.submitRequest(businessId, userId, draft.id),
      ).rejects.toMatchObject({
        response: { code: 'SPECIALIST_ACTION_SOURCE_CHANGED' },
      });
    } finally {
      await prisma.product.update({
        where: { id: productId },
        data: { minimumReorderQty: null },
      });
      if (requestId) {
        await prisma.procurementRequest.deleteMany({
          where: { id: requestId, businessId },
        });
      }
      if (runId) {
        await prisma.specialistAgentRun.deleteMany({
          where: { id: runId, businessId },
        });
      }
    }
  });

  it('rejects a prepared reorder draft after a pending outbound branch transfer changes availability', async () => {
    let runId: string | null = null;
    let requestId: string | null = null;
    let branchId: string | null = null;
    let destinationProductId: string | null = null;
    let transferId: string | null = null;
    try {
      const run = await inventory.run(
        businessId,
        userId,
        'inventory-agent-transfer-handoff-test',
        { includeAiSummary: false },
      );
      runId = run.id;
      const source = run.recommendations.find(
        (item) =>
          (item.details as Prisma.JsonObject).signalType === 'reorder' &&
          (item.details as Prisma.JsonObject).productId === productId,
      );
      if (!source) {
        throw new Error('Transfer-aware reorder recommendation was not saved');
      }
      const draft = await procurement.createInventoryAgentRequest(
        userId,
        source.id,
      );
      requestId = draft.id;
      const branch = await prisma.business.create({
        data: {
          name: 'Agent Handoff Transfer Branch',
          slug: `agent-handoff-transfer-${Date.now()}`,
          parentId: businessId,
        },
      });
      branchId = branch.id;
      branchBusinessIds.push(branch.id);
      const destinationProduct = await prisma.product.create({
        data: {
          businessId: branch.id,
          name: 'Agent Handoff Transfer Destination',
          sku: productSku,
        },
      });
      destinationProductId = destinationProduct.id;
      const transfer = await prisma.stockTransfer.create({
        data: {
          sourceBusinessId: businessId,
          destBusinessId: branch.id,
          status: 'pending',
          items: { create: { sourceProductId: productId, qty: 1 } },
        },
      });
      transferId = transfer.id;
      stockTransferIds.push(transfer.id);

      await expect(
        procurement.submitRequest(businessId, userId, draft.id),
      ).rejects.toMatchObject({
        response: { code: 'SPECIALIST_ACTION_SOURCE_CHANGED' },
      });
    } finally {
      if (requestId) {
        await prisma.procurementRequest.deleteMany({
          where: { id: requestId, businessId },
        });
      }
      if (runId) {
        await prisma.specialistAgentRun.deleteMany({
          where: { id: runId, businessId },
        });
      }
      if (transferId) {
        await prisma.stockTransferItem.deleteMany({
          where: { transferId },
        });
        await prisma.stockTransfer.delete({ where: { id: transferId } });
        const index = stockTransferIds.indexOf(transferId);
        if (index >= 0) stockTransferIds.splice(index, 1);
      }
      if (destinationProductId) {
        await prisma.product.deleteMany({
          where: { id: destinationProductId },
        });
      }
      if (branchId) {
        await prisma.business.delete({ where: { id: branchId } });
        const index = branchBusinessIds.indexOf(branchId);
        if (index >= 0) branchBusinessIds.splice(index, 1);
      }
    }
  });

  it('does not expose guessed recommendation ids across tenants and verifies the handoff FK', async () => {
    const source = await recommendation();
    cls.set(CLS_KEY_BUSINESS_ID, otherBusinessId);
    await expect(
      procurement.createInventoryAgentRequest(userId, source.id),
    ).rejects.toMatchObject({
      response: { code: 'SPECIALIST_RECOMMENDATION_NOT_FOUND' },
    });
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const constraints = await prisma.$queryRaw<
      Array<{ referencedTable: string; deleteRule: string }>
    >`
      SELECT REFERENCED_TABLE_NAME AS referencedTable, DELETE_RULE AS deleteRule
      FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND CONSTRAINT_NAME = 'procurement_requests_source_agent_recommendation_id_fkey'
    `;
    expect(constraints).toEqual([
      {
        referencedTable: 'specialist_agent_recommendations',
        deleteRule: 'RESTRICT',
      },
    ]);
  });
});
