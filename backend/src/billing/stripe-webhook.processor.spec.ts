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

  describe('Membership depth fix (UPD-INT-007) — disambiguated by real membershipId metadata', () => {
    let membershipPlanId: string;
    let membershipId: string;
    let membershipCustomerId: string;

    beforeAll(async () => {
      const plan = await prisma.membershipPlan.create({
        data: {
          businessId,
          name: 'Webhook Membership Plan',
          price: 20,
          interval: 'monthly',
          stripePriceId: `price_membership_${Date.now()}`,
        },
      });
      membershipPlanId = plan.id;

      const customer = await prisma.customer.create({
        data: {
          businessId,
          name: 'Membership Webhook Customer',
          phone: `+1${Date.now()}mw`,
        },
      });
      membershipCustomerId = customer.id;

      const membership = await prisma.membership.create({
        data: {
          businessId,
          planId: membershipPlanId,
          customerId: membershipCustomerId,
          status: 'pending',
          method: 'online',
        },
      });
      membershipId = membership.id;
    });

    afterAll(async () => {
      await prisma.membership.deleteMany({ where: { businessId } });
      await prisma.membershipPlan.delete({ where: { id: membershipPlanId } });
      await prisma.customer.delete({ where: { id: membershipCustomerId } });
    });

    it('activates a pending membership for real on checkout.session.completed, never touching Business', async () => {
      subscriptionsRetrieve.mockResolvedValue({
        id: 'sub_membership_1',
        metadata: { membershipId },
        items: {
          data: [
            {
              price: { id: 'price_irrelevant' },
              current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
            },
          ],
        },
      });

      await processor.process(
        jobOf('checkout.session.completed', {
          client_reference_id: membershipId, // a membership id here, not a businessId
          subscription: 'sub_membership_1',
          customer: 'cus_membership_1',
        }),
      );

      const membership = await prisma.membership.findUniqueOrThrow({
        where: { id: membershipId },
      });
      expect(membership.status).toBe('active');
      expect(membership.stripeSubscriptionId).toBe('sub_membership_1');
      expect(membership.currentPeriodEnd).not.toBeNull();

      // The business's own Stripe fields must be untouched by a membership's checkout.
      const business = await prisma.business.findUniqueOrThrow({
        where: { id: businessId },
      });
      expect(business.stripeCustomerId).not.toBe('cus_membership_1');
    });

    it('advances currentPeriodEnd on a real recurring renewal (customer.subscription.updated)', async () => {
      const newPeriodEnd = Math.floor(Date.now() / 1000) + 60 * 86400;
      await processor.process(
        jobOf('customer.subscription.updated', {
          id: 'sub_membership_1',
          status: 'active',
          items: { data: [{ current_period_end: newPeriodEnd }] },
        }),
      );

      const membership = await prisma.membership.findUniqueOrThrow({
        where: { id: membershipId },
      });
      expect(membership.status).toBe('active');
      expect(Math.floor(membership.currentPeriodEnd!.getTime() / 1000)).toBe(
        newPeriodEnd,
      );
    });

    it('marks a membership expired on a real failed-payment cancellation (customer.subscription.deleted)', async () => {
      await processor.process(
        jobOf('customer.subscription.deleted', { id: 'sub_membership_1' }),
      );

      const membership = await prisma.membership.findUniqueOrThrow({
        where: { id: membershipId },
      });
      expect(membership.status).toBe('expired');

      // The business's own plan must be untouched by a membership's cancellation.
      const business = await prisma.business.findUniqueOrThrow({
        where: { id: businessId },
      });
      const basic = await prisma.plan.findUniqueOrThrow({
        where: { key: BASIC_PLAN_KEY },
      });
      expect(business.planId).toBe(basic.id); // already Basic from the earlier test, unchanged
    });
  });
});
