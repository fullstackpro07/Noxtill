import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from './billing.service';
import { PaymentGatewayAdapter } from './adapters/payment-gateway.adapter';
import { StripeGatewayAdapter } from './adapters/stripe-gateway.adapter';
import { JazzCashGatewayAdapter } from './adapters/jazzcash-gateway.adapter';
import { AppException } from '../common/filters/app.exception';

function fakeAdapter(
  key: string,
  overrides: Partial<PaymentGatewayAdapter> = {},
) {
  return {
    key,
    isConfigured: true,
    createCheckoutSession: jest.fn().mockResolvedValue({
      url: `https://pay.example/${key}`,
      sessionRef: 'sess_1',
    }),
    ...overrides,
  };
}

describe('BillingService (BE-064)', () => {
  let prisma: PrismaService;
  let businessId: string;
  let ownerId: string;
  let planKey: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const business = await prisma.business.create({
      data: { name: 'Billing Test Biz', slug: `billing-test-${Date.now()}` },
    });
    businessId = business.id;

    const owner = await prisma.user.create({
      data: {
        name: 'Owner',
        email: `owner-billing-${Date.now()}@example.com`,
        passwordHash: 'x',
      },
    });
    ownerId = owner.id;
    await prisma.businessUser.create({
      data: { businessId, userId: owner.id, role: 'owner' },
    });

    planKey = `test-plan-${Date.now()}`;
    await prisma.plan.create({
      data: {
        key: planKey,
        name: 'Test Plan',
        price: 19,
        msgQuota: 1000,
        userLimit: 5,
        stripePriceId: `price_${planKey}`,
      },
    });
  });

  afterAll(async () => {
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.user.delete({ where: { id: ownerId } });
    await prisma.plan.delete({ where: { key: planKey } });
    await prisma.$disconnect();
  });

  it('creates a checkout session against the correct price id', async () => {
    const stripe = fakeAdapter('stripe');
    const service = new BillingService(
      prisma,
      stripe as unknown as StripeGatewayAdapter,
      fakeAdapter('jazzcash') as unknown as JazzCashGatewayAdapter,
    );

    const result = await service.createCheckout(businessId, {
      planKey,
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
    });

    expect(result.url).toBe('https://pay.example/stripe');
    expect(stripe.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ businessId, priceRef: `price_${planKey}` }),
    );
  });

  it('rejects an unknown plan', async () => {
    const service = new BillingService(
      prisma,
      fakeAdapter('stripe') as unknown as StripeGatewayAdapter,
      fakeAdapter('jazzcash') as unknown as JazzCashGatewayAdapter,
    );

    await expect(
      service.createCheckout(businessId, {
        planKey: 'does-not-exist',
        successUrl: 'https://app.example/success',
        cancelUrl: 'https://app.example/cancel',
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('rejects when the requested gateway is not configured', async () => {
    const service = new BillingService(
      prisma,
      fakeAdapter('stripe', {
        isConfigured: false,
      }) as unknown as StripeGatewayAdapter,
      fakeAdapter('jazzcash') as unknown as JazzCashGatewayAdapter,
    );

    await expect(
      service.createCheckout(businessId, {
        planKey,
        successUrl: 'https://app.example/success',
        cancelUrl: 'https://app.example/cancel',
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('rejects a plan that has no Stripe price configured yet', async () => {
    const bareKey = `bare-plan-${Date.now()}`;
    await prisma.plan.create({
      data: {
        key: bareKey,
        name: 'Bare Plan',
        price: 9,
        msgQuota: 100,
        userLimit: 1,
      },
    });

    const service = new BillingService(
      prisma,
      fakeAdapter('stripe') as unknown as StripeGatewayAdapter,
      fakeAdapter('jazzcash') as unknown as JazzCashGatewayAdapter,
    );

    await expect(
      service.createCheckout(businessId, {
        planKey: bareKey,
        successUrl: 'https://app.example/success',
        cancelUrl: 'https://app.example/cancel',
      }),
    ).rejects.toBeInstanceOf(AppException);

    await prisma.plan.delete({ where: { key: bareKey } });
  });
});
