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

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('OrdersService.createDraft/convertDraft (UPD-BE-009)', () => {
  let prisma: PrismaService;
  let ordersService: OrdersService;
  let businessId: string;
  let productId: string;
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
      activity as unknown as ActivityService,
      cashRegister as unknown as CashRegisterService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Draft Orders Test Biz',
        slug: `draft-orders-test-${Date.now()}`,
        taxRate: 10,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const product = await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Draft Widget',
        costPrice: 40,
        sellingPrice: 100,
        stockQty: 10,
      },
    });
    productId = product.id;
  });

  afterEach(() => {
    activity.record.mockClear();
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { businessId } });
    await prisma.stockMovement.deleteMany({ where: { businessId } });
    await prisma.payment.deleteMany({ where: { order: { businessId } } });
    await prisma.orderItem.deleteMany({ where: { order: { businessId } } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('creates a real draft order with items but touches no stock, payment, or activity', async () => {
    const draft = await ordersService.createDraft(businessId, {
      items: [{ productId, qty: 2 }],
    });

    expect(draft.status).toBe('draft');
    expect(Number(draft.total)).toBe(220);

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    expect(product.stockQty).toBe(10); // unchanged — draft never decrements stock

    expect(activity.record).not.toHaveBeenCalled();

    const listed = await ordersService.findAll('draft');
    expect(listed.some((o) => o.id === draft.id)).toBe(true);
  });

  it('converts a draft into a real completed sale, decrementing stock and locking in the draft price', async () => {
    const draft = await ordersService.createDraft(businessId, {
      items: [{ productId, qty: 1 }],
    });

    // Live price changes after the draft was taken — convert should still charge the locked price.
    await prisma.product.update({
      where: { id: productId },
      data: { sellingPrice: 500 },
    });

    const order = await ordersService.convertDraft(businessId, draft.id, {
      payment: { method: 'cash' },
    });

    expect(order.status).toBe('completed');
    expect(Number(order.total)).toBe(110); // still priced at 100, not the new 500

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    expect(product.stockQty).toBe(9);

    const stillDraft = await prisma.order.findUnique({
      where: { id: draft.id },
    });
    expect(stillDraft).toBeNull();

    await prisma.product.update({
      where: { id: productId },
      data: { sellingPrice: 100 },
    });
  });

  it('rejects converting an id that is not a pending draft', async () => {
    const completed = await ordersService.createDraft(businessId, {
      items: [{ productId, qty: 1 }],
    });
    await ordersService.convertDraft(businessId, completed.id, {
      payment: { method: 'cash' },
    });

    await expect(
      ordersService.convertDraft(businessId, completed.id, {
        payment: { method: 'cash' },
      }),
    ).rejects.toThrow();
  });
});
