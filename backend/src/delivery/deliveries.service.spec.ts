import { ClsService } from 'nestjs-cls';
import { EMPTY, lastValueFrom, toArray } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { S3Service } from '../common/storage/s3.service';
import { ActivityPubSubService } from '../activity/activity-pubsub.service';
import { DeliveryAssignmentService } from './delivery-assignment.service';
import { DeliverySettingsService } from './delivery-settings.service';
import { DeliveriesService } from './deliveries.service';
import { deliveryChannel } from './delivery.constants';
import { AppException } from '../common/filters/app.exception';

// file-type is ESM-only; its dynamic import() isn't supported under ts-jest's CommonJS transform —
// same established workaround as customer-import/digitizer specs.
jest.mock('../common/utils/file-validation.util', () => ({
  validateUploadedFile: jest.fn().mockResolvedValue(undefined),
}));

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('DeliveriesService (UPD-BE-065/067)', () => {
  let prisma: PrismaService;
  let service: DeliveriesService;
  let businessId: string;
  let orderNo = 1;
  const s3 = { upload: jest.fn(), getSignedDownloadUrl: jest.fn() };
  const pubsub = { publish: jest.fn(), subscribe: jest.fn() };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const assignment = new DeliveryAssignmentService(tenantPrisma);
    const deliverySettings = new DeliverySettingsService(tenantPrisma);
    service = new DeliveriesService(
      tenantPrisma,
      s3 as unknown as S3Service,
      pubsub as unknown as ActivityPubSubService,
      assignment,
      deliverySettings,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Deliveries Test Biz',
        slug: `deliveries-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  beforeEach(() => {
    s3.upload.mockResolvedValue(undefined);
    s3.getSignedDownloadUrl.mockResolvedValue('https://signed.example/url');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.delivery.deleteMany({ where: { businessId } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.rider.deleteMany({ where: { businessId } });
    await prisma.deliveryZone.deleteMany({ where: { businessId } });
    await prisma.deliverySettings.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  async function makeOrder() {
    return prisma.order.create({ data: { businessId, orderNo: orderNo++ } });
  }

  describe('create()', () => {
    it('creates a real delivery and auto-assigns the only active rider', async () => {
      const rider = await prisma.rider.create({
        data: {
          businessId,
          name: 'Auto Rider',
          phone: '+14155551000',
          status: 'active',
        },
      });
      const order = await makeOrder();

      const delivery = await service.create(businessId, {
        orderId: order.id,
        addressLine: '1 Main St',
        lat: 24.86,
        lng: 67.0,
      });

      expect(delivery.status).toBe('assigned');
      expect(delivery.riderId).toBe(rider.id);
      expect(delivery.assignedAt).not.toBeNull();
      expect(pubsub.publish).toHaveBeenCalledWith(
        `delivery:${businessId}`,
        expect.objectContaining({ kind: 'delivery_update' }),
      );
    });

    it('on-time-rate depth fix: sets a real promisedAt from the business default SLA when auto-assigned', async () => {
      const before = Date.now();
      const order = await makeOrder();
      const delivery = await service.create(businessId, {
        orderId: order.id,
        addressLine: '1b Main St',
      });

      expect(delivery.promisedAt).not.toBeNull();
      const promisedInMinutes =
        (delivery.promisedAt!.getTime() - before) / (60 * 1000);
      // Default SLA is 45 minutes (no DeliverySettings row written for this business yet).
      expect(promisedInMinutes).toBeGreaterThan(44);
      expect(promisedInMinutes).toBeLessThan(46);
    });

    it('never sets promisedAt for a delivery that is left unassigned', async () => {
      await prisma.rider.updateMany({
        where: { businessId },
        data: { status: 'inactive' },
      });
      const order = await makeOrder();
      const delivery = await service.create(businessId, {
        orderId: order.id,
        addressLine: '1c Main St',
      });
      expect(delivery.status).toBe('unassigned');
      expect(delivery.promisedAt).toBeNull();

      // restore for the remaining tests in this file
      await prisma.rider.updateMany({
        where: { businessId },
        data: { status: 'active' },
      });
    });

    it('leaves a delivery unassigned (not an error) when no active rider exists', async () => {
      await prisma.rider.updateMany({
        where: { businessId },
        data: { status: 'inactive' },
      });
      const order = await makeOrder();

      const delivery = await service.create(businessId, {
        orderId: order.id,
        addressLine: '2 Main St',
      });
      expect(delivery.status).toBe('unassigned');
      expect(delivery.riderId).toBeNull();
    });

    it('rejects a second delivery for the same order', async () => {
      const order = await makeOrder();
      await service.create(businessId, {
        orderId: order.id,
        addressLine: '3 Main St',
      });

      await expect(
        service.create(businessId, {
          orderId: order.id,
          addressLine: '3 Main St',
        }),
      ).rejects.toBeInstanceOf(AppException);
    });

    it('rejects an unknown order', async () => {
      await expect(
        service.create(businessId, {
          orderId: 'no-such-order',
          addressLine: 'x',
        }),
      ).rejects.toThrow();
    });

    it('rejects an unknown zoneId', async () => {
      const order = await makeOrder();
      await expect(
        service.create(businessId, {
          orderId: order.id,
          addressLine: '1d Main St',
          zoneId: 'no-such-zone',
        }),
      ).rejects.toThrow();
    });
  });

  describe('per-zone SLA depth fix', () => {
    // Uses its own dedicated active rider rather than touching the shared `businessId` riders'
    // active/inactive state — the updateStatus() describe block below depends on exactly one real
    // active rider ("State Rider") existing when it runs, and this block must leave that untouched.
    let slaTestRiderId: string;

    beforeAll(async () => {
      const rider = await prisma.rider.create({
        data: {
          businessId,
          name: 'SLA Test Rider',
          phone: '+14155551050',
          status: 'active',
        },
      });
      slaTestRiderId = rider.id;
    });

    afterAll(async () => {
      // Deactivate rather than delete — deliveries created above still reference this rider.
      await prisma.rider.update({
        where: { id: slaTestRiderId },
        data: { status: 'inactive' },
      });
    });

    it("create() uses the zone's own slaMinutes over the business default when the zone has one", async () => {
      const zone = await prisma.deliveryZone.create({
        data: {
          businessId,
          name: 'Fast Zone',
          chargeType: 'flat',
          slaMinutes: 10,
        },
      });
      const order = await makeOrder();
      const before = Date.now();

      const delivery = await service.create(businessId, {
        orderId: order.id,
        addressLine: '1e Main St',
        zoneId: zone.id,
      });

      expect(delivery.zoneId).toBe(zone.id);
      const promisedInMinutes =
        (delivery.promisedAt!.getTime() - before) / (60 * 1000);
      expect(promisedInMinutes).toBeGreaterThan(9);
      expect(promisedInMinutes).toBeLessThan(11);
    });

    it("falls back to the business default when the delivery's zone has no override", async () => {
      const zone = await prisma.deliveryZone.create({
        data: { businessId, name: 'No Override Zone', chargeType: 'flat' },
      });
      const order = await makeOrder();
      const before = Date.now();

      const delivery = await service.create(businessId, {
        orderId: order.id,
        addressLine: '1f Main St',
        zoneId: zone.id,
      });

      const promisedInMinutes =
        (delivery.promisedAt!.getTime() - before) / (60 * 1000);
      // Business default is 45 minutes (no DeliverySettings row written for this business).
      expect(promisedInMinutes).toBeGreaterThan(44);
      expect(promisedInMinutes).toBeLessThan(46);
    });

    it('setZone() honestly recomputes an already-made promise under the new zone SLA', async () => {
      const zone = await prisma.deliveryZone.create({
        data: {
          businessId,
          name: 'Recompute Zone',
          chargeType: 'flat',
          slaMinutes: 5,
        },
      });
      const order = await makeOrder();
      const created = await service.create(businessId, {
        orderId: order.id,
        addressLine: '1g Main St',
      });
      expect(created.riderId).not.toBeNull(); // already assigned, so a promise already exists

      const before = Date.now();
      const rezoned = await service.setZone(businessId, created.id, zone.id);
      expect(rezoned.zoneId).toBe(zone.id);
      const promisedInMinutes =
        (rezoned.promisedAt!.getTime() - before) / (60 * 1000);
      expect(promisedInMinutes).toBeGreaterThan(4);
      expect(promisedInMinutes).toBeLessThan(6);

      // Clearing the zone reverts to the business default going forward.
      const cleared = await service.setZone(businessId, created.id, null);
      expect(cleared.zoneId).toBeNull();
      const clearedMinutes =
        (cleared.promisedAt!.getTime() - Date.now()) / (60 * 1000);
      expect(clearedMinutes).toBeGreaterThan(44);
      expect(clearedMinutes).toBeLessThan(46);
    });

    it('setZone() does not fabricate a promise for a delivery with no rider yet', async () => {
      await prisma.rider.update({
        where: { id: slaTestRiderId },
        data: { status: 'inactive' },
      });
      const zone = await prisma.deliveryZone.create({
        data: { businessId, name: 'Unassigned Zone', chargeType: 'flat' },
      });
      const order = await makeOrder();
      const created = await service.create(businessId, {
        orderId: order.id,
        addressLine: '1h Main St',
      });
      expect(created.riderId).toBeNull();
      expect(created.promisedAt).toBeNull();

      const rezoned = await service.setZone(businessId, created.id, zone.id);
      expect(rezoned.zoneId).toBe(zone.id);
      expect(rezoned.promisedAt).toBeNull();

      await prisma.rider.update({
        where: { id: slaTestRiderId },
        data: { status: 'active' },
      });
    });

    it('setZone() rejects an unknown zone', async () => {
      const order = await makeOrder();
      const created = await service.create(businessId, {
        orderId: order.id,
        addressLine: '1i Main St',
      });
      await expect(
        service.setZone(businessId, created.id, 'no-such-zone'),
      ).rejects.toThrow();
    });
  });

  describe('updateStatus()', () => {
    it('follows the real state machine, forward-only', async () => {
      const rider = await prisma.rider.create({
        data: {
          businessId,
          name: 'State Rider',
          phone: '+14155551001',
          status: 'active',
        },
      });
      const order = await makeOrder();
      const delivery = await service.create(businessId, {
        orderId: order.id,
        addressLine: '4 Main St',
      });
      expect(delivery.riderId).toBe(rider.id); // only active rider

      const pickedUp = await service.updateStatus(businessId, delivery.id, {
        status: 'picked_up',
      });
      expect(pickedUp.status).toBe('picked_up');

      const enRoute = await service.updateStatus(businessId, delivery.id, {
        status: 'en_route',
      });
      expect(enRoute.status).toBe('en_route');

      // Can't skip backwards or sideways to an already-passed state.
      await expect(
        service.updateStatus(businessId, delivery.id, { status: 'picked_up' }),
      ).rejects.toBeInstanceOf(AppException);

      const delivered = await service.updateStatus(businessId, delivery.id, {
        status: 'delivered',
      });
      expect(delivered.status).toBe('delivered');
      expect(delivered.deliveredAt).not.toBeNull();

      // Terminal state — no further transitions allowed.
      await expect(
        service.updateStatus(businessId, delivery.id, { status: 'failed' }),
      ).rejects.toBeInstanceOf(AppException);
    });

    it('rejects marking a delivery failed without a real reason (UPD-FE-055e)', async () => {
      const order = await makeOrder();
      const delivery = await service.create(businessId, {
        orderId: order.id,
        addressLine: '4b Main St',
      });

      await expect(
        service.updateStatus(businessId, delivery.id, { status: 'failed' }),
      ).rejects.toBeInstanceOf(AppException);

      const failed = await service.updateStatus(businessId, delivery.id, {
        status: 'failed',
        failureReason: 'Customer refused delivery',
      });
      expect(failed.status).toBe('failed');
      expect(failed.failureReason).toBe('Customer refused delivery');
    });
  });

  describe('rate() (UPD-FE-127)', () => {
    it('persists a real rating on a delivered delivery', async () => {
      const order = await makeOrder();
      const delivery = await service.create(businessId, {
        orderId: order.id,
        addressLine: '4c Main St',
      });
      await service.updateStatus(businessId, delivery.id, {
        status: 'picked_up',
      });
      await service.updateStatus(businessId, delivery.id, {
        status: 'en_route',
      });
      await service.updateStatus(businessId, delivery.id, {
        status: 'delivered',
      });

      const rated = await service.rate(delivery.id, { rating: 5 });
      expect(rated.qualityRating).toBe(5);
    });

    it('rejects rating a delivery that has not been delivered yet', async () => {
      const order = await makeOrder();
      const delivery = await service.create(businessId, {
        orderId: order.id,
        addressLine: '4d Main St',
      });

      await expect(
        service.rate(delivery.id, { rating: 3 }),
      ).rejects.toBeInstanceOf(AppException);
    });
  });

  describe('submitProof()', () => {
    it('uploads real signature/photo to S3, records real GPS, and marks the delivery delivered', async () => {
      const order = await makeOrder();
      const delivery = await service.create(businessId, {
        orderId: order.id,
        addressLine: '5 Main St',
      });

      const result = await service.submitProof(
        businessId,
        delivery.id,
        { buffer: Buffer.from('sig'), mimetype: 'image/png', size: 3 },
        { buffer: Buffer.from('photo'), mimetype: 'image/jpeg', size: 5 },
        24.9,
        67.1,
      );

      expect(result.status).toBe('delivered');
      expect(result.proofAt).not.toBeNull();
      expect(Number(result.proofLat)).toBeCloseTo(24.9, 4);
      expect(s3.upload).toHaveBeenCalledTimes(2);

      const proof = await service.getProof(delivery.id);
      expect(proof.submitted).toBe(true);
    });

    it('rejects submitting proof twice for the same delivery', async () => {
      const order = await makeOrder();
      const delivery = await service.create(businessId, {
        orderId: order.id,
        addressLine: '6 Main St',
      });
      await service.submitProof(
        businessId,
        delivery.id,
        { buffer: Buffer.from('sig'), mimetype: 'image/png', size: 3 },
        undefined,
        1,
        1,
      );

      await expect(
        service.submitProof(
          businessId,
          delivery.id,
          { buffer: Buffer.from('sig2'), mimetype: 'image/png', size: 4 },
          undefined,
          1,
          1,
        ),
      ).rejects.toBeInstanceOf(AppException);
    });

    it('getProof() reports not submitted for a delivery with no proof yet', async () => {
      const order = await makeOrder();
      const delivery = await service.create(businessId, {
        orderId: order.id,
        addressLine: '7 Main St',
      });
      const proof = await service.getProof(delivery.id);
      expect(proof).toEqual({ submitted: false });
    });
  });

  describe('onTimeStats() (on-time-rate depth fix)', () => {
    // The tenant-scoping Prisma extension auto-injects business_id from CLS on every query, so each
    // test here gets its own fresh business + CLS/tenantPrisma/service instance rather than sharing
    // the outer `service` — otherwise deliveries created by earlier describe blocks (state-machine,
    // rate(), submitProof() tests, all under the shared outer `businessId`) would pollute the sample.
    async function makeIsolatedService() {
      const business = await prisma.business.create({
        data: {
          name: 'On-Time Stats Biz',
          slug: `on-time-stats-${Date.now()}-${Math.random()}`,
        },
      });
      const cls = new FakeClsService();
      cls.set(CLS_KEY_BUSINESS_ID, business.id);
      const tenantPrisma = new TenantPrismaService(
        prisma,
        cls as unknown as ClsService,
      );
      const isolatedService = new DeliveriesService(
        tenantPrisma,
        s3 as unknown as S3Service,
        pubsub as unknown as ActivityPubSubService,
        new DeliveryAssignmentService(tenantPrisma),
        new DeliverySettingsService(tenantPrisma),
      );
      return { business, isolatedService };
    }

    it('excludes deliveries with no real promise, and correctly buckets the rest', async () => {
      const { business, isolatedService } = await makeIsolatedService();
      const rider = await prisma.rider.create({
        data: {
          businessId: business.id,
          name: 'On-Time Rider',
          phone: '+14155551099',
          status: 'active',
        },
      });
      const order = () =>
        prisma.order.create({
          data: { businessId: business.id, orderNo: orderNo++ },
        });

      // No promisedAt at all — created directly at the DB level to simulate a pre-fix historical
      // row. Must be excluded from the rate, not counted as "late".
      const legacyOrder = await order();
      await prisma.delivery.create({
        data: {
          businessId: business.id,
          orderId: legacyOrder.id,
          riderId: rider.id,
          addressLine: 'Legacy Ave',
          status: 'delivered',
          deliveredAt: new Date(),
          promisedAt: null,
        },
      });

      // A real, on-time delivery: delivered before the promise.
      const onTimeOrder = await order();
      const now = new Date();
      await prisma.delivery.create({
        data: {
          businessId: business.id,
          orderId: onTimeOrder.id,
          riderId: rider.id,
          addressLine: 'On Time Ave',
          status: 'delivered',
          deliveredAt: now,
          promisedAt: new Date(now.getTime() + 60_000),
        },
      });

      // A real, late delivery: delivered after the promise.
      const lateOrder = await order();
      await prisma.delivery.create({
        data: {
          businessId: business.id,
          orderId: lateOrder.id,
          riderId: rider.id,
          addressLine: 'Late Ave',
          status: 'delivered',
          deliveredAt: now,
          promisedAt: new Date(now.getTime() - 60_000),
        },
      });

      // A failed delivery with a real promise counts as not-on-time — it never arrived.
      const failedOrder = await order();
      await prisma.delivery.create({
        data: {
          businessId: business.id,
          orderId: failedOrder.id,
          riderId: rider.id,
          addressLine: 'Failed Ave',
          status: 'failed',
          failureReason: 'Customer refused delivery',
          promisedAt: new Date(now.getTime() + 60_000),
        },
      });

      const stats = await isolatedService.onTimeStats(business.id);
      // 3 candidates counted (legacy row with null promisedAt excluded): 1 on-time out of 3.
      expect(stats.sampleSize).toBe(3);
      expect(stats.onTimeRate).toBeCloseTo(33.33, 1);
      expect(stats.trend.length).toBeGreaterThan(0);
      const today = new Date().toISOString().slice(0, 10);
      const todayBucket = stats.trend.find((t) => t.date === today);
      expect(todayBucket?.sampleSize).toBe(3);

      await prisma.delivery.deleteMany({ where: { businessId: business.id } });
      await prisma.order.deleteMany({ where: { businessId: business.id } });
      await prisma.rider.deleteMany({ where: { businessId: business.id } });
      await prisma.business.delete({ where: { id: business.id } });
    });

    it('returns a null rate (not zero) when there is no real sample yet', async () => {
      const { business, isolatedService } = await makeIsolatedService();
      const stats = await isolatedService.onTimeStats(business.id);
      expect(stats.onTimeRate).toBeNull();
      expect(stats.sampleSize).toBe(0);
      await prisma.business.delete({ where: { id: business.id } });
    });
  });

  describe('stream() (Live Tracking depth fix)', () => {
    it('sets a real SSE `type` on every frame so the frontend SSE client does not silently drop them', async () => {
      const pubsubWithSubscribe = pubsub as unknown as ActivityPubSubService & {
        subscribe: jest.Mock;
      };
      pubsubWithSubscribe.subscribe = jest.fn().mockReturnValue(EMPTY);

      const events = await lastValueFrom(
        service.stream(businessId).pipe(toArray()),
      );

      expect(pubsubWithSubscribe.subscribe).toHaveBeenCalledWith(
        deliveryChannel(businessId),
      );
      // EMPTY completes immediately with no live events — every emission here is a real snapshot row.
      for (const event of events) {
        expect(typeof event.type).toBe('string');
        expect(event.type).toBe((event.data as { kind: string }).kind);
      }
    });
  });
});
