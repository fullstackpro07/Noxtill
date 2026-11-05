import { ClsService } from 'nestjs-cls';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ExpensesService } from './expenses.service';
import type { S3Service } from '../common/storage/s3.service';

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
  const s3 = {
    getSignedDownloadUrl: jest
      .fn()
      .mockResolvedValue('https://signed.example/receipt.jpg'),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    expensesService = new ExpensesService(
      tenantPrisma,
      prisma,
      s3 as unknown as S3Service,
      { add: jest.fn().mockResolvedValue(null) } as never,
    );

    const business = await prisma.business.create({
      data: { name: 'Expenses Test Biz', slug: `expenses-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.expense.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('creates and lists expenses filtered by month', async () => {
    await expensesService.create({
      description: 'Studio rent',
      category: 'Rent',
      amount: 1000,
      incurredOn: '2026-01-05',
    });
    await expensesService.create({
      description: 'Electricity',
      category: 'Utilities',
      amount: 200,
      incurredOn: '2026-02-10',
    });

    const januaryExpenses = await expensesService.findAll({ month: '2026-01' });
    expect(januaryExpenses).toHaveLength(1);
    expect(januaryExpenses[0].category).toBe('Rent');
    expect(januaryExpenses[0].receiptUrl).toBeNull(); // no receipt attached
  });

  it('returns only exact-match candidate IDs for this tenant and month', async () => {
    const stamp = Date.now();
    const otherBusiness = await prisma.business.create({
      data: {
        name: 'Expenses Candidate Isolation',
        slug: `expenses-candidate-isolation-${stamp}`,
      },
    });
    const date = new Date('2026-04-12T00:00:00.000Z');
    const exactRows = await Promise.all([
      prisma.expense.create({
        data: {
          businessId,
          description: ` QA Expense ${stamp} `,
          category: ' Office ',
          amount: new Prisma.Decimal('44.25'),
          incurredOn: date,
        },
      }),
      prisma.expense.create({
        data: {
          businessId,
          description: `qa   expense ${stamp}`,
          category: 'office',
          amount: new Prisma.Decimal('44.25'),
          incurredOn: date,
        },
      }),
    ]);
    const nonCandidateRows = await Promise.all([
      prisma.expense.create({
        data: {
          businessId,
          description: `QA Expense ${stamp}`,
          category: 'Office',
          amount: new Prisma.Decimal('44.26'),
          incurredOn: date,
        },
      }),
      prisma.expense.create({
        data: {
          businessId: otherBusiness.id,
          description: `QA Expense ${stamp}`,
          category: 'Office',
          amount: new Prisma.Decimal('44.25'),
          incurredOn: date,
        },
      }),
      prisma.expense.create({
        data: {
          businessId,
          description: `QA Expense ${stamp}`,
          category: 'Office',
          amount: new Prisma.Decimal('44.25'),
          incurredOn: new Date('2026-05-12T00:00:00.000Z'),
        },
      }),
    ]);

    try {
      const result = await expensesService.findPotentialDuplicateIds('2026-04');
      expect(result.month).toBe('2026-04');
      expect(result.groups).toEqual([
        [...exactRows.map((row) => row.id).sort()],
      ]);
      expect(result.groups.flat()).not.toContain(nonCandidateRows[0].id);
      expect(result.groups.flat()).not.toContain(nonCandidateRows[1].id);
      expect(result.groups.flat()).not.toContain(nonCandidateRows[2].id);
    } finally {
      await prisma.expense.deleteMany({
        where: {
          id: { in: [...exactRows, ...nonCandidateRows].map((row) => row.id) },
        },
      });
      await prisma.business.delete({ where: { id: otherBusiness.id } });
    }
  });

  it('resolves a real signed receiptUrl when a receipt was attached (UPD-BE-107)', async () => {
    const withReceipt = await prisma.expense.create({
      data: {
        businessId,
        description: 'Scanned supplies receipt',
        category: 'Supplies',
        amount: 42,
        incurredOn: new Date('2026-03-01'),
        receiptKey: 'digitizer/some-biz/123-receipt.jpg',
      },
    });

    const found = await expensesService.findOne(withReceipt.id);
    expect(found.receiptUrl).toBe('https://signed.example/receipt.jpg');
    expect(s3.getSignedDownloadUrl).toHaveBeenCalledWith(
      'digitizer/some-biz/123-receipt.jpg',
    );
  });

  it('clones recurring expenses into the current month, idempotently', async () => {
    const lastMonth = new Date();
    lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1, 1);
    await prisma.expense.create({
      data: {
        businessId,
        description: 'Software subscription',
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
