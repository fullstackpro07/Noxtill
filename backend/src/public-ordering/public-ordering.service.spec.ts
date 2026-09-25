import { PrismaService } from '../prisma/prisma.service';
import { PublicOrderingService } from './public-ordering.service';

describe('PublicOrderingService — delivery zone rules', () => {
  let prisma: PrismaService;
  let service: PublicOrderingService;
  let businessId: string;
  let slug: string;
  let productId: string;
  let activeZoneId: string;
  let pausedZoneId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new PublicOrderingService(prisma);
    slug = `public-order-${Date.now()}`;
    const business = await prisma.business.create({
      data: { name: 'Public Order Biz', slug },
    });
    businessId = business.id;
    const product = await prisma.product.create({
      data: {
        businessId,
        name: 'Widget',
        sellingPrice: 100,
        costPrice: 40,
        active: true,
      },
    });
    productId = product.id;
    const active = await prisma.deliveryZone.create({
      data: {
        businessId,
        name: 'Core',
        chargeType: 'flat',
        flatAmount: 200,
        active: true,
      },
    });
    activeZoneId = active.id;
    const paused = await prisma.deliveryZone.create({
      data: {
        businessId,
        name: 'Paused',
        chargeType: 'flat',
        flatAmount: 300,
        active: false,
      },
    });
    pausedZoneId = paused.id;
  });

  afterAll(async () => {
    await prisma.activityEvent.deleteMany({ where: { businessId } });
    await prisma.delivery.deleteMany({ where: { businessId } });
    await prisma.orderItem.deleteMany({ where: { order: { businessId } } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.deliverySettings.deleteMany({ where: { businessId } });
    await prisma.deliveryZone.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  const order = (extra: Record<string, unknown>) =>
    service.createOrder(slug, {
      items: [{ productId, qty: 1 }],
      orderType: 'delivery',
      ...extra,
    } as never);

  it('a delivery order needs an address', async () => {
    await expect(order({})).rejects.toMatchObject({
      response: { code: 'DELIVERY_ADDRESS_REQUIRED' },
    });
  });

  it('with no rules switched on, any delivery order is accepted and a delivery record is created with its zone fee', async () => {
    const o = await order({
      deliveryAddress: '1 Main St',
      deliveryZoneId: activeZoneId,
    });
    const delivery = await prisma.delivery.findUnique({
      where: { orderId: o.id },
    });
    expect(delivery?.status).toBe('unassigned');
    expect(Number(delivery?.deliveryFee)).toBe(200);
    expect(delivery?.trackingToken).toBeTruthy();
  });

  it('"nothing outside a zone" refuses an order with no zone, and one for a paused zone', async () => {
    await prisma.deliverySettings.upsert({
      where: { businessId },
      create: { businessId, enforceZoneCoverage: true },
      update: { enforceZoneCoverage: true },
    });
    await expect(order({ deliveryAddress: '2 Far St' })).rejects.toMatchObject({
      response: { code: 'DELIVERY_OUT_OF_ZONE' },
    });
    await expect(
      order({ deliveryAddress: '3 Paused St', deliveryZoneId: pausedZoneId }),
    ).rejects.toMatchObject({
      response: { code: 'DELIVERY_OUT_OF_ZONE' },
    });
    await expect(
      order({ deliveryAddress: '4 Core St', deliveryZoneId: activeZoneId }),
    ).resolves.toBeDefined();
  });

  it('"paused zones stop taking orders" refuses a paused zone even when coverage is not enforced', async () => {
    await prisma.deliverySettings.update({
      where: { businessId },
      data: { enforceZoneCoverage: false, pausedZonesBlockOrders: true },
    });
    await expect(
      order({ deliveryAddress: '5 Paused St', deliveryZoneId: pausedZoneId }),
    ).rejects.toMatchObject({
      response: { code: 'DELIVERY_ZONE_PAUSED' },
    });
  });

  it('the menu shows zone fees only when "fee shown before checkout" is on', async () => {
    await prisma.deliverySettings.update({
      where: { businessId },
      data: { showFeeBeforeCheckout: false, pausedZonesBlockOrders: false },
    });
    expect((await service.getMenu(slug)).deliveryZones).toHaveLength(0);

    await prisma.deliverySettings.update({
      where: { businessId },
      data: { showFeeBeforeCheckout: true },
    });
    const menu = await service.getMenu(slug);
    expect(menu.deliveryZones).toHaveLength(1);
    expect(menu.deliveryZones[0].fee?.flatAmount).toBe(200);
  });
});
