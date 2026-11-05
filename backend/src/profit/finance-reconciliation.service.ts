import { createHash } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Prisma } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { Queue } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { AppException } from '../common/filters/app.exception';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { resolvePolicies } from '../common/policies/policies.service';
import {
  FINANCE_STATEMENT_IMPORTED_EVENT_JOB,
  SPECIALIST_AGENT_FINANCE_EVENTS_QUEUE,
} from '../common/agents/specialist-agent-events.constants';
import {
  FinanceReconciliationDecisionDto,
  FinanceReconciliationMatchDto,
  ImportFinanceBankStatementDto,
} from './dto/finance-reconciliation.dto';

const MAX_STATEMENT_ROWS = 500;
const PAGE_SIZE = 50;
const DATE_HEADER_NAMES = ['date', 'transaction_date', 'posted_date'];
const AMOUNT_HEADER_NAMES = ['amount', 'signed_amount'];

type SafeStatementRow = { lineNumber: number; date: Date; amount: Prisma.Decimal };
type CandidateRow = {
  id: string;
  reference: string;
  entryDate: Date;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
};

@Injectable()
export class FinanceReconciliationService {
  private readonly logger = new Logger(FinanceReconciliationService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cls: ClsService,
    @InjectQueue(SPECIALIST_AGENT_FINANCE_EVENTS_QUEUE)
    private readonly financeAgentEvents: Queue,
  ) {}

