import { ClsService } from 'nestjs-cls';
import {
  CommerceExperimentMetric,
  CommerceExperimentStatus,
  CommerceExperimentType,
  OrderStatus,
  OrderType,
  ReturnRefundMethod,
  ReturnStatus,
} from '@prisma/client';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CommerceExperimentsService,
  type ExperimentResults,
} from './commerce-experiments.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

describe('CommerceExperimentsService (MySQL)', () => {
  let prisma: PrismaService;
  let service: CommerceExperimentsService;
  let businessId: string;
  let productId: string;
  let orderNo = 1;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    service = new CommerceExperimentsService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
    );
    businessId = (
      await prisma.business.create({
        data: { name: 'Exp Lab', slug: `exp-lab-${stamp}` },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    productId = (
      await prisma.product.create({
        data: { businessId, name: 'Candle', costPrice: 6, sellingPrice: 10 },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.commerceExperimentAudit.deleteMany({ where: { businessId } });
    await prisma.commerceExperiment.deleteMany({ where: { businessId } });
    const returns = await prisma.return.findMany({
      where: { businessId },
      select: { id: true },
    });
    await prisma.returnItem.deleteMany({
      where: { returnId: { in: returns.map((row) => row.id) } },
    });
    await prisma.return.deleteMany({ where: { businessId } });
    const orders = await prisma.order.findMany({
      where: { businessId },
      select: { id: true },
    });
    await prisma.orderItem.deleteMany({
      where: { orderId: { in: orders.map((row) => row.id) } },
    });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  async function sell(
    qty: number,
    price: number,
    daysAgo: number,
    status: OrderStatus = OrderStatus.completed,
  ) {
    return prisma.order.create({
      data: {
        businessId,
        orderNo: orderNo++,
        orderType: OrderType.online,
        status,
        createdAt: new Date(Date.now() - daysAgo * DAY_MS),
        items: { create: { productId, name: 'Candle', price, cost: 6, qty } },
      },
    });
  }

  function draft(name: string, minMarginPct?: number) {
    return service.create(businessId, 'owner', {
      productId,
      name,
      type: CommerceExperimentType.price,
      hypothesis: 'A higher price will not reduce weekly units much',
      changeDescription: 'Raise price from 10 to 12',
      primaryMetric: CommerceExperimentMetric.revenue,
      minMarginPct,
    });
  }

  it('compares an equal-length baseline with the test window on real orders', async () => {
    // Baseline window (20–10 days ago): 12 units at 10. Test window (last 10 days): 15 units at 12,
    // 3 returned. Cancelled/draft orders must not count.
    await sell(12, 10, 15);
    await sell(15, 12, 5);
    await sell(50, 12, 4, OrderStatus.cancelled);
    await sell(50, 12, 4, OrderStatus.draft);
    const testOrder = await sell(0, 12, 3);
    await prisma.return.create({
      data: {
        businessId,
        orderId: testOrder.id,
        reason: 'Melted',
        refundMethod: ReturnRefundMethod.cash,
        refundAmount: 36,
        status: ReturnStatus.approved,
        items: { create: { productId, qty: 3, amount: 36 } },
      },
    });

    const experiment = await draft('Price +20%', 55);
    await service.start(businessId, 'owner', experiment.id);
    await prisma.commerceExperiment.update({
      where: { id: experiment.id },
      data: { startedAt: new Date(Date.now() - 10 * DAY_MS) },
    });
    await prisma.product.update({
      where: { id: productId },
      data: { sellingPrice: 12 },
    });
    await service.stop(businessId, 'owner', experiment.id);

    const row = (await service.list(businessId)).find(
      (item) => item.id === experiment.id,
    )!;
    const results = row.results as ExperimentResults;
    expect(results.baseline).toMatchObject({ units: 12, revenue: 120 });
    expect(results.test).toMatchObject({
      units: 15,
      revenue: 180,
      grossMarginPct: 50,
      returnedUnits: 3,
      returnRatePct: 20,
    });
    expect(results.primary).toMatchObject({ change: 50, changeUnit: 'pct' });
    expect(results.sufficient).toBe(true);
    expect(results.guardrail).toEqual({
      minMarginPct: 55,
      testMarginPct: 50,
      breached: true,
    });
    expect(row).toMatchObject({
      priceAtStart: 10,
      priceAtStop: 12,
      priceUnchanged: false,
    });

    // Results are frozen at stop: a later sale in the window doesn't change the decided numbers.
    await sell(40, 12, 2);
    const again = (await service.list(businessId)).find(
      (item) => item.id === experiment.id,
    )!;
    expect((again.results as ExperimentResults).test.units).toBe(15);
  });

  it('enforces one running experiment per product and the decision flow', async () => {
    const first = await draft('Bundle test');
    const second = await draft('Photo test');
    await service.start(businessId, 'owner', first.id);
    await expect(
      service.start(businessId, 'owner', second.id),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_EXPERIMENT_PRODUCT_BUSY' },
    });
    await expect(
      service.decide(
        businessId,
        'owner',
        first.id,
        CommerceExperimentStatus.adopted,
        'Looks good',
      ),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_EXPERIMENT_INVALID_TRANSITION' },
    });

    await service.stop(businessId, 'owner', first.id);
    const stopped = (await service.list(businessId)).find(
      (item) => item.id === first.id,
    )!;
    // Stopped straight away: not enough days or units for a read, and the price never changed.
    expect((stopped.results as ExperimentResults).sufficient).toBe(false);
    expect(
      (stopped.results as ExperimentResults).insufficientReasons.length,
    ).toBeGreaterThan(0);
    expect(stopped.priceUnchanged).toBe(true);

    await expect(
      service.decide(
        businessId,
        'owner',
        first.id,
        CommerceExperimentStatus.inconclusive,
        ' ',
      ),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_EXPERIMENT_NOTE_REQUIRED' },
    });
    await service.decide(
      businessId,
      'owner',
      first.id,
      CommerceExperimentStatus.inconclusive,
      'Not enough sales to tell',
    );
    await service.start(businessId, 'owner', second.id); // product is free again
    await expect(
      service.removeDraft(businessId, 'owner', second.id),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_EXPERIMENT_INVALID_TRANSITION' },
    });

    expect(await service.summary(businessId)).toMatchObject({
      running: 1,
      awaitingDecision: 1,
      inconclusive: 1,
    });
    const audits = await prisma.commerceExperimentAudit.findMany({
      where: { businessId, experimentId: first.id },
    });
    expect(audits.map((row) => row.action).sort()).toEqual([
      'created',
      'decided_inconclusive',
      'started',
      'stopped',
    ]);
  });
});
