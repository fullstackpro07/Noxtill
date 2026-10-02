import { ClsService } from 'nestjs-cls';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import type { CreditReminderService } from '../credit/credit-reminder.service';
import {
  FinActor,
  FinanceContextService,
  dayOf,
  monthKey,
  num,
  r2,
  FAR_FUTURE,
} from './finance-context.service';
import { FinancePostingService } from './finance-posting.service';
import { FinanceSourcesService } from './finance-sources.service';
import { FinanceLedgerService } from './finance-ledger.service';
import { FinanceJournalsService } from './finance-journals.service';
import { FinanceBankingService } from './finance-banking.service';
import { FinancePayablesService } from './finance-payables.service';
import { FinanceReceivablesService } from './finance-receivables.service';
import { FinanceTaxService } from './finance-tax.service';
import { FinanceAssetsService } from './finance-assets.service';
import { FinanceFxService } from './finance-fx.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
  run<T>(fn: () => T): T {
    return fn();
  }
}

const codeOf = (e: unknown) =>
  ((e as { getResponse?: () => { code?: string } }).getResponse?.() ?? {}).code;
async function expectCode(p: Promise<unknown>, code: string) {
  let caught: unknown = null;
  try {
    await p;
  } catch (e) {
    caught = e;
  }
  expect(caught).not.toBeNull();
  expect(codeOf(caught)).toBe(code);
}

