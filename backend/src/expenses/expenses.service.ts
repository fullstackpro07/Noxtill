import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { QueryExpensesDto } from './dto/query-expenses.dto';
import { Expense, Prisma } from '@prisma/client';

function monthBounds(month: string): { start: Date; end: Date } {
  const [year, mon] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 1));
  return { start, end };
}

/** Expenses CRUD + recurring flag (BE-035). */
@Injectable()
export class ExpensesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  /** UPD-BE-107: resolves `receiptKey` (if any) to a fresh signed URL — never leaked as a raw storage key. */
  private async withReceiptUrl<T extends Expense>(
    expense: T,
  ): Promise<T & { receiptUrl: string | null }> {
    return {
      ...expense,
      receiptUrl: expense.receiptKey
        ? await this.s3.getSignedDownloadUrl(expense.receiptKey)
        : null,
    };
  }

  create(dto: CreateExpenseDto) {
    return this.tenantPrisma.client.expense.create({
      data: {
        description: dto.description,
        category: dto.category,
        amount: dto.amount,
        recurring: dto.recurring ?? false,
        incurredOn: new Date(dto.incurredOn),
      } as Prisma.ExpenseUncheckedCreateInput,
    });
  }

  async findAll(query: QueryExpensesDto) {
    const where: Prisma.ExpenseWhereInput = { category: query.category };
    if (query.month) {
      const { start, end } = monthBounds(query.month);
      where.incurredOn = { gte: start, lt: end };
    }
    const expenses = await this.tenantPrisma.client.expense.findMany({
      where,
      orderBy: { incurredOn: 'desc' },
    });
    return Promise.all(expenses.map((e) => this.withReceiptUrl(e)));
  }

  async findOne(id: string) {
    const expense = await this.tenantPrisma.client.expense.findUnique({
      where: { id },
    });
    if (!expense) {
      throw new NotFoundException('Expense not found');
    }
    return this.withReceiptUrl(expense);
  }

  async update(id: string, dto: UpdateExpenseDto) {
    await this.findOne(id);
    return this.tenantPrisma.client.expense.update({
      where: { id },
      data: {
        description: dto.description,
        category: dto.category,
        amount: dto.amount,
        recurring: dto.recurring,
        incurredOn: dto.incurredOn ? new Date(dto.incurredOn) : undefined,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.tenantPrisma.client.expense.delete({ where: { id } });
  }

  /**
   * Monthly recurring clone (BE-035 job): for every business, clones each
   * recurring expense from the prior month into `referenceDate`'s month,
   * skipping a business/category/amount combo that's already been cloned
   * this month (idempotent against a job that fires more than once).
   */
  async cloneRecurringExpenses(
    referenceDate: Date = new Date(),
  ): Promise<number> {
    const currentMonthStart = new Date(
      Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1),
    );
    const previousMonthStart = new Date(
      Date.UTC(
        referenceDate.getUTCFullYear(),
        referenceDate.getUTCMonth() - 1,
        1,
      ),
    );

    const recurringLastMonth = await this.prisma.expense.findMany({
      where: {
        recurring: true,
        incurredOn: { gte: previousMonthStart, lt: currentMonthStart },
      },
    });

    let cloned = 0;
    for (const expense of recurringLastMonth) {
      const alreadyCloned = await this.prisma.expense.findFirst({
        where: {
          businessId: expense.businessId,
          description: expense.description,
          category: expense.category,
          amount: expense.amount,
          recurring: true,
          incurredOn: { gte: currentMonthStart },
        },
      });
      if (alreadyCloned) continue;

      await this.prisma.expense.create({
        data: {
          businessId: expense.businessId,
          description: expense.description,
          category: expense.category,
          amount: expense.amount,
          recurring: true,
          incurredOn: currentMonthStart,
        },
      });
      cloned += 1;
    }

    return cloned;
  }
}
