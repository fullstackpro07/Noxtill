import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ProcurementRequestEventType,
  ProcurementRequestStatus,
  PurchaseOrderStatus,
  Prisma,
} from '@prisma/client';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
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
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

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
          value: null,
          availability: 'not_tracked' as const,
          detail:
            'Generic procurement RFQs are not tracked. Commerce sourcing RFQs are separate.',
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
          availability: 'not_tracked' as const,
          detail: 'Procurement 3-way matching is not available yet.',
        },
        spendVsBudget: {
          value: null,
          availability: 'not_available' as const,
          detail: 'No procurement budget source is configured.',
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
        genericRfqs: 'not_tracked',
        procurementBudgets: 'not_available',
        branchOnPurchaseOrders: 'not_tracked',
        perOrderCurrency: 'not_tracked',
        financeMatch: 'not_tracked',
      },
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
  ) {
    const business = await this.tenantPrisma.client.business.findUnique({
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

    await this.validateRequestReferences(businessId, dto);

    const request = await this.tenantPrisma.client.procurementRequest.create({
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
  ) {
    const request = await this.findRequest(businessId, id);
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
            request.requesterUserId === actorUserId
              ? 'Withdrawn by requester.'
              : 'Withdrawn by a procurement manager.',
        },
      });
    });
    return this.getRequest(businessId, id);
  }

  private async validateRequestReferences(
    businessId: string,
    dto: CreateProcurementRequestDto,
  ) {
    if (dto.branchBusinessId) {
      const branch = await this.tenantPrisma.client.business.findUnique({
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
      const supplier = await this.tenantPrisma.client.supplier.findFirst({
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
      const products = await this.tenantPrisma.client.product.findMany({
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
      const updated = await tx.procurementRequest.updateMany({
        where: { id, businessId, status: ProcurementRequestStatus.draft },
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
      const updated = await tx.procurementRequest.updateMany({
        where: {
          id,
          businessId,
          status: ProcurementRequestStatus.submitted,
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
          reason,
        },
      });
    });
    return this.getRequest(businessId, id);
  }

  async convertRequestToPurchaseOrder(
    businessId: string,
    actorUserId: string,
    id: string,
  ) {
    const request = await this.findRequest(businessId, id);
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
        const claimed = await tx.procurementRequest.updateMany({
          where: {
            id,
            businessId,
            status: ProcurementRequestStatus.approved,
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
            note: `Converted from request ${request.id}. ${request.reason}`,
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
}
