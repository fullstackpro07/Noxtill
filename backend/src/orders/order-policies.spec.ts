import { ClsService } from 'nestjs-cls';
import { Role } from '@prisma/client';
import { PoliciesService, resolvePolicies } from '../common/policies/policies.service';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID, CLS_KEY_ROLE, CLS_KEY_USER_ID } from '../common/tenancy/tenant.constants';
import { OrdersService } from './orders.service';
import { SendGateService } from '../messaging/send-gate.service';
import { ReviewRequestsService } from '../reviews/review-requests.service';
import { ReferralsService } from '../marketing/referrals.service';
import { CouponsService } from '../marketing/coupons.service';
import { VouchersService } from '../marketing/vouchers.service';
import { LoyaltyService } from '../customers/loyalty.service';
import { ActivityService } from '../activity/activity.service';
import { CashRegisterService } from '../cash-register/cash-register.service';
import { ORDER_ERROR_CODES } from './orders.constants';
import { computeOrderTotals } from './order-totals.util';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('computeOrderTotals with tax-inclusive prices', () => {
  it('extracts tax from the price and does not add it again', () => {
    const t = computeOrderTotals([{ price: 110, cost: 40, qty: 1 }], 0, 10, true);
    expect(t.subtotal).toBe(110);
    expect(t.tax).toBe(10);
    expect(t.total).toBe(110);
  });

  it('takes the discount off the gross price before extracting tax', () => {
    const t = computeOrderTotals([{ price: 110, cost: 40, qty: 2 }], 22, 10, true);
    // gross 220 - 22 = 198 → tax = 198 × 10 / 110 = 18
    expect(t.tax).toBe(18);
    expect(t.total).toBe(198);
  });

  it('leaves the exclusive maths unchanged when the flag is off', () => {
    const t = computeOrderTotals([{ price: 100, cost: 40, qty: 1 }], 0, 10);
    expect(t.tax).toBe(10);
    expect(t.total).toBe(110);
  });
});

