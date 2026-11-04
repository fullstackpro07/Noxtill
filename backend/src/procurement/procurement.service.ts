import { HttpStatus, Injectable } from '@nestjs/common';
import {
  CommerceRfqStatus,
  ProcurementRequestEventType,
  ProcurementRequestStatus,
  PurchaseOrderStatus,
  Prisma,
} from '@prisma/client';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import {
  PoliciesService,
  resolvePolicies,
} from '../common/policies/policies.service';
import {
  agentHandoffError,
  assertInventoryAgentRequestCurrent,
  assertInventoryHandoffEnabled,
  inventoryReorderSource,
  INVENTORY_HANDOFF_VALIDITY_MS,
  purchaseRequestPayloadHash,
  readInventoryHandoffContext,
  type AgentDataClient,
} from '../common/agents/inventory-reorder-handoff.util';
import {
  createSpecialistAgentAction,
  recordSpecialistAgentActionProposalRevision,
  specialistAgentActionIdempotencyHash,
  transitionSpecialistAgentAction,
  type SpecialistAgentActionState,
} from '../common/agents/specialist-agent-action.util';
import {
  CreateProcurementRequestDto,
  DecideProcurementRequestDto,
  ListProcurementRequestsDto,
  UpdateProcurementRequestDto,
} from './procurement.dto';

export const PROCUREMENT_ERROR_CODES = {
  REQUEST_NOT_FOUND: 'PROCUREMENT_REQUEST_NOT_FOUND',
  INVALID_TRANSITION: 'PROCUREMENT_REQUEST_INVALID_TRANSITION',
  INVALID_BRANCH: 'PROCUREMENT_REQUEST_INVALID_BRANCH',
  INVALID_SUPPLIER: 'PROCUREMENT_REQUEST_INVALID_SUPPLIER',
  INVALID_PRODUCT: 'PROCUREMENT_REQUEST_INVALID_PRODUCT',
  CONVERSION_UNAVAILABLE: 'PROCUREMENT_REQUEST_CONVERSION_UNAVAILABLE',
} as const;

