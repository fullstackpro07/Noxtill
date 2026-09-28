import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BranchScopeService } from '../common/tenancy/branch-scope.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import type { NotificationsService } from '../notifications/notifications.service';
import { BrainContextService } from './brain-context.service';
import { BrainMetricsService } from './brain-metrics.service';
import { BrainDetectorsService } from './brain-detectors.service';
import { BrainReadingService } from './brain-reading.service';
import { BrainDecisionsService } from './brain-decisions.service';
import { BrainWatchService } from './brain-watch.service';

const DAY = 86_400_000;

describe('Business Brain (real DB)', () => {
  let prisma: PrismaService;
  let businessId: string;
  let ownerId: string;
  let owner: AuthenticatedUser;
  let fastId: string;
  let costlessId: string;
  let context: BrainContextService;
  let detectors: BrainDetectorsService;
  let reading: BrainReadingService;
  let decisions: BrainDecisionsService;
  let watches: BrainWatchService;
  const notifications = { create: jest.fn().mockResolvedValue(null) };

  const findings = async () => {
    const ctx = await context.build(owner, {});
    const data = await detectors.read(ctx);
    return reading.visibleFindings(ctx, data);
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const metrics = new BrainMetricsService(prisma);
    context = new BrainContextService(prisma, new BranchScopeService(prisma));
    detectors = new BrainDetectorsService(prisma, metrics);
    reading = new BrainReadingService(prisma, detectors);
    decisions = new BrainDecisionsService(prisma);
    watches = new BrainWatchService(
      prisma,
      metrics,
      notifications as unknown as NotificationsService,
    );

    const stamp = Date.now();
    const business = await prisma.business.create({
      data: {
        name: 'Brain Test Biz',
        slug: `brain-test-${stamp}`,
        currency: 'PKR',
        timezone: 'UTC',
      },
    });
    businessId = business.id;
    const o = await prisma.user.create({
      data: {
        name: 'Olivia Owner',
        email: `brain-owner-${stamp}@example.com`,
        passwordHash: 'x',
      },
    });
    ownerId = o.id;
    await prisma.businessUser.create({
      data: { businessId, userId: ownerId, role: Role.owner },
    });
    owner = { sub: ownerId, businessId, role: Role.owner, capabilities: [] };

    // Sells 10 a day for two weeks and has 12 left: under two days of cover.
    const fast = await prisma.product.create({
      data: {
        businessId,
        name: 'Fast Seller',
        costPrice: 50,
        sellingPrice: 100,
        stockQty: 12,
      },
    });
    fastId = fast.id;
    // Sold this month with no cost price.
    const costless = await prisma.product.create({
      data: {
        businessId,
        name: 'No Cost Item',
        costPrice: 0,
        sellingPrice: 40,
        stockQty: 500,
      },
    });
    costlessId = costless.id;

    for (let i = 0; i < 14; i++) {
      await prisma.order.create({
        data: {
          businessId,
          orderNo: i + 1,
          status: 'completed',
          orderType: 'counter',
          subtotal: 1040,
          total: 1040,
          cogs: 500,
          createdAt: new Date(Date.now() - (i + 0.5) * DAY),
          items: {
            create: [
              {
                productId: fastId,
                name: 'Fast Seller',
                price: 100,
                cost: 50,
                qty: 10,
              },
              {
                productId: costlessId,
                name: 'No Cost Item',
                price: 40,
                cost: 0,
                qty: 1,
              },
            ],
          },
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.brainWatch.deleteMany({ where: { businessId } });
    await prisma.brainDecision.deleteMany({ where: { businessId } });
    await prisma.brainFindingState.deleteMany({ where: { businessId } });
    await prisma.brainSnapshot.deleteMany({ where: { businessId } });
    await prisma.orderItem.deleteMany({ where: { order: { businessId } } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('raises a stock run-out from the real 14-day sales rate, and blocks the reorder when no supplier is on record', async () => {
    const f = (await findings()).find(
      (x) => x.key === `stock_runout:${fastId}`,
    );
    expect(f).toBeDefined();
    expect(f!.action?.type).toBe('reorder_draft');
    expect(f!.action?.blockedReason).toMatch(/No supplier/);
  });

  it('flags products sold with no cost price instead of counting them as pure profit', async () => {
    const all = await findings();
    const f = all.find((x) => x.key === 'missing_costs');
    expect(f).toBeDefined();
    expect(f!.t).toMatch(/1 product/);
    // Nothing is raised about the healthy, well-stocked product.
    expect(all.some((x) => x.key === `stock_runout:${costlessId}`)).toBe(false);
  });

  it('hides a dismissed finding, logs the reason, and brings it back on restore', async () => {
    await decisions.setState(
      owner,
      'missing_costs',
      'dismissed',
      'No cost price',
      'Being fixed',
    );
    expect((await findings()).some((x) => x.key === 'missing_costs')).toBe(
      false,
    );
    const log = await prisma.brainDecision.findFirst({
      where: { businessId, findingKey: 'missing_costs', decision: 'dismissed' },
    });
    expect(log?.reason).toBe('Being fixed');

    await decisions.restore(owner, 'missing_costs');
    expect((await findings()).some((x) => x.key === 'missing_costs')).toBe(
      true,
    );
  });

  it('trips a stock watch on the real stock figure and notifies once', async () => {
    notifications.create.mockClear();
    await watches.create(owner, {
      metric: 'product_stock',
      subjectId: fastId,
      op: 'lt',
      threshold: 20,
    });
    await watches.tick(businessId);
    await watches.tick(businessId);
    expect(notifications.create).toHaveBeenCalledTimes(1);
    const w = await prisma.brainWatch.findFirst({ where: { businessId } });
    expect(w?.status).toBe('triggered');
    expect(Number(w?.lastValue)).toBe(12);
  });
});
