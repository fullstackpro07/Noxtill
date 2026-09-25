import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ActivityPubSubService } from '../activity/activity-pubsub.service';
import { ActivityService } from '../activity/activity.service';
import { DeliverySettingsService } from './delivery-settings.service';
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
  const activity = { record: jest.fn() };

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
      activity as unknown as ActivityService,
      new DeliverySettingsService(tenantPrisma),
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
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
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

  describe('Riders screen depth fix (UPD-FE-127)', () => {
    it('persists real vehicle type, commission rate, and zone ids through create() and update()', async () => {
      const created = await service.create(businessId, {
        name: 'Depth Rider',
        phone: '+14155550020',
        vehicleType: 'motorcycle',
        commissionRate: 12.5,
        zoneIds: ['zone-1', 'zone-2'],
      });
      expect(created.vehicleType).toBe('motorcycle');
      expect(Number(created.commissionRate)).toBe(12.5);
      expect(created.zoneIds).toEqual(['zone-1', 'zone-2']);

      const updated = await service.update(created.id, {
        vehicleType: 'van',
        zoneIds: ['zone-3'],
      });
      expect(updated.vehicleType).toBe('van');
      expect(updated.zoneIds).toEqual(['zone-3']);
    });

    it('list() enriches each rider with a real "deliveries today" count, not fabricated', async () => {
      const rider = await service.create(businessId, {
        name: 'Today Rider',
        phone: '+14155550021',
      });
      const order = await prisma.order.create({
        data: { businessId, orderNo: 950 },
      });
      await prisma.delivery.create({
        data: {
          businessId,
          orderId: order.id,
          addressLine: 'C',
          riderId: rider.id,
          status: 'assigned',
        },
      });

      const listed = await service.list();
      const row = listed.find((r) => r.id === rider.id)!;
      expect(row.deliveriesToday).toBe(1);
      expect(row.activeDeliveries).toBe(1);
    });

    it('performance() averages real staff-recorded ratings, null until at least one exists', async () => {
      const rider = await service.create(businessId, {
        name: 'Rated Rider',
        phone: '+14155550022',
      });
      const noRatingYet = await service.performance(rider.id);
      expect(noRatingYet.averageRating).toBeNull();
      expect(noRatingYet.ratedDeliveries).toBe(0);

      const order = await prisma.order.create({
        data: { businessId, orderNo: 951 },
      });
      await prisma.delivery.create({
        data: {
          businessId,
          orderId: order.id,
          addressLine: 'D',
          riderId: rider.id,
          status: 'delivered',
          qualityRating: 4,
        },
      });
      const order2 = await prisma.order.create({
        data: { businessId, orderNo: 952 },
      });
      await prisma.delivery.create({
        data: {
          businessId,
          orderId: order2.id,
          addressLine: 'E',
          riderId: rider.id,
          status: 'delivered',
          qualityRating: 5,
        },
      });

      const withRatings = await service.performance(rider.id);
      expect(withRatings.averageRating).toBe(4.5);
      expect(withRatings.ratedDeliveries).toBe(2);
    });
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

  it('going off shift clears the last GPS fix and the break marker — location is not kept after a shift ends', async () => {
    const rider = await service.create(businessId, {
      name: 'Shift Rider',
      phone: '0300',
    });
    await service.reportLocation(businessId, rider.id, {
      lat: 31.5,
      lng: 74.3,
    });
    await service.setBreak(businessId, rider.id, true);
    const off = await service.update(rider.id, { status: 'inactive' });
    expect(off.lastLat).toBeNull();
    expect(off.lastLng).toBeNull();
    expect(off.lastLocationAt).toBeNull();
    expect(off.onBreakSince).toBeNull();
  });

  it('location-sharing consent is off by default and only changes when set explicitly', async () => {
    const rider = await service.create(businessId, {
      name: 'Consent Rider',
      phone: '0301',
    });
    expect(rider.shareLocationConsent).toBe(false);
    const on = await service.setLocationConsent(rider.id, true);
    expect(on.shareLocationConsent).toBe(true);
  });
});
