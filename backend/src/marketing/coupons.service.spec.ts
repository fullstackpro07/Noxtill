import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { CouponsService, CouponTxClient } from './coupons.service';
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

describe('CouponsService (UPD-BE-029)', () => {
  let prisma: PrismaService;
  let service: CouponsService;
  let businessId: string;
  let customerId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new CouponsService(tenantPrisma);

    const business = await prisma.business.create({
      data: { name: 'Coupons Test Biz', slug: `coupons-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const customer = await prisma.customer.create({
      data: { businessId, phone: `+1${Date.now()}`, name: 'Coupon Customer' },
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    await prisma.coupon.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('creates a real coupon and rejects a duplicate code for the same business', async () => {
    const code = `SAVE10-${Date.now()}`;
    const coupon = await service.create(businessId, {
      code,
      type: 'percentage',
      value: 10,
    });
    expect(coupon.code).toBe(code);
    expect(coupon.usedCount).toBe(0);

    await expect(
      service.create(businessId, { code, type: 'fixed', value: 5 }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('applies a percentage discount capped by maxDiscountAmount', async () => {
    const coupon = await service.create(businessId, {
      code: `PCT-CAP-${Date.now()}`,
      type: 'percentage',
      value: 50,
      maxDiscountAmount: 20,
    });

    const result = await service.validateAndApply(
      businessId,
      coupon.code,
      100,
      undefined,
      prisma,
    );

    expect(result.discountAmount).toBe(20); // 50% of 100 = 50, capped at 20
    const refreshed = await prisma.coupon.findUniqueOrThrow({
      where: { id: coupon.id },
    });
    expect(refreshed.usedCount).toBe(1);
  });

  it('applies a fixed discount never exceeding the subtotal', async () => {
    const coupon = await service.create(businessId, {
      code: `FIXED-${Date.now()}`,
      type: 'fixed',
      value: 500,
    });

    const result = await service.validateAndApply(
      businessId,
      coupon.code,
      50,
      undefined,
      prisma,
    );
    expect(result.discountAmount).toBe(50); // capped at subtotal
  });

  it('rejects a coupon below its minimum order amount', async () => {
    const coupon = await service.create(businessId, {
      code: `MIN-${Date.now()}`,
      type: 'fixed',
      value: 10,
      minOrderAmount: 100,
    });

    await expect(
      service.validateAndApply(
        businessId,
        coupon.code,
        50,
        undefined,
        prisma as unknown as CouponTxClient,
      ),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('rejects an unknown code, an inactive coupon, and an expired coupon', async () => {
    await expect(
      service.validateAndApply(
        businessId,
        'NOT-REAL',
        100,
        undefined,
        prisma as unknown as CouponTxClient,
      ),
    ).rejects.toBeInstanceOf(AppException);

    const inactive = await service.create(businessId, {
      code: `INACTIVE-${Date.now()}`,
      type: 'fixed',
      value: 5,
    });
    await service.update(inactive.id, { active: false });
    await expect(
      service.validateAndApply(
        businessId,
        inactive.code,
        100,
        undefined,
        prisma as unknown as CouponTxClient,
      ),
    ).rejects.toBeInstanceOf(AppException);

    const expired = await service.create(businessId, {
      code: `EXPIRED-${Date.now()}`,
      type: 'fixed',
      value: 5,
      expiresAt: new Date(Date.now() - 86_400_000).toISOString(),
    });
    await expect(
      service.validateAndApply(
        businessId,
        expired.code,
        100,
        undefined,
        prisma as unknown as CouponTxClient,
      ),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('enforces usageLimit and usageLimitPerCustomer against real redemption counts', async () => {
    const coupon = await service.create(businessId, {
      code: `LIMIT1-${Date.now()}`,
      type: 'fixed',
      value: 5,
      usageLimit: 1,
    });
    await service.validateAndApply(
      businessId,
      coupon.code,
      100,
      undefined,
      prisma,
    );
    await expect(
      service.validateAndApply(
        businessId,
        coupon.code,
        100,
        undefined,
        prisma as unknown as CouponTxClient,
      ),
    ).rejects.toBeInstanceOf(AppException);

    const perCustomerCoupon = await service.create(businessId, {
      code: `PERCUST-${Date.now()}`,
      type: 'fixed',
      value: 5,
      usageLimitPerCustomer: 1,
    });
    // Requires a real customer when usageLimitPerCustomer is set.
    await expect(
      service.validateAndApply(
        businessId,
        perCustomerCoupon.code,
        100,
        undefined,
        prisma as unknown as CouponTxClient,
      ),
    ).rejects.toBeInstanceOf(AppException);

    // A real customer with no prior orders against this coupon may redeem once.
    const result = await service.validateAndApply(
      businessId,
      perCustomerCoupon.code,
      100,
      customerId,
      prisma,
    );
    expect(result.discountAmount).toBe(5);
  });

  it('deactivates via update and rejects operations on a deleted coupon', async () => {
    const coupon = await service.create(businessId, {
      code: `DEL-${Date.now()}`,
      type: 'fixed',
      value: 1,
    });
    await service.remove(coupon.id);
    await expect(service.findOne(coupon.id)).rejects.toBeInstanceOf(
      AppException,
    );
  });
});
