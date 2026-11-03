import { ClsService } from 'nestjs-cls';
import {
  CommerceComplianceDocType,
  CommerceMarketEligibilityStatus,
  CommerceRiskCaseStatus,
  CommerceRiskRuleKey,
  CouponType,
  OrderStatus,
  OrderType,
  ReturnRefundMethod,
  ReturnStatus,
} from '@prisma/client';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommerceRiskService, documentStatus } from './commerce-risk.service';

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

describe('documentStatus', () => {
  const now = new Date('2026-10-01T00:00:00Z');
  it('classifies expiry relative to the 30-day warning window', () => {
    expect(documentStatus(null, now)).toBe('no_expiry');
    expect(documentStatus(new Date(now.getTime() - DAY), now)).toBe('expired');
    expect(documentStatus(new Date(now.getTime() + 10 * DAY), now)).toBe(
      'expiring',
    );
    expect(documentStatus(new Date(now.getTime() + 60 * DAY), now)).toBe(
      'valid',
    );
  });
});

describe('CommerceRiskService (MySQL)', () => {
  let prisma: PrismaService;
  let service: CommerceRiskService;
  let businessId: string;
  let productId: string;
  let repeatCustomer: string;
  let calmCustomer: string;
  let overReturnCustomer: string;
  let couponId: string;
  let orderNo = 1;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    service = new CommerceRiskService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
    );
    businessId = (
      await prisma.business.create({
        data: { name: 'Risk Test', slug: `risk-${stamp}` },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    productId = (
      await prisma.product.create({ data: { businessId, name: 'Kettle' } })
    ).id;
    repeatCustomer = (
      await prisma.customer.create({
        data: {
          businessId,
          name: 'Riley Repeat',
          phone: `+1555000${String(stamp).slice(-4)}1`,
        },
      })
    ).id;
    calmCustomer = (
      await prisma.customer.create({
        data: {
          businessId,
          name: 'Casey Calm',
          phone: `+1555000${String(stamp).slice(-4)}2`,
        },
      })
    ).id;
    overReturnCustomer = (
      await prisma.customer.create({
        data: {
          businessId,
          name: 'Pat Over-returned',
          phone: `+1555000${String(stamp).slice(-4)}3`,
        },
      })
    ).id;
    couponId = (
      await prisma.coupon.create({
        data: {
          businessId,
          code: `SAVE-${stamp}`,
          type: CouponType.fixed,
          value: 5,
        },
      })
    ).id;
  });

  afterEach(async () => {
    await prisma.commerceRiskAudit.deleteMany({ where: { businessId } });
    await prisma.commerceRiskCase.deleteMany({ where: { businessId } });
    await prisma.commerceRiskRule.deleteMany({ where: { businessId } });
    await prisma.commerceMarketEligibility.deleteMany({
      where: { businessId },
    });
    await prisma.commerceComplianceDocument.deleteMany({
      where: { businessId },
    });
    const returns = await prisma.return.findMany({
      where: { businessId },
      select: { id: true },
    });
    await prisma.returnItem.deleteMany({
      where: { returnId: { in: returns.map((row) => row.id) } },
    });
    await prisma.return.deleteMany({ where: { businessId } });
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
    await prisma.coupon.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  function order(
    customerId: string,
    options: { qty?: number; coupon?: boolean; status?: OrderStatus } = {},
  ) {
    return prisma.order.create({
      data: {
        businessId,
        orderNo: orderNo++,
        customerId,
        orderType: OrderType.online,
        status: options.status ?? OrderStatus.completed,
        couponId: options.coupon ? couponId : null,
        couponDiscountAmount: options.coupon ? 5 : null,
        items: {
          create: {
            productId,
            name: 'Kettle',
            price: 30,
            cost: 10,
            qty: options.qty ?? 1,
          },
        },
      },
    });
  }

  function returnFor(
    orderId: string,
    customerId: string,
    status: ReturnStatus = ReturnStatus.approved,
  ) {
    return prisma.return.create({
      data: {
        businessId,
        orderId,
        customerId,
        reason: 'Changed mind',
        refundMethod: ReturnRefundMethod.card,
        refundAmount: 30,
        status,
        items: { create: { productId, qty: 1, amount: 30 } },
      },
    });
  }

  it('creates documented default rules and audits rule changes', async () => {
    const rules = await service.rules(businessId);
    expect(
      Object.fromEntries(rules.map((rule) => [rule.key, rule.threshold])),
    ).toEqual({
      repeat_returns: 3,
      over_returned_order: 1,
      coupon_repeat_use: 4,
    });
    const updated = await service.updateRule(
      businessId,
      'owner',
      CommerceRiskRuleKey.repeat_returns,
      { threshold: 5 },
    );
    expect(updated.threshold).toBe(5);
    expect(
      await prisma.commerceRiskAudit.count({
        where: { businessId, action: 'rule_updated' },
      }),
    ).toBe(1);
  });

  it('flags repeat returns and over-returned orders from real records', async () => {
    for (let i = 0; i < 3; i += 1) {
      const placed = await order(repeatCustomer);
      await returnFor(placed.id, repeatCustomer);
    }
    const calm = await order(calmCustomer);
    await returnFor(calm.id, calmCustomer);
    // Rejected returns never count.
    await returnFor(calm.id, calmCustomer, ReturnStatus.rejected);
    // One unit ordered, two approved returns of one unit each.
    const doubled = await order(overReturnCustomer);
    await returnFor(doubled.id, overReturnCustomer);
    await returnFor(doubled.id, overReturnCustomer);

    const findings = await service.detect(businessId);
    const summary = findings.map((finding) => [
      finding.ruleKey,
      finding.entityId,
      finding.signalCount,
    ]);
    expect(summary).toEqual(
      expect.arrayContaining([
        [CommerceRiskRuleKey.repeat_returns, repeatCustomer, 3],
        [CommerceRiskRuleKey.over_returned_order, doubled.id, 1],
      ]),
    );
    expect(
      findings.some(
        (finding) =>
          finding.ruleKey === CommerceRiskRuleKey.repeat_returns &&
          finding.entityId === calmCustomer,
      ),
    ).toBe(false);
    const over = findings.find(
      (finding) => finding.ruleKey === CommerceRiskRuleKey.over_returned_order,
    )!;
    expect(over).toMatchObject({ severity: 'high', exposureAmount: 60 });
  });

  it('flags repeated coupon use but ignores cancelled orders', async () => {
    for (let i = 0; i < 4; i += 1)
      await order(repeatCustomer, { coupon: true });
    await order(calmCustomer, { coupon: true });
    await order(calmCustomer, { coupon: true, status: OrderStatus.cancelled });
    const findings = await service.detect(businessId);
    const coupon = findings.filter(
      (finding) => finding.ruleKey === CommerceRiskRuleKey.coupon_repeat_use,
    );
    expect(coupon.map((finding) => finding.entityId)).toEqual([repeatCustomer]);
    expect(coupon[0].exposureAmount).toBe(20);
  });

  it('records cases idempotently and only reopens a closed case when the pattern grows', async () => {
    const orders: Array<{ id: string }> = [];
    for (let i = 0; i < 3; i += 1) {
      const placed = await order(repeatCustomer);
      orders.push(placed);
      await returnFor(placed.id, repeatCustomer);
    }
    expect(await service.runChecks(businessId, 'owner')).toMatchObject({
      created: 1,
    });
    expect(await service.runChecks(businessId, 'owner')).toMatchObject({
      created: 0,
      refreshed: 1,
    });
    const [riskCase] = await service.listCases(businessId);
    await expect(
      service.setCaseStatus(
        businessId,
        'owner',
        riskCase.id,
        CommerceRiskCaseStatus.dismissed,
      ),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_RISK_REASON_REQUIRED' },
    });
    await service.setCaseStatus(
      businessId,
      'owner',
      riskCase.id,
      CommerceRiskCaseStatus.dismissed,
      'Known wholesale customer returning samples',
    );
    await expect(
      service.setCaseStatus(
        businessId,
        'owner',
        riskCase.id,
        CommerceRiskCaseStatus.investigating,
      ),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_RISK_INVALID_TRANSITION' },
    });

    expect(await service.runChecks(businessId, 'owner')).toMatchObject({
      reopened: 0,
    });
    const another = await order(repeatCustomer);
    await returnFor(another.id, repeatCustomer);
    expect(await service.runChecks(businessId, 'owner')).toMatchObject({
      reopened: 1,
    });
    const [reopened] = await service.listCases(businessId);
    expect(reopened).toMatchObject({
      status: CommerceRiskCaseStatus.open,
      signalCount: 4,
    });
  });

  it('tracks compliance documents and requires a reason to block a market', async () => {
    await service.createDocument(businessId, 'owner', {
      docType: CommerceComplianceDocType.certificate,
      title: 'CE declaration',
      productId,
      markets: ['de', 'fr'],
      expiresAt: new Date(Date.now() + 5 * DAY).toISOString(),
    });
    await service.createDocument(businessId, 'owner', {
      docType: CommerceComplianceDocType.test_report,
      title: 'Lab report 2024',
      expiresAt: new Date(Date.now() - DAY).toISOString(),
    });
    const documents = await service.listDocuments(businessId);
    expect(
      Object.fromEntries(documents.map((doc) => [doc.title, doc.status])),
    ).toEqual({ 'CE declaration': 'expiring', 'Lab report 2024': 'expired' });
    expect(
      documents.find((doc) => doc.title === 'CE declaration')?.markets,
    ).toEqual(['DE', 'FR']);

    await expect(
      service.setEligibility(businessId, 'owner', {
        productId,
        market: 'us',
        status: CommerceMarketEligibilityStatus.blocked,
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_RISK_REASON_REQUIRED' },
    });
    await service.setEligibility(businessId, 'owner', {
      productId,
      market: 'us',
      status: CommerceMarketEligibilityStatus.blocked,
      reason: 'UL listing not obtained',
    });
    await service.setEligibility(businessId, 'owner', {
      productId,
      market: 'US',
      status: CommerceMarketEligibilityStatus.review_required,
      reason: 'UL application submitted',
    });
    const rows = await service.listEligibility(businessId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      market: 'US',
      status: CommerceMarketEligibilityStatus.review_required,
    });
    expect(await service.summary(businessId)).toMatchObject({
      documentsExpiring: 1,
      documentsExpired: 1,
      blockedMarkets: 0,
      marketsInReview: 1,
    });
  });
});
