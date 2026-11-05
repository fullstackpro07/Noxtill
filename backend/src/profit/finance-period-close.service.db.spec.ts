import {
  IntegrationProvider,
  IntegrationStatus,
  OrderStatus,
  OrderType,
  ReturnRefundMethod,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BranchScopeService } from '../common/tenancy/branch-scope.service';
import { FinancePeriodCloseService } from './finance-period-close.service';

describe('FinancePeriodCloseService (MySQL)', () => {
  jest.setTimeout(30_000);

  let prisma: PrismaService;
  let service: FinancePeriodCloseService;
  let businessId: string;
  let branchId: string;
  let unrelatedBusinessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new FinancePeriodCloseService(
      prisma,
      new BranchScopeService(prisma),
    );
    const stamp = `${Date.now()}-${process.pid}`;
    const root = await prisma.business.create({
      data: {
        name: 'Period Close Test Business',
        slug: `period-close-${stamp}`,
      },
    });
    businessId = root.id;
    const branch = await prisma.business.create({
      data: {
        name: 'Period Close Test Branch',
        slug: `period-close-branch-${stamp}`,
        parentId: businessId,
      },
    });
    branchId = branch.id;
    const unrelated = await prisma.business.create({
      data: {
        name: 'Period Close Other Tenant',
        slug: `period-close-other-${stamp}`,
      },
    });
    unrelatedBusinessId = unrelated.id;
  });

  beforeEach(async () => {
    const ids = [businessId, branchId, unrelatedBusinessId];
    await prisma.financeBankStatementImport.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.financeJournalEntry.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.financeAccountingPeriod.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.financeAccount.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.return.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.order.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.expense.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.integration.deleteMany({ where: { businessId: { in: ids } } });
  });

  afterAll(async () => {
    if (businessId && branchId && unrelatedBusinessId) {
      const ids = [businessId, branchId, unrelatedBusinessId];
      await prisma.financeBankStatementImport.deleteMany({
        where: { businessId: { in: ids } },
      });
      await prisma.financeJournalEntry.deleteMany({
        where: { businessId: { in: ids } },
      });
      await prisma.financeAccountingPeriod.deleteMany({
        where: { businessId: { in: ids } },
      });
      await prisma.financeAccount.deleteMany({
        where: { businessId: { in: ids } },
      });
      await prisma.return.deleteMany({ where: { businessId: { in: ids } } });
      await prisma.order.deleteMany({ where: { businessId: { in: ids } } });
      await prisma.expense.deleteMany({ where: { businessId: { in: ids } } });
      await prisma.integration.deleteMany({
        where: { businessId: { in: ids } },
      });
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
        await tx.business.deleteMany({ where: { id: { in: ids } } });
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
      });
    }
    await prisma.$disconnect();
  });

  it('summarizes source records, evidence gaps and Xero sync without mixing tenants', async () => {
    const monthStart = new Date('2026-10-01T00:00:00.000Z');
    const completed = await prisma.order.create({
      data: {
        businessId,
        orderNo: 1,
        orderType: OrderType.counter,
        status: OrderStatus.completed,
        total: '125.50',
        createdAt: new Date('2026-10-05T12:00:00.000Z'),
      },
    });
    await prisma.order.create({
      data: {
        businessId,
        orderNo: 2,
        orderType: OrderType.counter,
        status: OrderStatus.pending,
        total: '70.00',
        accountingSyncedAt: monthStart,
        createdAt: new Date('2026-10-06T12:00:00.000Z'),
      },
    });
    await prisma.order.create({
      data: {
        businessId,
        orderNo: 3,
        orderType: OrderType.quotation,
        isQuotation: true,
        status: OrderStatus.pending,
        total: '900.00',
        createdAt: new Date('2026-10-07T12:00:00.000Z'),
      },
    });
    await prisma.order.create({
      data: {
        businessId: unrelatedBusinessId,
        orderNo: 1,
        orderType: OrderType.counter,
        status: OrderStatus.completed,
        total: '999.00',
        createdAt: new Date('2026-10-08T12:00:00.000Z'),
      },
    });
    await prisma.expense.createMany({
      data: [
        {
          businessId,
          description: 'Test expense with receipt',
          category: 'supplies',
          amount: '20.25',
          incurredOn: new Date('2026-10-09T00:00:00.000Z'),
          receiptKey: 'receipts/period-close-test.pdf',
        },
        {
          businessId,
          description: 'Test expense without receipt',
          category: 'utilities',
          amount: '10.00',
          incurredOn: new Date('2026-10-10T00:00:00.000Z'),
        },
      ],
    });
    await prisma.return.create({
      data: {
        businessId,
        orderId: completed.id,
        reason: 'Period close test',
        refundMethod: ReturnRefundMethod.cash,
        refundAmount: '15.00',
        createdAt: new Date('2026-10-11T12:00:00.000Z'),
      },
    });
    await prisma.integration.create({
      data: {
        businessId,
        provider: IntegrationProvider.xero,
        status: IntegrationStatus.connected,
        lastSyncAt: monthStart,
      },
    });
    const cashAccount = await prisma.financeAccount.create({
      data: {
        businessId,
        code: '1000',
        name: 'QA cash account',
        type: 'asset',
      },
    });
    const incomeAccount = await prisma.financeAccount.create({
      data: {
        businessId,
        code: '4000',
        name: 'QA income account',
        type: 'revenue',
      },
    });
    const postedJournal = await prisma.financeJournalEntry.create({
      data: {
        businessId,
        reference: 'QA-PERIOD-CLOSE-POSTED',
        entryDate: new Date('2026-10-11T00:00:00.000Z'),
        currencyCode: 'USD',
        description: 'Posted journal for period close readiness coverage',
        status: 'posted',
        totalDebits: '55.00',
        totalCredits: '55.00',
        createdByUserId: 'period-close-author',
        postedByUserId: 'period-close-reviewer',
        postedAt: new Date('2026-10-11T12:00:00.000Z'),
      },
    });
    const cashJournalLine = await prisma.financeJournalLine.create({
      data: {
        businessId,
        journalEntryId: postedJournal.id,
        accountId: cashAccount.id,
        accountCode: cashAccount.code,
        accountName: cashAccount.name,
        debit: '55.00',
        credit: '0.00',
      },
    });
    await prisma.financeJournalLine.create({
      data: {
        businessId,
        journalEntryId: postedJournal.id,
        accountId: incomeAccount.id,
        accountCode: incomeAccount.code,
        accountName: incomeAccount.name,
        debit: '0.00',
        credit: '55.00',
      },
    });
    await prisma.financeBankStatementImport.create({
      data: {
        businessId,
        financeAccountId: cashAccount.id,
        currencyCode: 'USD',
        periodStart: new Date('2026-09-30T00:00:00.000Z'),
        periodEnd: new Date('2026-10-14T00:00:00.000Z'),
        rowCount: 4,
        sourceHash: '1'.repeat(64),
        importedByUserId: 'period-close-importer',
        lines: {
          create: [
            {
              lineNumber: 1,
              statementDate: new Date('2026-09-30T00:00:00.000Z'),
              amount: '55.00',
            },
            {
              lineNumber: 2,
              statementDate: new Date('2026-10-11T00:00:00.000Z'),
              amount: '55.00',
              status: 'matched',
              matchedJournalLineId: cashJournalLine.id,
              decisionByUserId: 'period-close-reviewer',
              decisionAt: new Date('2026-10-12T00:00:00.000Z'),
              decisionReason: 'Accepted the exact test journal match',
            },
            {
              lineNumber: 3,
              statementDate: new Date('2026-10-12T00:00:00.000Z'),
              amount: '-12.00',
              status: 'unmatched',
            },
            {
              lineNumber: 4,
              statementDate: new Date('2026-10-14T00:00:00.000Z'),
              amount: '-8.00',
              status: 'no_match',
              decisionByUserId: 'period-close-reviewer',
              decisionAt: new Date('2026-10-15T00:00:00.000Z'),
              decisionReason: 'Reviewed and rejected the available suggestions',
            },
          ],
        },
      },
    });
    const unrelatedCash = await prisma.financeAccount.create({
      data: {
        businessId: unrelatedBusinessId,
        code: '1000',
        name: 'Other tenant cash account',
        type: 'asset',
      },
    });
    await prisma.financeBankStatementImport.create({
      data: {
        businessId: unrelatedBusinessId,
        financeAccountId: unrelatedCash.id,
        currencyCode: 'USD',
        periodStart: new Date('2026-10-11T00:00:00.000Z'),
        periodEnd: new Date('2026-10-11T00:00:00.000Z'),
        rowCount: 1,
        sourceHash: '2'.repeat(64),
        importedByUserId: 'other-tenant-importer',
        lines: {
          create: [
            {
              lineNumber: 1,
              statementDate: new Date('2026-10-11T00:00:00.000Z'),
              amount: '999.00',
              status: 'matched',
            },
          ],
        },
      },
    });
    await prisma.financeAccountingPeriod.create({
      data: {
        businessId,
        monthStart,
        status: 'closed',
        closeReason: 'QA period lock for readiness coverage',
        closedByUserId: 'period-close-owner',
      },
    });

    const result = await service.readiness(businessId, '2026-10', 'all');
    expect(result.coverage).toBe('partial');
    expect(result.businesses).toHaveLength(2);
    const root = result.businesses.find(
      (row) => row.businessId === businessId,
    )!;
    expect(root.sales).toMatchObject({
      orderCount: 2,
      completedOrderCount: 1,
      completedOrderTotal: '125.50',
      openOrderCount: 1,
    });
    expect(root.expenses).toMatchObject({
      count: 2,
      recordedTotal: '30.25',
      withoutAttachedReceiptCount: 1,
      withoutAttachedReceiptTotal: '10.00',
    });
    expect(root.pendingReturns).toMatchObject({
      count: 1,
      refundAmount: '15.00',
    });
    expect(root.xeroSync).toMatchObject({
      status: 'connected',
      unsyncedOrderCount: 1,
    });
    expect(root.manualJournals).toMatchObject({
      postedCount: 1,
      balancedPostedCount: 1,
      unbalancedPostedCount: 0,
      unresolvedCount: 0,
      postingLocked: true,
      lockReason: 'QA period lock for readiness coverage',
    });
    expect(root.statementReview).toMatchObject({
      importCount: 1,
      lineCount: 3,
      matchedCount: 1,
      unmatchedCount: 1,
      noMatchCount: 1,
      otherCount: 0,
    });
    const branch = result.businesses.find(
      (row) => row.businessId === branchId,
    )!;
    expect(branch.statementReview).toMatchObject({
      importCount: 0,
      lineCount: 0,
      matchedCount: 0,
      unmatchedCount: 0,
    });
    expect(result.unavailable.map((item) => item.key)).toEqual([
      'bank_reconciliation',
      'certified_close',
    ]);
    expect(result.unavailable[0].label).toBe(
      'Native bank feeds and complete bank reconciliation',
    );
  });

  it('rejects malformed months and a branch outside the caller business group', async () => {
    await expect(
      service.readiness(businessId, '2026-13'),
    ).rejects.toMatchObject({
      response: { code: 'FINANCE_PERIOD_INVALID' },
    });
    await expect(
      service.readiness(businessId, '2026-10', unrelatedBusinessId),
    ).rejects.toThrow();
  });
});
