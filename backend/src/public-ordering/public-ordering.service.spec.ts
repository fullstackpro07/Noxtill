import { PrismaService } from '../prisma/prisma.service';
import { PublicOrderingService } from './public-ordering.service';
import { ActivityService } from '../activity/activity.service';
import { ORDER_ERROR_CODES } from '../orders/orders.constants';

describe('PublicOrderingService — delivery zone rules', () => {
  let prisma: PrismaService;
  let service: PublicOrderingService;
  let businessId: string;
  let slug: string;
  let productId: string;
  let outOfStockProductId: string;
  let inactiveProductId: string;
  let activeZoneId: string;
  let pausedZoneId: string;
  let idempotencySequence = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const activity = {
      record: async (
        activityBusinessId: string,
        input: Record<string, unknown>,
      ) => {
        await prisma.activityEvent.create({
          data: { businessId: activityBusinessId, ...input } as never,
        });
      },
    } as unknown as ActivityService;
    service = new PublicOrderingService(prisma, activity);
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
        stockQty: 10,
        active: true,
      },
    });
    productId = product.id;
    const outOfStockProduct = await prisma.product.create({
      data: {
        businessId,
        name: 'Out of Stock Widget',
        sellingPrice: 50,
        stockQty: 0,
        active: true,
      },
    });
    outOfStockProductId = outOfStockProduct.id;
    const inactiveProduct = await prisma.product.create({
      data: {
        businessId,
        name: 'Inactive Widget',
        sellingPrice: 60,
        stockQty: 5,
        active: false,
      },
    });
    inactiveProductId = inactiveProduct.id;
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
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  const order = (extra: Record<string, unknown>) =>
    service.createOrder(
      slug,
      {
        items: [{ productId, qty: 1 }],
        orderType: 'delivery',
        ...extra,
      } as never,
      `public-order-test-${++idempotencySequence}`,
    );

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
    const events = await prisma.activityEvent.findMany({
      where: { businessId, entityId: { in: [o.id, delivery!.id] } },
    });
    expect(events.map((event) => event.type).sort()).toEqual([
      'delivery',
      'sale',
    ]);
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

  it('returns only public catalog fields and reports real availability', async () => {
    const menu = await service.getMenu(slug);
    const widget = menu.products.find((item) => item.id === productId);
    expect(widget).toMatchObject({
      id: productId,
      name: 'Widget',
      sellingPrice: 100,
      available: true,
    });
    expect(widget).not.toHaveProperty('costPrice');
    expect(widget).not.toHaveProperty('stockQty');
    expect(menu.products.map((item) => item.id)).not.toContain(
      inactiveProductId,
    );
    expect(
      menu.products.find((item) => item.id === outOfStockProductId),
    ).toMatchObject({ available: false });
    expect(menu.business.onlinePayment.availability).toBe('not_configured');
  });

  it('revalidates active status and stock when a public order is submitted', async () => {
    await expect(
      service.createOrder(
        slug,
        {
          items: [{ productId: inactiveProductId, qty: 1 }],
        },
        `public-order-test-${++idempotencySequence}`,
      ),
    ).rejects.toMatchObject({
      response: { code: ORDER_ERROR_CODES.PRODUCT_NOT_FOUND },
    });
    await expect(
      service.createOrder(
        slug,
        {
          items: [{ productId: outOfStockProductId, qty: 1 }],
        },
        `public-order-test-${++idempotencySequence}`,
      ),
    ).rejects.toMatchObject({
      response: { code: ORDER_ERROR_CODES.INSUFFICIENT_STOCK },
    });
  });

  it('returns a public-safe order confirmation that says payment is still unpaid', async () => {
    const result = await service.createOrder(
      slug,
      {
        items: [{ productId, qty: 1 }],
        orderType: 'takeaway',
        customerName: 'Checkout Guest',
        customerPhone: `+1${Date.now()}`,
      },
      `public-order-test-${++idempotencySequence}`,
    );
    expect(result).toMatchObject({
      status: 'pending',
      total: 100,
      currency: 'USD',
      paymentStatus: 'unpaid',
    });
    expect(result).not.toHaveProperty('businessId');
    expect(result).not.toHaveProperty('cogs');
  });

  it('replays the same public order for concurrent retries and rejects key reuse with changed input', async () => {
    const input = {
      items: [{ productId, qty: 1 }],
      orderType: 'takeaway' as const,
      customerName: 'Idempotent Guest',
      customerPhone: `+1555${Date.now()}`,
    };
    const key = `public-order-test-${++idempotencySequence}`;
    const [first, retry] = await Promise.all([
      service.createOrder(slug, input, key),
      service.createOrder(slug, input, key),
    ]);

    expect(retry).toEqual(first);
    expect(
      await prisma.order.count({
        where: { businessId, id: first.id },
      }),
    ).toBe(1);
    expect(
      await prisma.activityEvent.count({
        where: { businessId, entityType: 'Order', entityId: first.id },
      }),
    ).toBe(1);

    await expect(
      service.createOrder(
        slug,
        { ...input, items: [{ productId, qty: 2 }] },
        key,
      ),
    ).rejects.toMatchObject({
      response: { code: 'PUBLIC_ORDER_IDEMPOTENCY_CONFLICT' },
    });
  });
});
