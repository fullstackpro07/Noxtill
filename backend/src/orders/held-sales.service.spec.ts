import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { OrdersService } from './orders.service';
import { HeldSalesService } from './held-sales.service';
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

describe('HeldSalesService (UPD-BE-005)', () => {
  let prisma: PrismaService;
  let heldSalesService: HeldSalesService;
  let businessId: string;
  let productId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const ordersService = new OrdersService(
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
      {
        recordSaleMovement: jest.fn().mockResolvedValue(undefined),
      } as unknown as CashRegisterService,
    );
    heldSalesService = new HeldSalesService(
      tenantPrisma,
      cls as unknown as ClsService,
      ordersService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Held Sale Test Biz',
        slug: `held-sale-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const product = await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Held Sale Widget',
        costPrice: 5,
        sellingPrice: 20,
        stockQty: 10,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await prisma.orderItem.deleteMany({ where: { order: { businessId } } });
    await prisma.payment.deleteMany({ where: { order: { businessId } } });
    await prisma.reviewRequest.deleteMany({ where: { businessId } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.heldSale.deleteMany({ where: { businessId } });
    await prisma.stockMovement.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.auditLog.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('holds a real cart snapshot and lists it with an estimated total from current prices', async () => {
    await heldSalesService.hold(businessId, {
      items: [{ productId, qty: 2 }],
      note: 'Customer stepped away',
    });

    const list = await heldSalesService.list(businessId);
    expect(list).toHaveLength(1);
    expect(list[0].estimatedTotal).toBe(40); // 2 * 20
    expect(list[0].note).toBe('Customer stepped away');
  });

  it('resumes a held sale into a real completed order, then removes the hold', async () => {
    const held = await heldSalesService.hold(businessId, {
      items: [{ productId, qty: 1 }],
    });

    const order = await heldSalesService.resume(businessId, held.id, {
      payment: { method: 'cash' },
    });

    expect(order.status).toBe('completed');
    expect(Number(order.total)).toBe(20);

    const stillHeld = await prisma.heldSale.findUnique({
      where: { id: held.id },
    });
    expect(stillHeld).toBeNull();
  });

  it('leaves the hold intact when resume fails (e.g. insufficient stock)', async () => {
    const held = await heldSalesService.hold(businessId, {
      items: [{ productId, qty: 999 }],
    });

    await expect(
      heldSalesService.resume(businessId, held.id, {
        payment: { method: 'cash' },
      }),
    ).rejects.toThrow();

    const stillHeld = await prisma.heldSale.findUnique({
      where: { id: held.id },
    });
    expect(stillHeld).not.toBeNull();
  });

  it('discards a held sale without creating any order', async () => {
    const held = await heldSalesService.hold(businessId, {
      items: [{ productId, qty: 1 }],
    });
    await heldSalesService.discard(businessId, held.id);

    const stillHeld = await prisma.heldSale.findUnique({
      where: { id: held.id },
    });
    expect(stillHeld).toBeNull();
  });

  it('rejects resuming/discarding a held sale belonging to another business', async () => {
    const other = await prisma.business.create({
      data: { name: 'Other Biz', slug: `other-held-${Date.now()}` },
    });
    const foreignHold = await prisma.heldSale.create({
      data: { businessId: other.id, cart: { items: [{ productId, qty: 1 }] } },
    });

    await expect(
      heldSalesService.resume(businessId, foreignHold.id, {
        payment: { method: 'cash' },
      }),
    ).rejects.toThrow();
    await expect(
      heldSalesService.discard(businessId, foreignHold.id),
    ).rejects.toThrow();

    await prisma.heldSale.delete({ where: { id: foreignHold.id } });
    await prisma.business.delete({ where: { id: other.id } });
  });
});
