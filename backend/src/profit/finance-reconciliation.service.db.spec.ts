import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { BranchScopeService } from '../common/tenancy/branch-scope.service';
import { FinanceJournalsService } from './finance-journals.service';
import { FinanceReconciliationService } from './finance-reconciliation.service';
import { FINANCE_STATEMENT_IMPORTED_EVENT_JOB } from '../common/agents/specialist-agent-events.constants';

class FakeClsService {
  private readonly values: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.values[key] as T;
  }
  set(key: string, value: unknown) {
    this.values[key] = value;
  }
}

describe('FinanceReconciliationService (MySQL)', () => {
  jest.setTimeout(30_000);
  let prisma: PrismaService;
  let service: FinanceReconciliationService;
  let journals: FinanceJournalsService;
  let cls: FakeClsService;
  let businessId: string;
  let otherBusinessId: string;
  let cashAccountId: string;
  let revenueAccountId: string;
  const financeAgentEvents = { add: jest.fn() };

  async function postCashJournal(reference: string, entryDate: string, amount = '125.00', currencyCode = 'USD') {
    const draft = await journals.createDraft(businessId, 'reconciliation-author', {
      reference,
      entryDate,
      description: 'Test source journal for reconciliation suggestion coverage',
      lines: [
        { accountId: cashAccountId, debit: amount, credit: '0' },
        { accountId: revenueAccountId, debit: '0', credit: amount },
      ],
    });
    await journals.submit(businessId, 'reconciliation-author', draft.id);
    await journals.decide(businessId, 'reconciliation-reviewer', draft.id, 'approved', 'Reviewed the reconciliation test entry');
    const posted = await journals.post(businessId, 'reconciliation-reviewer', draft.id);
    return currencyCode === 'USD'
      ? posted
      : prisma.financeJournalEntry.update({ where: { id: posted.id }, data: { currencyCode } }).then(async () =>
          prisma.financeJournalEntry.findUniqueOrThrow({ where: { id: posted.id }, include: { lines: true } }),
        );
  }

  async function importCsv(csv = 'date,amount,description\n2099-03-15,125.00,Do not retain this private memo') {
    return service.importStatement(businessId, 'statement-importer', {
      financeAccountId: cashAccountId,
      currencyCode: 'USD',
      csv,
    });
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(prisma, cls as unknown as ClsService);
    service = new FinanceReconciliationService(
      tenantPrisma,
      cls as unknown as ClsService,
      financeAgentEvents as never,
    );
    journals = new FinanceJournalsService(
      tenantPrisma,
      cls as unknown as ClsService,
      prisma,
      new BranchScopeService(prisma),
    );
    const stamp = `${Date.now()}-${process.pid}`;
    [businessId, otherBusinessId] = await Promise.all([
      prisma.business.create({ data: { name: 'Finance Reconciliation QA', slug: `finance-reconcile-${stamp}` } }).then((row) => row.id),
      prisma.business.create({ data: { name: 'Finance Reconciliation Other Tenant', slug: `finance-reconcile-other-${stamp}` } }).then((row) => row.id),
    ]);
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const [cash, revenue] = await Promise.all([
      journals.createAccount(businessId, 'reconciliation-owner', { code: '1000', name: 'Test cash account', type: 'asset' }),
      journals.createAccount(businessId, 'reconciliation-owner', { code: '4000', name: 'Test revenue account', type: 'revenue' }),
    ]);
    cashAccountId = cash.id;
    revenueAccountId = revenue.id;
  });

  beforeEach(async () => {
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    financeAgentEvents.add.mockReset().mockResolvedValue(undefined);
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: {} },
    });
    await prisma.financeBankStatementImport.deleteMany({ where: { businessId: { in: [businessId, otherBusinessId] } } });
    await prisma.financeJournalEntry.deleteMany({ where: { businessId: { in: [businessId, otherBusinessId] } } });
    await prisma.auditLog.deleteMany({
      where: {
        businessId: { in: [businessId, otherBusinessId] },
        action: { startsWith: 'finance.' },
      },
    });
  });

  afterAll(async () => {
    if (businessId && otherBusinessId) {
      await prisma.financeBankStatementImport.deleteMany({ where: { businessId: { in: [businessId, otherBusinessId] } } });
      await prisma.financeJournalEntry.deleteMany({ where: { businessId: { in: [businessId, otherBusinessId] } } });
      await prisma.financeAccount.deleteMany({ where: { businessId: { in: [businessId, otherBusinessId] } } });
      await prisma.auditLog.deleteMany({ where: { businessId: { in: [businessId, otherBusinessId] }, action: { startsWith: 'finance.' } } });
      await prisma.business.deleteMany({ where: { id: { in: [businessId, otherBusinessId] } } });
    }
    await prisma.$disconnect();
  });

  it('imports only safe columns and suggests exact posted same-account, same-currency journal lines within three days', async () => {
    const match = await postCashJournal('QA-RECON-MATCH', '2099-03-15');
    await postCashJournal('QA-RECON-DATE-MISMATCH', '2099-03-20');
    await postCashJournal('QA-RECON-CURRENCY-MISMATCH', '2099-03-15', '125.00', 'EUR');
    const created = await importCsv();
    const detail = await service.getImport(businessId, created.id);
    expect(detail.total).toBe(1);
    expect(detail.lines[0].candidates).toEqual([
      expect.objectContaining({
        id: match.lines.find((line) => line.accountId === cashAccountId)?.id,
        reference: 'QA-RECON-MATCH',
      }),
    ]);
    expect(JSON.stringify(detail)).not.toContain('Do not retain this private memo');
    expect(detail.disclosure).toContain('only recorded after a human accepts');
  });

  it('accepts a suggestion with an audit record and leaves the posted journal untouched', async () => {
    const posted = await postCashJournal('QA-RECON-ACCEPT', '2099-03-15');
    const imported = await importCsv();
    const detail = await service.getImport(businessId, imported.id);
    const accepted = await service.acceptMatch(businessId, 'reconciliation-reviewer', detail.lines[0].id, {
      journalLineId: posted.lines.find((line) => line.accountId === cashAccountId)!.id,
      reason: 'Matched against the business bank statement line',
    });
    expect(accepted).toMatchObject({ status: 'matched', matchedJournalLineId: posted.lines.find((line) => line.accountId === cashAccountId)!.id });
    expect(await prisma.financeJournalEntry.findUniqueOrThrow({ where: { id: posted.id } })).toMatchObject({ status: 'posted' });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { businessId, entity: 'FinanceBankStatementLine', entityId: detail.lines[0].id },
    });
    expect(audit.action).toBe('finance.reconciliation_match_accepted');
    await expect(service.acceptMatch(businessId, 'reconciliation-reviewer', detail.lines[0].id, {
      journalLineId: posted.lines.find((line) => line.accountId === cashAccountId)!.id,
      reason: 'Duplicate confirmation should fail safely',
    })).rejects.toMatchObject({ response: { code: 'FINANCE_RECONCILIATION_LINE_NOT_OPEN' } });
    const reopened = await service.reopenLine(businessId, 'reconciliation-reviewer', detail.lines[0].id, {
      reason: 'Reopen after reviewing the original match',
    });
    expect(reopened).toMatchObject({ status: 'unmatched', matchedJournalLineId: null });
  });

  it('exports every statement line with reviewed journal references and never exports ignored bank descriptions', async () => {
    const posted = await postCashJournal('QA-RECON-EXPORT', '2099-03-15');
    const imported = await importCsv();
    const detail = await service.getImport(businessId, imported.id);
    await service.acceptMatch(businessId, 'reconciliation-reviewer', detail.lines[0].id, {
      journalLineId: posted.lines.find((line) => line.accountId === cashAccountId)!.id,
      reason: 'Confirmed from the original bank source',
    });

    const exported = await service.exportImportCsv(businessId, 'reconciliation-exporter', imported.id);
    expect(exported.filename).toBe(`finance-statement-review-${imported.id}.csv`);
    expect(exported.rowCount).toBe(1);
    expect(exported.csv).toContain('QA-RECON-EXPORT');
    expect(exported.csv).toContain('matched');
    expect(exported.csv).not.toContain('Do not retain this private memo');
    expect(exported.csv).not.toContain('Confirmed from the original bank source');
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        businessId,
        action: 'finance.reconciliation_exported',
        entityId: imported.id,
        actorUserId: 'reconciliation-exporter',
      },
    });
    expect(audit.after).toMatchObject({ rowCount: 1, includesBankDescriptions: false, includesDecisionNotes: false });
    await expect(service.exportImportCsv(otherBusinessId, 'other-user', imported.id)).rejects.toMatchObject({
      response: { code: 'FINANCE_RECONCILIATION_SCOPE_MISMATCH' },
    });
  });

  it('supports reasoned no-match decisions, prevents duplicate imports, and rejects cross-business accounts', async () => {
    const imported = await importCsv('date,amount\n2099-03-16,-8.50');
    const detail = await service.getImport(businessId, imported.id);
    const noMatch = await service.rejectSuggestions(businessId, 'reconciliation-reviewer', detail.lines[0].id, {
      reason: 'No posted journal line represents this bank transaction',
    });
    expect(noMatch.status).toBe('no_match');
    const reopened = await service.reopenLine(businessId, 'reconciliation-reviewer', detail.lines[0].id, {
      reason: 'Reopen after obtaining another supporting source',
    });
    expect(reopened.status).toBe('unmatched');
    await expect(importCsv('date,amount\n2099-03-16,-8.50')).rejects.toMatchObject({
      response: { code: 'FINANCE_RECONCILIATION_DUPLICATE_IMPORT' },
    });
    cls.set(CLS_KEY_BUSINESS_ID, otherBusinessId);
    await expect(service.importStatement(otherBusinessId, 'other-user', {
      financeAccountId: cashAccountId,
      currencyCode: 'USD',
      csv: 'date,amount\n2099-03-16,-8.50',
    })).rejects.toMatchObject({ response: { code: 'FINANCE_RECONCILIATION_ACCOUNT_UNAVAILABLE' } });
  });

  it('rejects ambiguous or invalid statement values without persisting an import', async () => {
    await expect(importCsv('date,amount\n2099-02-30,10.00')).rejects.toMatchObject({
      response: { code: 'FINANCE_RECONCILIATION_ROW_INVALID' },
    });
    await expect(importCsv('date,amount\n2099-03-15,0.00')).rejects.toMatchObject({
      response: { code: 'FINANCE_RECONCILIATION_ROW_INVALID' },
    });
    expect(await prisma.financeBankStatementImport.count({ where: { businessId } })).toBe(0);
  });

  it('queues an opt-in review after commit without sending CSV descriptions or undoing the import on queue failure', async () => {
    await prisma.business.update({
      where: { id: businessId },
      data: {
        policies: {
          'agents.financeEnabled': true,
          'agents.financeStatementImportedEventReviewEnabled': true,
        },
      },
    });

    const imported = await importCsv();

    expect(financeAgentEvents.add).toHaveBeenCalledWith(
      FINANCE_STATEMENT_IMPORTED_EVENT_JOB,
      {
        businessId,
        importId: imported.id,
        importedAt: imported.createdAt.toISOString(),
      },
      expect.objectContaining({
        jobId: `finance-statement-imported-${businessId}-${imported.id}`,
        attempts: 3,
      }),
    );
    expect(JSON.stringify(financeAgentEvents.add.mock.calls)).not.toContain(
      'Do not retain this private memo',
    );

    financeAgentEvents.add.mockRejectedValueOnce(new Error('Redis unavailable'));
    const secondImport = await service.importStatement(
      businessId,
      'statement-importer',
      {
        financeAccountId: cashAccountId,
        currencyCode: 'USD',
        csv: 'date,amount,description\n2099-03-16,126.00,another private memo',
      },
    );
    expect(secondImport.id).toBeTruthy();
    expect(
      await prisma.financeBankStatementImport.count({ where: { businessId } }),
    ).toBe(2);
  });

  it('keeps statement review event opt-in off by default', async () => {
    await importCsv();
    expect(financeAgentEvents.add).not.toHaveBeenCalled();
  });
});
