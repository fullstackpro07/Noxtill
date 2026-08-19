import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { DeliveryAssignmentService } from './delivery-assignment.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('DeliveryAssignmentService (UPD-BE-065)', () => {
  let prisma: PrismaService;
  let service: DeliveryAssignmentService;
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
    service = new DeliveryAssignmentService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Delivery Assignment Test Biz',
        slug: `delivery-assignment-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterEach(async () => {
    await prisma.delivery.deleteMany({ where: { businessId } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.rider.deleteMany({ where: { businessId } });
  });

  afterAll(async () => {
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  async function createOrderAndDelivery(
    riderId: string | undefined,
    status: 'assigned' | 'delivered',
  ) {
    const order = await prisma.order.create({
      data: { businessId, orderNo: orderNo++ },
    });
    return prisma.delivery.create({
      data: {
        businessId,
        orderId: order.id,
        addressLine: '123 Test St',
        riderId,
        status,
      },
    });
  }

  it('returns null when there are no active riders at all', async () => {
    const riderId = await service.pickRider();
    expect(riderId).toBeNull();
  });

  it('picks the only active rider, ignoring an inactive one', async () => {
    const inactive = await prisma.rider.create({
      data: {
        businessId,
        name: 'Inactive Rider',
        phone: '+14155550001',
        status: 'inactive',
      },
    });
    const active = await prisma.rider.create({
      data: {
        businessId,
        name: 'Active Rider',
        phone: '+14155550002',
        status: 'active',
      },
    });

    const riderId = await service.pickRider();
    expect(riderId).toBe(active.id);
    expect(riderId).not.toBe(inactive.id);
  });

  it('picks the real least-busy active rider, ignoring completed deliveries', async () => {
    const busy = await prisma.rider.create({
      data: {
        businessId,
        name: 'Busy Rider',
        phone: '+14155550003',
        status: 'active',
      },
    });
    const free = await prisma.rider.create({
      data: {
        businessId,
        name: 'Free Rider',
        phone: '+14155550004',
        status: 'active',
      },
    });

    // Busy rider has 2 real active deliveries; a 3rd, already-delivered one shouldn't count against them.
    await createOrderAndDelivery(busy.id, 'assigned');
    await createOrderAndDelivery(busy.id, 'assigned');
    await createOrderAndDelivery(busy.id, 'delivered');

    const riderId = await service.pickRider();
    expect(riderId).toBe(free.id);
  });
});
