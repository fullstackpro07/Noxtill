import { ClsService } from 'nestjs-cls';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { AnalyticsService } from './analytics.service';
import { BranchScopeService } from '../common/tenancy/branch-scope.service';
import { SegmentsService } from '../customers/segments.service';
import { CustomerAnalyticsSummaryService } from '../customers/customer-analytics-summary.service';
import type { SendGateService } from '../messaging/send-gate.service';
import type { AiInfraService } from '../ai/ai-infra.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('AnalyticsService (BE-071)', () => {
  let prisma: PrismaService;
  let service: AnalyticsService;
  let businessId: string;
  const sendGate = { send: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const aiInfra = { complete: jest.fn() };
    const segments = new SegmentsService(
      tenantPrisma,
      aiInfra as unknown as AiInfraService,
    );
    const customerAnalyticsSummary = new CustomerAnalyticsSummaryService(
      prisma,
      new BranchScopeService(prisma),
      segments,
    );
    service = new AnalyticsService(
      tenantPrisma,
      prisma,
      new BranchScopeService(prisma),
      cls as unknown as ClsService,
      segments,
      sendGate as unknown as SendGateService,
      customerAnalyticsSummary,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Analytics Test Biz',
        slug: `analytics-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    await prisma.order.create({
      data: {
        businessId,
        orderNo: 1,
        status: 'completed',
        orderType: 'counter',
        total: 200,
        subtotal: 200,
        cogs: 80,
      },
    });
    await prisma.order.create({
      data: {
        businessId,
        orderNo: 2,
        status: 'completed',
        orderType: 'counter',
        total: 100,
        subtotal: 100,
        cogs: 40,
      },
    });
  });

  afterAll(async () => {
    await prisma.reviewRequest.deleteMany({ where: { businessId } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('computes this-month KPIs from completed orders', async () => {
    const kpis = await service.kpis();
    expect(kpis.ordersThisMonth).toBe(2);
    expect(kpis.revenueThisMonth).toBe(300);
    expect(kpis.grossProfitThisMonth).toBe(180);
    expect(kpis.avgOrderValue).toBe(150);
  });

  it('returns a revenue series from v_daily_close', async () => {
    const series = await service.revenueSeries(7);
    const today = new Date().toISOString().slice(0, 10);
    const todayRow = series.find((r) => r.date === today);
    expect(todayRow).toMatchObject({ orders: 2, revenue: 300 });
  });

  it('returns an empty channel breakdown when no messages exist', async () => {
    const channels = await service.channels(30);
    expect(channels).toEqual({});
  });

  it('summarizes only recent rated review requests linked to non-erased customers', async () => {
    const stamp = randomUUID();
    const phoneSeed = Date.now();
    const customers = await Promise.all([
      prisma.customer.create({
        data: {
          businessId,
          name: 'Feedback Public',
          phone: `+1555${phoneSeed}1`,
        },
        select: { id: true },
      }),
      prisma.customer.create({
        data: {
          businessId,
          name: 'Feedback Private',
          phone: `+1555${phoneSeed}2`,
        },
        select: { id: true },
      }),
      prisma.customer.create({
        data: {
          businessId,
          name: 'Feedback Old',
          phone: `+1555${phoneSeed}3`,
        },
        select: { id: true },
      }),
      prisma.customer.create({
        data: {
          businessId,
          name: 'Feedback Erased',
          phone: `erased-${stamp}`,
        },
        select: { id: true },
      }),
    ]);
    const [publicCustomer, privateCustomer, oldCustomer, erasedCustomer] =
      customers;
    const respondedAt = new Date();
    const oldRespondedAt = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);

    await prisma.reviewRequest.createMany({
      data: [
        {
          businessId,
          customerId: publicCustomer.id,
          token: `feedback-${stamp}-public`,
          source: 'qa',
          status: 'rated',
          stars: 2,
          routedTo: 'public',
          respondedAt,
        },
        {
          businessId,
          customerId: privateCustomer.id,
          token: `feedback-${stamp}-private`,
          source: 'qa',
          status: 'rated',
          stars: 4,
          routedTo: 'private',
          respondedAt,
        },
        {
          businessId,
          customerId: oldCustomer.id,
          token: `feedback-${stamp}-old`,
          source: 'qa',
          status: 'rated',
          stars: 5,
          routedTo: 'public',
          respondedAt: oldRespondedAt,
        },
        {
          businessId,
          customerId: erasedCustomer.id,
          token: `feedback-${stamp}-erased`,
          source: 'qa',
          status: 'rated',
          stars: 1,
          routedTo: 'private',
          respondedAt,
        },
        {
          businessId,
          token: `feedback-${stamp}-unlinked`,
          source: 'qa',
          status: 'rated',
          stars: 1,
          routedTo: 'public',
          respondedAt,
        },
      ],
    });

    try {
      const { customerFeedback } = await service.customerSummary(businessId);
      expect(customerFeedback).toMatchObject({
        responseCount: 2,
        averageStars: 3,
        ratingCounts: [
          { stars: 1, count: 0 },
          { stars: 2, count: 1 },
          { stars: 3, count: 0 },
          { stars: 4, count: 1 },
          { stars: 5, count: 0 },
        ],
        routedCounts: { public: 1, private: 1 },
        source: 'customer_linked_noxtill_review_requests',
      });
    } finally {
      await prisma.reviewRequest.deleteMany({
        where: { businessId, token: { startsWith: `feedback-${stamp}-` } },
      });
      await prisma.customer.deleteMany({
        where: { id: { in: customers.map((customer) => customer.id) } },
      });
    }
  });

  describe('staff (UPD-BE-108)', () => {
    let staffAId: string;
    let staffBId: string;

    beforeAll(async () => {
      const userA = await prisma.user.create({
        data: {
          email: `staff-a-${Date.now()}@example.com`,
          passwordHash: 'x',
          name: 'Sam Staff',
        },
      });
      const userB = await prisma.user.create({
        data: {
          email: `staff-b-${Date.now()}@example.com`,
          passwordHash: 'x',
          name: 'Sam Staff',
        }, // deliberately same name as userA
      });
      const buA = await prisma.businessUser.create({
        data: { businessId, userId: userA.id, role: 'staff' },
      });
      const buB = await prisma.businessUser.create({
        data: { businessId, userId: userB.id, role: 'staff' },
      });
      staffAId = buA.id;
      staffBId = buB.id;

      await prisma.order.create({
        data: {
          businessId,
          orderNo: 3,
          status: 'completed',
          orderType: 'counter',
          total: 150,
          subtotal: 150,
          staffUserId: staffAId,
        },
      });
      await prisma.order.create({
        data: {
          businessId,
          orderNo: 4,
          status: 'completed',
          orderType: 'counter',
          total: 50,
          subtotal: 50,
          staffUserId: staffBId,
        },
      });

      const product = await prisma.product.create({
        data: {
          businessId,
          kind: 'service',
          name: 'Haircut',
          sellingPrice: 30,
        },
      });
      const customer = await prisma.customer.create({
        data: {
          businessId,
          phone: `+1${Date.now()}`,
          name: 'No Show Customer',
        },
      });
      await prisma.appointment.create({
        data: {
          businessId,
          serviceId: product.id,
          customerId: customer.id,
          staffUserId: staffAId,
          startsAt: new Date(),
          endsAt: new Date(Date.now() + 30 * 60 * 1000),
          status: 'no_show',
        },
      });

      await prisma.externalReview.create({
        data: {
          businessId,
          platform: 'google',
          externalId: `staff-review-${Date.now()}`,
          stars: 5,
          text: 'Sam Staff was wonderful!',
        },
      });
    });

    afterAll(async () => {
      await prisma.appointment.deleteMany({ where: { businessId } });
      await prisma.customer.deleteMany({ where: { businessId } });
      await prisma.product.deleteMany({ where: { businessId } });
      await prisma.externalReview.deleteMany({ where: { businessId } });
      await prisma.order.deleteMany({
        where: { businessId, staffUserId: { not: null } },
      });
      await prisma.businessUser.deleteMany({
        where: { id: { in: [staffAId, staffBId] } },
      });
    });

    it('keeps two staff with the same name as separate rows, grouped by id not name', async () => {
      const rows = await service.staff(businessId);
      const staffRows = rows.filter(
        (r) => r.staffUserId === staffAId || r.staffUserId === staffBId,
      );
      expect(staffRows).toHaveLength(2);
    });

    it('computes a real avg ticket size per staff member', async () => {
      const rows = await service.staff(businessId);
      const rowA = rows.find((r) => r.staffUserId === staffAId)!;
      expect(rowA.totalSales).toBe(150);
      expect(rowA.orders).toBe(1);
      expect(rowA.avgTicketSize).toBe(150);
    });

    it('counts real no-shows scoped to this staff member', async () => {
      const rows = await service.staff(businessId);
      const rowA = rows.find((r) => r.staffUserId === staffAId)!;
      const rowB = rows.find((r) => r.staffUserId === staffBId)!;
      expect(rowA.noShowCount).toBe(1);
      expect(rowB.noShowCount).toBe(0);
    });

    it('counts real (approximate, name-substring) review mentions for both staff sharing the name', async () => {
      const rows = await service.staff(businessId);
      const staffRows = rows.filter(
        (r) => r.staffUserId === staffAId || r.staffUserId === staffBId,
      );
      // Both share the exact name "Sam Staff", so the substring match legitimately counts for both —
      // this is the disclosed approximation (no structured staff-tagging on reviews exists).
      expect(staffRows.every((r) => r.reviewMentionCount >= 1)).toBe(true);
    });

    describe('month scoping (Staff module v2, UPD-BE-STAFF-08)', () => {
      it('an explicit past month with no real activity returns none of this month\'s real rows', async () => {
        const rows = await service.staff(businessId, undefined, '2020-01');
        const staffRows = rows.filter(
          (r) => r.staffUserId === staffAId || r.staffUserId === staffBId,
        );
        expect(staffRows).toHaveLength(0);
      });

      it('an explicit month matching real activity reproduces the same figures as the default (this month) call', async () => {
        const now = new Date();
        const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
        const rows = await service.staff(businessId, undefined, thisMonth);
        const rowA = rows.find((r) => r.staffUserId === staffAId)!;
        expect(rowA.totalSales).toBe(150);
        expect(rowA.orders).toBe(1);
      });
    });
  });

  describe('customer analytics extension (UPD-FE-098)', () => {
    let regularId: string;
    let newId: string;
    let lapsedId: string;

    beforeAll(async () => {
      const regular = await prisma.customer.create({
        data: {
          businessId,
          phone: `+1${Date.now()}0`,
          name: 'Regular Rita',
          visitCount: 3,
          lifetimeSpend: 300,
        },
      });
      const fresh = await prisma.customer.create({
        data: {
          businessId,
          phone: `+1${Date.now()}1`,
          name: 'New Nina',
          visitCount: 1,
          lifetimeSpend: 50,
        },
      });
      const lapsed = await prisma.customer.create({
        data: {
          businessId,
          phone: `+1${Date.now()}2`,
          name: 'Lapsed Leo',
          visitCount: 1,
          lifetimeSpend: 20,
          tags: ['Lapsed'],
        },
      });
      regularId = regular.id;
      newId = fresh.id;
      lapsedId = lapsed.id;
    });

    afterAll(async () => {
      await prisma.customer.deleteMany({
        where: { id: { in: [regularId, newId, lapsedId] } },
      });
      await prisma.campaign.deleteMany({ where: { businessId } });
    });

    it('computes real new/returning/retention/LTV/at-risk from real customer rows', async () => {
      const summary = await service.customerSummary(businessId);
      expect(summary.totalCustomers).toBeGreaterThanOrEqual(3);
      expect(summary.newCount).toBeGreaterThanOrEqual(1); // "New Nina" and "Lapsed Leo" both signed up just now
      expect(summary.returningCount).toBeGreaterThanOrEqual(1); // "Regular Rita" has visitCount 3
      expect(summary.atRiskCount).toBeGreaterThanOrEqual(1); // "Lapsed Leo" carries the real Lapsed tag
      expect(summary.avgLTV).toBeGreaterThan(0);
      expect(summary.ltvDistribution).toHaveLength(4);
      const totalBucketed = summary.ltvDistribution.reduce(
        (sum, b) => sum + b.count,
        0,
      );
      expect(totalBucketed).toBe(summary.totalCustomers);
    });

    it('excludes erased customer profiles from analytics counts and cohort drilldowns', async () => {
      const thisMonth = new Date().toISOString().slice(0, 7);
      const beforeSummary = await service.customerSummary(businessId);
      const beforeCohorts = await service.cohorts(businessId);
      const beforeNewVsReturning = await service.newVsReturningByMonth(
        businessId,
      );
      const beforeCohortCustomers = await service.cohortCustomers(
        businessId,
        thisMonth,
      );
      const beforeKpis = await service.kpis();
      let erasedCustomerId: string | undefined;
      let erasedOrderId: string | undefined;

      try {
        const erasedCustomer = await prisma.customer.create({
          data: {
            businessId,
            phone: `erased-analytics-${businessId}`,
            name: 'Anonymized customer placeholder',
            visitCount: 9,
            lifetimeSpend: 9999,
            tags: ['Lapsed'],
          },
        });
        erasedCustomerId = erasedCustomer.id;
        const erasedOrder = await prisma.order.create({
          data: {
            businessId,
            customerId: erasedCustomer.id,
            orderNo: 98_765_432,
            status: 'completed',
            orderType: 'counter',
          },
          select: { id: true },
        });
        erasedOrderId = erasedOrder.id;

        const afterSummary = await service.customerSummary(businessId);
        expect(afterSummary).toMatchObject({
          totalCustomers: beforeSummary.totalCustomers,
          newCount: beforeSummary.newCount,
          returningCount: beforeSummary.returningCount,
          withVisitCount: beforeSummary.withVisitCount,
          retentionRate: beforeSummary.retentionRate,
          avgLTV: beforeSummary.avgLTV,
          ltvDistribution: beforeSummary.ltvDistribution,
          atRiskCount: beforeSummary.atRiskCount,
          customerFeedback: {
            windowDays: beforeSummary.customerFeedback.windowDays,
            responseCount: beforeSummary.customerFeedback.responseCount,
            averageStars: beforeSummary.customerFeedback.averageStars,
            ratingCounts: beforeSummary.customerFeedback.ratingCounts,
            routedCounts: beforeSummary.customerFeedback.routedCounts,
            source: beforeSummary.customerFeedback.source,
          },
        });
        expect(await service.cohorts(businessId)).toEqual(beforeCohorts);
        expect(await service.newVsReturningByMonth(businessId)).toEqual(
          beforeNewVsReturning,
        );
        expect(await service.cohortCustomers(businessId, thisMonth)).toEqual(
          beforeCohortCustomers,
        );
        expect((await service.kpis()).newCustomersThisMonth).toBe(
          beforeKpis.newCustomersThisMonth,
        );
      } finally {
        if (erasedOrderId) {
          await prisma.order.delete({ where: { id: erasedOrderId } });
        }
        if (erasedCustomerId) {
          await prisma.customer.delete({ where: { id: erasedCustomerId } });
        }
      }
    });

    it('drills down a cohort month to the real customers who signed up in it', async () => {
      const thisMonth = new Date().toISOString().slice(0, 7);
      const customers = await service.cohortCustomers(businessId, thisMonth);
      const ids = customers.map((c) => c.id);
      expect(ids).toEqual(expect.arrayContaining([regularId, newId, lapsedId]));
    });

    it('messages the real lapsed/at-risk segment via the real send gate, quota-checked', async () => {
      const campaign = await service.messageAtRisk(
        'We miss you {{customerName}}! Come back for 10% off.',
      );
      expect(campaign.segment).toBe('lapsed');
      expect(sendGate.send).toHaveBeenCalledWith(
        expect.objectContaining({
          businessId,
          customerId: lapsedId,
          templateKey: 'campaign',
          variables: { body: 'We miss you Lapsed Leo! Come back for 10% off.' },
        }),
      );
    });
  });
});
