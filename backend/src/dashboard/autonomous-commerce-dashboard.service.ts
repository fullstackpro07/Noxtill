import { Injectable } from '@nestjs/common';
import {
  CommerceSupplierClaimStatus,
  OrderStatus,
  ReturnStatus,
} from '@prisma/client';
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

    return {
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
        definition:
          'Currently pending Returns records only. This does not include approvals for autonomous Commerce agent actions.',
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
          key: 'net_sales_after_refunds',
          reason:
            'Refunds are recorded separately from orders and are not yet allocated to the original order period in this dashboard.',
        },
        {
          key: 'contribution_profit_and_margin',
          reason:
            'The current dashboard does not yet reconcile variable fulfillment, payment and acquisition costs against each order.',
        },
        {
          key: 'ad_spend_mer_and_cac',
          reason:
            'No complete order-level attribution source is connected to this dashboard summary.',
        },
        {
          key: 'commerce_approvals',
          reason:
            'Autonomous Commerce agent actions are not yet registered in the shared Action Center. Pending return approvals are shown separately.',
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
