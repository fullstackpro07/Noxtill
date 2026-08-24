import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ReputationScoreService } from './reputation-score.service';
import { REPUTATION_TREND_WEEKS } from './reviews.constants';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('ReputationScoreService (UPD-BE-103)', () => {
  let prisma: PrismaService;
  let service: ReputationScoreService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new ReputationScoreService(tenantPrisma);

    const business = await prisma.business.create({
      data: { name: 'Reputation Test Biz', slug: `reputation-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.externalReview.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('scores 0 across rating/volume/recency with no reviews at all, and 100 on response-rate (nothing to reply to)', async () => {
    const result = await service.getScore();
    expect(result.components.rating).toBe(0);
    expect(result.components.volume).toBe(0);
    expect(result.components.recency).toBe(0);
    expect(result.components.responseRate).toBe(25); // 100 raw * 25/100 weight
    expect(result.score).toBe(25);
    expect(result.trend).toHaveLength(REPUTATION_TREND_WEEKS);
  });

  it('scores a real composite once reviews exist: high rating + replied = strong score', async () => {
    await prisma.externalReview.createMany({
      data: [
        { businessId, platform: 'google', externalId: `rep-a-${Date.now()}`, stars: 5, repliedAt: new Date() },
        { businessId, platform: 'google', externalId: `rep-b-${Date.now()}`, stars: 5, repliedAt: new Date() },
      ],
    });

    const result = await service.getScore();
    expect(result.components.rating).toBe(25); // 5/5 = 100 raw
    expect(result.components.responseRate).toBe(25); // 2/2 replied = 100 raw
    expect(result.score).toBeGreaterThan(50);
  });

  it('a stale business (last review long ago) scores low on recency even with a perfect rating', async () => {
    await prisma.externalReview.deleteMany({ where: { businessId } });
    await prisma.externalReview.create({
      data: {
        businessId,
        platform: 'google',
        externalId: `rep-stale-${Date.now()}`,
        stars: 5,
        createdAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000),
      },
    });

    const result = await service.getScore();
    expect(result.components.rating).toBe(25);
    expect(result.components.recency).toBe(0);
  });

  it('reconstructs trend history honestly from real review timestamps, without fabricating data for weeks with none', async () => {
    await prisma.externalReview.deleteMany({ where: { businessId } });
    const now = new Date();
    await prisma.externalReview.create({
      data: {
        businessId,
        platform: 'google',
        externalId: `rep-trend-${Date.now()}`,
        stars: 5,
        createdAt: now,
      },
    });

    const trend = await service.getTrend(now);
    expect(trend).toHaveLength(REPUTATION_TREND_WEEKS);
    // The oldest week-point predates the review's creation, so it must not count it yet.
    expect(trend[0].totalScore).toBeLessThan(trend[trend.length - 1].totalScore);
  });
});
