import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ProfitService } from '../profit/profit.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { HealthScoreService, HealthScoreReady } from './health-score.service';
import { DEFAULT_HEALTH_SCORE_WEIGHTS } from './dashboard.constants';

function assertReady(
  result: Awaited<ReturnType<HealthScoreService['getScore']>>,
): asserts result is HealthScoreReady {
  if (result.building) {
    throw new Error('Expected a ready score, got the "building" status');
  }
}

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('HealthScoreService (UPD-BE-001)', () => {
  let prisma: PrismaService;
  let service: HealthScoreService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const profitService = new ProfitService(
      tenantPrisma,
      cls as unknown as ClsService,
      { complete: jest.fn() } as unknown as AiInfraService,
    );
    service = new HealthScoreService(tenantPrisma, profitService);

    const business = await prisma.business.create({
      data: {
        name: 'Health Score Test Biz',
        slug: `health-score-test-${Date.now()}`,
        // UPD-BE-001e: backdated past the "building" threshold so these tests exercise real
        // score computation, not the <14-day guard — that guard gets its own dedicated test below.
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.healthScoreWeightChange.deleteMany({ where: { businessId } });
    await prisma.healthScoreSnapshot.deleteMany({ where: { businessId } });
    await prisma.creditEntry.deleteMany({ where: { businessId } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.expense.deleteMany({ where: { businessId } });
    await prisma.externalReview.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('defaults weights to 25 each when the business has never customized them', async () => {
    const weights = await service.getWeights(businessId);
    expect(weights).toEqual(DEFAULT_HEALTH_SCORE_WEIGHTS);
  });

  it('rejects a weight update that does not sum to 100', async () => {
    await expect(
      service.updateWeights(businessId, {
        ratingTrend: 40,
        repeatCustomerRate: 40,
        margin: 40,
        creditRecovery: 40,
      }),
    ).rejects.toThrow('Weights must sum to 100');
  });

  it('persists a valid weight update and reflects it on the next read', async () => {
    const custom = {
      ratingTrend: 40,
      repeatCustomerRate: 20,
      margin: 20,
      creditRecovery: 20,
    };
    const result = await service.updateWeights(businessId, custom);
    expect(result).toEqual(custom);

    const stored = await service.getWeights(businessId);
    expect(stored).toEqual(custom);

    // Reset to equal weighting so the remaining tests use predictable 0-25 contributions.
    await service.updateWeights(businessId, DEFAULT_HEALTH_SCORE_WEIGHTS);
  });

  it('scores 0 for every component when the business has no data yet', async () => {
    const result = await service.getScore(businessId);
    assertReady(result);
    // Every component is 0 except credit-recovery, which treats "no credit ever extended" as
    // healthy (25) rather than penalising a business with nothing to recover from.
    expect(result.score).toBe(25);
    expect(result.components.ratingTrend).toBe(0);
    expect(result.components.repeatCustomerRate).toBe(0);
    expect(result.components.margin).toBe(0);
    // No credit ever extended is scored as healthy, not penalised.
    expect(result.components.creditRecovery).toBe(25);
  });

  it('computes the rating-trend component from real ExternalReview rows', async () => {
    await prisma.externalReview.createMany({
      data: [
        { businessId, platform: 'google', externalId: 'r1', stars: 5 },
        { businessId, platform: 'google', externalId: 'r2', stars: 5 },
        { businessId, platform: 'google', externalId: 'r3', stars: 4 },
      ],
    });

    const result = await service.getScore(businessId);
    assertReady(result);
    // avg = 4.667 stars -> (4.667/5)*100 = 93.33 raw -> *25% weight = 23.33
    expect(result.components.ratingTrend).toBeCloseTo(23.33, 1);
  });

  it('computes the repeat-customer-rate component from real Customer visitCount', async () => {
    await prisma.customer.createMany({
      data: [
        { businessId, name: 'One Visit', phone: '+10000000001', visitCount: 1 },
        {
          businessId,
          name: 'Two Visits',
          phone: '+10000000002',
          visitCount: 2,
        },
        {
          businessId,
          name: 'Five Visits',
          phone: '+10000000003',
          visitCount: 5,
        },
        { businessId, name: 'No Visits', phone: '+10000000004', visitCount: 0 },
      ],
    });

    const result = await service.getScore(businessId);
    assertReady(result);
    // 3 customers with >=1 visit, 2 of them repeat (>1) -> 66.67 raw -> *25% weight = 16.67
    expect(result.components.repeatCustomerRate).toBeCloseTo(16.67, 1);
  });

  it('computes the margin component from real completed orders via ProfitService', async () => {
    await prisma.order.create({
      data: {
        businessId,
        orderNo: 1,
        status: 'completed',
        subtotal: 1000,
        total: 1000,
        cogs: 700,
      },
    });

    const result = await service.getScore(businessId);
    assertReady(result);
    // revenue 1000, cogs 700, no expenses -> netProfit 300 -> margin 30% -> clamp(30/25*100,0,100)=100 raw -> *25% = 25
    expect(result.components.margin).toBe(25);
  });

  it('computes the credit-recovery component from real CreditEntry rows', async () => {
    const customer = await prisma.customer.create({
      data: { businessId, name: 'Credit Customer', phone: '+10000000005' },
    });
    await prisma.creditEntry.createMany({
      data: [
        { businessId, customerId: customer.id, kind: 'credit', amount: 100 },
        { businessId, customerId: customer.id, kind: 'payment', amount: 50 },
      ],
    });

    const result = await service.getScore(businessId);
    assertReady(result);
    // 50 recovered / 100 extended = 50 raw -> *25% weight = 12.5
    expect(result.components.creditRecovery).toBe(12.5);
  });

  it('returns weekly history from real HealthScoreSnapshot rows, oldest first', async () => {
    const older = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const newer = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await prisma.healthScoreSnapshot.createMany({
      data: [
        {
          businessId,
          ratingTrendScore: 10,
          repeatCustomerScore: 10,
          marginScore: 10,
          creditRecoveryScore: 10,
          totalScore: 40,
          capturedAt: older,
        },
        {
          businessId,
          ratingTrendScore: 20,
          repeatCustomerScore: 20,
          marginScore: 20,
          creditRecoveryScore: 20,
          totalScore: 80,
          capturedAt: newer,
        },
      ],
    });

    const result = await service.getScore(businessId);
    assertReady(result);
    expect(result.history).toHaveLength(2);
    expect(result.history[0].totalScore).toBe(40);
    expect(result.history[1].totalScore).toBe(80);
  });

  it('defaults to a 3-month period and widens the snapshot window for 6/12 months', async () => {
    const threeMonths = await service.getScore(businessId);
    assertReady(threeMonths);
    expect(threeMonths.periodMonths).toBe(3);

    const twelveMonths = await service.getScore(businessId, '12');
    assertReady(twelveMonths);
    expect(twelveMonths.periodMonths).toBe(12);

    // An unrecognised value falls back to the 3-month default rather than erroring.
    const invalid = await service.getScore(businessId, 'not-a-number');
    assertReady(invalid);
    expect(invalid.periodMonths).toBe(3);
  });

  it('logs a real before/after entry to the change log on every weight update', async () => {
    const before = await service.getScore(businessId);
    assertReady(before);

    await service.updateWeights(
      businessId,
      {
        ratingTrend: 40,
        repeatCustomerRate: 20,
        margin: 20,
        creditRecovery: 20,
      },
      'user-123',
    );

    const after = await service.getScore(businessId);
    assertReady(after);
    expect(after.changeLog.length).toBeGreaterThanOrEqual(1);
    const latest = after.changeLog[0];
    expect(latest.oldScore).toBe(before.score);
    expect(latest.newWeights).toEqual({
      ratingTrend: 40,
      repeatCustomerRate: 20,
      margin: 20,
      creditRecovery: 20,
    });

    // Reset to equal weighting so no other test in this file is affected by ordering.
    await service.updateWeights(businessId, DEFAULT_HEALTH_SCORE_WEIGHTS);
  });

  it('returns a "building" status instead of a real score for a business under 14 days old', async () => {
    const newBusiness = await prisma.business.create({
      data: {
        name: 'Brand New Biz',
        slug: `health-score-new-${Date.now()}`,
        // createdAt defaults to now — genuinely under the 14-day threshold.
      },
    });
    try {
      const result = await service.getScore(newBusiness.id);
      expect(result.building).toBe(true);
      expect(result.score).toBeNull();
      expect(result.components).toBeNull();
      if (result.building) {
        expect(result.daysUntilReady).toBeGreaterThan(0);
        expect(result.daysUntilReady).toBeLessThanOrEqual(14);
      }
    } finally {
      await prisma.business.delete({ where: { id: newBusiness.id } });
    }
  });
});