describe('Finance ledger (real DB)', () => {
  const stamp = Date.now();
  let prisma: PrismaService;
  let ctx: FinanceContextService;
  let posting: FinancePostingService;
  let sources: FinanceSourcesService;
  let ledger: FinanceLedgerService;
  let journals: FinanceJournalsService;
  let banking: FinanceBankingService;
  let ap: FinancePayablesService;
  let ar: FinanceReceivablesService;
  let tax: FinanceTaxService;
  let assets: FinanceAssetsService;
  let fx: FinanceFxService;
  let businessId: string;
  let owner: FinActor;
  let manager: FinActor;
  let customerId: string;
  let expenseId: string;
  const today = dayOf(new Date());
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const balanceOf = async (key: string) => {
    const maps = await ctx.accountMaps(businessId);
    const a = maps.byKey.get(key)!;
    const t = await ledger.totals(businessId, null, null, FAR_FUTURE);
    return ledger.bal(t, a);
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    const biz = await prisma.business.create({
      data: {
        name: 'Finance Test Biz',
        slug: `fin-test-${stamp}`,
        currency: 'USD',
        timezone: 'UTC',
        taxRate: 10,
        taxLabel: 'VAT',
      },
    });
    businessId = biz.id;
    const mk = (name: string, tag: string) =>
      prisma.user.create({
        data: {
          name,
          email: `fin-${tag}-${stamp}@example.com`,
          passwordHash: 'x',
        },
      });
    const [o, m] = await Promise.all([
      mk('Olive Owner', 'o'),
      mk('Max Manager', 'm'),
    ]);
    await prisma.businessUser.createMany({
      data: [
        { businessId, userId: o.id, role: Role.owner },
        { businessId, userId: m.id, role: Role.manager },
      ],
    });
    ctx = new FinanceContextService(prisma, new CapabilitiesService(prisma));
    posting = new FinancePostingService(prisma, ctx);
    sources = new FinanceSourcesService(prisma, ctx, posting);
    ledger = new FinanceLedgerService(prisma, ctx);
    journals = new FinanceJournalsService(prisma, ctx, posting);
    banking = new FinanceBankingService(prisma, ctx, posting, journals);
    ap = new FinancePayablesService(prisma, ctx, posting, journals, banking);
    ar = new FinanceReceivablesService(
      prisma,
      ctx,
      cls as unknown as ClsService,
      {} as CreditReminderService,
    );
    tax = new FinanceTaxService(prisma, ctx, journals);
    assets = new FinanceAssetsService(prisma, ctx, posting);
    fx = new FinanceFxService(prisma, ctx, posting);
    owner = await ctx.actor({
      sub: o.id,
      businessId,
      role: Role.owner,
    } as AuthenticatedUser);
    manager = await ctx.actor({
      sub: m.id,
      businessId,
      role: Role.manager,
    } as AuthenticatedUser);

    customerId = (
      await prisma.customer.create({
        data: {
          businessId,
          name: 'Casey Credit',
          phone: `+1557${String(stamp).slice(-7)}`,
        },
      })
    ).id;
    const product = await prisma.product.create({
      data: { businessId, name: 'Widget', costPrice: 4, sellingPrice: 10 },
    });
    // A cash sale: 100 + 10 VAT, cost 40, cash tendered 120 (10 is change).
    const o1 = await prisma.order.create({
      data: {
        businessId,
        orderNo: 1,
        status: 'completed',
        subtotal: 100,
        tax: 10,
        total: 110,
        cogs: 40,
        items: {
          create: [
            {
              productId: product.id,
              name: 'Widget',
              price: 10,
              cost: 4,
              qty: 10,
            },
          ],
        },
      },
    });
    await prisma.payment.create({
      data: { orderId: o1.id, method: 'cash', amount: 120 },
    });
    // A sale on credit (50 + 5 VAT), then 20 paid on account by card.
    const o2 = await prisma.order.create({
      data: {
        businessId,
        orderNo: 2,
        status: 'completed',
        customerId,
        subtotal: 50,
        tax: 5,
        total: 55,
        cogs: 0,
        items: {
          create: [
            {
              productId: product.id,
              name: 'Widget',
              price: 5,
              cost: 0,
              qty: 10,
            },
          ],
        },
      },
    });
    await prisma.creditEntry.create({
      data: {
        businessId,
        customerId,
        kind: 'credit',
        amount: 55,
        orderId: o2.id,
        note: 'Sale on credit',
      },
    });
    await prisma.creditEntry.create({
      data: {
        businessId,
        customerId,
        kind: 'payment',
        amount: 20,
        method: 'card',
      },
    });
    expenseId = (
      await prisma.expense.create({
        data: {
          businessId,
          description: 'Shop rent',
          category: 'Rent',
          amount: 30,
          incurredOn: today,
        },
      })
    ).id;
    await prisma.stockMovement.create({
      data: {
        businessId,
        productId: product.id,
        kind: 'purchase',
        qty: 10,
        unitCost: 4,
      },
    });
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      for (const t of [
        'fin_journal_lines',
        'fin_journals',
        'fin_accounts',
        'fin_periods',
        'fin_settings',
        'fin_tax_codes',
        'fin_tax_returns',
        'fin_bank_accounts',
        'fin_bank_imports',
        'fin_bank_lines',
        'fin_bank_rules',
        'fin_reconciliations',
        'fin_bill_lines',
        'fin_bill_payments',
        'fin_bills',
        'fin_assets',
        'fin_depreciation_runs',
        'fin_approvals',
        'fin_audit',
        'fin_exchange_rates',
        'fin_health_runs',
        'fin_ar_disputes',
      ])
        await tx.$executeRawUnsafe(
          `DELETE FROM ${t} WHERE business_id = ?`,
          businessId,
        );
      await tx.$executeRawUnsafe(
        'DELETE p FROM payments p JOIN orders o ON o.id = p.order_id WHERE o.business_id = ?',
        businessId,
      );
      await tx.$executeRawUnsafe(
        'DELETE i FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.business_id = ?',
        businessId,
      );
      for (const t of [
        'credit_entries',
        'orders',
        'expenses',
        'stock_movements',
        'products',
        'customers',
        'notifications',
        'business_users',
      ])
        await tx.$executeRawUnsafe(
          `DELETE FROM ${t} WHERE business_id = ?`,
          businessId,
        );
      await tx.$executeRawUnsafe(
        'DELETE FROM users WHERE email LIKE ?',
        `fin-%-${stamp}@example.com`,
      );
      await tx.$executeRawUnsafe(
        'DELETE FROM businesses WHERE id = ?',
        businessId,
      );
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('posts every source record as a balanced journal, and a second run changes nothing', async () => {
    const r1 = await sources.sweep(businessId, true);
    expect(r1.errors).toEqual([]);
    expect(r1.failed).toBe(0);
    expect(r1.posted).toBeGreaterThanOrEqual(6);
    const tot = await prisma.finJournalLine.aggregate({
      where: { businessId, postedAt: { not: null } },
      _sum: { debit: true, credit: true },
    });
    expect(num(tot._sum.debit)).toBe(num(tot._sum.credit));
    expect(await balanceOf('sales')).toBe(150);
    expect(await balanceOf('output_tax')).toBe(15);
    expect(await balanceOf('cogs')).toBe(40);
    expect(await balanceOf('cash_drawer')).toBe(110 - 30); // change isn't revenue; rent paid from cash
    expect(await balanceOf('clearing')).toBe(20);
    expect(await balanceOf('grni')).toBe(40);
    const r2run = await sources.sweep(businessId, true);
    expect(r2run.posted + r2run.reposted + r2run.reversed).toBe(0);
  });

  it('keeps A/R control equal to the subledger', async () => {
    const items = await ar.items(businessId);
    const sub = r2(items.reduce((s, i) => s + i.balanceBase, 0));
    expect(sub).toBe(35);
    expect(await balanceOf('ar')).toBe(35);
  });

  it('reverses and reposts an edited source, and reverses a deleted one', async () => {
    await prisma.expense.update({
      where: { id: expenseId },
      data: { amount: 45 },
    });
    const r = await sources.sweep(businessId, true);
    expect(r.reposted).toBe(1);
    expect(await balanceOf('rent')).toBe(45);
    const old = await prisma.finJournal.findFirst({
      where: { businessId, sourceType: 'expense', sourceRev: 0 },
    });
    expect(old?.status).toBe('Reversed');
    expect(old?.superseded).toBe(true);
    await prisma.expense.delete({ where: { id: expenseId } });
    await sources.sweep(businessId, true);
    expect(await balanceOf('rent')).toBe(0);
  });

  it('routes manual journals by size and enforces segregation of duties', async () => {
    const maps = await ctx.accountMaps(businessId);
    const util = maps.byKey.get('utilities')!.id;
    const accr = maps.byKey.get('accrued')!.id;
    const small = await journals.createDraft(owner, {
      date: iso(today),
      type: 'Accrual',
      memo: 'Small accrual',
      lines: [
        { accountId: util, debit: 500 },
        { accountId: accr, credit: 400 },
      ],
    });
    await expectCode(journals.submit(owner, small.id), 'FINANCE_INVALID');
    await journals.updateDraft(owner, small.id, small.version, {
      date: iso(today),
      type: 'Accrual',
      memo: 'Small accrual',
      lines: [
        { accountId: util, debit: 500 },
        { accountId: accr, credit: 500 },
      ],
    });
    const p = await journals.post(owner, small.id);
    expect(p.ok).toBe(true);
    const big = await journals.createDraft(owner, {
      date: iso(today),
      type: 'Accrual',
      memo: 'Big accrual',
      lines: [
        { accountId: util, debit: 2000 },
        { accountId: accr, credit: 2000 },
      ],
    });
    await expectCode(journals.post(owner, big.id), 'FINANCE_FORBIDDEN');
    const sub = await journals.submit(owner, big.id);
    expect(sub.status).toBe('Approval Required');
    await expectCode(
      journals.approve(owner, big.id),
      'FINANCE_SEGREGATION_OF_DUTIES',
    );
    await journals.approve(manager, big.id);
    const posted = await journals.post(owner, big.id);
    expect(posted.ok).toBe(true);
    expect(await balanceOf('utilities')).toBe(2500);
  });

  it('refuses to post into a locked period and commits nothing', async () => {
    const maps = await ctx.accountMaps(businessId);
    const prev = monthKey(
      new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0)),
    );
    await ctx.period(businessId, prev.year, prev.month);
    await prisma.finPeriod.update({
      where: {
        businessId_year_month: {
          businessId,
          year: prev.year,
          month: prev.month,
        },
      },
      data: { status: 'locked' },
    });
    const d = iso(new Date(Date.UTC(prev.year, prev.month - 1, 15)));
    const j = await journals.createDraft(owner, {
      date: d,
      type: 'Adjustment',
      memo: 'Late',
      lines: [
        { accountId: maps.byKey.get('general')!.id, debit: 10 },
        { accountId: maps.byKey.get('accrued')!.id, credit: 10 },
      ],
    });
    const res = await journals.post(owner, j.id);
    expect(res.ok).toBe(false);
    expect(res.journal.status).toBe('Failed');
    expect(res.steps.find((s) => s.k === 'period')!.ok).toBe(false);
    expect(
      await prisma.finJournalLine.count({
        where: { journalId: j.id, postedAt: { not: null } },
      }),
    ).toBe(0);
  });

  it('reverses a posted journal with mirror lines and links them', async () => {
    const small = await prisma.finJournal.findFirst({
      where: { businessId, memo: 'Small accrual' },
    });
    const res = await journals.reverse(
      owner,
      small!.id,
      iso(today),
      'Booked twice',
    );
    expect(res.ok).toBe(true);
    const orig = await prisma.finJournal.findUnique({
      where: { id: small!.id },
    });
    expect(orig!.status).toBe('Reversed');
    expect(orig!.reversedById).toBe(res.reversal.id);
    expect(await balanceOf('utilities')).toBe(2000);
  });

  it('builds statements that balance and tie', async () => {
    const cfg = await ctx.config(businessId);
    const range = ledger.range(
      cfg,
      `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`,
    );
    const accounts = await ctx.accounts(businessId);
    const scope = { rootId: businessId, branchId: null, range };
    const bs = await ledger.balanceSheet(scope, accounts, true);
    expect(bs.balanced).toBe(true);
    const tb = await ledger.trialBalance(scope, accounts);
    expect(tb.dr).toBe(tb.cr);
    const cf = await ledger.cashFlow(scope, accounts);
    expect(cf.ties).toBe(true);
    const pl = await ledger.pnl(scope, accounts, false);
    expect(pl.net).toBe(r2(150 - 40 - 2000));
  });

  it('imports a statement once, categorizes a line, and reconciles to zero', async () => {
    const bank = await banking.create(owner, {
      name: 'Operating',
      kind: 'bank',
      mask: '4821',
      openingBalance: 1000,
      openingDate: iso(today),
    });
    const csv = Buffer.from(
      `Date,Description,Amount\n${iso(today)},MONTHLY SERVICE FEE,-15.00\n${iso(today)},COUNTER DEPOSIT,200.00\n`,
    );
    const first = await banking.importStatement(owner, bank.id, {
      buffer: csv,
      originalname: 'stmt.csv',
    });
    expect(first.imported).toBe(2);
    const again = await banking.importStatement(owner, bank.id, {
      buffer: csv,
      originalname: 'stmt.csv',
    });
    expect(again.imported).toBe(0);
    expect(again.duplicates).toBe(2);
    const maps = await ctx.accountMaps(businessId);
    const lines = await prisma.finBankLine.findMany({
      where: { bankAccountId: bank.id },
      orderBy: { amount: 'asc' },
    });
    await banking.match(owner, lines[0].id, {
      accountId: maps.byKey.get('bank_fees')!.id,
    });
    expect(await balanceOf('bank_fees')).toBe(15);
    const rec = await banking.startRecon(owner, {
      bankAccountId: bank.id,
      periodEnd: iso(today),
      statementBalance: 1185,
    });
    let w = await banking.workspace(businessId, rec.id);
    expect(w.opening).toBe(1000);
    expect(w.diff).toBe(200); // the deposit has no ledger record yet
    await expectCode(banking.submitRecon(owner, rec.id), 'FINANCE_INVALID');
    await banking.match(owner, lines[1].id, {
      accountId: maps.byKey.get('cash_drawer')!.id,
    });
    w = await banking.workspace(businessId, rec.id);
    expect(w.diff).toBe(0);
    await banking.submitRecon(owner, rec.id);
    await expectCode(
      banking.approveRecon(owner, rec.id),
      'FINANCE_SEGREGATION_OF_DUTIES',
    );
    await banking.approveRecon(manager, rec.id);
    expect(
      (await prisma.finReconciliation.findUnique({ where: { id: rec.id } }))!
        .status,
    ).toBe('Locked');
    await expectCode(banking.unmatch(owner, lines[0].id), 'FINANCE_CONFLICT');
  });

  it('flags duplicate vendor invoices, posts approved bills and keeps A/P in step', async () => {
    const maps = await ctx.accountMaps(businessId);
    const gen = maps.byKey.get('general')!.id;
    const b1 = await ap.create(owner, {
      vendorName: 'Acme Supply',
      vendorInvoiceNo: 'INV-77',
      billDate: iso(today),
      dueDate: iso(today),
      lines: [
        { description: 'Supplies', accountId: gen, amount: 100, taxCode: 'IN' },
      ],
    });
    expect(num(b1.total)).toBe(110);
    const dup = await ap.create(owner, {
      vendorName: 'Acme Supply',
      vendorInvoiceNo: 'INV-77',
      billDate: iso(today),
      dueDate: iso(today),
      lines: [{ description: 'Supplies', accountId: gen, amount: 100 }],
    });
    expect(dup.status).toBe('Review Required');
    await expectCode(ap.submit(owner, dup.id), 'FINANCE_CONFLICT');
    await ap.submit(owner, b1.id);
    await ap.approve(manager, b1.id);
    await ap.post(owner, b1.id);
    expect(await balanceOf('ap')).toBe(110);
    expect(await balanceOf('input_tax')).toBe(-10); // recoverable: a debit on a credit-nature account
    const items = await ap.openItems(businessId);
    expect(r2(items.reduce((s, i) => s + i.openBase, 0))).toBe(110);
    const bank = (await banking.list(businessId))[0];
    await ap.recordPayment(owner, b1.id, {
      bankAccountId: bank.id,
      date: iso(today),
      amount: 110,
    });
    expect(await balanceOf('ap')).toBe(0);
    expect((await ap.mustBill(businessId, b1.id)).status).toBe('Paid');
  });

  it('books realized FX on a foreign bill paid at a different rate', async () => {
    const maps = await ctx.accountMaps(businessId);
    const yesterday = new Date(today.getTime() - 86_400_000);
    await fx.setRate(owner, {
      currency: 'EUR',
      rate: 1.1,
      effectiveOn: iso(yesterday),
    });
    await fx.setRate(owner, {
      currency: 'EUR',
      rate: 1.2,
      effectiveOn: iso(today),
    });
    const b = await ap.create(owner, {
      vendorName: 'Euro Parts',
      vendorInvoiceNo: 'EU-1',
      billDate: iso(yesterday),
      dueDate: iso(today),
      currency: 'EUR',
      lines: [
        {
          description: 'Parts',
          accountId: maps.byKey.get('general')!.id,
          amount: 100,
        },
      ],
    });
    await ap.submit(owner, b.id);
    await ap.approve(manager, b.id);
    await ap.post(owner, b.id);
    expect(await balanceOf('ap')).toBe(110);
    const bank = (await banking.list(businessId))[0];
    const fxBefore = await balanceOf('fx');
    await ap.recordPayment(owner, b.id, {
      bankAccountId: bank.id,
      date: iso(today),
      amount: 100,
    });
    expect(await balanceOf('ap')).toBe(0);
    expect(r2((await balanceOf('fx')) - fxBefore)).toBe(-10); // paid 120 for a 110 liability: 10 loss
  });

  it('runs depreciation once per month from the asset register', async () => {
    const bank = (await banking.list(businessId))[0];
    const a = await assets.capitalize(owner, {
      name: 'Oven',
      category: 'Equipment',
      acquiredOn: iso(today),
      inServiceOn: iso(today),
      cost: 1200,
      salvage: 0,
      lifeMonths: 12,
      fundingAccountId: bank.glAccountId,
    });
    const { year, month } = monthKey(today);
    const pv = await assets.preview(businessId, year, month);
    expect(pv.total).toBe(100);
    await assets.run(owner, businessId, year, month);
    expect((await assets.accumulated(businessId)).get(a.id)).toBe(100);
    await expectCode(
      assets.run(owner, businessId, year, month),
      'FINANCE_CONFLICT',
    );
    // Depreciation is dated at month end; disposing earlier would strand it in accumulated depreciation.
    const monthEnd = new Date(Date.UTC(year, month, 0));
    if (monthEnd > today)
      await expectCode(
        assets.dispose(owner, a.id, { date: iso(today), proceeds: 0 }),
        'FINANCE_CONFLICT',
      );
    const accumBefore = await balanceOf('fa_accum');
    await assets.dispose(owner, a.id, { date: iso(monthEnd), proceeds: 0 });
    expect((await assets.accumulated(businessId)).get(a.id)).toBe(0);
    expect(r2((await balanceOf('fa_accum')) - accumBefore)).toBe(100); // contra-asset credit balance cleared
  });

  it('locks only the tax figures that were submitted', async () => {
    const maps = await ctx.accountMaps(businessId);
    const gen = maps.byKey.get('general')!.id;
    const { year, month } = monthKey(today);
    const prevDay = iso(new Date(Date.UTC(year, month - 2, 10)));
    const prevKey = monthKey(new Date(Date.UTC(year, month - 2, 10)));
    // An earlier test locks last month; this one needs it open.
    const prevPeriod = await ctx.period(
      businessId,
      prevKey.year,
      prevKey.month,
    );
    await prisma.finPeriod.update({
      where: { id: prevPeriod.id },
      data: { status: 'open' },
    });
    const taxedBill = async (inv: string) => {
      const b = await ap.create(manager, {
        vendorName: 'Tax Test Supply',
        vendorInvoiceNo: inv,
        billDate: prevDay,
        dueDate: prevDay,
        lines: [
          {
            description: 'Supplies',
            accountId: gen,
            amount: 100,
            taxCode: 'IN',
          },
        ],
      });
      await ap.submit(manager, b.id);
      await ap.approve(owner, b.id);
      await ap.post(owner, b.id);
    };
    await taxedBill('TX-1');
    const prevStart = new Date(Date.UTC(year, month - 2, 1)).getTime();
    const ret = (await tax.list(businessId)).find(
      (r) =>
        r.ret.jurisdiction === businessId &&
        r.ret.periodStart.getTime() === prevStart,
    )!;
    await tax.submit(manager, ret.ret.id);
    await taxedBill('TX-2'); // the ledger moves after submission
    const after = (await tax.list(businessId)).find(
      (r) => r.ret.id === ret.ret.id,
    )!;
    expect(after.calc.input).toBe(10); // still the submitted figures
    expect(after.changed).toBe(true);
    await expectCode(tax.approve(owner, ret.ret.id), 'FINANCE_CONFLICT');
    await tax.reopen(owner, ret.ret.id, 'Late bill');
    await tax.submit(manager, ret.ret.id);
    await tax.approve(owner, ret.ret.id);
    const locked = await tax.mustReturn(businessId, ret.ret.id);
    expect(locked.status).toBe('Locked');
    expect(num(locked.inputTax)).toBe(20);
    await prisma.finPeriod.update({
      where: { id: prevPeriod.id },
      data: { status: prevPeriod.status },
    });
  });

  it('computes the tax return from the tax accounts', async () => {
    const { year, month } = monthKey(today);
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 0));
    const c = await tax.calc(businessId, businessId, from, to);
    expect(c.output).toBe(15);
    expect(c.input).toBe(10);
    expect(c.net).toBe(5);
  });

  it('never leaves an unbalanced posted ledger', async () => {
    const tot = await prisma.finJournalLine.aggregate({
      where: { businessId, postedAt: { not: null } },
      _sum: { debit: true, credit: true },
    });
    expect(r2(num(tot._sum.debit))).toBe(r2(num(tot._sum.credit)));
    const posted = await prisma.finJournal.findMany({
      where: { businessId, status: { in: ['Posted', 'Reversed'] } },
      include: { lines: true },
    });
    for (const j of posted)
      expect(
        r2(j.lines.reduce((s, l) => s + num(l.debit) - num(l.credit), 0)),
      ).toBe(0);
    expect(posting).toBeDefined();
  });
});
