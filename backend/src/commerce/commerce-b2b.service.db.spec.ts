import { ClsService } from 'nestjs-cls';
import {
  CommerceB2bAccountStatus,
  CommerceB2bPriceListStatus,
  CreditEntryKind,
  OrderStatus,
  OrderType,
  QuotationStatus,
} from '@prisma/client';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommerceB2bService, reorderSignal } from './commerce-b2b.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

const DAY = 24 * 60 * 60 * 1000;

describe('reorderSignal', () => {
  const now = new Date('2026-10-01T00:00:00Z');
  it('needs enough history and averages the gaps between orders', () => {
    expect(reorderSignal([now], now)).toEqual({
      status: 'insufficient_history',
      orders: 1,
    });
    const every10 = [40, 30, 20].map(
      (daysAgo) => new Date(now.getTime() - daysAgo * DAY),
    );
    expect(reorderSignal(every10, now)).toMatchObject({
      status: 'due',
      averageGapDays: 10,
    });
    const recent = [25, 15, 5].map(
      (daysAgo) => new Date(now.getTime() - daysAgo * DAY),
    );
    expect(reorderSignal(recent, now).status).toBe('not_due');
  });
});

describe('CommerceB2bService (MySQL)', () => {
  let prisma: PrismaService;
  let service: CommerceB2bService;
  let businessId: string;
  let customerId: string;
  let otherCustomerId: string;
  let flour: string;
  let sugar: string;
  let orderNo = 1;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    service = new CommerceB2bService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
    );
    businessId = (
      await prisma.business.create({
        data: { name: 'B2B Test', slug: `b2b-${stamp}` },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    customerId = (
      await prisma.customer.create({
        data: {
          businessId,
          name: 'Cafe Owner',
          phone: `+1555${stamp}1`,
          creditLimit: 50,
        },
      })
    ).id;
    otherCustomerId = (
      await prisma.customer.create({
        data: { businessId, name: 'Other', phone: `+1555${stamp}2` },
      })
    ).id;
    flour = (
      await prisma.product.create({
        data: { businessId, name: 'Flour', sellingPrice: 10 },
      })
    ).id;
    sugar = (
      await prisma.product.create({
        data: { businessId, name: 'Sugar', sellingPrice: 8 },
      })
    ).id;
  });

  afterEach(async () => {
    await prisma.commerceB2bAudit.deleteMany({ where: { businessId } });
    await prisma.commerceB2bAccount.deleteMany({ where: { businessId } });
    await prisma.commerceB2bPriceList.deleteMany({ where: { businessId } });
    await prisma.commerceB2bTier.deleteMany({ where: { businessId } });
    await prisma.creditEntry.deleteMany({ where: { businessId } });
    const orders = await prisma.order.findMany({
      where: { businessId },
      select: { id: true },
    });
    await prisma.orderItem.deleteMany({
      where: { orderId: { in: orders.map((row) => row.id) } },
    });
    await prisma.order.deleteMany({ where: { businessId } });
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  async function setupAccount() {
    const tier = await service.createTier(businessId, 'owner', {
      name: 'Gold',
      defaultDiscountPct: 10,
      minOrderValue: 100,
      paymentTermsDays: 30,
    });
    const list = await service.createPriceList(businessId, 'owner', {
      name: 'Cafe list',
      items: [{ productId: flour, unitPrice: 7, minQty: 10 }],
    });
    const account = await service.createAccount(businessId, 'owner', {
      customerId,
      companyName: 'Corner Cafe Ltd',
      tierId: tier.id,
      priceListId: list.id,
    });
    return { tier, list, account };
  }

  it('wraps one CRM customer and validates links', async () => {
    const { list } = await setupAccount();
    await expect(
      service.createAccount(businessId, 'owner', {
        customerId,
        companyName: 'Again',
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_B2B_ACCOUNT_EXISTS' },
    });
    await expect(
      service.createAccount(businessId, 'owner', {
        customerId: 'missing-customer',
        companyName: 'Ghost',
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_B2B_CUSTOMER_NOT_FOUND' },
    });
    await service.updatePriceList(businessId, 'owner', list.id, {
      status: CommerceB2bPriceListStatus.archived,
    });
    await expect(
      service.createAccount(businessId, 'owner', {
        customerId: otherCustomerId,
        companyName: 'Other Ltd',
        priceListId: list.id,
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_B2B_INVALID_STATE' },
    });
  });

  it('reports real order value, open quotes, canonical credit and reorder cadence', async () => {
    await setupAccount();
    const now = new Date();
    for (const daysAgo of [40, 30, 20]) {
      await prisma.order.create({
        data: {
          businessId,
          orderNo: orderNo++,
          customerId,
          orderType: OrderType.counter,
          status: OrderStatus.completed,
          total: 120,
          createdAt: new Date(now.getTime() - daysAgo * DAY),
        },
      });
    }
    await prisma.order.create({
      data: {
        businessId,
        orderNo: orderNo++,
        customerId,
        isQuotation: true,
        quotationStatus: QuotationStatus.sent,
        total: 500,
      },
    });
    await prisma.creditEntry.createMany({
      data: [
        { businessId, customerId, kind: CreditEntryKind.credit, amount: 100 },
        { businessId, customerId, kind: CreditEntryKind.payment, amount: 30 },
      ],
    });

    const [account] = await service.listAccounts(businessId, now);
    const sameYear = [40, 30, 20].filter(
      (daysAgo) =>
        new Date(now.getTime() - daysAgo * DAY).getFullYear() ===
        now.getFullYear(),
    ).length;
    expect(account).toMatchObject({
      companyName: 'Corner Cafe Ltd',
      paymentTermsDays: 30,
      minOrderValue: 100,
      ytdOrderValue: sameYear * 120,
      openQuotes: 1,
      credit: { limit: 50, balance: 70, available: -20, overLimit: true },
    });
    expect(account.reorder).toMatchObject({
      status: 'due',
      averageGapDays: 10,
    });
    expect(await service.summary(businessId)).toMatchObject({
      activeAccounts: 1,
      overCreditLimit: 1,
      openQuotes: 1,
      reordersDue: 1,
      receivables: 70,
    });
  });

  it('previews wholesale pricing without changing canonical prices', async () => {
    const { account } = await setupAccount();
    const preview = await service.previewQuote(businessId, account.id, {
      lines: [
        { productId: flour, qty: 12 },
        { productId: sugar, qty: 2 },
      ],
    });
    expect(
      preview.lines.map((line) => [line.name, line.unitPrice, line.source]),
    ).toEqual([
      ['Flour', 7, 'price_list'],
      ['Sugar', 7.2, 'tier_discount'],
    ]);
    expect(preview.total).toBe(98.4);
    expect(preview.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('minimum order value')]),
    );

    const small = await service.previewQuote(businessId, account.id, {
      lines: [{ productId: flour, qty: 2 }],
    });
    expect(small.lines[0]).toMatchObject({
      unitPrice: 9,
      source: 'tier_discount',
    });
    expect(small.lines[0].note).toContain('at least 10 units');
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: flour },
    });
    expect(Number(product.sellingPrice)).toBe(10);
  });

  it('suspends and reactivates with an audit trail', async () => {
    const { account } = await setupAccount();
    await service.setAccountStatus(
      businessId,
      'owner',
      account.id,
      CommerceB2bAccountStatus.suspended,
      'Payment overdue 90 days',
    );
    const preview = await service.previewQuote(businessId, account.id, {
      lines: [{ productId: sugar, qty: 20 }],
    });
    expect(preview.warnings).toContain('This account is suspended.');
    await service.setAccountStatus(
      businessId,
      'owner',
      account.id,
      CommerceB2bAccountStatus.active,
    );
    const actions = await prisma.commerceB2bAudit.findMany({
      where: { businessId, entityId: account.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(actions.map((row) => row.action)).toEqual([
      'account_created',
      'account_suspended',
      'account_reactivated',
    ]);
    expect(actions[1].reason).toBe('Payment overdue 90 days');
  });
});
