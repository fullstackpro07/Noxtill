import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AutonomousCommerceDashboardService } from './autonomous-commerce-dashboard.service';

describe('AutonomousCommerceDashboardService', () => {
  // Work-queue counts are covered against real MySQL in the .db.spec; these mocked tests only
  // exercise the trailing-30-day summary maths.
  beforeEach(() => {
    jest
      .spyOn(AutonomousCommerceDashboardService.prototype, 'operations')
      .mockResolvedValue({
        paused: false,
        sourcing: { openRfqs: 0 },
        listings: { listingsAwaitingApproval: 2, approvedDrafts: 0 },
        production: { openWorkOrders: 0, qualityHolds: 1 },
        risk: { openRiskCases: 0, highRiskCases: 0 },
        b2b: { activeB2bAccounts: 0 },
        subscriptions: {
          activeSubscriptions: 0,
          dueRenewals: 0,
          reservedPreorders: 0,
        },
        growth: {
          openStoreOpportunities: 0,
          highImpactStoreOpportunities: 0,
          runningExperiments: 0,
          experimentsAwaitingDecision: 0,
        },
      });
  });
  afterEach(() => jest.restoreAllMocks());

  it('uses canonical records and discloses missing delivery promise data', async () => {
    const orderFindMany = jest
      .fn()
      .mockResolvedValue([{ total: 100 }, { total: 50 }]);
    const productFindMany = jest.fn().mockResolvedValue([
      { stockQty: 2, lowStockThreshold: 5 },
      { stockQty: 8, lowStockThreshold: 5 },
    ]);
    const deliveryFindMany = jest.fn().mockResolvedValue([
      {
        deliveredAt: new Date('2026-09-26T11:00:00.000Z'),
        promisedAt: new Date('2026-09-26T12:00:00.000Z'),
      },
      { deliveredAt: new Date('2026-09-26T11:00:00.000Z'), promisedAt: null },
    ]);
    const returnFindMany = jest
      .fn()
      .mockResolvedValue([{ refundAmount: 25 }, { refundAmount: 10 }]);
    const claimCount = jest
      .fn()
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1);
    const claimItemAggregate = jest.fn().mockResolvedValue({
      _sum: {
        productLossAmount: 100,
        freightLossAmount: 20,
        otherLossAmount: 10,
      },
    });
    const claimSettlementAggregate = jest
      .fn()
      .mockResolvedValueOnce({ _sum: { amount: 30 } })
      .mockResolvedValueOnce({ _sum: { amount: 40 } });
    const tenantPrisma = {
      client: {
        business: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({ currency: 'PKR' }),
        },
        order: { findMany: orderFindMany },
        product: { findMany: productFindMany },
        delivery: { findMany: deliveryFindMany },
        return: { findMany: returnFindMany },
        commerceSupplierClaim: { count: claimCount },
        commerceSupplierClaimItem: { aggregate: claimItemAggregate },
        commerceSupplierClaimSettlement: {
          aggregate: claimSettlementAggregate,
        },
      },
    } as unknown as TenantPrismaService;

    const service = new AutonomousCommerceDashboardService(tenantPrisma);
    const result = await service.summary('business_1');

    expect(result.sales).toMatchObject({
      currency: 'PKR',
      completedOrders: 2,
      recordedOrderTotal: 150,
      averageOrderValue: 75,
      status: 'available',
    });
    expect(result.inventory).toMatchObject({
      activeProducts: 2,
      lowStockProducts: 1,
    });
    expect(result.approvals).toMatchObject({
      pendingReturns: 2,
      pendingRefundAmount: 35,
      status: 'available',
    });
    expect(result.fulfillment).toMatchObject({
      status: 'partial',
      deliveredOrders: 2,
      eligibleDeliveredOrders: 1,
      missingPromiseTime: 1,
      onTimeRate: 100,
    });
    expect(result.supplierClaims).toMatchObject({
      status: 'available',
      openClaims: 4,
      recoverableValue: 100,
      agingClaims: 1,
      recoveredThisMonth: 40,
    });
    expect(result.approvals.commerceItemsWaiting).toBe(3);
    expect(result.unavailableMetrics.map((metric) => metric.key)).not.toContain(
      'commerce_approvals',
    );
    expect(result.unavailableMetrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'net_sales_after_refunds' }),
        expect.objectContaining({ key: 'supplier_dispute_rate' }),
      ]),
    );
    const [[firstOrderQuery]] = orderFindMany.mock.calls as unknown as [
      [{ where: { businessId: string } }],
    ];
    expect(firstOrderQuery.where.businessId).toBe('business_1');
  });

  it('returns null instead of a misleading zero rate when no delivered order has a promise', async () => {
    const tenantPrisma = {
      client: {
        business: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({ currency: 'PKR' }),
        },
        order: { findMany: jest.fn().mockResolvedValue([]) },
        product: { findMany: jest.fn().mockResolvedValue([]) },
        delivery: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ deliveredAt: new Date(), promisedAt: null }]),
        },
        return: { findMany: jest.fn().mockResolvedValue([]) },
        commerceSupplierClaim: { count: jest.fn().mockResolvedValue(0) },
        commerceSupplierClaimItem: {
          aggregate: jest.fn().mockResolvedValue({
            _sum: {
              productLossAmount: null,
              freightLossAmount: null,
              otherLossAmount: null,
            },
          }),
        },
        commerceSupplierClaimSettlement: {
          aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
        },
      },
    } as unknown as TenantPrismaService;

    const result = await new AutonomousCommerceDashboardService(
      tenantPrisma,
    ).summary('business_1');

    expect(result.fulfillment.onTimeRate).toBeNull();
    expect(result.fulfillment.status).toBe('unavailable');
  });
});
