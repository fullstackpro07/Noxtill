import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { S3Service } from '../common/storage/s3.service';
import { ActivityPubSubService } from '../activity/activity-pubsub.service';
import { DeliveryAssignmentService } from './delivery-assignment.service';
import { DeliveriesService } from './deliveries.service';
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
    service = new DeliveriesService(
      tenantPrisma,
      s3 as unknown as S3Service,
      pubsub as unknown as ActivityPubSubService,
      assignment,
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
});