describe('Owner sale policies (createSale)', () => {
  let prisma: PrismaService;
  let cls: FakeClsService;
  let orders: OrdersService;
  let policies: PoliciesService;
  let businessId: string;
  let productId: string;
  let customerId: string;
  const caps = { resolve: jest.fn() };

  const sale = (over: Record<string, unknown> = {}) =>
    orders.createSale(businessId, {
      items: [{ productId, qty: 1 }],
      payment: { method: 'cash' },
      ...over,
    } as never);

  const setPolicies = (p: Record<string, unknown>) =>
    prisma.business.update({ where: { id: businessId }, data: { policies: p as never } });

  const actAs = (role: Role | undefined, granted: string[] = []) => {
    cls.set(CLS_KEY_ROLE, role);
    caps.resolve.mockResolvedValue(granted);
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(prisma, cls as unknown as ClsService);
    policies = new PoliciesService(prisma, cls as unknown as ClsService, caps as unknown as CapabilitiesService);
    orders = new OrdersService(
      tenantPrisma,
      cls as unknown as ClsService,
      { send: jest.fn() } as unknown as SendGateService,
      { scheduleSend: jest.fn() } as unknown as ReviewRequestsService,
      { issueRewardIfEligible: jest.fn() } as unknown as ReferralsService,
      { validateAndApply: jest.fn() } as unknown as CouponsService,
      { validateAndApply: jest.fn() } as unknown as VouchersService,
      { issueStampIfEligible: jest.fn() } as unknown as LoyaltyService,
      { record: jest.fn() } as unknown as ActivityService,
      { recordSaleMovement: jest.fn() } as unknown as CashRegisterService,
      policies,
    );

    const business = await prisma.business.create({
      data: { name: 'Policy Biz', slug: `policy-biz-${Date.now()}`, taxRate: 10 },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const user = await prisma.user.create({
      data: { name: 'Cashier', email: `policy-${Date.now()}@example.com`, passwordHash: 'x' },
    });
    cls.set(CLS_KEY_USER_ID, user.id);
    await prisma.businessUser.create({ data: { businessId, userId: user.id, role: Role.staff } });
    const product = await prisma.product.create({
      data: { businessId, kind: 'product', name: 'Widget', costPrice: 40, sellingPrice: 100, stockQty: 2 },
    });
    productId = product.id;
    const customer = await prisma.customer.create({ data: { businessId, phone: `+1555${Date.now() % 10000000}`, name: 'Buyer' } });
    customerId = customer.id;
  });

  afterAll(async () => {
    await prisma.creditEntry.deleteMany({ where: { businessId } });
    await prisma.auditLog.deleteMany({ where: { businessId } });
    await prisma.reviewRequest.deleteMany({ where: { businessId } });
    await prisma.stockMovement.deleteMany({ where: { businessId } });
    await prisma.payment.deleteMany({ where: { order: { businessId } } });
    await prisma.orderItem.deleteMany({ where: { order: { businessId } } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.user.deleteMany({ where: { businessUsers: { none: {} }, name: 'Cashier' } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await setPolicies({});
    await prisma.product.update({ where: { id: productId }, data: { stockQty: 10 } });
    actAs(Role.staff, []);
  });

  it('changes nothing while no policy is set', async () => {
    const order = await sale({ discount: 60, items: [{ productId, qty: 1, priceOverride: 10 }] });
    expect(Number(order.total)).toBeCloseTo(0, 2);
  });

  it('blocks a discount above the limit for staff, but not for someone holding the override', async () => {
    await setPolicies({ 'sales.maxDiscountPercent': 10 });
    await expect(sale({ discount: 20 })).rejects.toMatchObject({ response: { code: ORDER_ERROR_CODES.DISCOUNT_LIMIT_EXCEEDED } });
    await expect(sale({ discount: 10 })).resolves.toBeDefined();
    actAs(Role.staff, [CAPABILITIES.DISCOUNT_OVERRIDE]);
    await expect(sale({ discount: 30 })).resolves.toBeDefined();
  });

  it('lets the owner past every limit', async () => {
    await setPolicies({ 'sales.maxDiscountPercent': 5 });
    actAs(Role.owner);
    await expect(sale({ discount: 50 })).resolves.toBeDefined();
  });

  it('restricts price overrides to those who hold the capability', async () => {
    await setPolicies({ 'sales.restrictPriceOverride': true });
    await expect(sale({ items: [{ productId, qty: 1, priceOverride: 80 }] })).rejects.toMatchObject({
      response: { code: ORDER_ERROR_CODES.PRICE_OVERRIDE_RESTRICTED },
    });
    // The catalogue price is not an override.
    await expect(sale({ items: [{ productId, qty: 1, priceOverride: 100 }] })).resolves.toBeDefined();
    actAs(Role.staff, [CAPABILITIES.PRICE_OVERRIDE]);
    await expect(sale({ items: [{ productId, qty: 1, priceOverride: 80 }] })).resolves.toBeDefined();
  });

  it('requires a customer when the policy is on', async () => {
    await setPolicies({ 'sales.requireCustomer': true });
    await expect(sale()).rejects.toMatchObject({ response: { code: ORDER_ERROR_CODES.CUSTOMER_REQUIRED } });
    await expect(sale({ customerId })).resolves.toBeDefined();
  });

  it('refuses to oversell by default and allows negative stock only when the owner opts in', async () => {
    await expect(sale({ items: [{ productId, qty: 15 }] })).rejects.toMatchObject({
      response: { code: ORDER_ERROR_CODES.INSUFFICIENT_STOCK },
    });
    await setPolicies({ 'sales.allowNegativeStock': true });
    await sale({ items: [{ productId, qty: 15 }] });
    const after = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(after.stockQty).toBe(-5);
  });

  it('enforces the credit limit — the customer’s own first, then the business default', async () => {
    await setPolicies({ 'credit.defaultLimit': 150 });
    const credit = (qty: number) => sale({ customerId, payment: { method: 'credit' }, items: [{ productId, qty }] });
    // 100 + 10% tax = 110 owed → within the 150 default
    await expect(credit(1)).resolves.toBeDefined();
    // 110 already owed + 110 more = 220 > 150
    await expect(credit(1)).rejects.toMatchObject({ response: { code: ORDER_ERROR_CODES.CREDIT_LIMIT_EXCEEDED } });
    // The customer's own limit replaces the default
    await prisma.customer.update({ where: { id: customerId }, data: { creditLimit: 500 } });
    await expect(credit(1)).resolves.toBeDefined();
    actAs(Role.staff, [CAPABILITIES.CREDIT_LIMIT_OVERRIDE]);
    await prisma.customer.update({ where: { id: customerId }, data: { creditLimit: 10 } });
    await expect(credit(1)).resolves.toBeDefined();
  });

  it('records the order as tax-inclusive and does not add tax on top', async () => {
    await setPolicies({ 'sales.pricesIncludeTax': true });
    const order = await sale();
    expect(order.taxInclusive).toBe(true);
    expect(Number(order.total)).toBe(100);
    expect(Number(order.tax)).toBeCloseTo(9.09, 2);
  });

  it('resolves defaults for missing keys', () => {
    const p = resolvePolicies({ policies: { 'sales.maxDiscountPercent': 15 } });
    expect(p.num('sales.maxDiscountPercent')).toBe(15);
    expect(p.bool('sales.requireCustomer')).toBe(false);
    expect(p.num('catalog.defaultLowStockThreshold')).toBe(5);
  });

  it('rejects out-of-range and unknown policy values', () => {
    expect(() => policies.normalize('sales.maxDiscountPercent', 150)).toThrow();
    expect(() => policies.normalize('nope', 1)).toThrow();
    expect(policies.normalize('sales.maxDiscountPercent', '')).toBeNull();
    expect(policies.normalize('marketing.quietFrom', '21:30')).toBe('21:30');
    expect(() => policies.normalize('marketing.quietFrom', '25:00')).toThrow();
  });
});
