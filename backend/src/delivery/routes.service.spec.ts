import { ClsService } from 'nestjs-cls';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { RoutingService } from './routing.service';
import { RoutesService } from './routes.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('RoutesService (UPD-BE-066)', () => {
  let prisma: PrismaService;
  let service: RoutesService;
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
    const routing = new RoutingService(new ConfigService({}));
    service = new RoutesService(tenantPrisma, routing);

    const business = await prisma.business.create({
      data: { name: 'Routes Test Biz', slug: `routes-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.delivery.deleteMany({ where: { businessId } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.rider.deleteMany({ where: { businessId } });
    await prisma.route.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  async function makeDelivery(lat?: number, lng?: number) {
    const order = await prisma.order.create({
      data: { businessId, orderNo: orderNo++ },
    });
    return prisma.delivery.create({
      data: { businessId, orderId: order.id, addressLine: 'x', lat, lng },
    });
  }

  it('creates a real route linking real deliveries in the given order', async () => {
    const d1 = await makeDelivery();
    const d2 = await makeDelivery();

    const route = await service.create(businessId, {
      deliveryIds: [d1.id, d2.id],
    });
    expect(route.deliveries).toHaveLength(2);
    expect(route.deliveries[0].id).toBe(d1.id);
    expect(route.deliveries[0].routeSequence).toBe(0);
    expect(route.deliveries[1].routeSequence).toBe(1);
  });

  it('with a real rider position, fully nearest-neighbour-orders every stop from there', async () => {
    const rider = await prisma.rider.create({
      data: {
        businessId,
        name: 'Positioned Rider',
        phone: '+14155559999',
        lastLat: 0,
        lastLng: 0,
      },
    });
    const far = await makeDelivery(0, 3);
    const near = await makeDelivery(0, 1);
    const mid = await makeDelivery(0, 2);

    // Deliberately created in a "bad" order — optimise() should fix it relative to the rider's real position.
    const route = await service.create(businessId, {
      riderId: rider.id,
      deliveryIds: [far.id, near.id, mid.id],
    });

    const optimised = await service.optimise(route.id);
    expect(optimised.deliveries.map((d) => d.id)).toEqual([
      near.id,
      mid.id,
      far.id,
    ]);
  });

  it('without a known rider position, anchors on the first stop in the route and nearest-neighbour-orders the rest from there', async () => {
    const far = await makeDelivery(0, 3);
    const near = await makeDelivery(0, 1);
    const mid = await makeDelivery(0, 2);

    const route = await service.create(businessId, {
      deliveryIds: [far.id, near.id, mid.id],
    });

    const optimised = await service.optimise(route.id);
    // far stays first (the only real anchor available); mid (distance 1 from far) comes before
    // near (distance 2 from far).
    expect(optimised.deliveries.map((d) => d.id)).toEqual([
      far.id,
      mid.id,
      near.id,
    ]);
  });

  it('leaves an unoptimisable route (no coordinates) unchanged rather than erroring', async () => {
    const d1 = await makeDelivery(); // no lat/lng
    const route = await service.create(businessId, { deliveryIds: [d1.id] });

    const optimised = await service.optimise(route.id);
    expect(optimised.deliveries).toHaveLength(1);
  });

  it('rejects an unknown route', async () => {
    await expect(service.findOne('no-such-route')).rejects.toThrow();
  });
});
