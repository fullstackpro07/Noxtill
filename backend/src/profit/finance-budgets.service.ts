import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { resolvePolicies } from '../common/policies/policies.service';
import {
  FINANCE_BUDGET_APPROVED_EVENT_JOB,
  SPECIALIST_AGENT_FINANCE_EVENTS_QUEUE,
} from '../common/agents/specialist-agent-events.constants';

const FINANCE_BUDGET_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
] as const;

function parseMonth(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new AppException(
      'FINANCE_BUDGET_MONTH_INVALID',
      'Choose a calendar month in YYYY-MM format.',
      HttpStatus.BAD_REQUEST,
    );
  }
  const [year, monthNumber] = month.split('-').map(Number);
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1)),
    end: new Date(Date.UTC(year, monthNumber, 1)),
  };
}

@Injectable()
export class FinanceBudgetsService {
  private readonly logger = new Logger(FinanceBudgetsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cls: ClsService,
    @InjectQueue(SPECIALIST_AGENT_FINANCE_EVENTS_QUEUE)
    private readonly financeAgentEvents: Queue,
  ) {}

  async list(businessId: string, month: string) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    const { start, end } = parseMonth(month);
    const business = await this.tenantPrisma.client.business.findFirst({
      where: { id: scopedBusinessId },
      select: { currency: true },
    });
    if (!business) {
      throw new AppException(
        'FINANCE_BUDGET_BUSINESS_NOT_FOUND',
        'The current business could not be found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const [budgetRows, expenseRows] = await Promise.all([
      this.tenantPrisma.client.financeBudget.findMany({
        where: { businessId: scopedBusinessId, monthStart: start },
        orderBy: [
          { category: 'asc' },
          { version: 'desc' },
          { createdAt: 'desc' },
        ],
      }),
      this.tenantPrisma.client.expense.groupBy({
        by: ['category'],
        where: {
          businessId: scopedBusinessId,
          incurredOn: { gte: start, lt: end },
        },
        _sum: { amount: true },
      }),
    ]);

    const budgetByCategory = new Map<string, typeof budgetRows>();
    for (const row of budgetRows) {
      const group = budgetByCategory.get(row.category) ?? [];
      group.push(row);
      budgetByCategory.set(row.category, group);
    }
    const actualByCategory = new Map(
      expenseRows.map((row) => [
        row.category,
        row._sum.amount ?? new Prisma.Decimal(0),
      ]),
    );
    const categories = [
      ...new Set([...budgetByCategory.keys(), ...actualByCategory.keys()]),
    ].sort((a, b) => a.localeCompare(b));

