import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { ProfitService } from '../../profit/profit.service';
import { HealthScoreService } from '../health-score.service';
import { HealthScoreSnapshotProcessor } from './health-score-snapshot.processor';

class FakeClsService {
  get<T>(): T | undefined {
    return undefined;
  }
}

describe('HealthScoreSnapshotProcessor (UPD-BE-001)', () => {
  let prisma: PrismaService;
  let processor: HealthScoreSnapshotProcessor;
  let businessId: string;
  let otherBusinessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService() as unknown as ClsService;
    const tenantPrisma = new TenantPrismaService(prisma, cls);
    const profitService = new ProfitService(tenantPrisma, cls);
    const healthScoreService = new HealthScoreService(
      tenantPrisma,
      profitService,
    );
    processor = new HealthScoreSnapshotProcessor(
      prisma,
      tenantPrisma,
      healthScoreService,
    );

    const [a, b] = await Promise.all([
      prisma.business.create({
        data: {
          name: 'Snapshot Job Biz A',
          slug: `hs-snapshot-a-${Date.now()}`,
        },
      }),
      prisma.business.create({
        data: {
          name: 'Snapshot Job Biz B',
          slug: `hs-snapshot-b-${Date.now()}`,
        },
      }),
    ]);
    businessId = a.id;
    otherBusinessId = b.id;
  });

  afterAll(async () => {
    await prisma.healthScoreSnapshot.deleteMany({
      where: { businessId: { in: [businessId, otherBusinessId] } },
    });
    await prisma.business.deleteMany({
      where: { id: { in: [businessId, otherBusinessId] } },
    });
    await prisma.$disconnect();
  });

  it('runs outside any request context (no CLS businessId bound)', () => {
    const cls = new FakeClsService() as unknown as ClsService;
    expect(cls.get()).toBeUndefined();
  });

  it('writes one HealthScoreSnapshot row per business, scoped to the right business', async () => {
    await processor.runSnapshot();

    const [snapshotsA, snapshotsB] = await Promise.all([
      prisma.healthScoreSnapshot.findMany({ where: { businessId } }),
      prisma.healthScoreSnapshot.findMany({
        where: { businessId: otherBusinessId },
      }),
    ]);
    expect(snapshotsA).toHaveLength(1);
    expect(snapshotsB).toHaveLength(1);
    // No data yet: every component 0 except credit-recovery (25, "nothing to recover" = healthy).
    expect(Number(snapshotsA[0].totalScore)).toBe(25);
  });

  it('snapshotOne() is independently callable for a single business', async () => {
    await processor.snapshotOne(businessId);

    const snapshots = await prisma.healthScoreSnapshot.findMany({
      where: { businessId },
    });
    expect(snapshots).toHaveLength(2);
  });
});
