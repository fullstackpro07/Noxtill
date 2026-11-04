import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { resolvePolicies } from '../common/policies/policies.service';
import {
  FINANCE_EXPENSE_RECORDED_EVENT_JOB,
  SPECIALIST_AGENT_FINANCE_EVENTS_QUEUE,
} from '../common/agents/specialist-agent-events.constants';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { QueryExpensesDto } from './dto/query-expenses.dto';
import { findPotentialExpenseDuplicateGroups } from './expense-duplicate-candidates.util';
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
  private readonly logger = new Logger(ExpensesService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    @InjectQueue(SPECIALIST_AGENT_FINANCE_EVENTS_QUEUE)
    private readonly financeAgentEvents: Queue,
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

  async create(dto: CreateExpenseDto) {
    const expense = await this.tenantPrisma.client.expense.create({
      data: {
        description: dto.description,
        category: dto.category,
        amount: dto.amount,
        recurring: dto.recurring ?? false,
        incurredOn: new Date(dto.incurredOn),
      } as Prisma.ExpenseUncheckedCreateInput,
    });
    await this.queueFinanceReview(expense);
    return expense;
  }

  private async queueFinanceReview(expense: Expense): Promise<void> {
    try {
      const business = await this.tenantPrisma.client.business.findFirst({
        where: { id: expense.businessId },
        select: { policies: true },
      });
      const policies = resolvePolicies(business);
      if (
        !policies.bool('agents.financeEnabled') ||
        !policies.bool('agents.financeExpenseEventReviewEnabled')
      ) {
        return;
      }

      await this.financeAgentEvents.add(
        FINANCE_EXPENSE_RECORDED_EVENT_JOB,
        { businessId: expense.businessId, expenseId: expense.id },
        {
          jobId: `finance-expense-${expense.businessId}-${expense.id}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1_000 },
          removeOnComplete: 200,
          removeOnFail: 500,
        },
      );
    } catch (error) {
      // Optional review enqueueing cannot turn a successfully saved expense into a failed request.
      this.logger.warn(
        `Could not queue Finance review for expense ${expense.id}: ${(error as Error).message}`,
      );
    }
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

  async findPotentialDuplicateIds(month: string) {
    const { start, end } = monthBounds(month);
    const expenses = await this.tenantPrisma.client.expense.findMany({
      where: { incurredOn: { gte: start, lt: end } },
      orderBy: [{ incurredOn: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        businessId: true,
        description: true,
        category: true,
        amount: true,
        recurring: true,
        incurredOn: true,
      },
    });
    const groups = findPotentialExpenseDuplicateGroups(expenses);
    return {
      month,
      groups: groups.map((group) => group.map((expense) => expense.id)),
    };
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
