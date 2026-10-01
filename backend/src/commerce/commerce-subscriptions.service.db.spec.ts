import { ClsService } from 'nestjs-cls';
import {
  CommercePreorderCampaignStatus,
  CommerceSubscriptionCycleStatus,
  CommerceSubscriptionInterval,
  CommerceWorkOrderStatus,
  OrderStatus,
} from '@prisma/client';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import type { OrdersService } from '../orders/orders.service';
import {
  CommerceSubscriptionsService,
  monthlyValue,
  nextRenewalDate,
} from './commerce-subscriptions.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

const DAY = 24 * 60 * 60 * 1000;

describe('subscription date and value helpers', () => {
  it('keeps the day of month, clamped to short months', () => {
    expect(
      nextRenewalDate(
        new Date('2026-01-31T09:00:00Z'),
        CommerceSubscriptionInterval.month,
        1,
      ).toISOString(),
    ).toBe('2026-02-28T09:00:00.000Z');
    expect(
      nextRenewalDate(
        new Date('2026-03-10T00:00:00Z'),
        CommerceSubscriptionInterval.week,
        2,
      ).toISOString(),
    ).toBe('2026-03-24T00:00:00.000Z');
  });

  it('converts cycles to a monthly equivalent', () => {
    expect(monthlyValue(10, 1, CommerceSubscriptionInterval.month, 1)).toBe(10);
    expect(monthlyValue(12, 1, CommerceSubscriptionInterval.week, 1)).toBe(52);
  });
});

