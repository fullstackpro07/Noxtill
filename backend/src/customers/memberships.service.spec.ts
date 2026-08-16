import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { MembershipsService } from './memberships.service';
import { BillingService } from '../billing/billing.service';
import { AppException } from '../common/filters/app.exception';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('MembershipsService (UPD-BE-025)', () => {
  let prisma: PrismaService;
  let membershipsService: MembershipsService;
  let businessId: string;
  let customerId: string;
  const billing = {
    createSubscriptionCheckout: jest.fn(),
    cancelSubscription: jest.fn(),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    membershipsService = new MembershipsService(
      tenantPrisma,
      billing as unknown as BillingService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Memberships Test Biz',
        slug: `memberships-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const customer = await prisma.customer.create({
      data: { businessId, phone: `+1${Date.now()}`, name: 'Member Customer' },
    });
    customerId = customer.id;
  });

  afterEach(() => {
    billing.createSubscriptionCheckout.mockReset();
    billing.cancelSubscription.mockReset();
  });

  afterAll(async () => {
    await prisma.membership.deleteMany({ where: { businessId } });
    await prisma.membershipPlan.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('a cash membership is created active immediately, with no gateway call', async () => {
    const plan = await membershipsService.createPlan({
      name: 'Gym Basic',
      price: 30,
    });

    const result = await membershipsService.create(businessId, {
      customerId,
      planId: plan.id,
      method: 'cash',
    });

    expect(result.membership.status).toBe('active');
    expect(result.checkoutUrl).toBeNull();
    expect(billing.createSubscriptionCheckout).not.toHaveBeenCalled();
  });

  it('an online membership with no stripePriceId configured fails cleanly rather than faking checkout', async () => {
    const plan = await membershipsService.createPlan({
      name: 'No Stripe Plan',
      price: 40,
    });

    await expect(
      membershipsService.create(businessId, {
        customerId,
        planId: plan.id,
        method: 'online',
        successUrl: 'https://example.com/ok',
        cancelUrl: 'https://example.com/cancel',
      }),
    ).rejects.toBeInstanceOf(AppException);
    expect(billing.createSubscriptionCheckout).not.toHaveBeenCalled();
  });

  it('an online membership with a configured plan creates a real Stripe checkout session and lands pending, keyed by membershipId not businessId', async () => {
    billing.createSubscriptionCheckout.mockResolvedValue({
      url: 'https://checkout.stripe.com/session/abc',
      sessionRef: 'cs_test_abc',
    });
    const plan = await membershipsService.createPlan({
      name: 'Stripe Plan',
      price: 50,
      stripePriceId: 'price_test_123',
    });

    const result = await membershipsService.create(businessId, {
      customerId,
      planId: plan.id,
      method: 'online',
      successUrl: 'https://example.com/ok',
      cancelUrl: 'https://example.com/cancel',
    });

    expect(result.membership.status).toBe('pending');
    expect(result.checkoutUrl).toBe('https://checkout.stripe.com/session/abc');
    expect(billing.createSubscriptionCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceId: result.membership.id,
        referenceKey: 'membershipId',
        priceRef: 'price_test_123',
      }),
    );
  });

  it('activate() moves a pending membership to active, and rejects doing it twice', async () => {
    billing.createSubscriptionCheckout.mockResolvedValue({
      url: 'https://checkout.stripe.com/session/def',
      sessionRef: 'cs_test_def',
    });
    const plan = await membershipsService.createPlan({
      name: 'Activate Plan',
      price: 20,
      stripePriceId: 'price_test_456',
    });
    const { membership } = await membershipsService.create(businessId, {
      customerId,
      planId: plan.id,
      method: 'online',
      successUrl: 'https://example.com/ok',
      cancelUrl: 'https://example.com/cancel',
    });

    const activated = await membershipsService.activate(membership.id);
    expect(activated.status).toBe('active');

    await expect(
      membershipsService.activate(membership.id),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('cancel() on a cash membership never calls the gateway', async () => {
    const plan = await membershipsService.createPlan({
      name: 'Cash Cancel Plan',
      price: 10,
    });
    const { membership } = await membershipsService.create(businessId, {
      customerId,
      planId: plan.id,
      method: 'cash',
    });

    const cancelled = await membershipsService.cancel(membership.id);
    expect(cancelled.status).toBe('cancelled');
    expect(billing.cancelSubscription).not.toHaveBeenCalled();
  });

  it('cancel() does not flip local status if the real Stripe cancellation fails', async () => {
    billing.cancelSubscription.mockRejectedValue(new Error('Stripe down'));
    await prisma.membershipPlan.create({
      data: {
        businessId,
        name: 'Failing Cancel Plan',
        price: 15,
        stripePriceId: 'price_x',
      },
    });
    const membership = await prisma.membership.create({
      data: {
        businessId,
        planId: (
          await prisma.membershipPlan.findFirstOrThrow({
            where: { name: 'Failing Cancel Plan' },
          })
        ).id,
        customerId,
        status: 'active',
        method: 'online',
        stripeSubscriptionId: 'sub_real_123',
      },
    });

    await expect(membershipsService.cancel(membership.id)).rejects.toThrow(
      'Stripe down',
    );

    const stillActive = await prisma.membership.findUniqueOrThrow({
      where: { id: membership.id },
    });
    expect(stillActive.status).toBe('active');
  });

  it('rejects cancelling an already-cancelled membership', async () => {
    const plan = await membershipsService.createPlan({
      name: 'Double Cancel Plan',
      price: 10,
    });
    const { membership } = await membershipsService.create(businessId, {
      customerId,
      planId: plan.id,
      method: 'cash',
    });
    await membershipsService.cancel(membership.id);

    await expect(
      membershipsService.cancel(membership.id),
    ).rejects.toBeInstanceOf(AppException);
  });
});