  async listAccounts(businessId: string) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    return this.tenantPrisma.client.financeAccount.findMany({
      where: { businessId: scopedBusinessId, active: true },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      select: { id: true, code: true, name: true, type: true },
    });
  }

  async listImports(businessId: string) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    const imports = await this.tenantPrisma.client.financeBankStatementImport.findMany({
      where: { businessId: scopedBusinessId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
      include: { financeAccount: { select: { id: true, code: true, name: true } } },
    });
    if (!imports.length) return { imports: [], disclosure: this.disclosure() };

    const statuses = await this.tenantPrisma.client.financeBankStatementLine.groupBy({
      by: ['importId', 'status'],
      where: {
        businessId: scopedBusinessId,
        importId: { in: imports.map((item) => item.id) },
      },
      _count: { _all: true },
    });
    const countByImport = new Map<string, Record<string, number>>();
    for (const row of statuses) {
      const counts = countByImport.get(row.importId) ?? {};
      counts[row.status] = row._count._all;
      countByImport.set(row.importId, counts);
    }
    return {
      imports: imports.map((item) => ({
        id: item.id,
        currencyCode: item.currencyCode,
        periodStart: item.periodStart,
        periodEnd: item.periodEnd,
        rowCount: item.rowCount,
        createdAt: item.createdAt,
        account: item.financeAccount,
        counts: countByImport.get(item.id) ?? {},
      })),
      disclosure: this.disclosure(),
    };
  }

  async importStatement(
    businessId: string,
    actorUserId: string,
    dto: ImportFinanceBankStatementDto,
  ) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    const currencyCode = dto.currencyCode.trim().toUpperCase();
    const account = await this.tenantPrisma.client.financeAccount.findFirst({
      where: { id: dto.financeAccountId, businessId: scopedBusinessId, active: true },
      select: { id: true },
    });
    if (!account) {
      throw new AppException(
        'FINANCE_RECONCILIATION_ACCOUNT_UNAVAILABLE',
        'Choose an active account from this business.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const rows = this.parseCsv(dto.csv);
    const canonical = rows.map((row) => `${row.date.toISOString().slice(0, 10)}\t${row.amount.toFixed(2)}`).join('\n');
    const sourceHash = createHash('sha256')
      .update(`${account.id}\n${currencyCode}\n${canonical}`)
      .digest('hex');
    const periodStart = new Date(Math.min(...rows.map((row) => row.date.getTime())));
    const periodEnd = new Date(Math.max(...rows.map((row) => row.date.getTime())));

    try {
      const created = await this.tenantPrisma.client.$transaction(async (tx) => {
        const created = await tx.financeBankStatementImport.create({
          data: {
            businessId: scopedBusinessId,
            financeAccountId: account.id,
            currencyCode,
            periodStart,
            periodEnd,
            rowCount: rows.length,
            sourceHash,
            importedByUserId: actorUserId,
            lines: {
              create: rows.map((row) => ({
                lineNumber: row.lineNumber,
                statementDate: row.date,
                amount: row.amount,
              })),
            },
          },
          select: {
            id: true,
            rowCount: true,
            periodStart: true,
            periodEnd: true,
            currencyCode: true,
            createdAt: true,
          },
        });
        await tx.auditLog.create({
          data: {
            businessId: scopedBusinessId,
            actorUserId,
            action: 'finance.reconciliation_statement_imported',
            entity: 'FinanceBankStatementImport',
            entityId: created.id,
            before: Prisma.JsonNull,
            after: {
              financeAccountId: account.id,
              currencyCode,
              rowCount: created.rowCount,
              periodStart: created.periodStart.toISOString().slice(0, 10),
              periodEnd: created.periodEnd.toISOString().slice(0, 10),
            },
          },
        });
        return created;
      });
      await this.queueImportedStatementReview(scopedBusinessId, created);
      return created;
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        throw new AppException(
          'FINANCE_RECONCILIATION_DUPLICATE_IMPORT',
          'These statement lines have already been imported for this account and currency.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  private async queueImportedStatementReview(
    businessId: string,
    statement: {
      id: string;
      createdAt: Date;
    },
  ) {
    try {
      const business = await this.tenantPrisma.client.business.findFirst({
        where: { id: businessId },
        select: { id: true, policies: true },
      });
      const policies = resolvePolicies(business);
      if (
        !policies.bool('agents.financeEnabled') ||
        !policies.bool('agents.financeStatementImportedEventReviewEnabled')
      ) {
        return;
      }

      await this.financeAgentEvents.add(
        FINANCE_STATEMENT_IMPORTED_EVENT_JOB,
        {
          businessId,
          importId: statement.id,
          importedAt: statement.createdAt.toISOString(),
        },
        {
          jobId: `finance-statement-imported-${businessId}-${statement.id}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1_000 },
          removeOnComplete: 200,
          removeOnFail: 500,
        },
      );
    } catch (error) {
      // An optional read-only review must not undo a committed statement import.
      this.logger.warn(
        `Could not queue Finance review for statement import ${statement.id}: ${(error as Error).message}`,
      );
    }
  }

  async getImport(businessId: string, importId: string, page = 1) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    const safePage = Number.isInteger(page) && page > 0 ? Math.min(page, 10_000) : 1;
    const statement = await this.tenantPrisma.client.financeBankStatementImport.findFirst({
      where: { id: importId, businessId: scopedBusinessId },
      include: { financeAccount: { select: { id: true, code: true, name: true } } },
    });
    if (!statement) this.notFound();
    const [lines, total] = await Promise.all([
      this.tenantPrisma.client.financeBankStatementLine.findMany({
        where: { businessId: scopedBusinessId, importId },
        orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
        skip: (safePage - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          matchedJournalLine: {
            select: {
              id: true,
              accountCode: true,
              accountName: true,
              debit: true,
              credit: true,
              journalEntry: { select: { reference: true, entryDate: true, currencyCode: true } },
            },
          },
        },
      }),
      this.tenantPrisma.client.financeBankStatementLine.count({
        where: { businessId: scopedBusinessId, importId },
      }),
    ]);
    const linesWithCandidates = await Promise.all(
      lines.map(async (line) => ({
        ...line,
        candidates: line.status === 'unmatched' ? await this.findCandidates(
          scopedBusinessId,
          statement.financeAccountId,
          statement.currencyCode,
          line.statementDate,
          line.amount,
        ) : [],
      })),
    );
    return {
      statement: {
        id: statement.id,
        currencyCode: statement.currencyCode,
        periodStart: statement.periodStart,
        periodEnd: statement.periodEnd,
        rowCount: statement.rowCount,
        createdAt: statement.createdAt,
        account: statement.financeAccount,
      },
      lines: linesWithCandidates,
      page: safePage,
      pageSize: PAGE_SIZE,
      total,
      disclosure: this.disclosure(),
    };
  }

  async exportImportCsv(businessId: string, actorUserId: string, importId: string) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    const statement = await this.tenantPrisma.client.financeBankStatementImport.findFirst({
      where: { id: importId, businessId: scopedBusinessId },
      select: { id: true, currencyCode: true },
    });
    if (!statement) this.notFound();

    const lines = await this.tenantPrisma.client.financeBankStatementLine.findMany({
      where: { businessId: scopedBusinessId, importId: statement.id },
      orderBy: [{ lineNumber: 'asc' }, { id: 'asc' }],
      include: {
        statementImport: {
          select: {
            currencyCode: true,
            financeAccount: { select: { code: true, name: true } },
          },
        },
        matchedJournalLine: {
          select: {
            accountCode: true,
            accountName: true,
            debit: true,
            credit: true,
            journalEntry: { select: { reference: true, entryDate: true } },
          },
        },
      },
    });
    const headers = [
      'statement_line',
      'statement_date',
      'statement_amount',
      'currency',
      'status',
      'statement_account_code',
      'statement_account_name',
      'journal_reference',
      'journal_date',
      'journal_account_code',
      'journal_account_name',
      'journal_debit',
      'journal_credit',
    ];
    const rows = lines.map((line) => [
      String(line.lineNumber),
      line.statementDate.toISOString().slice(0, 10),
      line.amount.toString(),
      line.statementImport.currencyCode,
      line.status,
      line.statementImport.financeAccount.code,
      line.statementImport.financeAccount.name,
      line.matchedJournalLine?.journalEntry.reference ?? '',
      line.matchedJournalLine?.journalEntry.entryDate.toISOString().slice(0, 10) ?? '',
      line.matchedJournalLine?.accountCode ?? '',
      line.matchedJournalLine?.accountName ?? '',
      line.matchedJournalLine?.debit.toString() ?? '',
      line.matchedJournalLine?.credit.toString() ?? '',
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((value, index) => this.csvCell(value, [5, 6, 7, 9, 10].includes(index))).join(','))
      .join('\r\n');

    await this.tenantPrisma.client.auditLog.create({
      data: {
        businessId: scopedBusinessId,
        actorUserId,
        action: 'finance.reconciliation_exported',
        entity: 'FinanceBankStatementImport',
        entityId: statement.id,
        after: {
          rowCount: rows.length,
          includesBankDescriptions: false,
          includesDecisionNotes: false,
        },
      },
    });

    return {
      filename: `finance-statement-review-${statement.id}.csv`,
      csv,
      rowCount: rows.length,
      disclosure: 'This export contains imported dates and amounts plus human-recorded match status and journal references. It does not include bank descriptions or the original CSV.',
    };
  }

  async acceptMatch(
    businessId: string,
    actorUserId: string,
    lineId: string,
    dto: FinanceReconciliationMatchDto,
  ) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    try {
      return await this.tenantPrisma.client.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM finance_bank_statement_lines WHERE id = ${lineId} AND business_id = ${scopedBusinessId} FOR UPDATE`;
        const line = await tx.financeBankStatementLine.findFirst({
          where: { id: lineId, businessId: scopedBusinessId },
          include: { statementImport: true },
        });
        if (!line) this.notFound();
        if (line.status !== 'unmatched') this.lineNotOpen();
        await tx.$queryRaw`SELECT id FROM finance_journal_lines WHERE id = ${dto.journalLineId} AND business_id = ${scopedBusinessId} FOR UPDATE`;
        const candidates = await tx.$queryRaw<CandidateRow[]>`
          SELECT jl.id, je.reference, je.entry_date AS entryDate,
                 jl.debit, jl.credit
          FROM finance_journal_lines jl
          INNER JOIN finance_journal_entries je
            ON je.id = jl.journal_entry_id AND je.business_id = jl.business_id
          WHERE jl.id = ${dto.journalLineId}
            AND jl.business_id = ${scopedBusinessId}
            AND jl.account_id = ${line.statementImport.financeAccountId}
            AND je.status = 'posted'
            AND je.currency_code = ${line.statementImport.currencyCode}
            AND je.entry_date BETWEEN DATE_SUB(${line.statementDate}, INTERVAL 3 DAY)
                                  AND DATE_ADD(${line.statementDate}, INTERVAL 3 DAY)
            AND (jl.debit - jl.credit) = ${line.amount}
            AND NOT EXISTS (
              SELECT 1 FROM finance_bank_statement_lines existing
              WHERE existing.business_id = jl.business_id
                AND existing.matched_journal_line_id = jl.id
                AND existing.status = 'matched'
            )
          LIMIT 1
        `;
        if (!candidates.length) {
          throw new AppException(
            'FINANCE_RECONCILIATION_MATCH_INVALID',
            'That journal line is no longer an eligible match. Refresh suggestions and choose another line.',
            HttpStatus.CONFLICT,
          );
        }
        const updated = await tx.financeBankStatementLine.update({
          where: { id: line.id },
          data: {
            status: 'matched',
            matchedJournalLineId: dto.journalLineId,
            decisionByUserId: actorUserId,
            decisionAt: new Date(),
            decisionReason: dto.reason.trim(),
          },
          select: { id: true, status: true, matchedJournalLineId: true, decisionAt: true, decisionReason: true },
        });
        await tx.auditLog.create({
          data: {
            businessId: scopedBusinessId,
            actorUserId,
            action: 'finance.reconciliation_match_accepted',
            entity: 'FinanceBankStatementLine',
            entityId: line.id,
            before: { status: line.status },
            after: { status: updated.status, matchedJournalLineId: updated.matchedJournalLineId, reason: updated.decisionReason },
          },
        });
        return updated;
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        throw new AppException(
          'FINANCE_RECONCILIATION_JOURNAL_LINE_ALREADY_MATCHED',
          'That journal line has already been matched to another statement line.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async rejectSuggestions(
    businessId: string,
    actorUserId: string,
    lineId: string,
    dto: FinanceReconciliationDecisionDto,
  ) {
    return this.decideLine(businessId, actorUserId, lineId, 'no_match', dto.reason);
  }

  async reopenLine(
    businessId: string,
    actorUserId: string,
    lineId: string,
    dto: FinanceReconciliationDecisionDto,
  ) {
    return this.decideLine(businessId, actorUserId, lineId, 'unmatched', dto.reason, true);
  }

  private async decideLine(
    businessId: string,
    actorUserId: string,
    lineId: string,
    status: 'unmatched' | 'no_match',
    reason: string,
    clearMatch = false,
  ) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    return this.tenantPrisma.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM finance_bank_statement_lines WHERE id = ${lineId} AND business_id = ${scopedBusinessId} FOR UPDATE`;
      const line = await tx.financeBankStatementLine.findFirst({
        where: { id: lineId, businessId: scopedBusinessId },
      });
      if (!line) this.notFound();
      const canDecide = clearMatch
        ? line.status === 'matched' || line.status === 'no_match'
        : line.status === 'unmatched';
      if (!canDecide) this.lineNotOpen();
      const updated = await tx.financeBankStatementLine.update({
        where: { id: line.id },
        data: {
          status,
          ...(clearMatch ? { matchedJournalLineId: null } : {}),
          decisionByUserId: actorUserId,
          decisionAt: new Date(),
          decisionReason: reason.trim(),
        },
        select: { id: true, status: true, matchedJournalLineId: true, decisionAt: true, decisionReason: true },
      });
      await tx.auditLog.create({
        data: {
          businessId: scopedBusinessId,
          actorUserId,
          action: clearMatch ? 'finance.reconciliation_match_reopened' : 'finance.reconciliation_suggestions_rejected',
          entity: 'FinanceBankStatementLine',
          entityId: line.id,
          before: { status: line.status, matchedJournalLineId: line.matchedJournalLineId },
          after: { status: updated.status, matchedJournalLineId: updated.matchedJournalLineId, reason: updated.decisionReason },
        },
      });
      return updated;
    });
  }

  private async findCandidates(
    businessId: string,
    accountId: string,
    currencyCode: string,
    statementDate: Date,
    amount: Prisma.Decimal,
  ) {
    return this.tenantPrisma.client.$queryRaw<CandidateRow[]>`
      SELECT jl.id, je.reference, je.entry_date AS entryDate,
             jl.debit, jl.credit
      FROM finance_journal_lines jl
      INNER JOIN finance_journal_entries je
        ON je.id = jl.journal_entry_id AND je.business_id = jl.business_id
      WHERE jl.business_id = ${businessId}
        AND jl.account_id = ${accountId}
        AND je.status = 'posted'
        AND je.currency_code = ${currencyCode}
        AND je.entry_date BETWEEN DATE_SUB(${statementDate}, INTERVAL 3 DAY)
                              AND DATE_ADD(${statementDate}, INTERVAL 3 DAY)
        AND (jl.debit - jl.credit) = ${amount}
        AND NOT EXISTS (
          SELECT 1 FROM finance_bank_statement_lines existing
          WHERE existing.business_id = jl.business_id
            AND existing.matched_journal_line_id = jl.id
            AND existing.status = 'matched'
        )
      ORDER BY ABS(DATEDIFF(je.entry_date, ${statementDate})) ASC, je.entry_date DESC, jl.id ASC
      LIMIT 5
    `;
  }

  private parseCsv(csv: string): SafeStatementRow[] {
    let records: Record<string, string>[];
    try {
      records = parse(csv, {
        bom: true,
        columns: (headers: string[]) => headers.map((header) => header.trim().toLowerCase().replace(/[\s-]+/g, '_')),
        skip_empty_lines: true,
        trim: true,
        max_record_size: 4096,
        relax_column_count: false,
      });
    } catch {
      throw new AppException(
        'FINANCE_RECONCILIATION_CSV_INVALID',
        'The CSV could not be read. Use a header row and one date and amount per line.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!records.length || records.length > MAX_STATEMENT_ROWS) {
      throw new AppException(
        'FINANCE_RECONCILIATION_ROW_COUNT_INVALID',
        `Import between 1 and ${MAX_STATEMENT_ROWS} statement lines at a time.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const headers = Object.keys(records[0]);
    const dateHeader = DATE_HEADER_NAMES.find((name) => headers.includes(name));
    const amountHeader = AMOUNT_HEADER_NAMES.find((name) => headers.includes(name));
    if (!dateHeader || !amountHeader) {
      throw new AppException(
        'FINANCE_RECONCILIATION_COLUMNS_MISSING',
        'CSV needs a date column and a signed amount column. Other text columns are ignored and never stored.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const rows = records.map((record, index) => {
      const dateValue = String(record[dateHeader] ?? '').trim();
      const amountValue = String(record[amountHeader] ?? '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) this.invalidRow(index + 2);
      const date = new Date(`${dateValue}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateValue) this.invalidRow(index + 2);
      if (!/^-?\d{1,13}(?:\.\d{1,2})?$/.test(amountValue)) this.invalidRow(index + 2);
      const amount = new Prisma.Decimal(amountValue);
      if (amount.isZero()) this.invalidRow(index + 2);
      return { lineNumber: index + 1, date, amount };
    });
    return rows;
  }

  private scopedBusinessId(businessId: string) {
    const contextBusinessId = this.cls.get<string>(CLS_KEY_BUSINESS_ID);
    if (!contextBusinessId || contextBusinessId !== businessId) {
      throw new AppException(
        'FINANCE_RECONCILIATION_SCOPE_MISMATCH',
        'The requested business is not available in this request context.',
        HttpStatus.FORBIDDEN,
      );
    }
    return contextBusinessId;
  }

  private invalidRow(line: number): never {
    throw new AppException(
      'FINANCE_RECONCILIATION_ROW_INVALID',
      `Statement CSV row ${line} must contain a real YYYY-MM-DD date and a non-zero signed amount with at most two decimals.`,
      HttpStatus.BAD_REQUEST,
    );
  }

  private lineNotOpen(): never {
    throw new AppException(
      'FINANCE_RECONCILIATION_LINE_NOT_OPEN',
      'This statement line has already been decided. Refresh before taking another action.',
      HttpStatus.CONFLICT,
    );
  }

  private notFound(): never {
    throw new AppException(
      'FINANCE_RECONCILIATION_NOT_FOUND',
      'That statement import or line is not available in this business.',
      HttpStatus.NOT_FOUND,
    );
  }

  private isUniqueConflict(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private csvCell(value: string, protectFormula = false) {
    const safeValue = protectFormula && /^[=+@\-\t\r]/.test(value) ? `'${value}` : value;
    return /[",\r\n]/.test(safeValue) ? `"${safeValue.replace(/"/g, '""')}"` : safeValue;
  }

  private disclosure() {
    return 'Suggestions compare exact signed amounts on the selected account and currency within three calendar days against posted Noxtill manual journal lines. A match is only recorded after a human accepts it. Imports keep dates and amounts only; bank descriptions and the uploaded CSV are not stored. Automatic sales and expense journal postings are not included.';
  }
}