describe('CommerceSubscriptionsService (MySQL)', () => {
  let prisma: PrismaService;
  let service: CommerceSubscriptionsService;
  let createOrder: jest.Mock;
  let businessId: string;
  let customerId: string;
  let productId: string;
  let orderNo = 1;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    businessId = (
      await prisma.business.create({
        data: { name: 'Subs Test', slug: `subs-${stamp}` },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    // Stand-in for OrdersService.createOrder: records the call and writes a minimal real order.
    createOrder = jest
      .fn()
      .mockImplementation(async (bizId: string, dto: { customerId?: string }) =>
        prisma.order.create({
          data: {
            businessId: bizId,
            orderNo: orderNo++,
            customerId: dto.customerId,
            status: OrderStatus.pending,
          },
        }),
      );
    service = new CommerceSubscriptionsService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
      { createOrder } as unknown as OrdersService,
    );
    customerId = (
      await prisma.customer.create({
        data: { businessId, name: 'Sam', phone: `+1555${stamp}` },
      })
    ).id;
    productId = (
      await prisma.product.create({
        data: {
          businessId,
          name: 'Coffee beans',
          sellingPrice: 12,
          stockQty: 4,
        },
      })
    ).id;
  });

  afterEach(async () => {
    createOrder.mockClear();
    await prisma.commerceSubscriptionAudit.deleteMany({
      where: { businessId },
    });
    await prisma.commerceSubscription.deleteMany({ where: { businessId } });
    await prisma.commerceSubscriptionPlan.deleteMany({ where: { businessId } });
    await prisma.commercePreorderCampaign.deleteMany({ where: { businessId } });
    await prisma.commerceWorkOrder.deleteMany({ where: { businessId } });
    await prisma.commerceBom.deleteMany({ where: { businessId } });
    await prisma.order.deleteMany({ where: { businessId } });
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  async function subscription(
    firstRenewalAt: Date,
    pricePerUnit: number | null = 10,
  ) {
    const plan = await service.createPlan(businessId, 'owner', {
      name: `Monthly beans ${Math.random()}`,
      productId,
      qtyPerCycle: 2,
      interval: CommerceSubscriptionInterval.month,
      pricePerUnit,
    });
    return service.subscribe(businessId, 'owner', {
      planId: plan.id,
      customerId,
      firstRenewalAt: firstRenewalAt.toISOString(),
    });
  }

  it('creates one unpaid canonical order per due renewal and never twice', async () => {
    const due = new Date(Date.now() - DAY);
    const sub = await subscription(new Date(Date.now() + 5 * DAY));
    await expect(
      service.processRenewal(businessId, 'owner', sub.id),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_SUBSCRIPTION_NOT_DUE' },
    });

    await prisma.commerceSubscription.update({
      where: { id: sub.id },
      data: { nextRenewalAt: due },
    });
    const result = await service.processRenewal(businessId, 'owner', sub.id);
    expect(result.status).toBe(CommerceSubscriptionCycleStatus.order_created);
    expect(createOrder).toHaveBeenCalledWith(
      businessId,
      expect.objectContaining({
        customerId,
        paymentMethod: 'unpaid',
        items: [{ productId, qty: 2, priceOverride: 10 }],
      }),
    );
    const updated = await prisma.commerceSubscription.findUniqueOrThrow({
      where: { id: sub.id },
    });
    expect(updated.nextRenewalAt.getTime()).toBe(
      nextRenewalDate(due, CommerceSubscriptionInterval.month, 1).getTime(),
    );

    // Rewind to the same due date: the cycle is already claimed.
    await prisma.commerceSubscription.update({
      where: { id: sub.id },
      data: { nextRenewalAt: due },
    });
    await expect(
      service.processRenewal(businessId, 'owner', sub.id),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_SUBSCRIPTION_ALREADY_PROCESSED' },
    });
    expect(createOrder).toHaveBeenCalledTimes(1);
  });

  it('skips a cycle without an order and releases the claim when order creation fails', async () => {
    const sub = await subscription(new Date(Date.now() - DAY), null);
    await service.toggleSkip(businessId, 'owner', sub.id, true);
    const skipped = await service.processRenewal(businessId, 'owner', sub.id);
    expect(skipped.status).toBe(CommerceSubscriptionCycleStatus.skipped);
    expect(createOrder).not.toHaveBeenCalled();
    expect(
      (
        await prisma.commerceSubscription.findUniqueOrThrow({
          where: { id: sub.id },
        })
      ).skipNextCycle,
    ).toBe(false);

    const second = await subscription(new Date(Date.now() - DAY), null);
    createOrder.mockRejectedValueOnce(new Error('out of stock'));
    await expect(
      service.processRenewal(businessId, 'owner', second.id),
    ).rejects.toThrow('out of stock');
    expect(
      await prisma.commerceSubscriptionCycle.count({
        where: { subscriptionId: second.id },
      }),
    ).toBe(0);
    const retried = await service.processRenewal(
      businessId,
      'owner',
      second.id,
    );
    expect(retried.status).toBe(CommerceSubscriptionCycleStatus.order_created);
    // Null plan price → the canonical product price applies (no override sent).
    expect(createOrder).toHaveBeenLastCalledWith(
      businessId,
      expect.objectContaining({ items: [{ productId, qty: 2 }] }),
    );
  });

  it('caps pre-order reservations and only fulfils released campaigns', async () => {
    const campaign = await service.createCampaign(businessId, 'owner', {
      productId,
      name: 'Holiday blend',
      promisedDate: new Date(Date.now() + 20 * DAY).toISOString(),
      maxUnits: 5,
    });
    const first = await service.reserve(businessId, 'owner', campaign.id, {
      customerId,
      qty: 3,
    });
    await expect(
      service.reserve(businessId, 'owner', campaign.id, { customerId, qty: 3 }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_PREORDER_CAPACITY_EXCEEDED' },
    });
    await service.reserve(businessId, 'owner', campaign.id, {
      customerId,
      qty: 2,
    });
    await service.cancelPreorder(
      businessId,
      'owner',
      first.id,
      'Customer changed mind',
    );
    expect(
      (
        await prisma.commercePreorderCampaign.findUniqueOrThrow({
          where: { id: campaign.id },
        })
      ).reservedUnits,
    ).toBe(2);

    const [, second] = await prisma.commercePreorder.findMany({
      where: { campaignId: campaign.id },
      orderBy: { createdAt: 'asc' },
    });
    await expect(
      service.fulfillPreorder(businessId, 'owner', second.id),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_SUBSCRIPTION_INVALID_STATE' },
    });
    await service.setCampaignStatus(
      businessId,
      'owner',
      campaign.id,
      CommercePreorderCampaignStatus.released,
    );
    const fulfilled = await service.fulfillPreorder(
      businessId,
      'owner',
      second.id,
    );
    expect(fulfilled.orderId).toBeTruthy();
    await expect(
      service.fulfillPreorder(businessId, 'owner', second.id),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_SUBSCRIPTION_INVALID_STATE' },
    });
  });

  it('flags promise risk from real stock and production due before the promise', async () => {
    const promised = new Date(Date.now() + 20 * DAY);
    const campaign = await service.createCampaign(businessId, 'owner', {
      productId,
      name: 'Limited roast',
      promisedDate: promised.toISOString(),
    });
    await service.reserve(businessId, 'owner', campaign.id, {
      customerId,
      qty: 10,
    });
    let [row] = await service.listCampaigns(businessId);
    expect(row).toMatchObject({
      risk: 'supply_short',
      supply: { inStock: 4, incomingBeforePromise: 0 },
    });

    const bom = await prisma.commerceBom.create({
      data: { businessId, productId, version: 1 },
    });
    await prisma.commerceWorkOrder.create({
      data: {
        businessId,
        number: 1,
        bomId: bom.id,
        productId,
        qtyPlanned: 8,
        status: CommerceWorkOrderStatus.planned,
        dueDate: new Date(Date.now() + 10 * DAY),
        estimatedCost: 0,
      },
    });
    [row] = await service.listCampaigns(businessId);
    expect(row).toMatchObject({
      risk: 'on_track',
      supply: { incomingBeforePromise: 8, workOrders: ['WO-1'] },
    });

    await service.changePromiseDate(
      businessId,
      'owner',
      campaign.id,
      new Date(Date.now() - DAY).toISOString(),
      'Supplier delay',
    );
    [row] = await service.listCampaigns(businessId);
    expect(row.risk).toBe('past_promise');
    expect(row.preorders[0].promiseChanged).toBe(true);
  });
});
