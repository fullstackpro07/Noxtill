import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { BranchScopeService } from '../common/tenancy/branch-scope.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { FinanceJournalsService } from './finance-journals.service';
import { FINANCE_JOURNAL_POSTED_EVENT_JOB } from '../common/agents/specialist-agent-events.constants';

class FakeClsService {
  private readonly values: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.values[key] as T;
  }

  set(key: string, value: unknown) {
    this.values[key] = value;
  }
}

describe('FinanceJournalsService (MySQL)', () => {
  jest.setTimeout(30_000);

  let prisma: PrismaService;
  let service: FinanceJournalsService;
  let cls: FakeClsService;
  let businessId: string;
  let otherBusinessId: string;
  let cashAccountId: string;
  let revenueAccountId: string;

  const createDraft = (reference: string, entryDate = '2099-03-15') =>
    service.createDraft(businessId, 'journal-author', {
      reference,
      entryDate,
      description: 'Journal entry entered for database integration coverage',
      lines: [
        { accountId: cashAccountId, debit: '125.00', credit: '0' },
        { accountId: revenueAccountId, debit: '0', credit: '125.00' },
      ],
    });

  async function postJournal(reference: string, entryDate: string) {
    const draft = await createDraft(reference, entryDate);
    await service.submit(businessId, 'journal-author', draft.id);
    await service.decide(
      businessId,
      'journal-reviewer',
      draft.id,
      'approved',
      'Verified this source journal for posting',
    );
    return service.post(businessId, 'journal-reviewer', draft.id);
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    service = new FinanceJournalsService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
      cls as unknown as ClsService,
      prisma,
      new BranchScopeService(prisma),
    );
    const stamp = `${Date.now()}-${process.pid}`;
    [businessId, otherBusinessId] = await Promise.all([
      prisma.business
        .create({
          data: {
            name: 'Finance Journal Test',
            slug: `finance-journal-${stamp}`,
          },
        })
        .then((row) => row.id),
      prisma.business
        .create({
          data: {
            name: 'Finance Journal Other Tenant',
            slug: `finance-journal-other-${stamp}`,
          },
        })
        .then((row) => row.id),
    ]);
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const [cash, revenue] = await Promise.all([
      service.createAccount(businessId, 'journal-owner', {
        code: '1000',
        name: 'Cash test account',
        type: 'asset',
      }),
      service.createAccount(businessId, 'journal-owner', {
        code: '4000',
        name: 'Revenue test account',
        type: 'revenue',
      }),
    ]);
    cashAccountId = cash.id;
    revenueAccountId = revenue.id;
  });

  beforeEach(async () => {
    await prisma.financeJournalEntry.deleteMany({
      where: {
        businessId: { in: [businessId, otherBusinessId] },
        reversalOfId: { not: null },
      },
    });
    await prisma.financeJournalEntry.deleteMany({
      where: { businessId: { in: [businessId, otherBusinessId] } },
    });
    await prisma.financeAccountingPeriod.deleteMany({
      where: { businessId: { in: [businessId, otherBusinessId] } },
    });
    await prisma.financeAccount.deleteMany({
      where: { businessId: { in: [businessId, otherBusinessId] } },
    });
    await prisma.auditLog.deleteMany({
      where: {
        businessId: { in: [businessId, otherBusinessId] },
        action: { startsWith: 'finance.journal_' },
      },
    });
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const [cash, revenue] = await Promise.all([
      service.createAccount(businessId, 'journal-owner', {
        code: '1000',
        name: 'Cash test account',
        type: 'asset',
      }),
      service.createAccount(businessId, 'journal-owner', {
        code: '4000',
        name: 'Revenue test account',
        type: 'revenue',
      }),
    ]);
    cashAccountId = cash.id;
    revenueAccountId = revenue.id;
  });

  afterAll(async () => {
    if (businessId && otherBusinessId) {
      await prisma.financeJournalEntry.deleteMany({
        where: {
          businessId: { in: [businessId, otherBusinessId] },
          reversalOfId: { not: null },
        },
      });
      await prisma.financeJournalEntry.deleteMany({
        where: { businessId: { in: [businessId, otherBusinessId] } },
      });
      await prisma.financeAccountingPeriod.deleteMany({
        where: { businessId: { in: [businessId, otherBusinessId] } },
      });
      await prisma.financeAccount.deleteMany({
        where: { businessId: { in: [businessId, otherBusinessId] } },
      });
      await prisma.auditLog.deleteMany({
        where: {
          businessId: { in: [businessId, otherBusinessId] },
          action: { startsWith: 'finance.journal_' },
        },
      });
      await prisma.business.deleteMany({
        where: { id: { in: [businessId, otherBusinessId] } },
      });
    }
    await prisma.$disconnect();
  });

  it('requires balanced lines, records audit history, and enforces distinct reviewer/poster flow', async () => {
    const draft = await createDraft('QA-JOURNAL-APPROVAL');
    expect(draft.status).toBe('draft');
    expect(draft.currencyCode).toBe('USD');
    expect(draft.totalDebits.toString()).toBe('125');
    expect(draft.totalCredits.toString()).toBe('125');

    await expect(
      service.createDraft(businessId, 'journal-author', {
        reference: 'QA-JOURNAL-UNBALANCED',
        entryDate: '2099-03-15',
        description: 'An intentionally unbalanced test journal',
        lines: [
          { accountId: cashAccountId, debit: '125.00', credit: '0' },
          { accountId: revenueAccountId, debit: '0', credit: '124.99' },
        ],
      }),
    ).rejects.toMatchObject({
      response: { code: 'FINANCE_JOURNAL_NOT_BALANCED' },
    });

    await service.submit(businessId, 'journal-author', draft.id);
    await expect(
      service.decide(
        businessId,
        'journal-author',
        draft.id,
        'approved',
        'This must be reviewed by another user',
      ),
    ).rejects.toMatchObject({
      response: { code: 'FINANCE_JOURNAL_SELF_APPROVAL_BLOCKED' },
    });

    const approved = await service.decide(
      businessId,
      'journal-reviewer',
      draft.id,
      'approved',
      'Verified the source document and account coding',
    );
    expect(approved.status).toBe('approved');
    await expect(
      service.post(businessId, 'journal-poster', draft.id),
    ).rejects.toMatchObject({
      response: { code: 'FINANCE_JOURNAL_POST_REVIEWER_REQUIRED' },
    });

    const posted = await service.post(businessId, 'journal-reviewer', draft.id);
    expect(posted).toMatchObject({
      status: 'posted',
      reviewedByUserId: 'journal-reviewer',
      postedByUserId: 'journal-reviewer',
    });
    const audit = await prisma.auditLog.findMany({
      where: { businessId, entity: 'FinanceJournalEntry', entityId: draft.id },
      orderBy: { createdAt: 'asc' },
      select: { action: true },
    });
    expect(audit.map((row) => row.action)).toEqual([
      'finance.journal_draft_created',
      'finance.journal_pending_approval',
      'finance.journal_approved',
      'finance.journal_posted',
    ]);
  });

  it('queues an opt-in review only after posting and leaves posting intact on queue failure', async () => {
    const queue = {
      add: jest.fn().mockResolvedValue({ id: 'qa-journal-event-job' }),
    };
    const eventService = new FinanceJournalsService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
      cls as unknown as ClsService,
      prisma,
      new BranchScopeService(prisma),
      queue as never,
    );
    const createAndPost = async (reference: string) => {
      const draft = await eventService.createDraft(
        businessId,
        'journal-author',
        {
          reference,
          entryDate: '2099-03-15',
          description: 'Posted journal event integration fixture',
          lines: [
            { accountId: cashAccountId, debit: '25.00', credit: '0' },
            { accountId: revenueAccountId, debit: '0', credit: '25.00' },
          ],
        },
      );
      await eventService.submit(businessId, 'journal-author', draft.id);
      await eventService.decide(
        businessId,
        'journal-reviewer',
        draft.id,
        'approved',
        'Reviewed the source journal fixture',
      );
      return eventService.post(businessId, 'journal-reviewer', draft.id);
    };

    const defaultOff = await createAndPost('QA-JOURNAL-EVENT-OFF');
    expect(defaultOff.status).toBe('posted');
    expect(queue.add).not.toHaveBeenCalled();

    await prisma.business.update({
      where: { id: businessId },
      data: {
        policies: {
          'agents.financeEnabled': true,
          'agents.financePostedJournalEventReviewEnabled': true,
        },
      },
    });
    const queued = await createAndPost('QA-JOURNAL-EVENT-ON');
    expect(queue.add).toHaveBeenCalledWith(
      FINANCE_JOURNAL_POSTED_EVENT_JOB,
      {
        businessId,
        journalId: queued.id,
        postedAt: queued.postedAt?.toISOString(),
      },
      expect.objectContaining({
        jobId: `finance-journal-posted-${businessId}-${queued.id}`,
        attempts: 3,
      }),
    );

    queue.add.mockRejectedValueOnce(new Error('Redis unavailable'));
    const queueFailure = await createAndPost('QA-JOURNAL-EVENT-QUEUE-FAIL');
    expect(queueFailure.status).toBe('posted');
    expect(
      await prisma.financeJournalEntry.findUniqueOrThrow({
        where: { id: queueFailure.id },
        select: { status: true },
      }),
    ).toEqual({ status: 'posted' });
  });

  it('locks only an empty or fully resolved month and blocks new drafts after the lock', async () => {
    const draft = await createDraft('QA-JOURNAL-OPEN-PERIOD');
    await expect(
      service.closePeriod(
        businessId,
        'journal-owner',
        '2099-03',
        'Lock request must wait for this draft',
      ),
    ).rejects.toMatchObject({
      response: { code: 'FINANCE_PERIOD_HAS_OPEN_JOURNALS' },
    });

    await service.submit(businessId, 'journal-author', draft.id);
    await service.decide(
      businessId,
      'journal-reviewer',
      draft.id,
      'rejected',
      'Rejecting this test entry resolves it before the month lock',
    );
    const period = await service.closePeriod(
      businessId,
      'journal-owner',
      '2099-03',
      'Month reviewed and Noxtill journal posting is locked',
    );
    expect(period.status).toBe('closed');

    await expect(createDraft('QA-JOURNAL-CLOSED-PERIOD')).rejects.toMatchObject(
      {
        response: { code: 'FINANCE_ACCOUNTING_PERIOD_CLOSED' },
      },
    );
    const list = await service.listJournals(businessId, '2099-03');
    expect(list.closedPeriods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          month: '2099-03',
          reason: 'Month reviewed and Noxtill journal posting is locked',
        }),
      ]),
    );
    expect(list.disclosure).toContain('not include automatic postings');
  });

  it('rejects a mismatched tenant and will not use another business account on a journal line', async () => {
    const otherAccount = await prisma.financeAccount.create({
      data: {
        businessId: otherBusinessId,
        code: '1000',
        name: 'Other tenant cash account',
        type: 'asset',
      },
    });
    await expect(
      service.createDraft(businessId, 'journal-author', {
        reference: 'QA-JOURNAL-CROSS-TENANT',
        entryDate: '2099-03-15',
        description: 'Attempt to use an account from another business',
        lines: [
          { accountId: otherAccount.id, debit: '125.00', credit: '0' },
          { accountId: revenueAccountId, debit: '0', credit: '125.00' },
        ],
      }),
    ).rejects.toMatchObject({
      response: { code: 'FINANCE_JOURNAL_ACCOUNT_UNAVAILABLE' },
    });

    cls.set(CLS_KEY_BUSINESS_ID, otherBusinessId);
    await expect(service.listAccounts(businessId)).rejects.toMatchObject({
      response: { code: 'FINANCE_JOURNAL_TENANT_MISMATCH' },
    });
  });

  it('audits account creation and reports a duplicate code as a typed conflict', async () => {
    const account = await service.createAccount(businessId, 'journal-owner', {
      code: 'QA-AUDIT',
      name: 'Audited QA account',
      type: 'expense',
    });
    await expect(
      service.createAccount(businessId, 'journal-owner', {
        code: 'QA-AUDIT',
        name: 'Duplicate account code',
        type: 'expense',
      }),
    ).rejects.toMatchObject({
      response: { code: 'FINANCE_ACCOUNT_CODE_EXISTS' },
    });
    const audit = await prisma.auditLog.findFirst({
      where: {
        businessId,
        action: 'finance.journal_account_created',
        entityId: account.id,
      },
      select: { actorUserId: true, after: true },
    });
    expect(audit).toMatchObject({
      actorUserId: 'journal-owner',
      after: { code: 'QA-AUDIT', name: 'Audited QA account', type: 'expense' },
    });
  });

  it('creates an audited reversing draft while keeping the posted original immutable', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const original = await postJournal('QA-JOURNAL-TO-REVERSE', today);

    const reversal = await service.createReversalDraft(
      businessId,
      'journal-author',
      original.id,
      'Correct the source entry amount',
    );
    expect(reversal).toMatchObject({
      status: 'draft',
      reversalOfId: original.id,
      totalDebits: original.totalCredits,
      totalCredits: original.totalDebits,
      reversalOf: { id: original.id, reference: original.reference },
    });
    expect(
      reversal.lines.map((line) => ({
        debit: line.debit.toString(),
        credit: line.credit.toString(),
      })),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ debit: '0', credit: '125' }),
        expect.objectContaining({ debit: '125', credit: '0' }),
      ]),
    );
    await expect(
      service.createReversalDraft(
        businessId,
        'journal-author',
        original.id,
        'Prevent a duplicate reversal draft',
      ),
    ).rejects.toMatchObject({
      response: { code: 'FINANCE_JOURNAL_ALREADY_REVERSED' },
    });

    await service.submit(businessId, 'journal-author', reversal.id);
    await expect(
      service.decide(
        businessId,
        'journal-author',
        reversal.id,
        'approved',
        'The author cannot approve their own reversal',
      ),
    ).rejects.toMatchObject({
      response: { code: 'FINANCE_JOURNAL_SELF_APPROVAL_BLOCKED' },
    });
    await service.decide(
      businessId,
      'journal-reviewer',
      reversal.id,
      'approved',
      'Reviewed the reversing lines and reason',
    );
    const postedReversal = await service.post(
      businessId,
      'journal-reviewer',
      reversal.id,
    );
    expect(postedReversal.status).toBe('posted');
    expect(
      await prisma.financeJournalEntry.findFirst({
        where: { id: original.id, businessId },
        select: { status: true },
      }),
    ).toEqual({ status: 'posted' });

    const listed = await service.listJournals(businessId, today.slice(0, 7));
    const listedOriginal = listed.entries.find(
      (entry) => entry.id === original.id,
    );
    const listedReversal = listed.entries.find(
      (entry) => entry.id === reversal.id,
    );
    expect(listedOriginal?.reversal).toMatchObject({
      id: reversal.id,
      status: 'posted',
    });
    expect(listedReversal?.reversalOf).toMatchObject({
      id: original.id,
      reference: original.reference,
    });
    const reversalAudit = await prisma.auditLog.findFirst({
      where: {
        businessId,
        action: 'finance.journal_reversal_draft_created',
        entityId: reversal.id,
      },
      select: { after: true },
    });
    expect(reversalAudit?.after).toMatchObject({
      reversalOfId: original.id,
      reversalReason: 'Correct the source entry amount',
    });
  });

  it('refuses to create a reversing draft in a locked current month', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const original = await postJournal('QA-JOURNAL-LOCKED-REVERSAL', today);
    const month = today.slice(0, 7);
    await service.closePeriod(
      businessId,
      'journal-owner',
      month,
      'Reviewed and locked the current manual journal period',
    );
    await expect(
      service.createReversalDraft(
        businessId,
        'journal-author',
        original.id,
        'Attempt a reversal after the period lock',
      ),
    ).rejects.toMatchObject({
      response: { code: 'FINANCE_ACCOUNTING_PERIOD_CLOSED' },
    });
  });

  it('summarizes only posted manual journal activity without claiming opening balances', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await postJournal('QA-JOURNAL-ACTIVITY-POSTED', today);
    await createDraft('QA-JOURNAL-ACTIVITY-DRAFT', today);

    const summary = await service.activitySummary(
      businessId,
      today.slice(0, 7),
    );
    expect(summary).toMatchObject({
      month: today.slice(0, 7),
      coverage: 'posted_manual_journal_activity',
    });
    expect(summary.disclosure).toContain('not a cumulative account balance');
    expect(summary.currencies).toHaveLength(1);
    expect(summary.currencies[0]).toMatchObject({
      currencyCode: 'USD',
      totalDebits: '125.00',
      totalCredits: '125.00',
      balanced: true,
    });
    expect(summary.currencies[0].accounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountCode: '1000',
          debits: '125.00',
          credits: '0.00',
          netDebit: '125.00',
        }),
        expect.objectContaining({
          accountCode: '4000',
          debits: '0.00',
          credits: '125.00',
          netCredit: '125.00',
        }),
      ]),
    );
  });

  it('calculates cumulative posted manual journal balances by currency and excludes future or unposted entries', async () => {
    await postJournal('QA-TRIAL-BALANCE-USD', '2099-03-15');
    const eurEntry = await postJournal('QA-TRIAL-BALANCE-EUR', '2099-03-15');
    await prisma.financeJournalEntry.update({
      where: { id: eurEntry.id },
      data: { currencyCode: 'EUR' },
    });
    await postJournal('QA-TRIAL-BALANCE-FUTURE', '2099-03-16');
    await createDraft('QA-TRIAL-BALANCE-DRAFT', '2099-03-15');

    const report = await service.trialBalance(businessId, '2099-03-15');
    expect(report).toMatchObject({
      asOf: '2099-03-15',
      coverage: 'posted_manual_journals_only',
    });
    expect(report.disclosure).toContain('partial trial balance');
    expect(report.currencies.map((currency) => currency.currencyCode)).toEqual([
      'EUR',
      'USD',
    ]);
    const eur = report.currencies[0];
    const usd = report.currencies[1];
    expect(eur).toMatchObject({
      totalDebitBalances: '125.00',
      totalCreditBalances: '125.00',
      balanced: true,
    });
    expect(
      eur.accounts.map(({ accountCode, debitBalance, creditBalance }) => ({
        accountCode,
        debitBalance,
        creditBalance,
      })),
    ).toEqual([
      { accountCode: '1000', debitBalance: '125.00', creditBalance: '0.00' },
      { accountCode: '4000', debitBalance: '0.00', creditBalance: '125.00' },
    ]);
    expect(usd).toMatchObject({
      totalDebitBalances: '125.00',
      totalCreditBalances: '125.00',
      balanced: true,
    });
    await expect(
      service.trialBalance(businessId, '2099-02-30'),
    ).rejects.toMatchObject({
      response: { code: 'FINANCE_TRIAL_BALANCE_DATE_INVALID' },
    });
  });

  it('refuses a scoped trial-balance read for a business outside the caller branch group', async () => {
    await expect(
      service.trialBalanceForScope(businessId, '2099-03-15', otherBusinessId),
    ).rejects.toThrow('That branch is not part of your business group');
  });
});
