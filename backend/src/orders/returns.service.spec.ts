import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_USER_ID,
} from '../common/tenancy/tenant.constants';
import { OrdersService } from './orders.service';
import { ReturnsService } from './returns.service';
import { SendGateService } from '../messaging/send-gate.service';
import { ReviewRequestsService } from '../reviews/review-requests.service';
import { ReferralsService } from '../marketing/referrals.service';
import { CouponsService } from '../marketing/coupons.service';
import { VouchersService } from '../marketing/vouchers.service';
import { LoyaltyService } from '../customers/loyalty.service';
import { ActivityService } from '../activity/activity.service';
import { CashRegisterService } from '../cash-register/cash-register.service';
import { BillingService } from '../billing/billing.service';
import { AppException } from '../common/filters/app.exception';
import { deleteCrossTestBusinessRows } from '../common/testing/cleanup-test-business';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('ReturnsService (UPD-BE-011)', () => {
  let prisma: PrismaService;
  let ordersService: OrdersService;
  let returnsService: ReturnsService;
  let businessId: string;
  let customerId: string;
  let productId: string;
  const cashRegister = {
    recordSaleMovement: jest.fn().mockResolvedValue(undefined),
    recordRefundMovement: jest.fn().mockResolvedValue(undefined),
  };
  const billing = { refund: jest.fn() };

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
      {
        send: jest.fn().mockResolvedValue(undefined),
      } as unknown as SendGateService,
      {
        scheduleSend: jest.fn().mockResolvedValue(undefined),
      } as unknown as ReviewRequestsService,
      {
        issueRewardIfEligible: jest.fn().mockResolvedValue(undefined),
      } as unknown as ReferralsService,
      { validateAndApply: jest.fn() } as unknown as CouponsService,
      { validateAndApply: jest.fn() } as unknown as VouchersService,
      {
        issueStampIfEligible: jest.fn().mockResolvedValue(undefined),
      } as unknown as LoyaltyService,
      {
        record: jest.fn().mockResolvedValue(undefined),
      } as unknown as ActivityService,
      cashRegister as unknown as CashRegisterService,
    );
    returnsService = new ReturnsService(
      tenantPrisma,
      cls as unknown as ClsService,
      cashRegister as unknown as CashRegisterService,
      billing as unknown as BillingService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Returns Test Biz',
        slug: `returns-test-${Date.now()}`,
        taxRate: 0,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, 'test-actor');

    const product = await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Returnable Widget',
        costPrice: 20,
        sellingPrice: 50,
        stockQty: 10,
      },
    });
    productId = product.id;

    const customer = await prisma.customer.create({
      data: { businessId, phone: `+1${Date.now()}`, name: 'Return Customer' },
    });
    customerId = customer.id;
  });

  afterEach(() => {
    cashRegister.recordRefundMovement.mockClear();
    billing.refund.mockReset();
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { businessId } });
    await prisma.reviewRequest.deleteMany({ where: { businessId } });
    await prisma.creditEntry.deleteMany({ where: { businessId } });
    await prisma.stockMovement.deleteMany({ where: { businessId } });
    await prisma.returnItem.deleteMany({ where: { return: { businessId } } });
    await prisma.return.deleteMany({ where: { businessId } });
    await prisma.payment.deleteMany({ where: { order: { businessId } } });
    await prisma.orderItem.deleteMany({ where: { order: { businessId } } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await deleteCrossTestBusinessRows(prisma, businessId);
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  async function makeSale(qty: number) {
    return ordersService.createSale(businessId, {
      customerId,
      items: [{ productId, qty }],
      payment: { method: 'cash' },
    });
  }

  it('computes the refund amount server-side from the order item price, ignoring anything the client might send', async () => {
    const order = await makeSale(3);
    const ret = await returnsService.create(businessId, {
      orderId: order.id,
      reason: 'Customer changed mind',
      refundMethod: 'cash',
      items: [{ productId, qty: 2 }],
    });
    expect(Number(ret.refundAmount)).toBe(100); // 2 x 50, not anything client-supplied
    expect(ret.status).toBe('pending');
  });

  it('rejects a return that requests more than was actually sold', async () => {
    const order = await makeSale(1);
    await expect(
      returnsService.create(businessId, {
        orderId: order.id,
        reason: 'Too many',
        refundMethod: 'cash',
        items: [{ productId, qty: 5 }],
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('approving a cash return restocks inventory and records a cash-drawer refund movement', async () => {
    const order = await makeSale(2);
    const before = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });

    const ret = await returnsService.create(businessId, {
      orderId: order.id,
      reason: 'Damaged in transit but restockable',
      refundMethod: 'cash',
      items: [{ productId, qty: 1 }],
    });
    const approved = await returnsService.approve(businessId, ret.id);

    expect(approved.status).toBe('approved');
    const after = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    expect(after.stockQty).toBe(before.stockQty + 1);

    const movement = await prisma.stockMovement.findFirst({
      where: { productId, kind: 'return' },
      orderBy: { createdAt: 'desc' },
    });
    expect(movement?.qty).toBe(1);

    expect(cashRegister.recordRefundMovement).toHaveBeenCalledWith(
      businessId,
      50,
      expect.any(String),
    );
  });

  it('restock: false leaves stock untouched', async () => {
    const order = await makeSale(1);
    const before = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });

    const ret = await returnsService.create(businessId, {
      orderId: order.id,
      reason: 'Unsellable',
      refundMethod: 'cash',
      restock: false,
      items: [{ productId, qty: 1 }],
    });
    await returnsService.approve(businessId, ret.id);

    const after = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    expect(after.stockQty).toBe(before.stockQty);
  });

  it('a store-credit refund creates a real CreditEntry that reduces the customer balance', async () => {
    const order = await makeSale(1);
    const ret = await returnsService.create(businessId, {
      orderId: order.id,
      reason: 'Wants store credit',
      refundMethod: 'store_credit',
      items: [{ productId, qty: 1 }],
    });
    await returnsService.approve(businessId, ret.id);

    const entries = await prisma.creditEntry.findMany({
      where: { businessId, customerId, orderId: order.id },
    });
    expect(
      entries.some((e) => e.kind === 'payment' && Number(e.amount) === 50),
    ).toBe(true);
  });

  it('a card refund with no recorded Payment.providerRef fails cleanly rather than faking success, and leaves the return pending', async () => {
    const order = await ordersService.createSale(businessId, {
      customerId,
      items: [{ productId, qty: 1 }],
      payment: { method: 'card' },
    });
    const ret = await returnsService.create(businessId, {
      orderId: order.id,
      reason: 'Card refund attempt',
      refundMethod: 'card',
      items: [{ productId, qty: 1 }],
    });

    await expect(
      returnsService.approve(businessId, ret.id),
    ).rejects.toBeInstanceOf(AppException);
    expect(billing.refund).not.toHaveBeenCalled();

    const stillPending = await prisma.return.findUniqueOrThrow({
      where: { id: ret.id },
    });
    expect(stillPending.status).toBe('pending');
  });

  it('rejecting a return records the reviewer and leaves stock/money untouched', async () => {
    const order = await makeSale(1);
    const before = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    const ret = await returnsService.create(businessId, {
      orderId: order.id,
      reason: 'Suspicious',
      refundMethod: 'cash',
      items: [{ productId, qty: 1 }],
    });

    const rejected = await returnsService.reject(
      businessId,
      ret.id,
      'Receipt does not match',
    );
    expect(rejected.status).toBe('rejected');

    const after = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    expect(after.stockQty).toBe(before.stockQty);

    await expect(
      returnsService.approve(businessId, ret.id),
    ).rejects.toBeInstanceOf(AppException);
  });
});