    return {
      month,
      currencyCode: business.currency.trim().toUpperCase(),
      actualsSource: 'Expense.incurredOn + Expense.category + Expense.amount',
      scope: 'business_wide' as const,
      branchAttribution: 'not_available' as const,
      asOf: new Date().toISOString(),
      lines: categories.map((category) => {
        const rows = budgetByCategory.get(category) ?? [];
        const latest = rows[0] ?? null;
        const approved = rows.find((row) => row.status === 'approved') ?? null;
        const actual = actualByCategory.get(category) ?? new Prisma.Decimal(0);
        const variance = approved ? actual.minus(approved.amount) : null;
        return {
          category,
          actualAmount: actual.toFixed(2),
          approvedBudget: approved
            ? {
                id: approved.id,
                amount: approved.amount.toFixed(2),
                version: approved.version,
                reviewedAt: approved.reviewedAt?.toISOString() ?? null,
              }
            : null,
          latestRevision: latest
            ? {
                id: latest.id,
                amount: latest.amount.toFixed(2),
                version: latest.version,
                status: FINANCE_BUDGET_STATUSES.includes(
                  latest.status as (typeof FINANCE_BUDGET_STATUSES)[number],
                )
                  ? latest.status
                  : 'unknown',
                createdByUserId: latest.createdByUserId,
                submittedAt: latest.submittedAt?.toISOString() ?? null,
                reviewedByUserId: latest.reviewedByUserId,
                reviewedAt: latest.reviewedAt?.toISOString() ?? null,
                reviewReason: latest.reviewReason,
                note: latest.note,
              }
            : null,
          variance: variance?.toFixed(2) ?? null,
          actualPercent:
            approved && !approved.amount.isZero()
              ? Number(actual.dividedBy(approved.amount).times(100).toFixed(2))
              : null,
        };
      }),
    };
  }

  async saveDraft(
    businessId: string,
    actorUserId: string,
    input: { month: string; category: string; amount: string; note?: string },
  ) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    const { start } = parseMonth(input.month);
    const category = input.category.trim();
    if (!category || category.length > 191) {
      throw new AppException(
        'FINANCE_BUDGET_CATEGORY_INVALID',
        'Enter a category using 1 to 191 characters.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(input.amount)) {
      throw new AppException(
        'FINANCE_BUDGET_AMOUNT_INVALID',
        'Enter a non-negative amount with up to two decimal places.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const amount = new Prisma.Decimal(input.amount);

    return this.tenantPrisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM businesses WHERE id = ${scopedBusinessId} FOR UPDATE`;
      const business = await tx.business.findFirst({
        where: { id: scopedBusinessId },
        select: { currency: true },
      });
      if (!business) {
        throw new AppException(
          'FINANCE_BUDGET_BUSINESS_NOT_FOUND',
          'The current business could not be found.',
          HttpStatus.NOT_FOUND,
        );
      }
      const currencyCode = business.currency.trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(currencyCode)) {
        throw new AppException(
          'FINANCE_BUDGET_CURRENCY_INVALID',
          'Set a valid three-letter business currency before creating a budget.',
          HttpStatus.CONFLICT,
        );
      }
      const latest = await tx.financeBudget.findFirst({
        where: { businessId: scopedBusinessId, monthStart: start, category },
        orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
      });
      if (latest?.status === 'pending_approval') {
        throw new AppException(
          'FINANCE_BUDGET_ALREADY_PENDING',
          'This category already has a budget revision waiting for review.',
          HttpStatus.CONFLICT,
        );
      }
      if (latest?.status === 'draft') {
        return tx.financeBudget.update({
          where: { id: latest.id },
          data: {
            amount,
            note: input.note?.trim() || null,
            currencyCode,
          },
        });
      }
      return tx.financeBudget.create({
        data: {
          businessId: scopedBusinessId,
          monthStart: start,
          category,
          currencyCode,
          amount,
          version: (latest?.version ?? 0) + 1,
          status: 'draft',
          createdByUserId: actorUserId,
          note: input.note?.trim() || null,
        },
      });
    });
  }

  async submit(businessId: string, id: string) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    return this.tenantPrisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM finance_budgets WHERE id = ${id} AND business_id = ${scopedBusinessId} FOR UPDATE`;
      const row = await tx.financeBudget.findFirst({
        where: { id, businessId: scopedBusinessId },
      });
      if (!row) this.notFound();
      if (row.status !== 'draft')
        this.transitionConflict('Only a draft budget can be submitted.');
      return tx.financeBudget.update({
        where: { id: row.id },
        data: { status: 'pending_approval', submittedAt: new Date() },
      });
    });
  }

  async decide(
    businessId: string,
    actorUserId: string,
    id: string,
    decision: 'approved' | 'rejected',
    reason: string,
  ) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 8 || trimmedReason.length > 500) {
      throw new AppException(
        'FINANCE_BUDGET_REASON_INVALID',
        'Add a review reason between 8 and 500 characters.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const updated = await this.tenantPrisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM finance_budgets WHERE id = ${id} AND business_id = ${scopedBusinessId} FOR UPDATE`;
      const row = await tx.financeBudget.findFirst({
        where: { id, businessId: scopedBusinessId },
      });
      if (!row) this.notFound();
      if (row.status !== 'pending_approval') {
        this.transitionConflict(
          'Only a submitted budget can be approved or rejected.',
        );
      }
      return tx.financeBudget.update({
        where: { id: row.id },
        data: {
          status: decision,
          reviewedByUserId: actorUserId,
          reviewReason: trimmedReason,
          reviewedAt: new Date(),
        },
      });
    });

    if (decision === 'approved') {
      await this.queueApprovedBudgetFinanceReview(updated);
    }
    return updated;
  }

  private async queueApprovedBudgetFinanceReview(budget: {
    id: string;
    businessId: string;
    monthStart: Date;
    version: number;
    reviewedAt: Date | null;
  }): Promise<void> {
    if (!budget.reviewedAt) return;
    try {
      const business = await this.tenantPrisma.client.business.findFirst({
        where: { id: budget.businessId },
        select: { id: true, policies: true },
      });
      const policies = resolvePolicies(business);
      if (
        !policies.bool('agents.financeEnabled') ||
        !policies.bool('agents.financeApprovedBudgetEventReviewEnabled')
      ) {
        return;
      }

      await this.financeAgentEvents.add(
        FINANCE_BUDGET_APPROVED_EVENT_JOB,
        {
          businessId: budget.businessId,
          budgetId: budget.id,
          version: budget.version,
          approvedAt: budget.reviewedAt.toISOString(),
        },
        {
          jobId: `finance-budget-approved-${budget.businessId}-${budget.id}-v${budget.version}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1_000 },
          removeOnComplete: 200,
          removeOnFail: 500,
        },
      );
    } catch (error) {
      // Optional read-only review work cannot roll back an approved budget.
      this.logger.warn(
        `Could not queue Finance review for approved budget ${budget.id}: ${(error as Error).message}`,
      );
    }
  }

  private scopedBusinessId(businessId: string) {
    const activeBusinessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID);
    if (activeBusinessId && activeBusinessId !== businessId) {
      throw new AppException(
        'FINANCE_BUDGET_TENANT_MISMATCH',
        'The finance budget request does not match the active business.',
        HttpStatus.FORBIDDEN,
      );
    }
    return activeBusinessId ?? businessId;
  }

  private notFound(): never {
    throw new AppException(
      'FINANCE_BUDGET_NOT_FOUND',
      'This budget is not available in the current business.',
      HttpStatus.NOT_FOUND,
    );
  }

  private transitionConflict(message: string): never {
    throw new AppException(
      'FINANCE_BUDGET_INVALID_TRANSITION',
      message,
      HttpStatus.CONFLICT,
    );
  }
}
