import { Injectable } from '@nestjs/common';
import {
  CommerceB2bAccountStatus,
  CommerceExperimentStatus,
  CommerceListingDraftStatus,
  CommercePreorderStatus,
  CommerceRfqStatus,
  CommerceRiskCaseStatus,
  CommerceRiskSeverity,
  CommerceStoreImpact,
  CommerceStoreOpportunityStatus,
  CommerceSubscriptionStatus,
  CommerceSupplierClaimStatus,
  CommerceWorkOrderStatus,
  OrderStatus,
  ReturnStatus,
} from '@prisma/client';
import { commercePaused } from '../commerce/commerce-pause.util';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Read-only Autonomous Commerce dashboard pack. It reuses canonical Orders, Products and
 * Delivery records; unsupported measures are disclosed rather than represented as zero.
 */
@Injectable()
export class AutonomousCommerceDashboardService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /** Live work-queue counts from each Autonomous Commerce screen (all canonical records). */
  async operations(businessId: string, now = new Date()) {
    const db = this.tenantPrisma.client;
    const activeRisk = [
      CommerceRiskCaseStatus.open,
      CommerceRiskCaseStatus.investigating,
    ];
    const activeStore = [
      CommerceStoreOpportunityStatus.open,
      CommerceStoreOpportunityStatus.in_progress,
    ];
    const [
      paused,
      openRfqs,
      listingsAwaitingApproval,
      approvedListings,
      openWorkOrders,
      qualityHolds,
      openRiskCases,
      highRiskCases,
      activeB2bAccounts,
      activeSubscriptions,
      dueRenewals,
      reservedPreorders,
      openStoreOpportunities,
      highImpactStoreOpportunities,
      runningExperiments,
      experimentsAwaitingDecision,
    ] = await Promise.all([
      commercePaused(this.tenantPrisma, businessId),
      db.commerceRfq.count({
        where: { businessId, status: CommerceRfqStatus.open },
      }),
      db.commerceListingDraft.count({
        where: {
          businessId,
          status: CommerceListingDraftStatus.review_required,
        },
      }),
      db.commerceListingDraft.count({
        where: { businessId, status: CommerceListingDraftStatus.approved },
      }),
      db.commerceWorkOrder.count({
        where: {
          businessId,
          status: {
            in: [
              CommerceWorkOrderStatus.planned,
              CommerceWorkOrderStatus.in_progress,
              CommerceWorkOrderStatus.quality_hold,
            ],
          },
        },
      }),
      db.commerceWorkOrder.count({
        where: { businessId, status: CommerceWorkOrderStatus.quality_hold },
      }),
      db.commerceRiskCase.count({
        where: { businessId, status: { in: activeRisk } },
      }),
      db.commerceRiskCase.count({
        where: {
          businessId,
          status: { in: activeRisk },
          severity: CommerceRiskSeverity.high,
        },
      }),
      db.commerceB2bAccount.count({
        where: { businessId, status: CommerceB2bAccountStatus.active },
      }),
      db.commerceSubscription.count({
        where: { businessId, status: CommerceSubscriptionStatus.active },
      }),
      db.commerceSubscription.count({
        where: {
          businessId,
          status: CommerceSubscriptionStatus.active,
          nextRenewalAt: { lte: now },
        },
      }),
      db.commercePreorder.count({
        where: { businessId, status: CommercePreorderStatus.reserved },
      }),
      db.commerceStoreOpportunity.count({
        where: { businessId, status: { in: activeStore } },
      }),
      db.commerceStoreOpportunity.count({
        where: {
          businessId,
          status: { in: activeStore },
          impact: CommerceStoreImpact.high,
        },
      }),
      db.commerceExperiment.count({
        where: { businessId, status: CommerceExperimentStatus.running },
      }),
      db.commerceExperiment.count({
        where: { businessId, status: CommerceExperimentStatus.stopped },
      }),
    ]);
    return {
      paused,
      sourcing: { openRfqs },
      listings: { listingsAwaitingApproval, approvedDrafts: approvedListings },
      production: { openWorkOrders, qualityHolds },
      risk: { openRiskCases, highRiskCases },
      b2b: { activeB2bAccounts },
      subscriptions: { activeSubscriptions, dueRenewals, reservedPreorders },
      growth: {
        openStoreOpportunities,
        highImpactStoreOpportunities,
        runningExperiments,
        experimentsAwaitingDecision,
      },
    };
  }

  /**
   * Net sales and contribution for completed orders in the window. Refunds are approved returns on
   * those same orders (allocated to the order's period, not the refund date). Contribution here is
   * net sales minus recorded cost of goods only — shipping, payment, marketplace and ad costs are not
   * recorded per order, so the figure is always reported as incomplete with those components named.
   */
  async profitability(businessId: string, since: Date, until: Date) {
    const db = this.tenantPrisma.client;
    const orders = await db.order.findMany({
      where: {
        businessId,
        status: OrderStatus.completed,
        isQuotation: false,
        createdAt: { gte: since, lte: until },
      },
      select: {
        id: true,
        total: true,
        items: { select: { cost: true, qty: true } },
      },
    });
    const orderIds = orders.map((order) => order.id);
    const refunds = orderIds.length
      ? await db.return.aggregate({
          where: {
            businessId,
            status: ReturnStatus.approved,
            orderId: { in: orderIds },
          },
          _sum: { refundAmount: true },
          _count: { _all: true },
        })
      : { _sum: { refundAmount: null }, _count: { _all: 0 } };
    let gross = 0;
    let cogs = 0;
    let lines = 0;
    let linesWithoutCost = 0;
    for (const order of orders) {
      gross += Number(order.total);
      for (const item of order.items) {
        lines += 1;
        const cost = Number(item.cost);
        if (cost <= 0) linesWithoutCost += 1;
        cogs += cost * item.qty;
      }
    }
    const deliveries = orderIds.length
      ? await db.delivery.findMany({
          where: { businessId, orderId: { in: orderIds } },
          select: { deliveryCost: true },
        })
      : [];
    const deliveryCost = deliveries.reduce(
      (sum, row) => sum + Number(row.deliveryCost ?? 0),
      0,
    );
    const deliveriesWithoutCost = deliveries.filter(
      (row) => row.deliveryCost === null,
    ).length;
    const refunded = Number(refunds._sum.refundAmount ?? 0);
    const netSales = round2(gross - refunded);
    const contribution = round2(netSales - cogs - deliveryCost);
    return {
      grossSales: round2(gross),
      refunds: round2(refunded),
      refundedReturns: refunds._count._all,
      netSales,
      costOfGoods: round2(cogs),
      deliveryCost: round2(deliveryCost),
      deliveries: deliveries.length,
      linesWithoutCost,
      lines,
      contributionBeforeOtherCosts: contribution,
      contributionMarginPct:
        netSales > 0 ? round2((contribution / netSales) * 100) : null,
      status: 'incomplete' as const,
      missingComponents: [
        ...(deliveriesWithoutCost > 0
          ? [
              `Delivery cost on ${deliveriesWithoutCost} of ${deliveries.length} deliveries (no cost model)`,
            ]
          : []),
        'Payment processing fees',
        'Marketplace fees',
        'Allocated ad spend',
        ...(linesWithoutCost > 0
          ? [
              `Cost of goods on ${linesWithoutCost} of ${lines} order lines (recorded cost is 0)`,
            ]
          : []),
      ],
      definition:
        'Net sales = completed order totals less approved refunds on those same orders. Contribution = net sales less the cost recorded on each order line and the delivery cost recorded by Delivery & Riders; returned stock is not credited back. Payment, marketplace and ad costs are not recorded per order, so this is not full contribution profit.',
    };
  }

  async summary(businessId: string) {
    const capturedAt = new Date();
    const since = new Date(capturedAt.getTime() - 30 * 24 * 60 * 60 * 1000);
    const agingBefore = new Date(
      capturedAt.getTime() - 30 * 24 * 60 * 60 * 1000,
    );
    const utcMonthStart = new Date(
      Date.UTC(capturedAt.getUTCFullYear(), capturedAt.getUTCMonth(), 1),
    );
    const activeClaimStatuses = [
      CommerceSupplierClaimStatus.submitted,
      CommerceSupplierClaimStatus.acknowledged,
      CommerceSupplierClaimStatus.partially_settled,
    ];

    const [
      business,
      orders,
      products,
      delivered,
      pendingReturns,
      openSupplierClaims,
      agingSupplierClaims,
      activeClaimLoss,
      activeClaimRecovery,
      recoveredSupplierClaimsThisMonth,
    ] = await Promise.all([
      this.tenantPrisma.client.business.findUniqueOrThrow({
        where: { id: businessId },
        select: { currency: true },
      }),
      this.tenantPrisma.client.order.findMany({
        where: {
          businessId,
          status: OrderStatus.completed,
          isQuotation: false,
          createdAt: { gte: since, lte: capturedAt },
        },
        select: { total: true },
      }),
      this.tenantPrisma.client.product.findMany({
        where: { businessId, active: true },
        select: { stockQty: true, lowStockThreshold: true },
      }),
      this.tenantPrisma.client.delivery.findMany({
        where: {
          businessId,
          deliveredAt: { gte: since, lte: capturedAt },
        },
        select: { deliveredAt: true, promisedAt: true },
      }),
      this.tenantPrisma.client.return.findMany({
        where: { businessId, status: ReturnStatus.pending },
        select: { refundAmount: true },
      }),
      this.tenantPrisma.client.commerceSupplierClaim.count({
        where: { businessId, status: { in: activeClaimStatuses } },
      }),
      this.tenantPrisma.client.commerceSupplierClaim.count({
        where: {
          businessId,
          status: { in: activeClaimStatuses },
          submittedAt: { lte: agingBefore },
        },
      }),
      this.tenantPrisma.client.commerceSupplierClaimItem.aggregate({
        where: {
          claim: { businessId, status: { in: activeClaimStatuses } },
        },
        _sum: {
          productLossAmount: true,
          freightLossAmount: true,
          otherLossAmount: true,
        },
      }),
      this.tenantPrisma.client.commerceSupplierClaimSettlement.aggregate({
        where: {
          claim: { businessId, status: { in: activeClaimStatuses } },
        },
        _sum: { amount: true },
      }),
      this.tenantPrisma.client.commerceSupplierClaimSettlement.aggregate({
        where: {
          claim: { businessId },
          settledAt: { gte: utcMonthStart, lte: capturedAt },
        },
        _sum: { amount: true },
      }),
    ]);

    const salesTotal = round2(
      orders.reduce((sum, order) => sum + Number(order.total), 0),
    );
    const deliveriesWithPromise = delivered.filter((row) => row.promisedAt);
    const onTimeDeliveries = deliveriesWithPromise.filter(
      (row) => row.deliveredAt! <= row.promisedAt!,
    ).length;
    const lowStockProducts = products.filter(
      (product) => product.stockQty <= product.lowStockThreshold,
    ).length;
    const pendingRefundAmount = round2(
      pendingReturns.reduce((sum, row) => sum + Number(row.refundAmount), 0),
    );
    const activeLossAmount =
      Number(activeClaimLoss._sum.productLossAmount ?? 0) +
      Number(activeClaimLoss._sum.freightLossAmount ?? 0) +
      Number(activeClaimLoss._sum.otherLossAmount ?? 0);
    const activeRecoveryAmount = Number(activeClaimRecovery._sum.amount ?? 0);

    const [operations, profitability] = await Promise.all([
      this.operations(businessId, capturedAt),
      this.profitability(businessId, since, capturedAt),
    ]);

    return {
      operations,
      profitability: { ...profitability, currency: business.currency },
      period: { start: since, end: capturedAt, days: 30 },
      capturedAt,
      sales: {
        status: 'available' as const,
        currency: business.currency,
        completedOrders: orders.length,
        recordedOrderTotal: salesTotal,
        averageOrderValue:
          orders.length > 0 ? round2(salesTotal / orders.length) : null,
        definition:
          'Sum of Order.total for completed, non-quotation orders created in the trailing 30 days. Order.total already reflects recorded discounts; refunds are not deducted.',
      },
      inventory: {
        status: 'available' as const,
        activeProducts: products.length,
        lowStockProducts,
        definition:
          'Active canonical products with stockQty less than or equal to their configured lowStockThreshold.',
      },
      approvals: {
        status: 'available' as const,
        pendingReturns: pendingReturns.length,
        pendingRefundAmount,
        /** Same items the Action Center lists as Commerce work (before snooze/dismiss). */
        commerceItemsWaiting:
          operations.listings.listingsAwaitingApproval +
          operations.growth.experimentsAwaitingDecision +
          operations.risk.highRiskCases +
          operations.production.qualityHolds +
          operations.subscriptions.dueRenewals,
        definition:
          'Pending Returns, plus Commerce work waiting on a person in the Action Center: listings to approve, experiments to decide, open high-severity risk cases, quality holds and due renewals.',
      },
      fulfillment: {
        status:
          deliveriesWithPromise.length === 0
            ? ('unavailable' as const)
            : delivered.some((row) => row.promisedAt === null)
              ? ('partial' as const)
              : ('available' as const),
        deliveredOrders: delivered.length,
        eligibleDeliveredOrders: deliveriesWithPromise.length,
        missingPromiseTime: delivered.length - deliveriesWithPromise.length,
        onTimeOrders: onTimeDeliveries,
        onTimeRate:
          deliveriesWithPromise.length > 0
            ? round2((onTimeDeliveries / deliveriesWithPromise.length) * 100)
            : null,
        definition:
          'Delivered records in the same period with a stored promisedAt; the customer promise is compared with deliveredAt. Records without a promise are excluded and counted separately.',
      },
      supplierClaims: {
        status: 'available' as const,
        openClaims: openSupplierClaims,
        recoverableValue: round2(
          Math.max(0, activeLossAmount - activeRecoveryAmount),
        ),
        agingClaims: agingSupplierClaims,
        recoveredThisMonth: round2(
          Number(recoveredSupplierClaimsThisMonth._sum.amount ?? 0),
        ),
        definition:
          'Open claims are submitted, acknowledged or partially settled canonical supplier-claim records. Recoverable value is their recorded line-loss amount less recorded settlements. Aging means submitted more than 30 days ago. Recovered this month uses the UTC calendar month and recorded supplier settlements; it is not an accounting posting.',
      },
      unavailableMetrics: [
        {
          key: 'ad_spend_mer_and_cac',
          reason:
            'No complete order-level attribution source is connected to this dashboard summary.',
        },
        {
          key: 'supplier_dispute_rate',
          reason:
            'The system records claims but does not yet have a verified count of supplier deliveries/incidents to use as the rate denominator.',
        },
      ],
    };
  }
}