const REQUEST_INCLUDE = {
  requester: { select: { id: true, name: true, email: true } },
  reviewer: { select: { id: true, name: true, email: true } },
  supplier: { select: { id: true, name: true } },
  branchBusiness: { select: { id: true, name: true } },
  convertedPurchaseOrder: { select: { id: true, status: true } },
  items: {
    include: {
      product: { select: { id: true, name: true, kind: true, category: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  sourceRfqs: {
    select: { id: true, status: true, updatedAt: true },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
  },
  events: {
    include: { actor: { select: { id: true, name: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.ProcurementRequestInclude;

const COMMITTED_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.sent,
  PurchaseOrderStatus.confirmed,
  PurchaseOrderStatus.partially_received,
];

@Injectable()
export class ProcurementService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly policies: PoliciesService,
  ) {}

  /** One canonical draft per recommendation. Approval remains in the existing Action Center. */
  async createInventoryAgentRequest(
    actorUserId: string,
    recommendationId: string,
  ) {
    const sourceRecommendation =
      await this.tenantPrisma.client.specialistAgentRecommendation.findFirst({
        where: { id: recommendationId, agentKey: 'inventory_intelligence' },
        select: { id: true, businessId: true },
      });
    if (!sourceRecommendation) {
      throw new AppException(
        'SPECIALIST_RECOMMENDATION_NOT_FOUND',
        'Inventory recommendation not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    const businessId = sourceRecommendation.businessId;
    const requestId = await this.tenantPrisma.client.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM specialist_agent_recommendations WHERE id = ${recommendationId} AND business_id = ${businessId} FOR UPDATE`;
        const business = await assertInventoryHandoffEnabled(
          tx,
          businessId,
          this.policies,
        );
        const existing = await tx.procurementRequest.findFirst({
          where: { businessId, sourceAgentRecommendationId: recommendationId },
          select: { id: true },
        });
        if (existing) return existing.id;
        const recommendation = await tx.specialistAgentRecommendation.findFirst(
          {
            where: {
              id: recommendationId,
              businessId,
              agentKey: 'inventory_intelligence',
            },
            include: {
              run: { select: { id: true, moduleId: true, status: true } },
              evidence: { select: { id: true } },
            },
          },
        );
        const details = recommendation?.details as
          Prisma.JsonObject | undefined;
        if (
          !recommendation ||
          recommendation.run.status !== 'completed' ||
          details?.signalType !== 'reorder' ||
          typeof details.productId !== 'string'
        ) {
          throw agentHandoffError(
            'SPECIALIST_ACTION_UNSUPPORTED',
            'Only a completed Inventory reorder recommendation can prepare a purchase request.',
          );
        }
        const expiresAt = new Date(
          recommendation.createdAt.getTime() + INVENTORY_HANDOFF_VALIDITY_MS,
        );
        if (expiresAt.getTime() <= Date.now())
          throw agentHandoffError(
            'SPECIALIST_ACTION_EXPIRED',
            'This recommendation has expired. Run Inventory analysis again.',
          );
        const source = await inventoryReorderSource(
          tx,
          businessId,
          details.productId,
          resolvePolicies(business).num('inventory.agentReorderLeadTimeDays') ??
            14,
        );
        if (
          details.currentStock !== source.product.stockQty ||
          details.lowStockThreshold !== source.product.lowStockThreshold ||
          details.velocityPerDay !== source.calculation.velocityPerDay ||
          details.suggestedQty !== source.calculation.suggestedQty ||
          details.minimumReorderQty !== source.product.minimumReorderQty ||
          details.baselineLeadTimeDays !== source.source.baselineLeadTimeDays
        ) {
          throw agentHandoffError(
            'SPECIALIST_ACTION_SOURCE_CHANGED',
            'Inventory changed since this recommendation. Run analysis again before preparing the request.',
          );
        }
        if (
          !Number.isInteger(source.calculation.suggestedQty) ||
          source.calculation.suggestedQty <= 0 ||
          source.calculation.suggestedQty > 999999999
        ) {
          throw agentHandoffError(
            'SPECIALIST_ACTION_QUANTITY_INVALID',
            'There is no supported positive reorder quantity for this product.',
          );
        }
        const draft = await this.createRequest(
          businessId,
          actorUserId,
          {
            reason: `${recommendation.title}. ${recommendation.summary} Unit cost is an estimate from the current product cost price. Review supplier, quantity, cost, lead time and purchase-unit constraints before approval.`,
            currency: business.currency,
            supplierId:
              typeof details.supplierId === 'string'
                ? details.supplierId
                : undefined,
            urgency: 'normal',
            items: [
              {
                lineType: 'stock',
                productId: source.product.id,
                description: source.product.name,
                category: source.product.category ?? undefined,
                quantity: source.calculation.suggestedQty,
                estimatedUnitCost: Number(source.product.costPrice),
              },
            ],
          },
          tx,
        );
        const canonical = await tx.procurementRequest.findFirstOrThrow({
          where: { id: draft.id, businessId },
          include: { items: true },
        });
        const context = {
          schemaVersion: 1,
          actionType: 'inventory_reorder_request',
          productId: source.product.id,
          sourceHash: source.sourceHash,
          payloadHash: purchaseRequestPayloadHash(canonical),
          preparedAt: new Date().toISOString(),
          expiresAt: expiresAt.toISOString(),
          source: source.source,
        } satisfies Prisma.InputJsonObject;
        await tx.procurementRequest.update({
          where: { id: canonical.id },
          data: {
            sourceAgentRecommendationId: recommendationId,
            agentContext: context,
          },
        });
        await tx.specialistAgentRecommendation.update({
          where: { id: recommendationId },
          data: { status: 'handed_off', approvalRequired: true },
        });
        const proposedPayload = {
          requestId: canonical.id,
          version: canonical.version,
          currency: canonical.currency,
          supplierId: canonical.supplierId,
          items: canonical.items.map((item) => ({
            productId: item.productId,
            lineType: item.lineType,
            description: item.description,
            quantity: Number(item.quantity),
            estimatedUnitCost: Number(item.estimatedUnitCost),
          })),
        } satisfies Prisma.InputJsonObject;
        await createSpecialistAgentAction(tx, {
          data: {
            businessId,
            runId: recommendation.runId,
            recommendationId: recommendation.id,
            agentKey: recommendation.agentKey,
            moduleId: recommendation.run.moduleId,
            branchBusinessId: canonical.branchBusinessId,
            actionType: 'inventory_reorder_request',
            canonicalResourceType: 'ProcurementRequest',
            canonicalResourceId: canonical.id,
            expectedVersion: canonical.version,
            expectedPostcondition: {
              requestStatus: 'converted',
              linkedResourceType: 'PurchaseOrder',
              linkedFromRequestId: canonical.id,
            },
            proposedPayload,
            reason: canonical.reason,
            evidenceRefs: recommendation.evidence.map((item) => ({
              evidenceId: item.id,
            })),
            assumptions: recommendation.assumptions as Prisma.InputJsonValue,
            confidenceValue: recommendation.confidenceValue,
            riskTier: recommendation.riskTier,
            policyResult: {
              approvalRequired: true,
              approvalSystem: 'canonical_procurement_request',
              inventoryAgentPolicy: 'rechecked_by_canonical_service',
            },
            permissionResult: {
              capability: 'PURCHASES_MANAGE',
              enforcedBy: 'ProcurementController',
            },
            requiredApproval: true,
            idempotencyKeyHash: specialistAgentActionIdempotencyHash({
              businessId,
              agentKey: recommendation.agentKey,
              actionType: 'inventory_reorder_request',
              recommendationId: recommendation.id,
            }),
            correlationId: recommendation.runId,
            state: 'proposed',
            createdByUserId: actorUserId,
          },
          actorUserId,
          reason:
            'Prepared as a draft in the canonical Procurement request flow.',
        });
        await tx.auditLog.create({
          data: {
            businessId,
            actorUserId,
            action: 'inventory_agent.purchase_request_prepared',
            entity: 'ProcurementRequest',
            entityId: canonical.id,
            after: {
              recommendationId,
              runId: recommendation.runId,
              payloadHash: context.payloadHash,
              sourceHash: source.sourceHash,
              status: 'draft',
            },
          },
        });
        return canonical.id;
      },
      { timeout: 15000 },
    );
    return this.getRequest(businessId, requestId);
  }

  async overview(businessId: string) {
    // PurchaseOrder is an older model that was not originally added to the tenant extension.
    // Keep the explicit business predicate here as defense in depth.
    const orders = await this.tenantPrisma.client.purchaseOrder.findMany({
      where: { businessId, status: { in: COMMITTED_STATUSES } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        supplier: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, category: true } },
          },
        },
      },
    });

    const totalCommitted = orders.reduce(
      (total, order) =>
        total +
        order.items.reduce(
          (sum, item) => sum + Number(item.unitCost) * item.qtyOrdered,
          0,
        ),
      0,
    );
    const pendingReceipts = orders.filter(
      (order) =>
        (order.status === PurchaseOrderStatus.confirmed ||
          order.status === PurchaseOrderStatus.partially_received) &&
        order.items.some((item) => item.qtyReceived < item.qtyOrdered),
    ).length;

    const bySupplier = new Map<
      string,
      { supplierId: string; supplierName: string; committedValue: number }
    >();
    const byCategory = new Map<string, number>();
    for (const order of orders) {
      const orderValue = order.items.reduce(
        (sum, item) => sum + Number(item.unitCost) * item.qtyOrdered,
        0,
      );
      const supplierEntry = bySupplier.get(order.supplier.id) ?? {
        supplierId: order.supplier.id,
        supplierName: order.supplier.name,
        committedValue: 0,
      };
      supplierEntry.committedValue += orderValue;
      bySupplier.set(order.supplier.id, supplierEntry);

      for (const item of order.items) {
        const category = item.product.category?.trim() || 'Uncategorized';
        byCategory.set(
          category,
          (byCategory.get(category) ?? 0) +
            Number(item.unitCost) * item.qtyOrdered,
        );
      }
    }

    const supplierCommitments = [...bySupplier.values()].sort(
      (a, b) => b.committedValue - a.committedValue,
    );
    const topSupplier = supplierCommitments[0] ?? null;
    const recentOrders = await this.tenantPrisma.client.purchaseOrder.findMany({
      where: { businessId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 8,
      include: { supplier: { select: { id: true, name: true } } },
    });

    const [
      business,
      openPurchaseOrderCount,
      openRequestCount,
      openRfqCount,
      pendingRequests,
    ] = await Promise.all([
      this.tenantPrisma.client.business.findUnique({
        where: { id: businessId },
        select: { currency: true },
      }),
      this.tenantPrisma.client.purchaseOrder.count({
        where: { businessId, status: { in: COMMITTED_STATUSES } },
      }),
      this.tenantPrisma.client.procurementRequest.count({
        where: {
          businessId,
          status: {
            in: [
              ProcurementRequestStatus.draft,
              ProcurementRequestStatus.submitted,
            ],
          },
        },
      }),
      this.tenantPrisma.client.commerceRfq.count({
        where: {
          businessId,
          sourceProcurementRequestId: { not: null },
          status: { in: [CommerceRfqStatus.draft, CommerceRfqStatus.open] },
        },
      }),
      this.tenantPrisma.client.procurementRequest.findMany({
        where: { businessId, status: ProcurementRequestStatus.submitted },
        select: {
          currency: true,
          items: { select: { quantity: true, estimatedUnitCost: true } },
        },
      }),
    ]);
    const pendingCurrencyIsConsolidated = pendingRequests.every(
      (request) => request.currency === business?.currency,
    );
    const pendingApprovalValue = pendingCurrencyIsConsolidated
      ? pendingRequests.reduce(
          (total, request) =>
            total +
            request.items.reduce(
              (requestTotal, item) =>
                requestTotal +
                Number(item.quantity) * Number(item.estimatedUnitCost),
              0,
            ),
          0,
        )
      : null;

    return {
      currency: business?.currency ?? null,
      metrics: {
        openRequests: {
          value: openRequestCount,
          availability: 'tracked' as const,
          detail:
            'Draft and submitted requests that have not been decided or cancelled.',
        },
        pendingApprovalValue: {
          value: pendingApprovalValue,
          availability:
            pendingApprovalValue === null
              ? ('partial' as const)
              : ('tracked' as const),
          detail:
            pendingApprovalValue === null
              ? 'Submitted requests use more than one currency; no consolidated amount is shown because FX conversion is not configured.'
              : `Submitted request estimates in ${business?.currency ?? 'the business currency'}.`,
        },
        openRfqs: {
          value: openRfqCount,
          availability: 'tracked' as const,
          detail:
            'Open RFQs linked to approved procurement requests in the shared Commerce sourcing engine.',
        },
        committedPoValue: {
          value: totalCommitted,
          availability: 'tracked' as const,
          detail: `${openPurchaseOrderCount} open purchase order(s)`,
        },
        receiptsPending: {
          value: pendingReceipts,
          availability: 'tracked' as const,
          detail:
            'Confirmed or partially received purchase orders with outstanding quantities.',
        },
        matchExceptions: {
          value: null,
          availability: 'not_available' as const,
          detail:
            'Canonical supplier invoices linked to purchase orders are not available, so 3-way match exceptions cannot be computed.',
        },
        spendVsBudget: {
          value: null,
          availability: 'not_available' as const,
          detail:
            'Finance expense budgets are not linked to purchase-order commitments.',
        },
        supplierConcentration: {
          value:
            topSupplier && totalCommitted > 0
              ? (topSupplier.committedValue / totalCommitted) * 100
              : null,
          availability: topSupplier
            ? ('tracked' as const)
            : ('partial' as const),
          detail: topSupplier
            ? `${topSupplier.supplierName} has the largest share of open PO commitments.`
            : 'No open PO commitments to compare.',
        },
      },
      openPurchaseOrderCount,
      supplierCommitments: supplierCommitments.slice(0, 5),
      topCategories: [...byCategory.entries()]
        .map(([category, committedValue]) => ({ category, committedValue }))
        .sort((a, b) => b.committedValue - a.committedValue)
        .slice(0, 5),
      recentPurchaseOrders: recentOrders.map((order) => ({
        id: order.id,
        reference: `PO-${order.id.slice(0, 8).toUpperCase()}`,
        supplier: order.supplier.name,
        status: order.status,
        createdAt: order.createdAt,
      })),
      dataCompleteness: {
        purchaseOrders: 'tracked',
        requests: 'tracked',
        procurementLinkedRfqs: 'tracked',
        genericCommerceRfqs: 'not_tracked',
        procurementBudgets: 'not_available',
        branchOnPurchaseOrders: 'not_tracked',
        perOrderCurrency: 'not_tracked',
        financeMatch: 'not_available',
      },
    };
  }

  /**
   * Procurement-linked RFQs are the same CommerceRfq rows used by Commerce. This view only
   * surfaces sourcing requests and RFQs whose source request is recorded; it does not create a
   * second RFQ record or send supplier communications.
   */
  async sourcing(businessId: string) {
    const [requests, rfqs, business] = await Promise.all([
      this.tenantPrisma.client.procurementRequest.findMany({
        where: {
          businessId,
          status: {
            in: [
              ProcurementRequestStatus.approved,
              ProcurementRequestStatus.sourcing,
            ],
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 100,
        select: {
          id: true,
          reason: true,
          status: true,
          urgency: true,
          currency: true,
          neededBy: true,
          updatedAt: true,
          supplier: { select: { id: true, name: true } },
          items: {
            select: {
              id: true,
              description: true,
              lineType: true,
              quantity: true,
              productId: true,
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          },
          sourceRfqs: {
            select: { id: true, status: true, updatedAt: true },
            orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          },
        },
      }),
      this.tenantPrisma.client.commerceRfq.findMany({
        where: { businessId, sourceProcurementRequestId: { not: null } },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 100,
        select: {
          id: true,
          requirement: true,
          status: true,
          currency: true,
          dueAt: true,
          updatedAt: true,
          sourceProcurementRequestId: true,
          sourceProcurementRequest: {
            select: { id: true, reason: true, status: true },
          },
          items: { select: { id: true } },
          suppliers: {
            select: { supplierId: true, status: true, respondedAt: true },
          },
          quotes: { select: { id: true, status: true } },
          awardedQuoteId: true,
          purchaseOrderId: true,
        },
      }),
      this.tenantPrisma.client.business.findUnique({
        where: { id: businessId },
        select: { currency: true },
      }),
    ]);

    return {
      requests: requests.map((request) => ({
        ...request,
        items: request.items.map((item) => ({
          ...item,
          quantity: Number(item.quantity),
        })),
        sourcingSupported:
          request.items.length > 0 &&
          request.currency.toUpperCase() ===
            (business?.currency ?? '').toUpperCase() &&
          request.items.every(
            (item) =>
              item.lineType === 'stock' &&
              Boolean(item.productId) &&
              Number.isInteger(Number(item.quantity)),
          ),
      })),
      rfqs: rfqs.map((rfq) => ({
        ...rfq,
        supplierCount: rfq.suppliers.length,
        supplierResponses: rfq.suppliers.filter((supplier) =>
          Boolean(supplier.respondedAt),
        ).length,
        quoteCount: rfq.quotes.length,
      })),
      supplierOutreach: 'manual',
      listLimit: 100,
    };
  }

  /**
   * The recorded PO and goods-receipt quantities are available here. Vendor bills are not
   * recorded in this product, so no three-way match verdict or exception count is inferred.
   */
  async threeWayMatch(businessId: string) {
    const purchaseOrders =
      await this.tenantPrisma.client.purchaseOrder.findMany({
        where: {
          businessId,
          status: { not: PurchaseOrderStatus.cancelled },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 100,
        select: {
          id: true,
          status: true,
          createdAt: true,
          receivedAt: true,
          supplier: { select: { id: true, name: true } },
          items: {
            select: {
              id: true,
              qtyOrdered: true,
              qtyReceived: true,
              unitCost: true,
              product: { select: { id: true, name: true, sku: true } },
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          },
        },
      });

    const orders = purchaseOrders.map((order) => {
      const receivedLines = order.items.filter(
        (item) => item.qtyReceived >= item.qtyOrdered,
      ).length;
      const partiallyReceivedLines = order.items.filter(
        (item) => item.qtyReceived > 0 && item.qtyReceived < item.qtyOrdered,
      ).length;
      const receiptStatus =
        order.items.length > 0 && receivedLines === order.items.length
          ? 'received'
          : receivedLines > 0 || partiallyReceivedLines > 0
            ? 'partially_received'
            : 'not_received';

      return {
        id: order.id,
        reference: `PO-${order.id.slice(0, 8).toUpperCase()}`,
        status: order.status,
        createdAt: order.createdAt,
        receivedAt: order.receivedAt,
        supplier: order.supplier,
        receiptStatus,
        items: order.items.map((item) => ({
          id: item.id,
          product: item.product,
          qtyOrdered: item.qtyOrdered,
          qtyReceived: item.qtyReceived,
          outstanding: Math.max(0, item.qtyOrdered - item.qtyReceived),
          unitCost: Number(item.unitCost),
        })),
      };
    });

    return {
      purchaseOrders: orders,
      summary: {
        purchaseOrders: orders.length,
        awaitingReceipt: orders.filter(
          (order) =>
            (order.status === PurchaseOrderStatus.confirmed ||
              order.status === PurchaseOrderStatus.partially_received) &&
            order.receiptStatus !== 'received',
        ).length,
        fullyReceived: orders.filter(
          (order) => order.receiptStatus === 'received',
        ).length,
      },
      listLimit: 100,
      invoiceAvailability: 'not_available' as const,
      invoiceDetail:
        'Vendor bills are not recorded in this workspace, so invoice comparison and 3-way match results are not available.',
    };
  }

  async listRequests(businessId: string, query: ListProcurementRequestsDto) {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const records = await this.tenantPrisma.client.procurementRequest.findMany({
      where: { businessId, status: query.status },
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: REQUEST_INCLUDE,
    });
    const hasMore = records.length > limit;
    const page = hasMore ? records.slice(0, limit) : records;
    return {
      items: page.map((request) => this.serializeRequest(request)),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }

  async createRequest(
    businessId: string,
    actorUserId: string,
    dto: CreateProcurementRequestDto,
    client: AgentDataClient = this.tenantPrisma.client,
  ) {
    const business = await client.business.findUnique({
      where: { id: businessId },
      select: { currency: true },
    });
    if (!business) {
      throw new AppException(
        PROCUREMENT_ERROR_CODES.REQUEST_NOT_FOUND,
        'Business was not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    await this.validateRequestReferences(businessId, dto, client);

    const request = await client.procurementRequest.create({
      data: {
        businessId,
        requesterUserId: actorUserId,
        branchBusinessId: dto.branchBusinessId,
        department: dto.department,
        costCenter: dto.costCenter,
        neededBy: dto.neededBy ? new Date(dto.neededBy) : undefined,
        reason: dto.reason.trim(),
        urgency: dto.urgency ?? 'normal',
        budgetCode: dto.budgetCode,
        currency: dto.currency,
        supplierId: dto.supplierId,
        attachmentUrls: (dto.attachmentUrls ?? []) as Prisma.InputJsonValue,
        items: {
          create: dto.items.map((item) => ({
            lineType: item.lineType ?? 'stock',
            productId: item.productId,
            description: item.description.trim(),
            category: item.category,
            quantity: item.quantity,
            estimatedUnitCost: item.estimatedUnitCost,
          })),
        },
        events: {
          create: {
            businessId,
            actorUserId,
            eventType: ProcurementRequestEventType.created,
            toStatus: ProcurementRequestStatus.draft,
            version: 1,
          },
        },
      },
      include: REQUEST_INCLUDE,
    });
    return this.serializeRequest(request);
  }

  async updateDraftRequest(
    businessId: string,
    actorUserId: string,
    id: string,
    dto: UpdateProcurementRequestDto,
    canManageAll: boolean,
  ) {
    const request = await this.findRequest(businessId, id);
    if (request.status !== ProcurementRequestStatus.draft) {
      throw this.invalidTransition('Only a draft request can be edited.');
    }
    if (request.requesterUserId !== actorUserId && !canManageAll) {
      throw new AppException(
        'PROCUREMENT_REQUEST_FORBIDDEN',
        'Only the requester or a procurement manager can edit this draft.',
        HttpStatus.FORBIDDEN,
      );
    }
    if (request.version !== dto.expectedVersion) {
      throw this.invalidTransition(
        'This draft changed since it was opened. Refresh it before saving.',
      );
    }
    await this.validateRequestReferences(businessId, dto);

    await this.tenantPrisma.client.$transaction(async (tx) => {
      const agentContext = await assertInventoryAgentRequestCurrent(
        tx,
        request,
        this.policies,
      );
      if (
        agentContext &&
        (dto.items.length !== 1 ||
          dto.items[0].productId !== agentContext.productId ||
          (dto.items[0].lineType ?? 'stock') !== 'stock' ||
          !Number.isInteger(dto.items[0].quantity))
      ) {
        throw agentHandoffError(
          'SPECIALIST_ACTION_SCOPE_CHANGED',
          'An agent reorder draft must keep its original product and whole-unit quantity. Create a normal request for other needs.',
        );
      }
      const updated = await tx.procurementRequest.updateMany({
        where: {
          id,
          businessId,
          status: ProcurementRequestStatus.draft,
          version: dto.expectedVersion,
        },
        data: {
          branchBusinessId: dto.branchBusinessId ?? null,
          department: dto.department ?? null,
          costCenter: dto.costCenter ?? null,
          neededBy: dto.neededBy ? new Date(dto.neededBy) : null,
          reason: dto.reason.trim(),
          urgency: dto.urgency ?? 'normal',
          budgetCode: dto.budgetCode ?? null,
          currency: dto.currency,
          supplierId: dto.supplierId ?? null,
          attachmentUrls: (dto.attachmentUrls ?? []) as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw this.invalidTransition(
          'This draft changed before it could be saved. Refresh it and try again.',
        );
      }

      await tx.procurementRequestItem.deleteMany({ where: { requestId: id } });
      await tx.procurementRequestItem.createMany({
        data: dto.items.map((item) => ({
          requestId: id,
          lineType: item.lineType ?? 'stock',
          productId: item.productId ?? null,
          description: item.description.trim(),
          category: item.category ?? null,
          quantity: item.quantity,
          estimatedUnitCost: item.estimatedUnitCost,
        })),
      });
      if (agentContext) {
        const revised = await tx.procurementRequest.findFirstOrThrow({
          where: { id, businessId },
          include: { items: true },
        });
        await tx.procurementRequest.update({
          where: { id },
          data: {
            agentContext: {
              ...agentContext,
              payloadHash: purchaseRequestPayloadHash(revised),
            },
          },
        });
        const action = await tx.specialistAgentAction.findFirst({
          where: {
            businessId,
            recommendationId: request.sourceAgentRecommendationId!,
            canonicalResourceType: 'ProcurementRequest',
            canonicalResourceId: id,
          },
          select: { id: true },
        });
        if (!action) {
          throw new AppException(
            'SPECIALIST_ACTION_NOT_FOUND',
            'The Inventory action record is missing for this purchase request.',
            HttpStatus.CONFLICT,
          );
        }
        await recordSpecialistAgentActionProposalRevision(tx, {
          businessId,
          actionId: action.id,
          actorUserId,
          expectedVersion: revised.version,
          proposedPayload: {
            requestId: revised.id,
            version: revised.version,
            currency: revised.currency,
            supplierId: revised.supplierId,
            items: revised.items.map((item) => ({
              productId: item.productId,
              lineType: item.lineType,
              description: item.description,
              quantity: Number(item.quantity),
              estimatedUnitCost: Number(item.estimatedUnitCost),
            })),
          },
          reason:
            'The canonical Procurement draft was revised before submission.',
        });
      }
      await tx.procurementRequestEvent.create({
        data: {
          businessId,
          requestId: id,
          actorUserId,
          eventType: ProcurementRequestEventType.updated,
          fromStatus: ProcurementRequestStatus.draft,
          toStatus: ProcurementRequestStatus.draft,
          version: dto.expectedVersion + 1,
          reason: 'Draft details updated.',
        },
      });
    });
    return this.getRequest(businessId, id);
  }

  async withdrawRequest(
    businessId: string,
    actorUserId: string,
    id: string,
    canManageAll: boolean,
    reason?: string,
    expectedVersion?: number,
  ) {
    const request = await this.findRequest(businessId, id);
    if (expectedVersion !== undefined && request.version !== expectedVersion) {
      throw new AppException(
        'PROCUREMENT_REQUEST_VERSION_CONFLICT',
        'This request changed after it was reviewed. Refresh the request before withdrawing it.',
        HttpStatus.CONFLICT,
      );
    }
    if (request.status !== ProcurementRequestStatus.submitted) {
      throw this.invalidTransition(
        'Only a submitted request awaiting approval can be withdrawn.',
      );
    }
    if (request.requesterUserId !== actorUserId && !canManageAll) {
      throw new AppException(
        'PROCUREMENT_REQUEST_FORBIDDEN',
        'Only the requester or a procurement manager can withdraw this request.',
        HttpStatus.FORBIDDEN,
      );
    }

    await this.tenantPrisma.client.$transaction(async (tx) => {
      const updated = await tx.procurementRequest.updateMany({
        where: {
          id,
          businessId,
          status: ProcurementRequestStatus.submitted,
          version: request.version,
        },
        data: {
          status: ProcurementRequestStatus.cancelled,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw this.invalidTransition(
          'This request changed before it could be withdrawn.',
        );
      }
      await tx.procurementRequestEvent.create({
        data: {
          businessId,
          requestId: id,
          actorUserId,
          eventType: ProcurementRequestEventType.cancelled,
          fromStatus: ProcurementRequestStatus.submitted,
          toStatus: ProcurementRequestStatus.cancelled,
          version: request.version + 1,
          reason:
            reason?.trim() ||
            (request.requesterUserId === actorUserId
              ? 'Withdrawn by requester.'
              : 'Withdrawn by a procurement manager.'),
        },
      });
      await this.transitionLinkedAgentAction(
        tx,
        businessId,
        request,
        'approval_required',
        'cancelled',
        actorUserId,
        reason?.trim() ||
          (request.requesterUserId === actorUserId
            ? 'Withdrawn by requester.'
            : 'Withdrawn by a procurement manager.'),
        { closedAt: new Date() },
      );
    });
    return this.getRequest(businessId, id);
  }

  private async validateRequestReferences(
    businessId: string,
    dto: CreateProcurementRequestDto,
    client: AgentDataClient = this.tenantPrisma.client,
  ) {
    if (dto.branchBusinessId) {
      const branch = await client.business.findUnique({
        where: { id: dto.branchBusinessId },
        select: { id: true, parentId: true, active: true },
      });
      if (
        !branch?.active ||
        (branch.id !== businessId && branch.parentId !== businessId)
      ) {
        throw new AppException(
          PROCUREMENT_ERROR_CODES.INVALID_BRANCH,
          'Choose this business or one of its active branches.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    if (dto.supplierId) {
      const supplier = await client.supplier.findFirst({
        where: { id: dto.supplierId, businessId },
        select: { id: true },
      });
      if (!supplier) {
        throw new AppException(
          PROCUREMENT_ERROR_CODES.INVALID_SUPPLIER,
          'Choose a supplier belonging to this business.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const productIds = [
      ...new Set(
        dto.items.flatMap((item) => (item.productId ? [item.productId] : [])),
      ),
    ];
    if (productIds.length) {
      const products = await client.product.findMany({
        where: { businessId, id: { in: productIds } },
        select: { id: true },
      });
      if (products.length !== productIds.length) {
        throw new AppException(
          PROCUREMENT_ERROR_CODES.INVALID_PRODUCT,
          'One or more linked products do not belong to this business.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
  }

  async submitRequest(businessId: string, actorUserId: string, id: string) {
    const request = await this.findRequest(businessId, id);
    if (request.status !== ProcurementRequestStatus.draft) {
      throw this.invalidTransition('Only a draft request can be submitted.');
    }

    await this.tenantPrisma.client.$transaction(async (tx) => {
      await assertInventoryAgentRequestCurrent(tx, request, this.policies);
      const updated = await tx.procurementRequest.updateMany({
        where: {
          id,
          businessId,
          status: ProcurementRequestStatus.draft,
          version: request.version,
        },
        data: {
          status: ProcurementRequestStatus.submitted,
          submittedAt: new Date(),
        },
      });
      if (updated.count !== 1) {
        throw this.invalidTransition(
          'This request changed before it could be submitted.',
        );
      }
      await tx.procurementRequestEvent.create({
        data: {
          businessId,
          requestId: id,
          actorUserId,
          eventType: ProcurementRequestEventType.submitted,
          fromStatus: ProcurementRequestStatus.draft,
          toStatus: ProcurementRequestStatus.submitted,
          version: request.version,
        },
      });
      await this.transitionLinkedAgentAction(
        tx,
        businessId,
        request,
        'proposed',
        'approval_required',
        actorUserId,
        'Submitted through the canonical Procurement approval flow.',
      );
    });
    return this.getRequest(businessId, id);
  }

  async decideRequest(
    businessId: string,
    actorUserId: string,
    id: string,
    dto: DecideProcurementRequestDto,
  ) {
    const request = await this.findRequest(businessId, id);
    if (
      dto.expectedVersion !== undefined &&
      request.version !== dto.expectedVersion
    ) {
      throw new AppException(
        'PROCUREMENT_REQUEST_VERSION_CONFLICT',
        'This request changed after it was reviewed. Refresh the request before deciding it.',
        HttpStatus.CONFLICT,
      );
    }
    if (request.status !== ProcurementRequestStatus.submitted) {
      throw this.invalidTransition(
        'Only a submitted request can be approved or rejected.',
      );
    }
    const reason = dto.reason?.trim() || undefined;
    if (dto.decision === 'reject' && !reason) {
      throw new AppException(
        'PROCUREMENT_REJECTION_REASON_REQUIRED',
        'A reason is required when rejecting a purchase request.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const status =
      dto.decision === 'approve'
        ? ProcurementRequestStatus.approved
        : ProcurementRequestStatus.rejected;

    await this.tenantPrisma.client.$transaction(async (tx) => {
      const agentContext =
        dto.decision === 'approve'
          ? await assertInventoryAgentRequestCurrent(tx, request, this.policies)
          : null;
      const updated = await tx.procurementRequest.updateMany({
        where: {
          id,
          businessId,
          status: ProcurementRequestStatus.submitted,
          version: dto.expectedVersion ?? request.version,
        },
        data: {
          status,
          reviewedAt: new Date(),
          reviewedByUserId: actorUserId,
          decisionReason: reason,
        },
      });
      if (updated.count !== 1) {
        throw this.invalidTransition('This request was already decided.');
      }
      await tx.procurementRequestEvent.create({
        data: {
          businessId,
          requestId: id,
          actorUserId,
          eventType:
            dto.decision === 'approve'
              ? ProcurementRequestEventType.approved
              : ProcurementRequestEventType.rejected,
          fromStatus: ProcurementRequestStatus.submitted,
          toStatus: status,
          version: request.version,
          reason:
            reason ??
            (agentContext
              ? `Approved exact Inventory proposal ${agentContext.payloadHash}; source ${agentContext.sourceHash}.`
              : undefined),
        },
      });
      await this.transitionLinkedAgentAction(
        tx,
        businessId,
        request,
        'approval_required',
        dto.decision === 'approve' ? 'approved' : 'rejected',
        actorUserId,
        reason ??
          (dto.decision === 'approve'
            ? 'Approved through the canonical Procurement approval flow.'
            : undefined),
        dto.decision === 'approve'
          ? {
              approvedByUserId: actorUserId,
              approvedAt: new Date(),
              approvalReason:
                reason ??
                'Approved through the canonical Procurement approval flow.',
            }
          : {
              rejectionReason: reason,
              closedAt: new Date(),
            },
      );
    });
    return this.getRequest(businessId, id);
  }

  async convertRequestToPurchaseOrder(
    businessId: string,
    actorUserId: string,
    id: string,
    expectedVersion?: number,
  ) {
    const request = await this.findRequest(businessId, id);
    if (expectedVersion !== undefined && request.version !== expectedVersion) {
      throw new AppException(
        'PROCUREMENT_REQUEST_VERSION_CONFLICT',
        'This request changed after approval. Refresh it before creating a purchase order.',
        HttpStatus.CONFLICT,
      );
    }
    if (request.status !== ProcurementRequestStatus.approved) {
      throw this.invalidTransition(
        'Only an approved request can be converted to a purchase order.',
      );
    }
    if (!request.supplierId) {
      throw new AppException(
        PROCUREMENT_ERROR_CODES.CONVERSION_UNAVAILABLE,
        'Select a supplier on the request before converting it.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      request.items.length === 0 ||
      request.items.some(
        (item) =>
          item.lineType !== 'stock' ||
          !item.productId ||
          !Number.isInteger(Number(item.quantity)),
      )
    ) {
      throw new AppException(
        PROCUREMENT_ERROR_CODES.CONVERSION_UNAVAILABLE,
        'Only stock requests with linked products and whole-unit quantities can be converted to an inventory purchase order.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const business = await this.tenantPrisma.client.business.findUnique({
      where: { id: businessId },
      select: { currency: true },
    });
    if (business?.currency !== request.currency) {
      throw new AppException(
        PROCUREMENT_ERROR_CODES.CONVERSION_UNAVAILABLE,
        `Request currency ${request.currency} differs from this business's purchase-order currency ${business?.currency ?? 'not configured'}. No currency conversion is configured.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const purchaseOrder = await this.tenantPrisma.client.$transaction(
      async (tx) => {
        await assertInventoryAgentRequestCurrent(tx, request, this.policies);
        await this.transitionLinkedAgentAction(
          tx,
          businessId,
          request,
          'approved',
          'execution_queued',
          actorUserId,
          'Canonical Procurement conversion was requested after approval.',
        );
        const claimed = await tx.procurementRequest.updateMany({
          where: {
            id,
            businessId,
            status: ProcurementRequestStatus.approved,
            version: expectedVersion ?? request.version,
            convertedPurchaseOrderId: null,
          },
          data: { status: ProcurementRequestStatus.converted },
        });
        if (claimed.count !== 1) {
          throw this.invalidTransition(
            'This request has already been converted or changed.',
          );
        }
        const po = await tx.purchaseOrder.create({
          data: {
            businessId,
            supplierId: request.supplierId!,
            createdByUserId: actorUserId,
            // The PO note is VARCHAR(191); keep the full rationale on its linked request.
            note: `Converted from approved request ${request.id}. Full rationale and evidence are saved on the request.`,
            items: {
              create: request.items.map((item) => ({
                productId: item.productId!,
                qtyOrdered: Number(item.quantity),
                unitCost: Number(item.estimatedUnitCost),
              })),
            },
          },
        });
        await tx.procurementRequest.update({
          where: { id },
          data: { convertedPurchaseOrderId: po.id },
        });
        await tx.procurementRequestEvent.create({
          data: {
            businessId,
            requestId: id,
            actorUserId,
            eventType: ProcurementRequestEventType.converted,
            fromStatus: ProcurementRequestStatus.approved,
            toStatus: ProcurementRequestStatus.converted,
            version: request.version,
            reason: `Created purchase order ${po.id}`,
          },
        });

        await this.transitionLinkedAgentAction(
          tx,
          businessId,
          request,
          'execution_queued',
          'executing',
          actorUserId,
          'The canonical Procurement service is creating the purchase order.',
          {
            executedByUserId: actorUserId,
            executedAt: new Date(),
            executionAttemptCount: { increment: 1 },
            canonicalOperationId: po.id,
          },
        );
        await this.transitionLinkedAgentAction(
          tx,
          businessId,
          request,
          'executing',
          'succeeded',
          actorUserId,
          'The canonical Procurement service created a purchase order.',
          {
            actualResult: {
              procurementRequestId: request.id,
              purchaseOrderId: po.id,
              purchaseOrderStatus: po.status,
            },
          },
        );
        await this.transitionLinkedAgentAction(
          tx,
          businessId,
          request,
          'succeeded',
          'verification_pending',
          actorUserId,
          'Re-reading the canonical purchase order to verify the action postcondition.',
        );
        const verifiedPurchaseOrder = await tx.purchaseOrder.findFirst({
          where: { id: po.id, businessId },
          select: { id: true, status: true, createdAt: true },
        });
        if (!verifiedPurchaseOrder) {
          throw new AppException(
            'SPECIALIST_ACTION_VERIFICATION_FAILED',
            'The purchase order was not found after canonical creation.',
            HttpStatus.CONFLICT,
          );
        }
        await this.transitionLinkedAgentAction(
          tx,
          businessId,
          request,
          'verification_pending',
          'verified',
          actorUserId,
          'The canonical Procurement request links to the purchase order confirmed by a fresh read.',
          {
            verifiedAt: new Date(),
            verificationResult: {
              verified: true,
              postcondition: 'canonical_purchase_order_linked',
              procurementRequestId: request.id,
              purchaseOrderId: verifiedPurchaseOrder.id,
              observedStatus: verifiedPurchaseOrder.status,
              observedAt: new Date().toISOString(),
            },
          },
        );
        await this.transitionLinkedAgentAction(
          tx,
          businessId,
          request,
          'verified',
          'outcome_monitoring',
          actorUserId,
          'The canonical purchase order is linked. The Inventory Agent will measure recorded sales only after full receipt and the follow-up window.',
        );
        return po;
      },
    );
    return {
      request: await this.getRequest(businessId, id),
      purchaseOrder: {
        id: purchaseOrder.id,
        status: purchaseOrder.status,
        href: '/inventory/purchases',
      },
    };
  }

  async getRequest(businessId: string, id: string) {
    const request = await this.tenantPrisma.client.procurementRequest.findFirst(
      {
        where: { id, businessId },
        include: REQUEST_INCLUDE,
      },
    );
    if (!request) throw this.requestNotFound();
    return this.serializeRequest(request);
  }

  private async findRequest(businessId: string, id: string) {
    const request = await this.tenantPrisma.client.procurementRequest.findFirst(
      {
        where: { id, businessId },
        include: REQUEST_INCLUDE,
      },
    );
    if (!request) throw this.requestNotFound();
    return request;
  }

  private serializeRequest(
    request: Prisma.ProcurementRequestGetPayload<{
      include: typeof REQUEST_INCLUDE;
    }>,
  ) {
    const items = request.items.map((item) => ({
      id: item.id,
      lineType: item.lineType,
      productId: item.productId,
      productName: item.product?.name ?? null,
      description: item.description,
      category: item.category,
      quantity: Number(item.quantity),
      estimatedUnitCost: Number(item.estimatedUnitCost),
      estimatedLineTotal:
        Number(item.quantity) * Number(item.estimatedUnitCost),
    }));
    return {
      id: request.id,
      businessId: request.businessId,
      requester: request.requester,
      branch: request.branchBusiness,
      department: request.department,
      costCenter: request.costCenter,
      neededBy: request.neededBy,
      reason: request.reason,
      urgency: request.urgency,
      budgetCode: request.budgetCode,
      currency: request.currency,
      status: request.status,
      version: request.version,
      submittedAt: request.submittedAt,
      reviewedAt: request.reviewedAt,
      reviewer: request.reviewer,
      decisionReason: request.decisionReason,
      supplier: request.supplier,
      attachmentUrls: Array.isArray(request.attachmentUrls)
        ? request.attachmentUrls
        : [],
      convertedPurchaseOrder: request.convertedPurchaseOrder,
      sourceRfqs: request.sourceRfqs,
      agentSource: request.sourceAgentRecommendationId
        ? (() => {
            const context = readInventoryHandoffContext(request.agentContext);
            return {
              recommendationId: request.sourceAgentRecommendationId,
              agentKey: 'inventory_intelligence',
              expiresAt: context.expiresAt,
              preparedAt: context.preparedAt,
              productId: context.productId,
              stockUnitLabel:
                typeof context.source.stockUnitLabel === 'string'
                  ? context.source.stockUnitLabel
                  : null,
              purchaseUnitLabel:
                typeof context.source.purchaseUnitLabel === 'string'
                  ? context.source.purchaseUnitLabel
                  : null,
              purchasePackSize:
                typeof context.source.purchasePackSize === 'number'
                  ? context.source.purchasePackSize
                  : null,
              purchaseUnitCount:
                typeof context.source.purchaseUnitCount === 'number'
                  ? context.source.purchaseUnitCount
                  : null,
            };
          })()
        : null,
      totalEstimate: items.reduce(
        (sum, item) => sum + item.estimatedLineTotal,
        0,
      ),
      items,
      events: request.events.map((event) => ({
        id: event.id,
        type: event.eventType,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        version: event.version,
        reason: event.reason,
        actor: event.actor,
        createdAt: event.createdAt,
      })),
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    };
  }

  private requestNotFound() {
    return new AppException(
      PROCUREMENT_ERROR_CODES.REQUEST_NOT_FOUND,
      'Purchase request was not found.',
      HttpStatus.NOT_FOUND,
    );
  }

  private invalidTransition(message: string) {
    return new AppException(
      PROCUREMENT_ERROR_CODES.INVALID_TRANSITION,
      message,
      HttpStatus.CONFLICT,
    );
  }

  private async transitionLinkedAgentAction(
    tx: AgentDataClient,
    businessId: string,
    request: { id: string; sourceAgentRecommendationId: string | null },
    fromState: SpecialistAgentActionState,
    toState: SpecialistAgentActionState,
    actorUserId: string,
    reason?: string,
    update?: Prisma.SpecialistAgentActionUpdateManyMutationInput,
  ) {
    if (!request.sourceAgentRecommendationId) return;
    const action = await tx.specialistAgentAction.findFirst({
      where: {
        businessId,
        recommendationId: request.sourceAgentRecommendationId,
        canonicalResourceType: 'ProcurementRequest',
        canonicalResourceId: request.id,
      },
      select: { id: true },
    });
    if (!action) {
      throw new AppException(
        'SPECIALIST_ACTION_NOT_FOUND',
        'The Inventory action record is missing for this purchase request.',
        HttpStatus.CONFLICT,
      );
    }
    await transitionSpecialistAgentAction(tx, {
      businessId,
      actionId: action.id,
      fromState,
      toState,
      actorUserId,
      reason,
      update,
    });
  }
}
