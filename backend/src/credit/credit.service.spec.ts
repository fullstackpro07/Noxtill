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
});
