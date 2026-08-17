import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { OrdersService } from './orders.service';
import { SendGateService } from '../messaging/send-gate.service';
import { ReviewRequestsService } from '../reviews/review-requests.service';
import { ReferralsService } from '../marketing/referrals.service';
import { CouponsService } from '../marketing/coupons.service';
import { VouchersService } from '../marketing/vouchers.service';
import { LoyaltyService } from '../customers/loyalty.service';
import { ActivityService } from '../activity/activity.service';
import { CashRegisterService } from '../cash-register/cash-register.service';
import { AppException } from '../common/filters/app.exception';
import { ORDER_ERROR_CODES } from './orders.constants';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('OrdersService.createSale (BE-025 atomic transaction)', () => {
  let prisma: PrismaService;
  let ordersService: OrdersService;
  let businessId: string;
  let productId: string;
  const sendGate = { send: jest.fn().mockResolvedValue(undefined) };
  const reviewRequests = {
    scheduleSend: jest.fn().mockResolvedValue(undefined),
  };
  const referrals = {
    issueRewardIfEligible: jest.fn().mockResolvedValue(undefined),
  };
  const coupons = {
    validateAndApply: jest.fn(),
  };
  const vouchers = {
    validateAndApply: jest.fn(),
  };
  const loyalty = {
    issueStampIfEligible: jest.fn().mockResolvedValue(undefined),
  };
  const activity = { record: jest.fn().mockResolvedValue(undefined) };
  const cashRegister = {
    recordSaleMovement: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    ordersService = new OrdersService(
      tenantPrisma,
      cls as unknown as ClsService,
      sendGate as unknown as SendGateService,
      reviewRequests as unknown as ReviewRequestsService,
      referrals as unknown as ReferralsService,
      coupons as unknown as CouponsService,
      vouchers as unknown as VouchersService,
      loyalty as unknown as LoyaltyService,
      activity as unknown as ActivityService,
      cashRegister as unknown as CashRegisterService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Sales Test Biz',
        slug: `sales-test-${Date.now()}`,
        taxRate: 10,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const product = await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Widget',
        costPrice: 40,
        sellingPrice: 100,
        stockQty: 5,
      },
    });
    productId = product.id;
  });

  afterEach(() => {
    sendGate.send.mockClear();
    reviewRequests.scheduleSend.mockClear();
    coupons.validateAndApply.mockClear();
    vouchers.validateAndApply.mockClear();
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { businessId } });
    await prisma.reviewRequest.deleteMany({ where: { businessId } });
    await prisma.stockMovement.deleteMany({ where: { businessId } });
    await prisma.payment.deleteMany({ where: { order: { businessId } } });
    await prisma.orderItem.deleteMany({ where: { order: { businessId } } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.coupon.deleteMany({ where: { businessId } });
    await prisma.voucher.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('creates the order, items, stock movement, and payment atomically', async () => {
    const order = await ordersService.createSale(businessId, {
      items: [{ productId, qty: 2 }],
      payment: { method: 'cash' },
    });

    expect(Number(order.subtotal)).toBe(200);
    expect(Number(order.tax)).toBe(20);
    expect(Number(order.total)).toBe(220);
    expect(Number(order.cogs)).toBe(80);

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    expect(product.stockQty).toBe(3);

    const movements = await prisma.stockMovement.findMany({
      where: { productId, kind: 'sale' },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0].qty).toBe(-2);

    const payments = await prisma.payment.findMany({
      where: { orderId: order.id },
    });
    expect(payments).toHaveLength(1);
    expect(Number(payments[0].amount)).toBe(220);

    const audits = await prisma.auditLog.findMany({
      where: { entityId: order.id, entity: 'Order' },
    });
    expect(audits).toHaveLength(1);
  });

  it('upserts a customer by phone and updates lifetime stats', async () => {
    const phone = `+1${Date.now()}`;
    const order = await ordersService.createSale(businessId, {
      items: [{ productId, qty: 1 }],
      customerPhone: phone,
      customerName: 'Jane Doe',
      payment: { method: 'card' },
    });

    const customer = await prisma.customer.findUniqueOrThrow({
      where: { businessId_phone: { businessId, phone } },
    });
    expect(customer.id).toBe(order.customerId);
    expect(Number(customer.lifetimeSpend)).toBe(110);
    expect(customer.visitCount).toBe(1);

    expect(reviewRequests.scheduleSend).toHaveBeenCalledWith(
      businessId,
      customer.id,
      expect.any(String),
    );

    // UPD-BE-024: the loyalty stamp-issuance hook runs inside the same transaction as every
    // other post-sale customer effect (referrals, review requests) — confirms the wiring, not
    // just LoyaltyService's own logic (already covered in loyalty.service.spec.ts).
    expect(loyalty.issueStampIfEligible).toHaveBeenCalledWith(
      businessId,
      customer.id,
      order.id,
      expect.anything(),
    );
  });

  it('applies a coupon discount via CouponsService and stores couponId/couponDiscountAmount (UPD-BE-029 wiring)', async () => {
    // Dedicated product, so this test's stock decrement doesn't disturb the shared `productId`
    // stock count the other tests in this file depend on running in order.
    const wiringProduct = await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Coupon Wiring Widget',
        costPrice: 40,
        sellingPrice: 100,
        stockQty: 5,
      },
    });
    const coupon = await prisma.coupon.create({
      data: {
        businessId,
        code: `WIRING-${Date.now()}`,
        type: 'fixed',
        value: 20,
      },
    });
    coupons.validateAndApply.mockResolvedValueOnce({
      couponId: coupon.id,
      discountAmount: 20,
    });

    const order = await ordersService.createSale(businessId, {
      items: [{ productId: wiringProduct.id, qty: 1 }], // subtotal 100
      couponCode: coupon.code,
      payment: { method: 'cash' },
    });

    expect(coupons.validateAndApply).toHaveBeenCalledWith(
      businessId,
      coupon.code,
      100,
      undefined,
      expect.anything(),
    );
    expect(Number(order.discount)).toBe(20);
    expect(order.couponId).toBe(coupon.id);
    expect(Number(order.couponDiscountAmount)).toBe(20);
    // subtotal 100, discount 20 -> taxable 80, tax 10% = 8, total = 88
    expect(Number(order.total)).toBe(88);
  });

  it('applies a voucher toward payment (not the total) via VouchersService (UPD-BE-030 wiring)', async () => {
    const wiringProduct = await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Voucher Wiring Widget',
        costPrice: 40,
        sellingPrice: 100,
        stockQty: 5,
      },
    });
    const voucher = await prisma.voucher.create({
      data: {
        businessId,
        code: `WIRING-${Date.now()}`,
        initialValue: 50,
        balance: 50,
      },
    });
    vouchers.validateAndApply.mockResolvedValueOnce({
      voucherId: voucher.id,
      amountApplied: 50,
    });

    const order = await ordersService.createSale(businessId, {
      items: [{ productId: wiringProduct.id, qty: 1 }], // subtotal 100, tax 10 -> total 110
      voucherCode: voucher.code,
      voucherAmount: 50,
      payment: { method: 'cash' },
    });

    expect(vouchers.validateAndApply).toHaveBeenCalledWith(
      businessId,
      voucher.code,
      50,
      110,
      expect.anything(),
    );
    expect(order.voucherId).toBe(voucher.id);
    expect(Number(order.voucherAmountApplied)).toBe(50);
    expect(Number(order.total)).toBe(110); // a voucher is a payment method, not a discount

    const payments = await prisma.payment.findMany({
      where: { orderId: order.id },
    });
    expect(payments).toHaveLength(1);
    expect(Number(payments[0].amount)).toBe(60); // 110 total - 50 voucher = 60 collected via cash
  });

  it('rolls back the entire transaction on insufficient stock (no partial rows)', async () => {
    const ordersBefore = await prisma.order.count({ where: { businessId } });

    await expect(
      ordersService.createSale(businessId, {
        items: [{ productId, qty: 999 }],
        payment: { method: 'cash' },
      }),
    ).rejects.toMatchObject({
      response: { code: ORDER_ERROR_CODES.INSUFFICIENT_STOCK },
    });

    const ordersAfter = await prisma.order.count({ where: { businessId } });
    expect(ordersAfter).toBe(ordersBefore);

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    expect(product.stockQty).toBe(2); // unchanged from the previous test (5 - 2 - 1)
  });

  it('rejects a credit sale with no customer', async () => {
    await expect(
      ordersService.createSale(businessId, {
        items: [{ productId, qty: 1 }],
        payment: { method: 'credit' },
      }),
    ).rejects.toBeInstanceOf(AppException);
  });
});

