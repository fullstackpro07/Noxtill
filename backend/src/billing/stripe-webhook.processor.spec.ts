import { PrismaService } from '../prisma/prisma.service';
import { PlanAssignmentService } from './plan-assignment.service';
import { StripeWebhookProcessor } from './stripe-webhook.processor';
import { StripeGatewayAdapter } from './adapters/stripe-gateway.adapter';
import { BASIC_PLAN_KEY } from './billing.constants';

function jobOf(name: string, data: unknown) {
  return { name, data } as never;
}

describe('StripeWebhookProcessor (BE-065)', () => {
  let prisma: PrismaService;
  let processor: StripeWebhookProcessor;
  let businessId: string;
  let planId: string;
  let priceId: string;
  const subscriptionsRetrieve = jest.fn();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    await prisma.plan.upsert({
      where: { key: BASIC_PLAN_KEY },
      create: {
        key: BASIC_PLAN_KEY,
        name: 'Basic',
        price: 0,
        msgQuota: 200,
        userLimit: 2,
      },
      update: { msgQuota: 200 },
    });

    priceId = `price_webhook_${Date.now()}`;
    const plan = await prisma.plan.create({
      data: {
        key: `webhook-plan-${Date.now()}`,
        name: 'Webhook Plan',
        price: 29,
        msgQuota: 2000,
        userLimit: 8,
        stripePriceId: priceId,
      },
    });
    planId = plan.id;

    const business = await prisma.business.create({
      data: {
        name: 'Stripe Webhook Test Biz',
        slug: `stripe-webhook-test-${Date.now()}`,
        trialEndsAt: new Date(),
      },
    });
    businessId = business.id;

    const fakeStripeAdapter = {
      stripe: { subscriptions: { retrieve: subscriptionsRetrieve } },
    } as unknown as StripeGatewayAdapter;

    processor = new StripeWebhookProcessor(
      prisma,
      new PlanAssignmentService(prisma),
      fakeStripeAdapter,
    );
  });

  afterEach(() => {
    subscriptionsRetrieve.mockClear();
  });

  afterAll(async () => {
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it('links the business to Stripe and assigns the purchased plan on checkout.session.completed', async () => {
    subscriptionsRetrieve.mockResolvedValue({
      items: { data: [{ price: { id: priceId } }] },
    });

    await processor.process(
      jobOf('checkout.session.completed', {
        client_reference_id: businessId,
        subscription: 'sub_123',
        customer: 'cus_123',
      }),
    );

    const business = await prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    expect(business.stripeCustomerId).toBe('cus_123');
    expect(business.stripeSubscriptionId).toBe('sub_123');
    expect(business.trialEndsAt).toBeNull();
    expect(business.planId).toBe(planId);
  });

  it('downgrades to Basic and clears the subscription id on customer.subscription.deleted', async () => {
    await processor.process(
      jobOf('customer.subscription.deleted', { id: 'sub_123' }),
    );

    const business = await prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    expect(business.stripeSubscriptionId).toBeNull();

    const basic = await prisma.plan.findUniqueOrThrow({
      where: { key: BASIC_PLAN_KEY },
    });
    expect(business.planId).toBe(basic.id);
  });
});
