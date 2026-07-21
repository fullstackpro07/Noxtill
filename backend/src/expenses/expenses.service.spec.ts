import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ExpensesService } from './expenses.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('ExpensesService (BE-035)', () => {
  let prisma: PrismaService;
  let expensesService: ExpensesService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    expensesService = new ExpensesService(tenantPrisma, prisma);

    const business = await prisma.business.create({
      data: { name: 'Expenses Test Biz', slug: `expenses-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.expense.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('creates and lists expenses filtered by month', async () => {
    await expensesService.create({
      category: 'Rent',
      amount: 1000,
      incurredOn: '2026-01-05',
    });
    await expensesService.create({
      category: 'Utilities',
      amount: 200,
      incurredOn: '2026-02-10',
    });

    const januaryExpenses = await expensesService.findAll({ month: '2026-01' });
    expect(januaryExpenses).toHaveLength(1);
    expect(januaryExpenses[0].category).toBe('Rent');
  });

  it('clones recurring expenses into the current month, idempotently', async () => {
    const lastMonth = new Date();
    lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1, 1);
    await prisma.expense.create({
      data: {
        businessId,
        category: 'Subscription',
        amount: 50,
        recurring: true,
        incurredOn: lastMonth,
      },
    });

    const clonedFirstRun = await expensesService.cloneRecurringExpenses(
      new Date(),
    );
    expect(clonedFirstRun).toBe(1);

    const clonedSecondRun = await expensesService.cloneRecurringExpenses(
      new Date(),
    );
    expect(clonedSecondRun).toBe(0); // already cloned — idempotent

    const thisMonthStart = new Date();
    thisMonthStart.setUTCDate(1);
    thisMonthStart.setUTCHours(0, 0, 0, 0);
    const cloned = await prisma.expense.findFirst({
      where: {
        businessId,
        category: 'Subscription',
        incurredOn: { gte: thisMonthStart },
      },
    });
    expect(cloned).toBeDefined();
  });
});
