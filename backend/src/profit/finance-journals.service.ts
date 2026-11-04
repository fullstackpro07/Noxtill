import { HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { AppException } from '../common/filters/app.exception';
import { BranchScopeService } from '../common/tenancy/branch-scope.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePolicies } from '../common/policies/policies.service';
import {
  FINANCE_JOURNAL_POSTED_EVENT_JOB,
  SPECIALIST_AGENT_FINANCE_EVENTS_QUEUE,
} from '../common/agents/specialist-agent-events.constants';
import {
  CreateFinanceAccountDto,
  CreateFinanceJournalDto,
} from './dto/finance-journals.dto';

const JOURNAL_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'posted',
] as const;
type JournalStatus = (typeof JOURNAL_STATUSES)[number];

function parseMonth(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new AppException(
      'FINANCE_PERIOD_MONTH_INVALID',
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
export class FinanceJournalsService {
  private readonly logger = new Logger(FinanceJournalsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cls: ClsService,
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    @Optional()
    @InjectQueue(SPECIALIST_AGENT_FINANCE_EVENTS_QUEUE)
    private readonly financeAgentEvents?: Queue,
  ) {}

  async listAccounts(businessId: string) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    return this.tenantPrisma.client.financeAccount.findMany({
      where: { businessId: scopedBusinessId },
      orderBy: [{ active: 'desc' }, { code: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        active: true,
        createdAt: true,
      },
    });
  }

  async createAccount(
    businessId: string,
    actorUserId: string,
    dto: CreateFinanceAccountDto,
  ) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    const code = dto.code.trim();
    const name = dto.name.trim();
    if (!name) {
      throw new AppException(
        'FINANCE_ACCOUNT_NAME_INVALID',
        'Enter a name for the account.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const existing = await this.tenantPrisma.client.financeAccount.findFirst({
      where: { businessId: scopedBusinessId, code },
      select: { id: true },
    });
    if (existing) {
      throw new AppException(
        'FINANCE_ACCOUNT_CODE_EXISTS',
        'That account code is already used in this business.',
        HttpStatus.CONFLICT,
      );
    }
    try {
      return await this.tenantPrisma.client.$transaction(async (tx) => {
        const account = await tx.financeAccount.create({
          data: { businessId: scopedBusinessId, code, name, type: dto.type },
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            active: true,
          },
        });
        await tx.auditLog.create({
          data: {
            businessId: scopedBusinessId,
            actorUserId,
            action: 'finance.journal_account_created',
            entity: 'FinanceAccount',
            entityId: account.id,
            before: Prisma.JsonNull,
            after: {
              code: account.code,
              name: account.name,
              type: account.type,
              active: account.active,
            },
          },
        });
        return account;
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        throw new AppException(
          'FINANCE_ACCOUNT_CODE_EXISTS',
          'That account code is already used in this business.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async listJournals(businessId: string, month?: string) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    const range = month ? parseMonth(month) : null;
    const [business, entries, lockedPeriods] = await Promise.all([
      this.tenantPrisma.client.business.findFirst({
        where: { id: scopedBusinessId },
        select: { currency: true },
      }),
      this.tenantPrisma.client.financeJournalEntry.findMany({
        where: {
          businessId: scopedBusinessId,
          ...(range ? { entryDate: { gte: range.start, lt: range.end } } : {}),
        },
        orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
        take: 100,
        include: {
          lines: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              accountId: true,
              accountCode: true,
              accountName: true,
              memo: true,
              debit: true,
              credit: true,
            },
          },
          reversalOf: { select: { id: true, reference: true, status: true } },
          reversal: { select: { id: true, reference: true, status: true } },
        },
      }),
      this.tenantPrisma.client.financeAccountingPeriod.findMany({
        where: { businessId: scopedBusinessId, status: 'closed' },
        orderBy: { monthStart: 'desc' },
        take: 24,
        select: { monthStart: true, closeReason: true, closedAt: true },
      }),
    ]);
    if (!business) this.notFound();
    return {
      currencyCode: business.currency.trim().toUpperCase(),
      entries,
      closedPeriods: lockedPeriods.map((period) => ({
        month: period.monthStart.toISOString().slice(0, 7),
        reason: period.closeReason,
        closedAt: period.closedAt,
      })),
      coverage: 'manual_journals_only' as const,
      disclosure:
        'These are manually entered Noxtill journals only. They do not include automatic postings, bank reconciliation, Xero journals, or a certified accounting close.',
    };
  }

  async activitySummary(businessId: string, month: string) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    const { start, end } = parseMonth(month);
    const rows = await this.tenantPrisma.client.$queryRaw<
      Array<{
        accountId: string;
        accountCode: string;
        accountName: string;
        currencyCode: string;
        debits: Prisma.Decimal;
        credits: Prisma.Decimal;
      }>
    >`
      SELECT line.account_id AS accountId,
             line.account_code AS accountCode,
             line.account_name AS accountName,
             entry.currency_code AS currencyCode,
             SUM(line.debit) AS debits,
             SUM(line.credit) AS credits
      FROM finance_journal_lines AS line
      INNER JOIN finance_journal_entries AS entry
        ON entry.id = line.journal_entry_id
       AND entry.business_id = line.business_id
      WHERE line.business_id = ${scopedBusinessId}
        AND entry.status = 'posted'
        AND entry.entry_date >= ${start}
        AND entry.entry_date < ${end}
      GROUP BY line.account_id, line.account_code, line.account_name, entry.currency_code
      ORDER BY entry.currency_code ASC, line.account_code ASC, line.account_id ASC
    `;
    const currencies = new Map<
      string,
      {
        debits: Prisma.Decimal;
        credits: Prisma.Decimal;
        accounts: Array<{
          accountId: string;
          accountCode: string;
          accountName: string;
          debits: Prisma.Decimal;
          credits: Prisma.Decimal;
        }>;
      }
    >();
    for (const row of rows) {
      const debits = new Prisma.Decimal(row.debits);
      const credits = new Prisma.Decimal(row.credits);
      const group = currencies.get(row.currencyCode) ?? {
        debits: new Prisma.Decimal(0),
        credits: new Prisma.Decimal(0),
        accounts: [],
      };
      group.debits = group.debits.plus(debits);
      group.credits = group.credits.plus(credits);
      group.accounts.push({
        accountId: row.accountId,
        accountCode: row.accountCode,
        accountName: row.accountName,
        debits,
        credits,
      });
      currencies.set(row.currencyCode, group);
    }
    return {
      month,
      coverage: 'posted_manual_journal_activity' as const,
      disclosure:
        'Monthly activity from posted Noxtill manual journals only. It excludes opening balances, automatic sales/expense postings, Xero entries and bank reconciliation; this monthly view is not a cumulative account balance.',
      currencies: [...currencies.entries()].map(([currencyCode, group]) => ({
        currencyCode,
        totalDebits: group.debits.toFixed(2),
        totalCredits: group.credits.toFixed(2),
        balanced: group.debits.equals(group.credits),
        accounts: group.accounts.map((account) => {
          const net = account.debits.minus(account.credits);
          return {
            accountId: account.accountId,
            accountCode: account.accountCode,
            accountName: account.accountName,
            debits: account.debits.toFixed(2),
            credits: account.credits.toFixed(2),
            netDebit: net.greaterThan(0) ? net.toFixed(2) : '0.00',
            netCredit: net.lessThan(0) ? net.abs().toFixed(2) : '0.00',
          };
        }),
      })),
    };
  }

  async trialBalance(businessId: string, asOf: string) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    const asOfDate = this.parseTrialBalanceDate(asOf);
    const rows = await this.tenantPrisma.client.$queryRaw<
      Array<{
        accountId: string;
        accountCode: string;
        accountName: string;
        currencyCode: string;
        debits: string;
        credits: string;
      }>
    >`
      SELECT line.account_id AS accountId,
             line.account_code AS accountCode,
             line.account_name AS accountName,
             entry.currency_code AS currencyCode,
             CAST(SUM(line.debit) AS CHAR) AS debits,
             CAST(SUM(line.credit) AS CHAR) AS credits
      FROM finance_journal_lines AS line
      INNER JOIN finance_journal_entries AS entry
        ON entry.id = line.journal_entry_id
       AND entry.business_id = line.business_id
      WHERE line.business_id = ${scopedBusinessId}
        AND entry.status = 'posted'
        AND entry.entry_date <= ${asOfDate}
      GROUP BY line.account_id, line.account_code, line.account_name, entry.currency_code
      ORDER BY entry.currency_code ASC, line.account_code ASC, line.account_id ASC
    `;
    return this.summarizeTrialBalance(asOf, rows);
  }

  /**
   * Internal Finance Agent read. The input business IDs come from BranchScopeService and are
   * re-resolved here, so this explicit PrismaService query cannot expand the caller's tenant scope.
   */
  async trialBalanceForScope(
    businessId: string,
    asOf: string,
    branchId?: string,
  ) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    const asOfDate = this.parseTrialBalanceDate(asOf);
    const businessIds = await this.branchScope.resolveIds(
      scopedBusinessId,
      branchId,
    );
    const rows = await this.prisma.$queryRaw<
      Array<{
        businessId: string;
        accountId: string;
        accountCode: string;
        accountName: string;
        currencyCode: string;
        debits: string;
        credits: string;
      }>
    >`
      SELECT line.business_id AS businessId,
             line.account_id AS accountId,
             line.account_code AS accountCode,
             line.account_name AS accountName,
             entry.currency_code AS currencyCode,
             CAST(SUM(line.debit) AS CHAR) AS debits,
             CAST(SUM(line.credit) AS CHAR) AS credits
      FROM finance_journal_lines AS line
      INNER JOIN finance_journal_entries AS entry
        ON entry.id = line.journal_entry_id
       AND entry.business_id = line.business_id
      WHERE line.business_id IN (${Prisma.join(businessIds)})
        AND entry.status = 'posted'
        AND entry.entry_date <= ${asOfDate}
      GROUP BY line.business_id, line.account_id, line.account_code, line.account_name, entry.currency_code
      ORDER BY line.business_id ASC, entry.currency_code ASC, line.account_code ASC, line.account_id ASC
    `;
    return {
      asOf,
      coverage: 'posted_manual_journals_only' as const,
      disclosure: this.trialBalanceDisclosure(),
      scopeBusinessCount: businessIds.length,
      entities: businessIds.map((scopeId) => ({
        businessId: scopeId,
        currencies: this.summarizeTrialBalance(
          asOf,
          rows.filter((row) => row.businessId === scopeId),
        ).currencies,
      })),
    };
  }

  private parseTrialBalanceDate(asOf: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
      throw new AppException(
        'FINANCE_TRIAL_BALANCE_DATE_INVALID',
        'Choose an as-of date in YYYY-MM-DD format.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const asOfDate = new Date(`${asOf}T00:00:00.000Z`);
    if (
      Number.isNaN(asOfDate.getTime()) ||
      asOfDate.toISOString().slice(0, 10) !== asOf
    ) {
      throw new AppException(
        'FINANCE_TRIAL_BALANCE_DATE_INVALID',
        'Choose a real calendar date in YYYY-MM-DD format.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return asOfDate;
  }

  private summarizeTrialBalance(
    asOf: string,
    rows: Array<{
      accountId: string;
      accountCode: string;
      accountName: string;
      currencyCode: string;
      debits: string;
      credits: string;
    }>,
  ) {
    const currencies = new Map<
      string,
      {
        debitBalances: Prisma.Decimal;
        creditBalances: Prisma.Decimal;
        accounts: Array<{
          accountId: string;
          accountCode: string;
          accountName: string;
          debits: Prisma.Decimal;
          credits: Prisma.Decimal;
          debitBalance: Prisma.Decimal;
          creditBalance: Prisma.Decimal;
        }>;
      }
    >();
    for (const row of rows) {
      const debits = new Prisma.Decimal(row.debits);
      const credits = new Prisma.Decimal(row.credits);
      const net = debits.minus(credits);
      const debitBalance = net.greaterThan(0) ? net : new Prisma.Decimal(0);
      const creditBalance = net.lessThan(0) ? net.abs() : new Prisma.Decimal(0);
      const group = currencies.get(row.currencyCode) ?? {
        debitBalances: new Prisma.Decimal(0),
        creditBalances: new Prisma.Decimal(0),
        accounts: [],
      };
      group.debitBalances = group.debitBalances.plus(debitBalance);
      group.creditBalances = group.creditBalances.plus(creditBalance);
      group.accounts.push({
        accountId: row.accountId,
        accountCode: row.accountCode,
        accountName: row.accountName,
        debits,
        credits,
        debitBalance,
        creditBalance,
      });
      currencies.set(row.currencyCode, group);
    }
    return {
      asOf,
      coverage: 'posted_manual_journals_only' as const,
      disclosure: this.trialBalanceDisclosure(),
      currencies: [...currencies.entries()].map(([currencyCode, group]) => ({
        currencyCode,
        totalDebitBalances: group.debitBalances.toFixed(2),
        totalCreditBalances: group.creditBalances.toFixed(2),
        balanced: group.debitBalances.equals(group.creditBalances),
        accounts: group.accounts.map((account) => ({
          accountId: account.accountId,
          accountCode: account.accountCode,
          accountName: account.accountName,
          debits: account.debits.toFixed(2),
          credits: account.credits.toFixed(2),
          debitBalance: account.debitBalance.toFixed(2),
          creditBalance: account.creditBalance.toFixed(2),
        })),
      })),
    };
  }

  private trialBalanceDisclosure() {
    return 'Cumulative balances from posted Noxtill manual journals only. Opening balances, unposted entries, automatic sales/expense postings, Xero journals and bank reconciliation are excluded. This is a partial trial balance, not a complete ledger or certified accounting close.';
  }

  async createDraft(
    businessId: string,
    actorUserId: string,
    dto: CreateFinanceJournalDto,
  ) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    const reference = dto.reference.trim();
    const description = dto.description.trim();
    const entryDate = this.parseDate(dto.entryDate);
    const period = new Date(
      Date.UTC(entryDate.getUTCFullYear(), entryDate.getUTCMonth(), 1),
    );
    const business = await this.tenantPrisma.client.business.findFirst({
      where: { id: scopedBusinessId },
      select: { currency: true },
    });
    if (!business) this.notFound();
    const currencyCode = business.currency.trim().toUpperCase();
    const accounts = await this.tenantPrisma.client.financeAccount.findMany({
      where: {
        businessId: scopedBusinessId,
        active: true,
        id: { in: [...new Set(dto.lines.map((line) => line.accountId))] },
      },
      select: { id: true, code: true, name: true },
    });
    const accountById = new Map(
      accounts.map((account) => [account.id, account]),
    );
    if (
      accountById.size !== new Set(dto.lines.map((line) => line.accountId)).size
    ) {
      throw new AppException(
        'FINANCE_JOURNAL_ACCOUNT_UNAVAILABLE',
        'Every journal line must use an active account in this business.',
        HttpStatus.BAD_REQUEST,
      );
    }

    let debits = new Prisma.Decimal(0);
    let credits = new Prisma.Decimal(0);
    const lines = dto.lines.map((line) => {
      const debit = new Prisma.Decimal(line.debit);
      const credit = new Prisma.Decimal(line.credit);
      const debitPositive = debit.greaterThan(0);
      const creditPositive = credit.greaterThan(0);
      if (debitPositive === creditPositive) {
        throw new AppException(
          'FINANCE_JOURNAL_LINE_INVALID',
          'Each line must have a positive debit or a positive credit, not both.',
          HttpStatus.BAD_REQUEST,
        );
      }
      debits = debits.plus(debit);
      credits = credits.plus(credit);
      const account = accountById.get(line.accountId)!;
      return {
        businessId: scopedBusinessId,
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        memo: line.memo?.trim() || null,
        debit,
        credit,
      };
    });
    if (!debits.equals(credits) || debits.isZero()) {
      throw new AppException(
        'FINANCE_JOURNAL_NOT_BALANCED',
        'Total debits and credits must be equal and greater than zero.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    try {
      return await this.tenantPrisma.client.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM businesses WHERE id = ${scopedBusinessId} FOR UPDATE`;
        if (await this.isPeriodClosed(scopedBusinessId, period)) {
          this.closedPeriodError();
        }
        const entry = await tx.financeJournalEntry.create({
          data: {
            businessId: scopedBusinessId,
            reference,
            entryDate,
            currencyCode,
            description,
            status: 'draft',
            totalDebits: debits,
            totalCredits: credits,
            createdByUserId: actorUserId,
          },
        });
        await tx.financeJournalLine.createMany({
          data: lines.map((line) => ({
            ...line,
            journalEntryId: entry.id,
          })),
        });
        const created = await tx.financeJournalEntry.findFirstOrThrow({
          where: { id: entry.id, businessId: scopedBusinessId },
          include: { lines: true },
        });
        await tx.auditLog.create({
          data: {
            businessId: scopedBusinessId,
            actorUserId,
            action: 'finance.journal_draft_created',
            entity: 'FinanceJournalEntry',
            entityId: created.id,
            before: Prisma.JsonNull,
            after: this.auditEntry(created),
          },
        });
        return created;
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        throw new AppException(
          'FINANCE_JOURNAL_REFERENCE_EXISTS',
          'That journal reference is already used in this business.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async submit(businessId: string, actorUserId: string, id: string) {
    return this.transition(
      businessId,
      actorUserId,
      id,
      'draft',
      'pending_approval',
      async (row) => {
        if (
          !row.lines.length ||
          !new Prisma.Decimal(row.totalDebits).equals(row.totalCredits)
        ) {
          throw new AppException(
            'FINANCE_JOURNAL_NOT_BALANCED',
            'Only a balanced journal can be submitted for approval.',
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        }
        if (await this.isPeriodClosed(row.businessId, row.entryDate))
          this.closedPeriodError();
        return {
          submittedAt: new Date(),
        };
      },
    );
  }

  async decide(
    businessId: string,
    actorUserId: string,
    id: string,
    decision: 'approved' | 'rejected',
    reason: string,
  ) {
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 8 || trimmedReason.length > 1000) {
      throw new AppException(
        'FINANCE_JOURNAL_DECISION_REASON_INVALID',
        'Add a review reason between 8 and 1000 characters.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.transition(
      businessId,
      actorUserId,
      id,
      'pending_approval',
      decision,
      (row) => {
        if (row.createdByUserId === actorUserId) {
          throw new AppException(
            'FINANCE_JOURNAL_SELF_APPROVAL_BLOCKED',
            'A different business user must review this journal.',
            HttpStatus.FORBIDDEN,
          );
        }
        return Promise.resolve({
          reviewedByUserId: actorUserId,
          reviewReason: trimmedReason,
          reviewedAt: new Date(),
        });
      },
    );
  }

  async post(businessId: string, actorUserId: string, id: string) {
    const posted = await this.transition(
      businessId,
      actorUserId,
      id,
      'approved',
      'posted',
      async (row) => {
        if (row.reviewedByUserId !== actorUserId) {
          throw new AppException(
            'FINANCE_JOURNAL_POST_REVIEWER_REQUIRED',
            'The approving user must post the approved journal.',
            HttpStatus.FORBIDDEN,
          );
        }
        if (await this.isPeriodClosed(row.businessId, row.entryDate))
          this.closedPeriodError();
        if (!new Prisma.Decimal(row.totalDebits).equals(row.totalCredits)) {
          throw new AppException(
            'FINANCE_JOURNAL_NOT_BALANCED',
            'The journal no longer balances and cannot be posted.',
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        }
        return { postedByUserId: actorUserId, postedAt: new Date() };
      },
    );
    await this.queuePostedJournalReview(posted);
    return posted;
  }

  private async queuePostedJournalReview(journal: {
    id: string;
    businessId: string;
    entryDate: Date;
    postedAt: Date | null;
  }) {
    if (!journal.postedAt || !this.financeAgentEvents) return;
    try {
      const business = await this.tenantPrisma.client.business.findFirst({
        where: { id: journal.businessId },
        select: { id: true, policies: true },
      });
      const policies = resolvePolicies(business);
      if (
        !policies.bool('agents.financeEnabled') ||
        !policies.bool('agents.financePostedJournalEventReviewEnabled')
      ) {
        return;
      }

      await this.financeAgentEvents.add(
        FINANCE_JOURNAL_POSTED_EVENT_JOB,
        {
          businessId: journal.businessId,
          journalId: journal.id,
          postedAt: journal.postedAt.toISOString(),
        },
        {
          jobId: `finance-journal-posted-${journal.businessId}-${journal.id}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1_000 },
          removeOnComplete: 200,
          removeOnFail: 500,
        },
      );
    } catch (error) {
      // An optional review must not undo an already committed journal posting.
      this.logger.warn(
        `Could not queue Finance review for posted journal ${journal.id}: ${(error as Error).message}`,
      );
    }
  }

  async createReversalDraft(
    businessId: string,
    actorUserId: string,
    id: string,
    reason: string,
  ) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 8 || trimmedReason.length > 1000) {
      throw new AppException(
        'FINANCE_JOURNAL_REVERSAL_REASON_INVALID',
        'Add a reversal reason between 8 and 1000 characters.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const entryDate = new Date();
    entryDate.setUTCHours(0, 0, 0, 0);
    const monthStart = new Date(
      Date.UTC(entryDate.getUTCFullYear(), entryDate.getUTCMonth(), 1),
    );

    try {
      return await this.tenantPrisma.client.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM businesses WHERE id = ${scopedBusinessId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM finance_journal_entries WHERE id = ${id} AND business_id = ${scopedBusinessId} FOR UPDATE`;
        const original = await tx.financeJournalEntry.findFirst({
          where: { id, businessId: scopedBusinessId },
          include: { lines: true },
        });
        if (!original) this.entryNotFound();
        if (original.status !== 'posted') {
          throw new AppException(
            'FINANCE_JOURNAL_REVERSAL_REQUIRES_POSTED',
            'Only a posted journal can be reversed.',
            HttpStatus.CONFLICT,
          );
        }
        const existingReversal = await tx.financeJournalEntry.findFirst({
          where: { businessId: scopedBusinessId, reversalOfId: original.id },
          select: { id: true },
        });
        if (existingReversal) {
          throw new AppException(
            'FINANCE_JOURNAL_ALREADY_REVERSED',
            'A reversal draft already exists for this journal.',
            HttpStatus.CONFLICT,
          );
        }
        const closedPeriod = await tx.financeAccountingPeriod.findFirst({
          where: {
            businessId: scopedBusinessId,
            monthStart,
            status: 'closed',
          },
          select: { id: true },
        });
        if (closedPeriod) this.closedPeriodError();

        const reversal = await tx.financeJournalEntry.create({
          data: {
            businessId: scopedBusinessId,
            reversalOfId: original.id,
            reference: `REV-${original.id}`,
            entryDate,
            currencyCode: original.currencyCode,
            description: `Reversal of ${original.reference}: ${trimmedReason}`,
            status: 'draft',
            totalDebits: original.totalCredits,
            totalCredits: original.totalDebits,
            createdByUserId: actorUserId,
          },
        });
        await tx.financeJournalLine.createMany({
          data: original.lines.map((line) => ({
            businessId: scopedBusinessId,
            journalEntryId: reversal.id,
            accountId: line.accountId,
            accountCode: line.accountCode,
            accountName: line.accountName,
            memo: line.memo ? `Reversal: ${line.memo}` : 'Reversal',
            debit: line.credit,
            credit: line.debit,
          })),
        });
        const created = await tx.financeJournalEntry.findFirstOrThrow({
          where: { id: reversal.id, businessId: scopedBusinessId },
          include: {
            lines: true,
            reversalOf: { select: { id: true, reference: true } },
          },
        });
        await tx.auditLog.create({
          data: {
            businessId: scopedBusinessId,
            actorUserId,
            action: 'finance.journal_reversal_draft_created',
            entity: 'FinanceJournalEntry',
            entityId: created.id,
            before: Prisma.JsonNull,
            after: {
              ...this.auditEntry(created),
              reversalOfId: original.id,
              reversalReason: trimmedReason,
            },
          },
        });
        return created;
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        throw new AppException(
          'FINANCE_JOURNAL_ALREADY_REVERSED',
          'A reversal draft already exists for this journal or the reversal reference is already used.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async closePeriod(
    businessId: string,
    actorUserId: string,
    month: string,
    reason: string,
  ) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 8 || trimmedReason.length > 1000) {
      throw new AppException(
        'FINANCE_PERIOD_CLOSE_REASON_INVALID',
        'Add a reason between 8 and 1000 characters for locking the month.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const { start, end } = parseMonth(month);
    return this.tenantPrisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM businesses WHERE id = ${scopedBusinessId} FOR UPDATE`;
      const openEntries = await tx.financeJournalEntry.count({
        where: {
          businessId: scopedBusinessId,
          entryDate: { gte: start, lt: end },
          status: { in: ['draft', 'pending_approval', 'approved'] },
        },
      });
      if (openEntries > 0) {
        throw new AppException(
          'FINANCE_PERIOD_HAS_OPEN_JOURNALS',
          'Finish, reject or post every journal in this month before locking journal posting.',
          HttpStatus.CONFLICT,
        );
      }
      const exists = await tx.financeAccountingPeriod.findFirst({
        where: { businessId: scopedBusinessId, monthStart: start },
      });
      if (exists) {
        throw new AppException(
          'FINANCE_PERIOD_ALREADY_LOCKED',
          'Journal posting is already locked for this month.',
          HttpStatus.CONFLICT,
        );
      }
      const period = await tx.financeAccountingPeriod.create({
        data: {
          businessId: scopedBusinessId,
          monthStart: start,
          status: 'closed',
          closeReason: trimmedReason,
          closedByUserId: actorUserId,
        },
      });
      await tx.auditLog.create({
        data: {
          businessId: scopedBusinessId,
          actorUserId,
          action: 'finance.journal_period_locked',
          entity: 'FinanceAccountingPeriod',
          entityId: period.id,
          before: Prisma.JsonNull,
          after: {
            month,
            reason: trimmedReason,
            status: 'closed',
            closeScope: 'journal_posting_only',
          },
        },
      });
      return period;
    });
  }

  async pendingApprovalItems(businessId: string) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    const rows = await this.tenantPrisma.client.financeJournalEntry.findMany({
      where: { businessId: scopedBusinessId, status: 'pending_approval' },
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
      take: 100,
      select: {
        id: true,
        reference: true,
        description: true,
        currencyCode: true,
        totalDebits: true,
        entryDate: true,
        createdByUserId: true,
        submittedAt: true,
        reversalOfId: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      description: row.description,
      reversalOfId: row.reversalOfId,
      currencyCode: row.currencyCode,
      total: row.totalDebits.toString(),
      entryDate: row.entryDate,
      createdByUserId: row.createdByUserId,
      submittedAt: row.submittedAt,
    }));
  }

  async decideFromActionCenter(
    businessId: string,
    actorUserId: string,
    id: string,
    decision: 'approved' | 'rejected',
    reason: string,
  ) {
    return this.decide(businessId, actorUserId, id, decision, reason);
  }

  private async transition(
    businessId: string,
    actorUserId: string,
    id: string,
    expected: JournalStatus,
    status: JournalStatus,
    beforeUpdate: (
      row: Prisma.FinanceJournalEntryGetPayload<{ include: { lines: true } }>,
    ) => Promise<Prisma.FinanceJournalEntryUpdateInput>,
  ) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    return this.tenantPrisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM businesses WHERE id = ${scopedBusinessId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM finance_journal_entries WHERE id = ${id} AND business_id = ${scopedBusinessId} FOR UPDATE`;
      const row = await tx.financeJournalEntry.findFirst({
        where: { id, businessId: scopedBusinessId },
        include: { lines: true },
      });
      if (!row) this.entryNotFound();
      if (
        !JOURNAL_STATUSES.includes(row.status as JournalStatus) ||
        row.status !== expected
      ) {
        throw new AppException(
          'FINANCE_JOURNAL_INVALID_TRANSITION',
          `A ${expected.replace('_', ' ')} journal is required for this action.`,
          HttpStatus.CONFLICT,
        );
      }
      const extra = await beforeUpdate(row);
      const updated = await tx.financeJournalEntry.update({
        where: { id: row.id },
        data: { status, ...extra },
        include: { lines: true },
      });
      await tx.auditLog.create({
        data: {
          businessId: scopedBusinessId,
          actorUserId,
          action: `finance.journal_${status}`,
          entity: 'FinanceJournalEntry',
          entityId: row.id,
          before: this.auditEntry(row),
          after: this.auditEntry(updated),
        },
      });
      return updated;
    });
  }

  private async isPeriodClosed(businessId: string, entryDate: Date) {
    const monthStart = new Date(
      Date.UTC(entryDate.getUTCFullYear(), entryDate.getUTCMonth(), 1),
    );
    return Boolean(
      await this.tenantPrisma.client.financeAccountingPeriod.findFirst({
        where: { businessId, monthStart, status: 'closed' },
        select: { id: true },
      }),
    );
  }

  private parseDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new AppException(
        'FINANCE_JOURNAL_DATE_INVALID',
        'Enter a journal date in YYYY-MM-DD format.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    ) {
      throw new AppException(
        'FINANCE_JOURNAL_DATE_INVALID',
        'Enter a real calendar date in YYYY-MM-DD format.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return parsed;
  }

  private auditEntry(
    row: Prisma.FinanceJournalEntryGetPayload<{ include: { lines: true } }>,
  ): Prisma.InputJsonObject {
    return {
      reference: row.reference,
      entryDate: row.entryDate.toISOString().slice(0, 10),
      reversalOfId: row.reversalOfId,
      currencyCode: row.currencyCode,
      description: row.description,
      status: row.status,
      totalDebits: row.totalDebits.toString(),
      totalCredits: row.totalCredits.toString(),
      createdByUserId: row.createdByUserId,
      reviewedByUserId: row.reviewedByUserId,
      reviewReason: row.reviewReason,
      postedByUserId: row.postedByUserId,
      lines: row.lines.map((line) => ({
        accountId: line.accountId,
        accountCode: line.accountCode,
        accountName: line.accountName,
        memo: line.memo,
        debit: line.debit.toString(),
        credit: line.credit.toString(),
      })),
    };
  }

  private scopedBusinessId(businessId: string) {
    const activeBusinessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID);
    if (activeBusinessId && activeBusinessId !== businessId) {
      throw new AppException(
        'FINANCE_JOURNAL_TENANT_MISMATCH',
        'The journal request does not match the active business.',
        HttpStatus.FORBIDDEN,
      );
    }
    return activeBusinessId ?? businessId;
  }

  private isUniqueConflict(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private notFound(): never {
    throw new AppException(
      'FINANCE_JOURNAL_BUSINESS_NOT_FOUND',
      'The current business could not be found.',
      HttpStatus.NOT_FOUND,
    );
  }

  private entryNotFound(): never {
    throw new AppException(
      'FINANCE_JOURNAL_NOT_FOUND',
      'This journal is not available in the current business.',
      HttpStatus.NOT_FOUND,
    );
  }

  private closedPeriodError(): never {
    throw new AppException(
      'FINANCE_ACCOUNTING_PERIOD_CLOSED',
      'Journal posting is locked for this month. Use an authorized adjustment in an open period.',
      HttpStatus.CONFLICT,
    );
  }
}
