import { ClsService } from 'nestjs-cls';
import {
  CommerceListingDraftStatus,
  CommerceStoreOpportunityStatus,
  CommerceStoreRuleKey,
  OrderStatus,
  OrderType,
  ReturnRefundMethod,
  ReturnStatus,
} from '@prisma/client';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommerceStoreOptimizerService } from './commerce-store-optimizer.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('CommerceStoreOptimizerService (MySQL)', () => {
  let prisma: PrismaService;
  let service: CommerceStoreOptimizerService;
  let businessId: string;
  let customerId: string;
  let healthy: string;
  let messy: string;
  let orderNo = 1;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    service = new CommerceStoreOptimizerService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
    );
    businessId = (
      await prisma.business.create({
        data: { name: 'Store Opt', slug: `store-opt-${stamp}` },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    customerId = (
      await prisma.customer.create({
        data: { businessId, name: 'Pat', phone: `+1555${stamp}` },
      })
    ).id;
    healthy = (
      await prisma.product.create({
        data: {
          businessId,
          name: 'Healthy mug',
          photoKey: 'mug.jpg',
          category: 'Kitchen',
          stockQty: 20,
          costPrice: 4,
          sellingPrice: 10,
        },
      })
    ).id;
    messy = (
      await prisma.product.create({
        data: {
          businessId,
          name: 'Messy jacket',
          stockQty: 0,
          costPrice: 30,
          sellingPrice: 25,
        },
      })
    ).id;
  });

  afterEach(async () => {
    await prisma.commerceStoreAudit.deleteMany({ where: { businessId } });
    await prisma.commerceStoreOpportunity.deleteMany({ where: { businessId } });
  });

  afterAll(async () => {
    await prisma.commerceListingDraft.deleteMany({ where: { businessId } });
    await prisma.productWaitlistEntry.deleteMany({ where: { businessId } });
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
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  async function sell(productId: string, qty: number) {
    return prisma.order.create({
      data: {
        businessId,
        orderNo: orderNo++,
        orderType: OrderType.online,
        status: OrderStatus.completed,
        items: {
          create: { productId, name: 'item', price: 25, cost: 30, qty },
        },
      },
    });
  }

  beforeAll(async () => {
    // 10 jackets sold recently, 4 returned for sizing → 40% return rate; still demanded while out of stock.
    const order = await sell(messy, 10);
    await prisma.return.create({
      data: {
        businessId,
        orderId: order.id,
        reason: 'Too small',
        refundMethod: ReturnRefundMethod.card,
        refundAmount: 100,
        status: ReturnStatus.approved,
        items: { create: { productId: messy, qty: 4, amount: 100 } },
      },
    });
    await sell(healthy, 5);
    await prisma.productWaitlistEntry.create({
      data: { businessId, customerId, productId: messy },
    });
    await prisma.commerceListingDraft.create({
      data: {
        businessId,
        productId: healthy,
        channel: 'shopify',
        status: CommerceListingDraftStatus.approved,
      },
    });
  });

  it('finds real, explainable issues and none for a healthy product', async () => {
    const findings = await service.detect(businessId);
    const byRule = (rule: CommerceStoreRuleKey) =>
      findings
        .filter((finding) => finding.ruleKey === rule)
        .map((finding) => finding.productId);
    expect(byRule(CommerceStoreRuleKey.missing_photo)).toEqual([messy]);
    expect(byRule(CommerceStoreRuleKey.missing_category)).toEqual([messy]);
    expect(byRule(CommerceStoreRuleKey.below_cost_price)).toEqual([messy]);
    expect(byRule(CommerceStoreRuleKey.out_of_stock_demand)).toEqual([messy]);
    expect(byRule(CommerceStoreRuleKey.listing_not_synced)).toEqual([healthy]);
    const returns = findings.find(
      (finding) => finding.ruleKey === CommerceStoreRuleKey.high_return_rate,
    )!;
    expect(returns).toMatchObject({
      productId: messy,
      metricValue: 40,
      impact: 'high',
    });
    expect(returns.evidence.topReasons).toEqual([
      { reason: 'too small', units: 4 },
    ]);
  });

  it('records findings once, never lets a button verify a fix, and verifies on re-check', async () => {
    expect(await service.runChecks(businessId, 'owner')).toMatchObject({
      created: 6,
      verified: 0,
    });
    expect(await service.runChecks(businessId, 'owner')).toMatchObject({
      created: 0,
      refreshed: 6,
    });

    const photo = (await service.list(businessId)).find(
      (row) => row.ruleKey === CommerceStoreRuleKey.missing_photo,
    )!;
    await expect(
      service.setStatus(
        businessId,
        'owner',
        photo.id,
        CommerceStoreOpportunityStatus.verified,
      ),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_STORE_INVALID_TRANSITION' },
    });
    await service.setStatus(
      businessId,
      'owner',
      photo.id,
      CommerceStoreOpportunityStatus.done,
    );

    // Marked done but not actually fixed: the re-check keeps it as done, not verified.
    await service.runChecks(businessId, 'owner');
    expect(
      (
        await prisma.commerceStoreOpportunity.findUniqueOrThrow({
          where: { id: photo.id },
        })
      ).status,
    ).toBe(CommerceStoreOpportunityStatus.done);

    await prisma.product.update({
      where: { id: messy },
      data: { photoKey: 'jacket.jpg' },
    });
    expect(await service.runChecks(businessId, 'owner')).toMatchObject({
      verified: 1,
    });
    const fixed = await prisma.commerceStoreOpportunity.findUniqueOrThrow({
      where: { id: photo.id },
    });
    expect(fixed.status).toBe(CommerceStoreOpportunityStatus.verified);
    expect(fixed.verifiedAt).not.toBeNull();
    await prisma.product.update({
      where: { id: messy },
      data: { photoKey: null },
    });
  });

  it('requires a reason to dismiss and keeps dismissed findings dismissed', async () => {
    await service.runChecks(businessId, 'owner');
    const category = (await service.list(businessId)).find(
      (row) => row.ruleKey === CommerceStoreRuleKey.missing_category,
    )!;
    await expect(
      service.setStatus(
        businessId,
        'owner',
        category.id,
        CommerceStoreOpportunityStatus.dismissed,
      ),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_STORE_REASON_REQUIRED' },
    });
    await service.setStatus(
      businessId,
      'owner',
      category.id,
      CommerceStoreOpportunityStatus.dismissed,
      'Sold only by staff, not browsed',
    );
    await service.runChecks(businessId, 'owner');
    expect(
      (
        await prisma.commerceStoreOpportunity.findUniqueOrThrow({
          where: { id: category.id },
        })
      ).status,
    ).toBe(CommerceStoreOpportunityStatus.dismissed);
    expect(await service.summary(businessId)).toMatchObject({
      dismissed: 1,
      openOpportunities: 5,
    });
  });
});
