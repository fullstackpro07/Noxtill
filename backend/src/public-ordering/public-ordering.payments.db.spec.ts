/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matchers (`expect.stringContaining`/`expect.arrayContaining`) are typed `any`. */
import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import type { ActivityService } from '../activity/activity.service';
import { PayContextService } from '../payments/pay-context.service';
import { PayRequestsService } from '../payments/pay-requests.service';
import type { PayStripeService } from '../payments/pay-stripe.service';
import type { PayMessagingService } from '../payments/pay-messaging.service';
import { PublicOrderingService } from './public-ordering.service';

describe('PublicOrderingService — online payment through Payments (real MySQL)', () => {
  let prisma: PrismaService;
  let ctx: PayContextService;
  let requests: PayRequestsService;
  let service: PublicOrderingService;
  let businessId: string;
  let productId: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const slug = `pub-pay-${suffix}`;

  const storefront = (onlinePayment: boolean) =>
    prisma.websiteSite.upsert({
      where: { businessId },
      create: { businessId, settings: { storefront: { onlinePayment } } },
      update: { settings: { storefront: { onlinePayment } } },
    });

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    businessId = (
      await prisma.business.create({
        data: { name: 'Public Pay Spec', slug, currency: 'USD' },
      })
    ).id;
    productId = (
      await prisma.product.create({
        data: {
          businessId,
          name: 'Spec Pizza',
          costPrice: 5,
          sellingPrice: 25,
          stockQty: 50,
        },
      })
    ).id;
    ctx = new PayContextService(prisma, new CapabilitiesService(prisma));
    const config = {
      get: (k: string) =>
        ({
          FRONTEND_URL: 'https://shop.example',
          PAY_LINK_SECRET: 'pub-pay-secret',
        })[k],
    } as unknown as ConfigService;
    requests = new PayRequestsService(
      ctx,
      config,
      // No card provider is connected: only Payments' default manual Bank transfer link applies.
      { connections: () => Promise.resolve([]) } as unknown as PayStripeService,
      {} as PayMessagingService,
    );
    service = new PublicOrderingService(
      prisma,
      { record: jest.fn() } as unknown as ActivityService,
      requests,
    );
  });

  afterAll(async () => {
    if (!prisma) return;
    const payTables = await prisma.$queryRaw<{ t: string }[]>`
      SELECT table_name AS t FROM information_schema.columns
      WHERE table_schema = DATABASE() AND column_name = 'business_id' AND table_name LIKE 'pay\\_%'
      ORDER BY table_name`;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      for (const { t } of payTables)
        await tx.$executeRawUnsafe(
          `DELETE FROM \`${t}\` WHERE business_id = ?`,
          businessId,
        );
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.orderItem.deleteMany({ where: { order: { businessId } } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.websiteSite.deleteMany({ where: { businessId } });
    await prisma.business.deleteMany({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('offers a Payments link for the order total only when the owner turned it on and Payments is ready', async () => {
    await storefront(true);
    // Switch on, but Payments has never been set up for this business: not offered, and the public
    // menu does not set Payments up as a side effect.
    let menu = await service.getMenu(slug);
    expect(menu.business.onlinePayment).toMatchObject({
      availability: 'not_configured',
      detail: expect.stringContaining('not set up'),
    });
    expect(
      await prisma.paySettings.findUnique({ where: { businessId } }),
    ).toBeNull();

    await ctx.policy(businessId); // the owner opens Payments: defaults include Bank transfer links
    menu = await service.getMenu(slug);
    expect(menu.business.onlinePayment.availability).toBe('available');

    const body = {
      items: [{ productId, qty: 2 }],
      orderType: 'takeaway' as const,
      customerName: 'Sam',
      customerPhone: '+14155550142',
    };
    const order = await service.createOrder(slug, body, `pay-${suffix}`);
    expect(order).toMatchObject({ total: 50, paymentStatus: 'unpaid' });
    expect(order.payment).toMatchObject({ status: 'requested' });
    const payUrl = (order.payment as { payUrl: string }).payUrl;
    expect(payUrl).toMatch(/^https:\/\/shop\.example\/pay\/\S+$/);

    // The link opens a real Payments request for this order, created by the store's checkout.
    const req = await requests.byToken(payUrl.split('/pay/')[1]);
    expect(req).toMatchObject({
      businessId,
      env: 'live',
      linkType: 'Order',
      linkId: order.id,
      amountType: 'Fixed',
      contact: 'none',
      status: 'Open',
      createdById: 'storefront',
    });
    expect(Number(req.amount)).toBe(50);
    expect((await ctx.userNames([req.createdById])).get(req.createdById)).toBe(
      'Online store checkout',
    );

    // Re-submitting the same checkout returns the same order and the same link — no second request.
    const again = await service.createOrder(slug, body, `pay-${suffix}`);
    expect(again).toMatchObject({ id: order.id, payment: { payUrl } });
    expect(
      await prisma.payRequest.count({
        where: { businessId, linkId: order.id },
      }),
    ).toBe(1);

    // No phone means no CRM customer, which a payment request needs.
    const anonymous = await service.createOrder(
      slug,
      { items: [{ productId, qty: 1 }], orderType: 'takeaway' },
      `anon-${suffix}`,
    );
    expect(anonymous.payment).toMatchObject({
      status: 'not_requested',
      reason: expect.stringContaining('phone number'),
    });

    // Owner switch off: back to unpaid orders with no payment link.
    await storefront(false);
    menu = await service.getMenu(slug);
    expect(menu.business.onlinePayment).toMatchObject({
      availability: 'not_configured',
      detail: expect.stringContaining('off for this store'),
    });
    const off = await service.createOrder(
      slug,
      { ...body, customerPhone: '+14155550143' },
      `off-${suffix}`,
    );
    expect(off.payment).toBeUndefined();
  });
});
