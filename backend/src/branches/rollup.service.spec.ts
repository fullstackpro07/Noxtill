import { PrismaService } from '../prisma/prisma.service';
import { RollupService } from './rollup.service';

describe('RollupService (BE-059)', () => {
  let prisma: PrismaService;
  let service: RollupService;
  let parentId: string;
  let branchId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new RollupService(prisma);

    const parent = await prisma.business.create({
      data: { name: 'HQ', slug: `rollup-hq-${Date.now()}` },
    });
    parentId = parent.id;

    const branch = await prisma.business.create({
      data: {
        name: 'Downtown Branch',
        slug: `rollup-branch-${Date.now()}`,
        parentId,
      },
    });
    branchId = branch.id;

    const today = new Date().toISOString().slice(0, 10);
    await prisma.order.create({
      data: {
        businessId: parentId,
        orderNo: 1,
        status: 'completed',
        orderType: 'counter',
        total: 100,
        subtotal: 100,
        cogs: 40,
        createdAt: new Date(`${today}T09:00:00Z`),
      },
    });
    await prisma.order.create({
      data: {
        businessId: branchId,
        orderNo: 1,
        status: 'completed',
        orderType: 'counter',
        total: 300,
        subtotal: 300,
        cogs: 100,
        createdAt: new Date(`${today}T09:00:00Z`),
      },
    });

    await prisma.externalReview.createMany({
      data: [
        { businessId: branchId, platform: 'google', externalId: `rollup-rev-1-${Date.now()}`, stars: 5 },
        { businessId: branchId, platform: 'google', externalId: `rollup-rev-2-${Date.now()}`, stars: 3 },
      ],
    });
  });

  afterAll(async () => {
    await prisma.externalReview.deleteMany({
      where: { businessId: { in: [parentId, branchId] } },
    });
    await prisma.order.deleteMany({
      where: { businessId: { in: [parentId, branchId] } },
    });
    await prisma.business.delete({ where: { id: branchId } });
    await prisma.business.delete({ where: { id: parentId } });
    await prisma.$disconnect();
  });

  it('rolls up combined totals across parent + branches, from either side of the group', async () => {
    const fromParent = await service.dashboard(parentId);
    expect(fromParent.totals.revenue).toBe(400);
    expect(fromParent.branches.map((b) => b.businessId).sort()).toEqual(
      [parentId, branchId].sort(),
    );

    const fromBranch = await service.dashboard(branchId);
    expect(fromBranch.totals.revenue).toBe(400);
  });

  it('includes each branch\'s average review rating, null when it has none', async () => {
    const result = await service.dashboard(parentId);
    const branchRow = result.branches.find((b) => b.businessId === branchId)!;
    const parentRow = result.branches.find((b) => b.businessId === parentId)!;
    expect(branchRow.reviewAvg).toBe(4);
    expect(parentRow.reviewAvg).toBeNull();
  });

  it('returns a per-branch weekly comparison series', async () => {
    const compare = await service.compare(parentId, 4);
    expect(compare).toHaveLength(2);
    const branchRow = compare.find((r) => r.businessId === branchId)!;
    expect(branchRow.weeks.length).toBeGreaterThan(0);
    expect(branchRow.weeks[0].revenue).toBe(300);
  });
});