describe('OrdersService.updateStatus (BE-026 flow guard)', () => {
  let prisma: PrismaService;
  let ordersService: OrdersService;
  let businessId: string;
  let productId: string;
  const sendGate = { send: jest.fn().mockResolvedValue(undefined) };
  const reviewRequests = {
    scheduleSend: jest.fn().mockResolvedValue(undefined),
  };
  const referrals = {
    issueRewardIfEligible: jest.fn().mockResolvedValue(undefined),
  };
  const coupons = {
    validateAndApply: jest.fn(),
  };
  const vouchers = {
    validateAndApply: jest.fn(),
  };
  const loyalty = {
    issueStampIfEligible: jest.fn().mockResolvedValue(undefined),
  };
  const activity = { record: jest.fn().mockResolvedValue(undefined) };
  const cashRegister = {
    recordSaleMovement: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    ordersService = new OrdersService(
      tenantPrisma,
      cls as unknown as ClsService,
      sendGate as unknown as SendGateService,
      reviewRequests as unknown as ReviewRequestsService,
      referrals as unknown as ReferralsService,
      coupons as unknown as CouponsService,
      vouchers as unknown as VouchersService,
      loyalty as unknown as LoyaltyService,
      activity as unknown as ActivityService,
      cashRegister as unknown as CashRegisterService,
    );

    const business = await prisma.business.create({
      data: { name: 'Status Test Biz', slug: `status-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const product = await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Gadget',
        costPrice: 10,
        sellingPrice: 20,
        stockQty: 10,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { businessId } });
    await prisma.reviewRequest.deleteMany({ where: { businessId } });
    await prisma.stockMovement.deleteMany({ where: { businessId } });
    await prisma.payment.deleteMany({ where: { order: { businessId } } });
    await prisma.orderItem.deleteMany({ where: { order: { businessId } } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('walks pending -> confirmed -> in_progress -> completed and notifies the customer each time', async () => {
    const phone = `+1${Date.now()}`;
    const order = await ordersService.createSale(businessId, {
      items: [{ productId, qty: 1 }],
      customerPhone: phone,
      payment: { method: 'cash' },
    });
    // createSale marks the order completed directly; reset to pending for this flow-guard test.
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'pending' },
    });
    sendGate.send.mockClear();

    await ordersService.updateStatus(businessId, order.id, 'confirmed');
    await ordersService.updateStatus(businessId, order.id, 'in_progress');
    const completed = await ordersService.updateStatus(
      businessId,
      order.id,
      'completed',
    );

    expect(completed.status).toBe('completed');
    expect(sendGate.send).toHaveBeenCalledTimes(3);
  });

  it('rejects skipping a step', async () => {
    const order = await prisma.order.create({
      data: {
        businessId,
        orderNo: 9999,
        status: 'pending',
        orderType: 'counter',
      },
    });

    await expect(
      ordersService.updateStatus(businessId, order.id, 'completed'),
    ).rejects.toBeInstanceOf(AppException);
  });
});
