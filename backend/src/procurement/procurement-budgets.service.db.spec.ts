/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matchers (`expect.stringContaining`/`expect.arrayContaining`) are typed `any`. */
import { PrismaService } from '../prisma/prisma.service';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { FinanceContextService } from '../finance/finance-context.service';
import { FinanceLedgerService } from '../finance/finance-ledger.service';
import { FinancePostingService } from '../finance/finance-posting.service';
import { FinanceJournalsService } from '../finance/finance-journals.service';
import { FinanceBudgetsService } from '../finance/finance-budgets.service';
import { ProcurementBudgetsService } from './procurement-budgets.service';

describe('ProcurementBudgetsService — Finance budgets (real MySQL)', () => {
  let prisma: PrismaService;
  let ctx: FinanceContextService;
  let ledger: FinanceLedgerService;
  let service: ProcurementBudgetsService;
  let businessId: string;
  let userId: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const request = (budgetCode: string | null, qty: number, unitCost: number) =>
    prisma.procurementRequest.create({
      data: {
        businessId,
        requesterUserId: userId,
        reason: 'Budget spec',
        currency: 'USD',
        status: 'submitted',
        submittedAt: new Date(),
        budgetCode,
        items: {
          create: [
            {
              description: 'Spec item',
              quantity: qty,
              estimatedUnitCost: unitCost,
            },
          ],
        },
      },
    });

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    businessId = (
      await prisma.business.create({
        data: {
          name: 'Procurement Budget Spec',
          slug: `proc-budget-${suffix}`,
          currency: 'USD',
        },
      })
    ).id;
    userId = (
      await prisma.user.create({
        data: {
          name: 'Budget Spec Requester',
          email: `proc-budget-${suffix}@example.com`,
          passwordHash: 'x',
        },
      })
    ).id;
    ctx = new FinanceContextService(prisma, new CapabilitiesService(prisma));
    ledger = new FinanceLedgerService(prisma, ctx);
    const journals = new FinanceJournalsService(
      prisma,
      ctx,
      new FinancePostingService(prisma, ctx),
    );
    service = new ProcurementBudgetsService(
      prisma,
      ctx,
      ledger,
      new FinanceBudgetsService(prisma, ctx, ledger, journals),
    );
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.procurementRequest.deleteMany({ where: { businessId } });
    const finTables = await prisma.$queryRaw<{ t: string }[]>`
      SELECT table_name AS t FROM information_schema.columns
      WHERE table_schema = DATABASE() AND column_name = 'business_id' AND table_name LIKE 'fin\\_%'
      ORDER BY table_name`;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      for (const { t } of finTables)
        await tx.$executeRawUnsafe(
          `DELETE FROM \`${t}\` WHERE business_id = ?`,
          businessId,
        );
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.business.deleteMany({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('checks a request’s budget code against Finance budget vs actual, fiscal year to date', async () => {
    const noCode = await request(null, 1, 10);
    expect(await service.forRequest(businessId, noCode.id)).toMatchObject({
      available: false,
      reason: expect.stringContaining('Add a budget code'),
    });

    // Finance is never set up as a side effect of looking at a procurement budget.
    const early = await request('NOT-AN-ACCOUNT', 1, 10);
    expect(await service.forRequest(businessId, early.id)).toMatchObject({
      available: false,
      reason: expect.stringContaining('not set up'),
    });
    expect(
      await prisma.finSettings.findUnique({ where: { businessId } }),
    ).toBeNull();

    // Set up Finance (seeds the chart of accounts) and pick a real expense account.
    const accounts = await ctx.accounts(businessId);
    const account = accounts.find(
      (a) => a.type === 'expense' && !a.isHeader && a.active,
    )!;
    expect(account).toBeDefined();
    const code = account.code;
    const fits = await request(code, 2, 100);
    expect(await service.forRequest(businessId, fits.id)).toMatchObject({
      available: false,
      reason: expect.stringContaining('no budget'),
    });

    // An approved budget for this fiscal year (500 this month) and 120 of posted actuals.
    const now = new Date();
    const cfg = await ctx.config(businessId);
    const fyStart = ledger.fyStartFor(cfg, now);
    const fiscalYear =
      ledger.fyStartMonth(cfg) === 1
        ? fyStart.getUTCFullYear()
        : fyStart.getUTCFullYear() + 1;
    await prisma.finBudget.create({
      data: {
        businessId,
        name: 'Spec budget',
        fiscalYear,
        status: 'Approved',
        lines: {
          create: [
            {
              businessId,
              accountId: account.id,
              year: now.getUTCFullYear(),
              month: now.getUTCMonth() + 1,
              amount: 500,
            },
          ],
        },
      },
    });
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    await prisma.finJournal.create({
      data: {
        businessId,
        number: `JE-SPEC-${suffix}`.slice(0, 24),
        date: today,
        type: 'Manual',
        status: 'Posted',
        currency: 'USD',
        total: 120,
        postedAt: now,
        lines: {
          create: [
            {
              businessId,
              lineNo: 1,
              accountId: account.id,
              debit: 120,
              currency: 'USD',
              txnDebit: 120,
              date: today,
              postedAt: now,
            },
          ],
        },
      },
    });

    const ok = await service.forRequest(businessId, fits.id);
    expect(ok).toMatchObject({
      available: true,
      code,
      account: { code, name: account.name },
      budget: 500,
      actual: 120,
      remaining: 380,
      estimate: 200,
      fits: true,
      budgetVersion: { name: 'Spec budget', status: 'Approved', fiscalYear },
    });

    const tooBig = await request(code, 10, 100);
    expect(await service.forRequest(businessId, tooBig.id)).toMatchObject({
      available: true,
      estimate: 1000,
      remaining: 380,
      fits: false,
    });

    const header = accounts.find((a) => a.isHeader)!;
    const notPostable = await request(header.code, 1, 1);
    expect(await service.forRequest(businessId, notPostable.id)).toMatchObject({
      available: false,
      reason: expect.stringContaining('not an active posting account'),
    });

    // Summary across live requests' codes: unknown codes are listed, not silently dropped.
    const summary = await service.summary(businessId);
    expect(summary).toMatchObject({
      available: true,
      totals: { budget: 500, actual: 120, remaining: 380, percentUsed: 24 },
      unmatchedCodes: expect.arrayContaining(['NOT-AN-ACCOUNT', header.code]),
    });
  });
});
