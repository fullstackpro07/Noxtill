import { WorkflowTriggerKey } from '@prisma/client';

export interface TriggerEvent {
  eventId?: string;
  description: string;
  scheduledAt?: string;
  entityType?: string | null;
  entityId?: string | null;
  amount?: number | null;
}

/**
 * Narrow reader shape `buildTriggerContext` actually needs — satisfied structurally by both the
 * raw `PrismaService` (used by `WorkflowTriggerService.dispatch`, which has no request-scoped
 * tenant context) and `TenantPrismaService.client` (used by `WorkflowsService.test`'s dry run).
 * Every entity lookup includes `businessId` explicitly so contexts cannot cross tenants.
 */
export interface ContextReader {
  order: {
    findFirst(args: { where: { id: string; businessId: string } }): Promise<{
      customerId: string | null;
      total: unknown;
      orderNo: number;
    } | null>;
  };
  appointment: {
    findFirst(args: {
      where: { id: string; businessId: string };
      include: { service: { select: { name: true } } };
    }): Promise<{ customerId: string; service: { name: string } } | null>;
  };
  reviewRequest: {
    findFirst(args: {
      where: { id: string; businessId: string };
    }): Promise<{ customerId: string | null; stars: number | null } | null>;
  };
  customer: {
    findFirst(args: {
      where: { id: string; businessId: string };
    }): Promise<{ name: string } | null>;
  };
  installment: {
    findFirst(args: {
      where: { id: string; businessId: string };
      include: { plan: { select: { customerId: true } } };
    }): Promise<{
      amount: unknown;
      plan: { customerId: string };
    } | null>;
  };
  creditEntry: {
    findFirst(args: { where: { id: string; businessId: string } }): Promise<{
      amount: unknown;
      customerId: string;
      method: string | null;
    } | null>;
  };
  privateFeedback: {
    findFirst(args: {
      where: { id: string; businessId: string };
    }): Promise<{ customerId: string | null; stars: number } | null>;
  };
  delivery: {
    findFirst(args: {
      where: { id: string; businessId: string };
      include: { order: { select: { customerId: true; orderNo: true } } };
    }): Promise<{
      status: string;
      order: { customerId: string | null; orderNo: number };
    } | null>;
  };
  productValidationRun: {
    findFirst(args: {
      where: { id: string; businessId: string };
      include: {
        opportunity: {
          select: { title: true; risk: true; market: true; confidence: true };
        };
      };
    }): Promise<{
      decision: string;
      evidenceSnapshot: unknown;
      opportunity: {
        title: string;
        risk: string;
        market: string | null;
        confidence: number | null;
      };
    } | null>;
  };
  seoAuditRun: {
    findFirst(args: { where: { id: string; businessId: string } }): Promise<{
      siteUrl: string;
      pagesCrawled: number;
      issuesFound: number;
      issues: unknown;
    } | null>;
  };
  commerceRfq: {
    findFirst(args: {
      where: { id: string; businessId: string };
      select: {
        status: true;
        requirement: true;
        market: true;
        currency: true;
        purchaseOrderId: true;
        _count: { select: { suppliers: true; quotes: true } };
      };
    }): Promise<{
      status: string;
      requirement: string;
      market: string | null;
      currency: string;
      purchaseOrderId: string | null;
      _count: { suppliers: number; quotes: number };
    } | null>;
  };
  commerceSupplierClaim?: {
    findFirst(args: {
      where: { id: string; businessId: string };
      include: {
        supplier: { select: { name: true } };
        items: {
          select: {
            productLossAmount: true;
            freightLossAmount: true;
            otherLossAmount: true;
          };
        };
        settlements: { select: { amount: true } };
      };
    }): Promise<{
      supplierId: string;
      supplier: { name: string };
      reference: string | null;
      reasonCode: string;
      currency: string;
      status: string;
      items: Array<{
        productLossAmount: unknown;
        freightLossAmount: unknown;
        otherLossAmount: unknown;
      }>;
      settlements: Array<{ amount: unknown }>;
    } | null>;
  };
  commerceListingDraft?: {
    findFirst(args: {
      where: { id: string; businessId: string };
      select: {
        status: true;
        channel: true;
        market: true;
        currentVersion: true;
        product: { select: { id: true; name: true } };
      };
    }): Promise<{
      status: string;
      channel: string;
      market: string | null;
      currentVersion: number;
      product: { id: string; name: string };
    } | null>;
  };
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Builds the trigger's canonical context and resolves a customer name when a real customer is
 * attached. This powers both condition evaluation and message-template rendering.
 */
export async function buildTriggerContext(
  reader: ContextReader,
  businessId: string,
  triggerKey: WorkflowTriggerKey,
  event: TriggerEvent,
): Promise<Record<string, unknown>> {
  const context = await buildBaseTriggerContext(
    reader,
    businessId,
    triggerKey,
    event,
  );
  const customerId = context.customerId;
  if (
    typeof customerId !== 'string' ||
    customerId.length === 0 ||
    typeof context.customerName === 'string'
  ) {
    return context;
  }

  const customer = await reader.customer.findFirst({
    where: { id: customerId, businessId },
  });
  return { ...context, customerName: customer?.name };
}

/** Resolves trigger-specific fields from canonical records without crossing business scope. */
async function buildBaseTriggerContext(
  reader: ContextReader,
  businessId: string,
  triggerKey: WorkflowTriggerKey,
  event: TriggerEvent,
): Promise<Record<string, unknown>> {
  const base: Record<string, unknown> = {
    eventId: event.eventId,
    description: event.description,
    amount: event.amount ?? undefined,
  };

  switch (triggerKey) {
    case WorkflowTriggerKey.scheduled:
      return {
        ...base,
        scheduledAt: event.scheduledAt,
      };
    case WorkflowTriggerKey.sale: {
      const order = event.entityId
        ? await reader.order.findFirst({
            where: { id: event.entityId, businessId },
          })
        : null;
      return {
        ...base,
        customerId: order?.customerId ?? undefined,
        orderTotal: order ? Number(order.total) : undefined,
        orderNo: order?.orderNo,
      };
    }
    case WorkflowTriggerKey.booking_completed: {
      const appt = event.entityId
        ? await reader.appointment.findFirst({
            where: { id: event.entityId, businessId },
            include: { service: { select: { name: true } } },
          })
        : null;
      return {
        ...base,
        customerId: appt?.customerId,
        serviceName: appt?.service.name,
      };
    }
    case WorkflowTriggerKey.review: {
      const reviewRequest = event.entityId
        ? await reader.reviewRequest.findFirst({
            where: { id: event.entityId, businessId },
          })
        : null;
      return {
        ...base,
        customerId: reviewRequest?.customerId ?? undefined,
        reviewRating: reviewRequest?.stars ?? undefined,
      };
    }
    case WorkflowTriggerKey.lapsed_customer:
    case WorkflowTriggerKey.birthday: {
      const customer = event.entityId
        ? await reader.customer.findFirst({
            where: { id: event.entityId, businessId },
          })
        : null;
      return {
        ...base,
        customerId: event.entityId ?? undefined,
        customerName: customer?.name,
      };
    }
    case WorkflowTriggerKey.credit_overdue: {
      const installment = event.entityId
        ? await reader.installment.findFirst({
            where: { id: event.entityId, businessId },
            include: { plan: { select: { customerId: true } } },
          })
        : null;
      return {
        ...base,
        customerId: installment?.plan.customerId,
        installmentAmount: installment ? Number(installment.amount) : undefined,
      };
    }
    case WorkflowTriggerKey.low_stock:
      return base;
    case WorkflowTriggerKey.payment_received: {
      const entry =
        event.entityId && event.entityType === 'CreditEntry'
          ? await reader.creditEntry.findFirst({
              where: { id: event.entityId, businessId },
            })
          : null;
      return {
        ...base,
        customerId: entry?.customerId,
        paymentAmount: entry
          ? Number(entry.amount)
          : (event.amount ?? undefined),
        paymentMethod: entry?.method ?? undefined,
      };
    }
    case WorkflowTriggerKey.complaint_received: {
      const feedback =
        event.entityId && event.entityType === 'PrivateFeedback'
          ? await reader.privateFeedback.findFirst({
              where: { id: event.entityId, businessId },
            })
          : null;
      return {
        ...base,
        customerId: feedback?.customerId ?? undefined,
        feedbackRating: feedback?.stars,
      };
    }
    case WorkflowTriggerKey.delivery_created:
    case WorkflowTriggerKey.delivery_assigned:
    case WorkflowTriggerKey.delivery_picked_up:
    case WorkflowTriggerKey.delivery_en_route:
    case WorkflowTriggerKey.delivery_delivered:
    case WorkflowTriggerKey.delivery_failed:
    case WorkflowTriggerKey.delivery_retried: {
      const delivery =
        event.entityId && event.entityType === 'Delivery'
          ? await reader.delivery.findFirst({
              where: { id: event.entityId, businessId },
              include: {
                order: { select: { customerId: true, orderNo: true } },
              },
            })
          : null;
      return {
        ...base,
        deliveryId: event.entityId ?? undefined,
        deliveryStatus: delivery?.status,
        customerId: delivery?.order.customerId ?? undefined,
        orderNo: delivery?.order.orderNo,
      };
    }
    case WorkflowTriggerKey.commerce_validation: {
      const validationRun =
        event.entityId && event.entityType === 'ProductValidationRun'
          ? await reader.productValidationRun.findFirst({
              where: { id: event.entityId, businessId },
              include: {
                opportunity: {
                  select: {
                    title: true,
                    risk: true,
                    market: true,
                    confidence: true,
                  },
                },
              },
            })
          : null;
      const evidenceSnapshot = recordValue(validationRun?.evidenceSnapshot);
      const coverage = recordValue(evidenceSnapshot?.evidenceCoverage);
      return {
        ...base,
        validationDecision: validationRun?.decision,
        candidateTitle: validationRun?.opportunity.title,
        candidateRisk: validationRun?.opportunity.risk,
        market: validationRun?.opportunity.market ?? undefined,
        confidence: validationRun?.opportunity.confidence ?? undefined,
        evidenceRecorded:
          typeof coverage?.recorded === 'number'
            ? coverage.recorded
            : undefined,
      };
    }
    case WorkflowTriggerKey.commerce_listing_draft: {
      const listingDraft =
        event.entityId &&
        event.entityType === 'CommerceListingDraft' &&
        reader.commerceListingDraft
          ? await reader.commerceListingDraft.findFirst({
              where: { id: event.entityId, businessId },
              select: {
                status: true,
                channel: true,
                market: true,
                currentVersion: true,
                product: { select: { id: true, name: true } },
              },
            })
          : null;
      return {
        ...base,
        listingDraftId: listingDraft ? event.entityId : undefined,
        draftVersion: listingDraft?.currentVersion,
        listingStatus: listingDraft?.status,
        listingChannel: listingDraft?.channel,
        listingMarket: listingDraft?.market ?? undefined,
        productId: listingDraft?.product.id,
        productName: listingDraft?.product.name,
      };
    }
    case WorkflowTriggerKey.commerce_rfq_created:
    case WorkflowTriggerKey.commerce_rfq_response_received:
    case WorkflowTriggerKey.commerce_rfq_awarded: {
      const rfq =
        event.entityId && event.entityType === 'CommerceRfq'
          ? await reader.commerceRfq.findFirst({
              where: { id: event.entityId, businessId },
              select: {
                status: true,
                requirement: true,
                market: true,
                currency: true,
                purchaseOrderId: true,
                _count: { select: { suppliers: true, quotes: true } },
              },
            })
          : null;
      return {
        ...base,
        rfqId: rfq ? event.entityId : undefined,
        rfqStatus: rfq?.status,
        requirement: rfq?.requirement,
        market: rfq?.market ?? undefined,
        currency: rfq?.currency,
        supplierCount: rfq?._count.suppliers,
        quoteCount: rfq?._count.quotes,
        purchaseOrderId: rfq?.purchaseOrderId ?? undefined,
      };
    }
    case WorkflowTriggerKey.commerce_supplier_claim_created:
    case WorkflowTriggerKey.commerce_supplier_claim_settled: {
      const claim =
        event.entityId &&
        event.entityType === 'CommerceSupplierClaim' &&
        reader.commerceSupplierClaim
          ? await reader.commerceSupplierClaim.findFirst({
              where: { id: event.entityId, businessId },
              include: {
                supplier: { select: { name: true } },
                items: {
                  select: {
                    productLossAmount: true,
                    freightLossAmount: true,
                    otherLossAmount: true,
                  },
                },
                settlements: { select: { amount: true } },
              },
            })
          : null;
      const requestedAmount = claim
        ? claim.items.reduce(
            (total, item) =>
              total +
              Number(item.productLossAmount) +
              Number(item.freightLossAmount) +
              Number(item.otherLossAmount),
            0,
          )
        : undefined;
      const recoveredAmount = claim
        ? claim.settlements.reduce(
            (total, settlement) => total + Number(settlement.amount),
            0,
          )
        : undefined;
      return {
        ...base,
        supplierClaimId: claim ? event.entityId : undefined,
        supplierId: claim?.supplierId,
        supplierName: claim?.supplier.name,
        claimStatus: claim?.status,
        claimCurrency: claim?.currency,
        claimReference: claim?.reference ?? undefined,
        claimReasonCode: claim?.reasonCode,
        claimRequestedAmount: requestedAmount,
        claimRecoveredAmount: recoveredAmount,
        claimOutstandingAmount:
          requestedAmount !== undefined && recoveredAmount !== undefined
            ? Math.max(0, requestedAmount - recoveredAmount)
            : undefined,
      };
    }
    case WorkflowTriggerKey.seo_issue_detected: {
      const auditRun =
        event.entityId && event.entityType === 'SeoAuditRun'
          ? await reader.seoAuditRun.findFirst({
              where: { id: event.entityId, businessId },
            })
          : null;
      const issues = Array.isArray(auditRun?.issues)
        ? auditRun.issues.map(recordValue).filter((issue) => issue !== null)
        : [];
      const priorityIssues = issues.filter(
        (issue) => issue.severity === 'critical' || issue.severity === 'high',
      );
      const criticalIssueCount = priorityIssues.filter(
        (issue) => issue.severity === 'critical',
      ).length;
      let siteHost: string | undefined;
      if (auditRun) {
        try {
          siteHost = new URL(auditRun.siteUrl).hostname;
        } catch {
          siteHost = undefined;
        }
      }
      const topIssueType = priorityIssues[0]?.type;
      return {
        ...base,
        auditRunId: event.entityId ?? undefined,
        siteHost,
        pagesCrawled: auditRun?.pagesCrawled,
        issuesFound: auditRun?.issuesFound,
        highPriorityIssueCount: priorityIssues.length,
        criticalIssueCount,
        topIssueType:
          typeof topIssueType === 'string' ? topIssueType : undefined,
      };
    }
    default:
      return base;
  }
}
