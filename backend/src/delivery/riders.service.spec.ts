import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ActivityPubSubService } from '../activity/activity-pubsub.service';
import { RidersService } from './riders.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('RidersService (UPD-BE-064/065)', () => {
  let prisma: PrismaService;
  let service: RidersService;
  let businessId: string;
  const pubsub = { publish: jest.fn() };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new RidersService(
      tenantPrisma,
      pubsub as unknown as ActivityPubSubService,
    );

    const business = await prisma.business.create({
      data: { name: 'Riders Test Biz', slug: `riders-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterEach(() => {
    pubsub.publish.mockReset();
  });

  afterAll(async () => {
    await prisma.delivery.deleteMany({ where: { businessId } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.rider.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('creates, lists, updates, and removes a real rider', async () => {
    const created = await service.create(businessId, {
      name: 'Jordan Rider',
      phone: '+14155550010',
    });
    expect(created.status).toBe('active');

    const listed = await service.list();
    expect(listed.some((r) => r.id === created.id)).toBe(true);

    const updated = await service.update(created.id, { status: 'inactive' });
    expect(updated.status).toBe('inactive');

    await service.remove(created.id);
    await expect(service.findOne(created.id)).rejects.toThrow();
  });

  it('rejects operating on an unknown rider', async () => {
    await expect(service.findOne('no-such-rider')).rejects.toThrow();
    await expect(
      service.update('no-such-rider', { name: 'x' }),
    ).rejects.toThrow();
  });

  it('computes real performance stats from real delivered/failed deliveries', async () => {
    const rider = await service.create(businessId, {
      name: 'Performance Rider',
      phone: '+14155550011',
    });

    const assignedAt = new Date('2026-08-01T10:00:00.000Z');
    const deliveredAt = new Date('2026-08-01T10:30:00.000Z'); // 30 real minutes

    const order1 = await prisma.order.create({
      data: { businessId, orderNo: 901 },
    });
    await prisma.delivery.create({
      data: {
        businessId,
        orderId: order1.id,
        addressLine: 'A',
        riderId: rider.id,
        status: 'delivered',
        assignedAt,
        deliveredAt,
      },
    });
    const order2 = await prisma.order.create({
      data: { businessId, orderNo: 902 },
    });
    await prisma.delivery.create({
      data: {
        businessId,
        orderId: order2.id,
        addressLine: 'B',
        riderId: rider.id,
        status: 'failed',
      },
    });

    const perf = await service.performance(rider.id);
    expect(perf.totalDeliveries).toBe(2);
    expect(perf.delivered).toBe(1);
    expect(perf.failed).toBe(1);
    expect(perf.successRate).toBe(50);
    expect(perf.averageDeliveryMinutes).toBe(30);
  });

  it('persists a real GPS push and broadcasts it live', async () => {
    const rider = await service.create(businessId, {
      name: 'GPS Rider',
      phone: '+14155550012',
    });

    const updated = await service.reportLocation(businessId, rider.id, {
      lat: 24.8607,
      lng: 67.0011,
    });
    expect(Number(updated.lastLat)).toBeCloseTo(24.8607, 4);
    expect(Number(updated.lastLng)).toBeCloseTo(67.0011, 4);
    expect(updated.lastLocationAt).not.toBeNull();

    expect(pubsub.publish).toHaveBeenCalledWith(
      `delivery:${businessId}`,
      expect.objectContaining({ kind: 'rider_location', riderId: rider.id }),
    );
  });
});
