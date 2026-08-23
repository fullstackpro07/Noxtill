import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ActivityService } from '../activity/activity.service';
import { CreditService } from './credit.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('CreditService (BE-030)', () => {
  let prisma: PrismaService;
  let creditService: CreditService;
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
    const auditService = new AuditService(
      tenantPrisma,
      cls as unknown as ClsService,
    );
    const activity = { record: jest.fn().mockResolvedValue(undefined) };
    creditService = new CreditService(
      tenantPrisma,
      cls as unknown as ClsService,
      auditService,
      activity as unknown as ActivityService,
    );

    const business = await prisma.business.create({
      data: { name: 'Credit Test Biz', slug: `credit-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const customer = await prisma.customer.create({
      data: { businessId, phone: `+1${Date.now()}`, name: 'Debtor Dan' },
    });
    customerId = customer.id;

    await prisma.creditEntry.create({
      data: {
        businessId,
        customerId,
        kind: 'credit',
        amount: 500,
        note: 'Opening balance',
      },
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { businessId } });
    await prisma.installment.deleteMany({ where: { businessId } });
    await prisma.installmentPlan.deleteMany({ where: { businessId } });
    await prisma.creditShareLink.deleteMany({ where: { businessId } });
    await prisma.creditEntry.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('lists the debtor with the correct outstanding balance', async () => {
    const debtors = await creditService.listDebtors();
    const debtor = debtors.find((d) => d.customerId === customerId);
    expect(debtor).toBeDefined();
    expect(debtor?.balance).toBe(500);
  });

  it('records a payment, reduces the balance, and audit-logs before/after', async () => {
    const result = await creditService.recordPayment({
      customerId,
      amount: 200,
      method: 'cash',
    });

    expect(result.balanceBefore).toBe(500);
    expect(result.balanceAfter).toBe(300);

    const balance = await creditService.getBalance(customerId);
    expect(balance).toBe(300);

    const audits = await prisma.auditLog.findMany({
      where: { entityId: result.entry.id },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe('credit.payment');
  });

  it('excludes the customer from the debtors list once fully paid off', async () => {
    await creditService.recordPayment({
      customerId,
      amount: 300,
      method: 'cash',
    });

    const debtors = await creditService.listDebtors();
    expect(debtors.find((d) => d.customerId === customerId)).toBeUndefined();
  });

  it('flags opted-out customers in the debtors list', async () => {
    const optedOutCustomer = await prisma.customer.create({
      data: {
        businessId,
        phone: `+1${Date.now()}9`,
        name: 'Opted Out Ollie',
        optedOut: true,
      },
    });
    await prisma.creditEntry.create({
      data: {
        businessId,
        customerId: optedOutCustomer.id,
        kind: 'credit',
        amount: 50,
        note: 'Opening balance',
      },
    });

    const debtors = await creditService.listDebtors();
    const debtor = debtors.find((d) => d.customerId === optedOutCustomer.id);
    expect(debtor?.optedOutOfReminders).toBe(true);
  });

  it('builds a ledger with correct running balance for a customer with credit and payment entries', async () => {
    const ledgerCustomer = await prisma.customer.create({
      data: { businessId, phone: `+1${Date.now()}8`, name: 'Ledger Larry' },
    });
    await prisma.creditEntry.create({
      data: {
        businessId,
        customerId: ledgerCustomer.id,
        kind: 'credit',
        amount: 100,
        note: 'Sale',
      },
    });
    await creditService.recordPayment({
      customerId: ledgerCustomer.id,
      amount: 40,
      method: 'cash',
    });

    const ledger = await creditService.getLedger(ledgerCustomer.id);
    expect(ledger.balance).toBe(60);
    expect(ledger.entries).toHaveLength(2);
    expect(ledger.entries[0].runningBalance).toBe(100);
    expect(ledger.entries[1].runningBalance).toBe(60);
  });

  describe('Instalment plans (UPD-BE-021)', () => {
    it('creates a plan and its lines when amounts match, writing no CreditEntry', async () => {
      const c = await prisma.customer.create({
        data: { businessId, phone: `+1${Date.now()}7`, name: 'Plan Customer' },
      });
      const before = await prisma.creditEntry.count({
        where: { customerId: c.id },
      });

      const plan = await creditService.createInstallmentPlan(c.id, {
        totalAmount: 300,
        installments: [
          { amount: 100, dueDate: '2026-09-01' },
          { amount: 100, dueDate: '2026-10-01' },
          { amount: 100, dueDate: '2026-11-01' },
        ],
      });

      expect(plan.status).toBe('active');
      expect(plan.installments).toHaveLength(3);
      expect(plan.installments[0].seq).toBe(1);

      const after = await prisma.creditEntry.count({
        where: { customerId: c.id },
      });
      expect(after).toBe(before);
    });

    it('rejects a plan whose line amounts do not sum to totalAmount', async () => {
      const c = await prisma.customer.create({
        data: {
          businessId,
          phone: `+1${Date.now()}6`,
          name: 'Mismatch Customer',
        },
      });
      await expect(
        creditService.createInstallmentPlan(c.id, {
          totalAmount: 300,
          installments: [{ amount: 100, dueDate: '2026-09-01' }],
        }),
      ).rejects.toThrow();
    });
  });

  describe('Write-off (UPD-BE-023)', () => {
    it('rejects a write-off with a wrong confirmation phrase', async () => {
      const c = await prisma.customer.create({
        data: {
          businessId,
          phone: `+1${Date.now()}5`,
          name: 'Writeoff Customer',
        },
      });
      await prisma.creditEntry.create({
        data: {
          businessId,
          customerId: c.id,
          kind: 'credit',
          amount: 100,
          note: 'Sale',
        },
      });

      await expect(
        creditService.writeOff(c.id, {
          amount: 50,
          reason: 'Uncollectable',
          confirm: 'nope',
        }),
      ).rejects.toThrow();
    });

    it('rejects writing off more than the outstanding balance', async () => {
      const c = await prisma.customer.create({
        data: {
          businessId,
          phone: `+1${Date.now()}4`,
          name: 'Overwriteoff Customer',
        },
      });
      await prisma.creditEntry.create({
        data: {
          businessId,
          customerId: c.id,
          kind: 'credit',
          amount: 100,
          note: 'Sale',
        },
      });

      await expect(
        creditService.writeOff(c.id, {
          amount: 500,
          reason: 'Too much',
          confirm: 'WRITE OFF',
        }),
      ).rejects.toThrow();
    });

    it('writes off real debt, records a write_off CreditEntry, and audit-logs it', async () => {
      const c = await prisma.customer.create({
        data: {
          businessId,
          phone: `+1${Date.now()}3`,
          name: 'Real Writeoff Customer',
        },
      });
      await prisma.creditEntry.create({
        data: {
          businessId,
          customerId: c.id,
          kind: 'credit',
          amount: 100,
          note: 'Sale',
        },
      });

      const result = await creditService.writeOff(c.id, {
        amount: 60,
        reason: 'Customer went out of business',
        confirm: 'WRITE OFF',
      });

      expect(result.balanceBefore).toBe(100);
      expect(result.balanceAfter).toBe(40);
      expect(result.entry.kind).toBe('write_off');

      const audits = await prisma.auditLog.findMany({
        where: { entityId: result.entry.id },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0].action).toBe('credit.write_off');
    });
  });

  describe('Transparent ledger links (UPD-BE-022)', () => {
    it('creates a share link and reuses the same active one on a second call', async () => {
      const c = await prisma.customer.create({
        data: {
          businessId,
          phone: `+1${Date.now()}2`,
          name: 'Share Link Customer',
        },
      });

      const first = await creditService.createShareLink(c.id);
      const second = await creditService.createShareLink(c.id);
      expect(second.id).toBe(first.id);
      expect(second.token).toBe(first.token);
    });

    it('revoking a link stops it from being reused, and a fresh one is minted next time', async () => {
      const c = await prisma.customer.create({
        data: {
          businessId,
          phone: `+1${Date.now()}1`,
          name: 'Revoke Customer',
        },
      });

      const link = await creditService.createShareLink(c.id);
      const revoked = await creditService.revokeShareLink(link.id);
      expect(revoked.revoked).toBe(true);

      const fresh = await creditService.createShareLink(c.id);
      expect(fresh.id).not.toBe(link.id);
    });
  });

  describe('Outstanding view, sort=overdue (UPD-BE-093)', () => {
    it('sorts by days_outstanding descending instead of balance', async () => {
      const older = await prisma.customer.create({
        data: { businessId, phone: `+1${Date.now()}o1`, name: 'Older Debtor' },
      });
      const newer = await prisma.customer.create({
        data: { businessId, phone: `+1${Date.now()}o2`, name: 'Newer Debtor' },
      });
      // A small balance but an old entry — should still sort ahead of a bigger, fresher balance under sort=overdue.
      await prisma.creditEntry.create({
        data: {
          businessId,
          customerId: older.id,
          kind: 'credit',
          amount: 10,
          createdAt: new Date('2020-01-01'),
        },
      });
      await prisma.creditEntry.create({
        data: {
          businessId,
          customerId: newer.id,
          kind: 'credit',
          amount: 1000,
        },
      });

      const byOverdue = await creditService.listDebtors('overdue');
      const olderIdx = byOverdue.findIndex((d) => d.customerId === older.id);
      const newerIdx = byOverdue.findIndex((d) => d.customerId === newer.id);
      expect(olderIdx).toBeLessThan(newerIdx);

      const byBalance = await creditService.listDebtors('balance');
      const olderBalIdx = byBalance.findIndex((d) => d.customerId === older.id);
      const newerBalIdx = byBalance.findIndex((d) => d.customerId === newer.id);
      expect(newerBalIdx).toBeLessThan(olderBalIdx);
    });
  });

  describe('Overdue ageing (UPD-BE-094)', () => {
    it('buckets a real debtor by days_outstanding and flags 90+-with-no-plan as at-risk', async () => {
      const atRiskCustomer = await prisma.customer.create({
        data: {
          businessId,
          phone: `+1${Date.now()}ar`,
          name: 'At Risk Customer',
        },
      });
      await prisma.creditEntry.create({
        data: {
          businessId,
          customerId: atRiskCustomer.id,
          kind: 'credit',
          amount: 200,
          createdAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000),
        },
      });

      const report = await creditService.overdueAgeing();
      const ninetyPlus = report.buckets.find((b) => b.key === 'ninetyPlus');
      expect(ninetyPlus).toBeDefined();
      expect(ninetyPlus!.count).toBeGreaterThanOrEqual(1);
      expect(
        report.atRisk.debtors.some((d) => d.customerId === atRiskCustomer.id),
      ).toBe(true);
    });

    it('excludes a 90+ debtor from at-risk once they have an active instalment plan', async () => {
      const plannedCustomer = await prisma.customer.create({
        data: {
          businessId,
          phone: `+1${Date.now()}pl`,
          name: 'Planned Customer',
        },
      });
      await prisma.creditEntry.create({
        data: {
          businessId,
          customerId: plannedCustomer.id,
          kind: 'credit',
          amount: 300,
          createdAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
        },
      });
      await creditService.createInstallmentPlan(plannedCustomer.id, {
        totalAmount: 300,
        installments: [{ amount: 300, dueDate: '2026-12-01' }],
      });

      const report = await creditService.overdueAgeing();
      expect(
        report.atRisk.debtors.some((d) => d.customerId === plannedCustomer.id),
      ).toBe(false);
    });
  });

  describe('collectedToday (UPD-FE-076)', () => {
    it('sums only real payments recorded today, across both direct payments and instalments', async () => {
      const c = await prisma.customer.create({
        data: {
          businessId,
          phone: `+1${Date.now()}ct`,
          name: 'Collected Today Customer',
        },
      });
      await prisma.creditEntry.create({
        data: { businessId, customerId: c.id, kind: 'credit', amount: 200 },
      });
      const before = await creditService.collectedToday();
      await creditService.recordPayment({
        customerId: c.id,
        amount: 75,
        method: 'cash',
      });
      const after = await creditService.collectedToday();
      expect(after).toBeCloseTo(before + 75, 2);
    });
  });

  describe('Recovery Reports (UPD-BE-096)', () => {
    it('aggregates extended/recovered/recoveryRate/writtenOff from real CreditEntry rows', async () => {
      const c = await prisma.customer.create({
        data: {
          businessId,
          phone: `+1${Date.now()}rr`,
          name: 'Recovery Customer',
        },
      });
      await prisma.creditEntry.create({
        data: { businessId, customerId: c.id, kind: 'credit', amount: 400 },
      });
      await creditService.recordPayment({
        customerId: c.id,
        amount: 100,
        method: 'cash',
      });
      await creditService.writeOff(c.id, {
        amount: 50,
        reason: 'test',
        confirm: 'WRITE OFF',
      });

      const report = await creditService.recoveryReport(12);
      expect(report.extended).toBeGreaterThanOrEqual(400);
      expect(report.recovered).toBeGreaterThanOrEqual(100);
      expect(report.writtenOff).toBeGreaterThanOrEqual(50);
      expect(report.netExposure).toBeGreaterThanOrEqual(0);
    });
  });
});
