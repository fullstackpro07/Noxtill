import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ActivityPubSubService } from '../activity/activity-pubsub.service';
import { ActivityService } from '../activity/activity.service';
import { DeliverySettingsService } from './delivery-settings.service';
import { RidersService } from './riders.service';
import { RoutingService } from './routing.service';
import { DeliveryOverviewService } from './delivery-overview.service';
import { ConfigService } from '@nestjs/config';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('DeliveryOverviewService (delivery module redesign)', () => {
  let prisma: PrismaService;
  let service: DeliveryOverviewService;
  let businessId: string;
  let orderNo = 1;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const activity = new ActivityService(tenantPrisma, {
      publish: jest.fn(),
    } as unknown as ActivityPubSubService);
    const riders = new RidersService(
      tenantPrisma,
      { publish: jest.fn() } as unknown as ActivityPubSubService,
      activity,
      new DeliverySettingsService(tenantPrisma),
    );
    service = new DeliveryOverviewService(
      tenantPrisma,
      new DeliverySettingsService(tenantPrisma),
      riders,
      new RoutingService(new ConfigService()),
    );

    const business = await prisma.business.create({
      data: { name: 'Overview Test Biz', slug: `overview-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.activityEvent.deleteMany({ where: { businessId } });
    await prisma.delivery.deleteMany({ where: { businessId } });
    await prisma.payment.deleteMany({ where: { order: { businessId } } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.rider.deleteMany({ where: { businessId } });
    await prisma.deliveryZone.deleteMany({ where: { businessId } });
    await prisma.deliverySettings.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  async function makeOrder(total: number) {
    return prisma.order.create({
      data: {
        businessId,
        orderNo: orderNo++,
        orderType: 'delivery',
        status: 'pending',
        total,
      },
    });
  }

  it('kpis() shows no fee/cost figure until a delivered order really carries one, then the real sums', async () => {
    const before = await service.kpis(businessId);
    expect(before.find((k) => k.l === 'Delivery fees taken')?.v).toBe(
      'None quoted',
    );
    expect(before.find((k) => k.l === 'What delivery cost you')?.v).toBe(
      'Not configured',
    );

    const order = await makeOrder(900);
    await prisma.delivery.create({
      data: {
        businessId,
        orderId: order.id,
        addressLine: 'Fee Street',
        status: 'delivered',
        deliveredAt: new Date(),
        deliveryFee: 250,
        deliveryCost: 180,
      },
    });
    const after = await service.kpis(businessId);
    expect(after.find((k) => k.l === 'Delivery fees taken')?.v).toBe('Rs. 250');
    expect(after.find((k) => k.l === 'What delivery cost you')?.v).toBe(
      'Rs. 180',
    );
  });

  it('kpis() counts a real unassigned delivery as "waiting for a rider"', async () => {
    const order = await makeOrder(1000);
    await prisma.delivery.create({
      data: { businessId, orderId: order.id, addressLine: '1 Test Street' },
    });
    const kpis = await service.kpis(businessId);
    const waiting = kpis.find((k) => k.l === 'Waiting for a rider');
    expect(Number(waiting?.v)).toBeGreaterThanOrEqual(1);
  });

  it('intel() flags a rider over the configured cash limit using their real held cash, not an estimate', async () => {
    await prisma.deliverySettings.upsert({
      where: { businessId },
      create: { businessId, cashLimitAmount: 100 },
      update: { cashLimitAmount: 100 },
    });
    const rider = await prisma.rider.create({
      data: { businessId, name: 'Cash Rider', phone: '0300', status: 'active' },
    });
    const order = await makeOrder(500);
    await prisma.delivery.create({
      data: {
        businessId,
        orderId: order.id,
        addressLine: '2 Test Street',
        riderId: rider.id,
        status: 'delivered',
        deliveredAt: new Date(),
      },
    });
    await prisma.payment.create({
      data: { orderId: order.id, method: 'cash', amount: 500 },
    });

    const intel = await service.intel(businessId);
    const cashFlag = intel.find((i) => i.kind === 'Cash');
    expect(cashFlag).toBeDefined();
    expect(cashFlag?.ev).toContain('500');
  });

  it('queue() suggests a rider only from real active-status riders, never a fabricated name', async () => {
    const order = await makeOrder(2000);
    await prisma.delivery.create({
      data: { businessId, orderId: order.id, addressLine: '3 Test Street' },
    });
    const queue = await service.queue(businessId);
    for (const row of queue) {
      if (row.rider) {
        const rider = await prisma.rider.findFirst({
          where: { businessId, name: row.rider, status: 'active' },
        });
        expect(rider).not.toBeNull();
      }
    }
  });

  it('queue() priority follows the owner settings: urgent after N minutes, high value from an amount, off when blank', async () => {
    await prisma.deliverySettings.upsert({
      where: { businessId },
      create: { businessId, urgentAfterMinutes: 5, highValueAmount: 5000 },
      update: { urgentAfterMinutes: 5, highValueAmount: 5000 },
    });
    const big = await makeOrder(9000);
    await prisma.delivery.create({
      data: { businessId, orderId: big.id, addressLine: 'Big St' },
    });
    const old = await makeOrder(100);
    await prisma.delivery.create({
      data: {
        businessId,
        orderId: old.id,
        addressLine: 'Old St',
        createdAt: new Date(Date.now() - 30 * 60000),
      },
    });
    let queue = await service.queue(businessId);
    expect(queue.find((q) => q.addr === 'Big St')?.pri).toBe('High value');
    expect(queue.find((q) => q.addr === 'Old St')?.pri).toBe('Urgent');

    await prisma.deliverySettings.update({
      where: { businessId },
      data: { highValueAmount: null },
    });
    queue = await service.queue(businessId);
    expect(queue.find((q) => q.addr === 'Big St')?.pri).toBe('Normal');
  });
});
