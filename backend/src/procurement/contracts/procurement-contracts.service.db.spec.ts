import { ClsService } from 'nestjs-cls';
import {
  ProcurementRequestStatus,
  ProductKind,
  PurchaseOrderStatus,
  Role,
} from '@prisma/client';
import { CLS_KEY_BUSINESS_ID } from '../../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ProcurementAnalyticsService } from './procurement-analytics.service';
import {
  ProcurementContractsService,
  effectiveStatus,
} from './procurement-contracts.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
  run<T>(fn: () => T): T {
    return fn();
  }
}

const day = (offset: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() + offset * 86_400_000);
};
const ymd = (d: Date) => d.toISOString().slice(0, 10);

describe('Procurement contracts & analytics (MySQL)', () => {
  let prisma: PrismaService;
  let cls: FakeClsService;
  let contracts: ProcurementContractsService;
  let analytics: ProcurementAnalyticsService;
  const stamp = Date.now();
  let businessId: string;
  let otherBusinessId: string;
  let userId: string;
  let supplierId: string;
  let productId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    const tenant = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    contracts = new ProcurementContractsService(
      tenant,
      prisma,
      new NotificationsService(tenant),
      cls as unknown as ClsService,
    );
    analytics = new ProcurementAnalyticsService(tenant, prisma);
    businessId = (
      await prisma.business.create({
        data: { name: 'Proc Co', slug: `proc-c-${stamp}`, currency: 'USD' },
      })
    ).id;
    otherBusinessId = (
      await prisma.business.create({
        data: { name: 'Other Proc', slug: `proc-o-${stamp}` },
      })
    ).id;
    userId = (
      await prisma.user.create({
        data: {
          email: `proc-${stamp}@test.local`,
          name: 'Pat Owner',
          passwordHash: 'x',
        },
      })
    ).id;
    await prisma.businessUser.create({
      data: { businessId, userId, role: Role.owner },
    });
    supplierId = (
      await prisma.supplier.create({
        data: { businessId, name: 'Acme Supply' },
      })
    ).id;
    productId = (
      await prisma.product.create({
        data: {
          businessId,
          name: 'Flour',
          category: 'Baking',
          kind: ProductKind.product,
          sellingPrice: 5,
        },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    const ids = [businessId, otherBusinessId];
    await prisma.auditLog.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.notification.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.procurementSupplierContractVersion.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.procurementSupplierContract.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.commerceRfq.updateMany({
      where: { businessId: { in: ids } },
      data: { awardedQuoteId: null },
    });
    await prisma.commerceSupplierQuote.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.commerceRfq.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.procurementRequest.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.purchaseOrderItem.deleteMany({
      where: { purchaseOrder: { businessId: { in: ids } } },
    });
    await prisma.purchaseOrder.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.product.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.supplier.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.businessUser.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  const po = async (createdAt: Date, qty: number, unitCost: number) =>
    prisma.purchaseOrder.create({
      data: {
        businessId,
        supplierId,
        status: PurchaseOrderStatus.sent,
        createdAt,
        items: { create: [{ productId, qtyOrdered: qty, unitCost }] },
      },
    });

  it('versions terms, requires re-confirmation, and measures spend inside and after the contract', async () => {
    const c = await contracts.create(businessId, userId, {
      supplierId,
      reference: `C-${stamp}`,
      title: 'Flour supply',
      effectiveFrom: ymd(day(-60)),
      expiresAt: ymd(day(-10)),
      documentUrl: 'https://docs.example.com/contract.pdf',
      discountTiers: [{ minQty: 100, percent: 5 }],
    });
    await contracts.setStatus(businessId, userId, c.id, 'active');
    await contracts.confirmTerms(businessId, userId, c.id);
    await po(day(-30), 10, 2); // inside: 20
    await po(day(-2), 5, 4); // after expiry: 20

    let list = await contracts.list(businessId);
    let row = list.contracts[0];
    expect(row).toMatchObject({
      effectiveStatus: 'expired',
      spendUnderContract: 20,
      posUnderContract: 1,
      posAfterExpiry: 1,
    });
    expect(row.issues).toEqual(['1 PO(s) placed after expiry']);
    expect(list.kpis.nonCompliant).toBe(1);

    // Changing terms creates v2 and clears the confirmation; extending expiry covers the later PO.
    const updated = await contracts.updateTerms(businessId, userId, c.id, {
      expiresAt: ymd(day(200)),
      reason: 'Renewed for a year',
    });
    expect(updated).toMatchObject({ version: 2, termsConfirmedAt: null });
    list = await contracts.list(businessId);
    row = list.contracts[0];
    expect(row).toMatchObject({
      effectiveStatus: 'active',
      spendUnderContract: 40,
      posAfterExpiry: 0,
    });
    expect(row.issues).toEqual([
      'Terms not confirmed against the source document',
    ]);
    const versions = await contracts.versions(businessId, c.id);
    expect(
      versions
        .filter((v) => v.kind === 'terms')
        .map((v) => v.version)
        .sort(),
    ).toEqual([1, 2]);
    expect(
      versions.some((v) => v.kind === 'status' && v.reason === 'Activated'),
    ).toBe(true);

    await expect(
      contracts.setStatus(businessId, userId, c.id, 'terminated'),
    ).rejects.toMatchObject({
      response: { code: 'PROCUREMENT_CONTRACT_INVALID' },
    });

    // Tenant isolation.
    cls.set(CLS_KEY_BUSINESS_ID, otherBusinessId);
    expect((await contracts.list(otherBusinessId)).contracts).toEqual([]);
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  it('sends one renewal alert per term once the notice window opens', async () => {
    const c = await contracts.create(businessId, userId, {
      supplierId,
      reference: `R-${stamp}`,
      title: 'Packaging',
      effectiveFrom: ymd(day(-100)),
      expiresAt: ymd(day(40)),
      noticeDays: 30,
      autoRenew: true,
    });
    await contracts.setStatus(businessId, userId, c.id, 'active');
    // Notice deadline = expiry − 30 days = 10 days away; the default 30-day lead opens the window.
    expect(
      effectiveStatus(
        {
          status: 'active',
          expiresAt: day(40),
          noticeDays: 30,
          autoRenew: true,
        },
        30,
      ),
    ).toBe('renewal_due');
    expect(
      effectiveStatus(
        {
          status: 'active',
          expiresAt: day(40),
          noticeDays: 30,
          autoRenew: true,
        },
        5,
      ),
    ).toBe('active');

    const first = await contracts.sendRenewalAlerts();
    const second = await contracts.sendRenewalAlerts();
    expect(first.sent).toBeGreaterThanOrEqual(1);
    expect(second.sent).toBe(0);
    const notes = await prisma.notification.findMany({
      where: { businessId, userId, title: { contains: `R-${stamp}` } },
    });
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toContain('auto-renews unless you give notice');
  });

  it('computes analytics from real records and only counts like-for-like savings', async () => {
    const request = await prisma.procurementRequest.create({
      data: {
        businessId,
        requesterUserId: userId,
        reason: 'Restock flour',
        currency: 'USD',
        status: ProcurementRequestStatus.converted,
        submittedAt: day(-6),
        department: 'Kitchen',
        items: {
          create: [
            {
              description: 'Flour',
              quantity: 10,
              estimatedUnitCost: 3,
              productId,
            },
          ],
        },
      },
    });
    const rfq = await prisma.commerceRfq.create({
      data: {
        businessId,
        requirement: 'Flour',
        currency: 'USD',
        status: 'awarded',
        sourceProcurementRequestId: request.id,
        items: { create: [{ description: 'Flour', qty: 10 }] },
      },
      include: { items: true },
    });
    const invite = await prisma.commerceRfqSupplier.create({
      data: {
        rfqId: rfq.id,
        supplierId,
        status: 'responded',
        invitedAt: day(-5),
        respondedAt: new Date(day(-5).getTime() + 6 * 3_600_000),
      },
    });
    const quote = await prisma.commerceSupplierQuote.create({
      data: {
        businessId,
        rfqId: rfq.id,
        supplierId,
        invitationId: invite.id,
        currency: 'USD',
        status: 'awarded',
        freight: 2,
        duties: 0,
        items: {
          create: [
            { rfqItemId: rfq.items[0].id, quotedQty: 10, unitPrice: 2.5 },
          ],
        },
      },
    });
    await prisma.commerceRfq.update({
      where: { id: rfq.id },
      data: { awardedQuoteId: quote.id },
    });
    const converted = await po(day(-4), 10, 2.5);
    await prisma.procurementRequest.update({
      where: { id: request.id },
      data: { convertedPurchaseOrderId: converted.id },
    });

    const a = await analytics.analytics(businessId, { days: 90 });
    // Baseline 10 × 3 = 30; awarded 10 × 2.5 + 2 freight = 27 → saving 3 (10%).
    expect(a.kpis.savingsVsBaseline).toMatchObject({
      amount: 3,
      percent: 10,
      comparedRfqs: 1,
    });
    expect(a.kpis.rfqParticipation).toMatchObject({
      invited: 1,
      responded: 1,
      rate: 100,
    });
    expect(a.kpis.supplierResponseHours).toMatchObject({ median: 6 });
    expect(a.kpis.requestToPoCycleDays).toMatchObject({ median: 2, sample: 1 });
    expect(a.kpis.matchExceptionRate).toMatchObject({
      value: null,
      availability: 'not_available',
    });
    expect(a.spendByCategory).toEqual([{ category: 'Baking', committed: 65 }]);
    // All three POs fall inside the (now extended) Flour contract or the active packaging contract.
    expect(a.kpis.offContractSpend.amount).toBe(0);
    expect(a.departments).toEqual([
      expect.objectContaining({
        department: 'Kitchen',
        converted: 1,
        estimated: 30,
      }),
    ]);
  });
});
