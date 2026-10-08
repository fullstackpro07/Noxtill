import { Injectable, Logger } from '@nestjs/common';
import { FinAccount, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  Branch,
  FinanceContextService,
  num,
  r2,
  ymd,
} from './finance-context.service';
import { FinancePostingService, LineInput } from './finance-posting.service';
import { EXPENSE_KEYWORDS, FinanceConfig } from './finance.constants';

export interface SweepReport {
  scanned: number;
  posted: number;
  reposted: number;
  reversed: number;
  failed: number;
  errors: string[];
  ms: number;
}

/** A journal one source record implies (empty lines = it implies nothing, e.g. a cancelled sale). */
interface Implied {
  type: string;
  id: string;
  event: string;
  label: string;
  reference: string;
  date: Date;
  branchId: string;
  memo: string;
  lines: LineInput[];
}

interface SweepCtx {
  rootId: string;
  base: string;
  branches: Map<string, Branch>;
  key: (k: string) => FinAccount;
  byCode: Map<string, FinAccount>;
  cfg: FinanceConfig;
  report: SweepReport;
  rates: Map<string, number | null>;
}

const CLEARING_METHODS = new Set(['card', 'online']);

/** What each source type is called in the ledger's "Source" column. */
export const SOURCE_MODULE: Record<string, string> = {
  order: 'Orders',
  payment: 'Payments',
  credit: 'Customer credit',
  return: 'Returns',
  stock: 'Inventory',
  voucher: 'Vouchers',
  expense: 'Expenses',
  cash: 'Cash register',
  shift: 'Cash register',
  deposit: 'Booking deposits',
  bill: 'Bills',
  billpay: 'Bill payments',
  asset: 'Fixed Assets',
  depreciation: 'Fixed Assets',
  bankline: 'Bank feeds',
  fx: 'FX revaluation',
  payprovider: 'Payments & Billing',
  payroll: 'People & Payroll',
};

/** Payroll runs whose posting People & Payroll has requested, and every later step. */
const PAYROLL_POSTED = [
  'Finance Posting Pending',
  'Finance Posted',
  'Payout Submitted',
  'Partially Paid',
  'Payout Failed',
  'Paid',
];

/**
 * Turns what already happened in Noxtill into the ledger. Nothing in the source modules changes:
 * this reads their rows and posts one idempotent system journal per (record, event). An edited
 * record reverses its old journal and posts a new revision; a deleted or cancelled one is reversed.
 * The same code backfills history (full pass) and keeps up every minute (changed rows only).
 */
@Injectable()
export class FinanceSourcesService {
  private readonly logger = new Logger(FinanceSourcesService.name);
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FinanceContextService,
    private readonly posting: FinancePostingService,
  ) {}

  isRunning(rootId: string) {
    return this.running.has(rootId);
  }

  async sweep(rootId: string, full: boolean): Promise<SweepReport> {
    const report: SweepReport = {
      scanned: 0,
      posted: 0,
      reposted: 0,
      reversed: 0,
      failed: 0,
      errors: [],
      ms: 0,
    };
    if (this.running.has(rootId)) {
      report.errors.push('A posting sweep is already running for this ledger.');
      return report;
    }
    this.running.add(rootId);
    const t0 = Date.now();
    try {
      const settings = await this.ctx.settingsRow(rootId);
      const doFull = full || !settings.backfilledAt;
      // Overlap the window so a row committed while the last sweep ran is never missed.
      const since =
        doFull || !settings.lastSweepAt
          ? null
          : new Date(settings.lastSweepAt.getTime() - 10 * 60_000);
      const maps = await this.ctx.accountMaps(rootId);
      const branches = await this.ctx.branches(rootId);
      const c: SweepCtx = {
        rootId,
        base: await this.ctx.baseCurrency(rootId),
        branches: new Map(branches.map((b) => [b.id, b])),
        key: (k) => {
          const a = maps.byKey.get(k);
          if (!a)
            throw new Error(
              `System account “${k}” is missing from the chart of accounts.`,
            );
          return a;
        },
        byCode: maps.byCode,
        cfg: await this.ctx.config(rootId),
        report,
        rates: new Map(),
      };
      const ids = branches.map((b) => b.id);
      const steps: [string, () => Promise<void>][] = [
        ['orders', () => this.orders(c, ids, since)],
        ['payments', () => this.payments(c, ids, since)],
        ['credit', () => this.credit(c, ids, since)],
        ['returns', () => this.returns(c, ids, since)],
        ['stock', () => this.stock(c, ids, since)],
        ['vouchers', () => this.vouchers(c, ids, since)],
        ['expenses', () => this.expenses(c, ids, since)],
        ['cash', () => this.cash(c, ids, since)],
        ['deposits', () => this.deposits(c, ids, since)],
        ['payprovider', () => this.providerCosts(c, since)],
        ['payroll', () => this.payroll(c)],
      ];
      for (const [name, fn] of steps) {
        try {
          await fn();
        } catch (e) {
          report.errors.push(`${name}: ${(e as Error).message}`);
          this.logger.warn(
            `finance sweep ${name} failed for ${rootId}: ${(e as Error).message}`,
          );
        }
      }
      await this.prisma.finSettings.update({
        where: { businessId: rootId },
        data: {
          lastSweepAt: new Date(t0),
          ...(doFull
            ? { backfilledAt: settings.backfilledAt ?? new Date() }
            : {}),
          sweepError: report.errors.length
            ? report.errors.join(' · ').slice(0, 500)
            : null,
        },
      });
    } finally {
      this.running.delete(rootId);
      report.ms = Date.now() - t0;
    }
    return report;
  }

  // ── plumbing ─────────────────────────────────────────────────────────────

  private async rate(c: SweepCtx, currency: string, on: Date) {
    if (currency === c.base) return 1;
    const k = `${currency}|${ymd(on)}`;
    if (!c.rates.has(k))
      c.rates.set(k, await this.ctx.rateOn(c.rootId, currency, on, c.base));
    return c.rates.get(k) ?? null;
  }

  private hash(lines: LineInput[], date: Date) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto') as typeof import('crypto');
    const s =
      ymd(date) +
      '|' +
      lines
        .map(
          (l) =>
            `${l.accountId}:${r2(l.debit).toFixed(2)}:${r2(l.credit).toFixed(2)}:${l.customerId ?? ''}`,
        )
        .join(';');
    return crypto.createHash('sha1').update(s).digest('hex');
  }

  /** Post each implied journal whose content differs from what the ledger already has. */
  private async apply(
    c: SweepCtx,
    type: string,
    items: Implied[],
    live?: Map<string, string>,
  ) {
    const known =
      live ??
      new Map(
        (await this.posting.liveSources(c.rootId, type)).map((r) => [
          `${r.sourceId}|${r.sourceEvent}`,
          r.status === 'Failed' ? '' : (r.sourceHash ?? ''),
        ]),
      );
    for (const it of items) {
      c.report.scanned += 1;
      const lines = it.lines.filter((l) => r2(l.debit) || r2(l.credit));
      const h = this.hash(lines, it.date);
      const k = `${it.id}|${it.event}`;
      if (!lines.length && !known.has(k)) continue;
      if (known.get(k) === h) continue;
      const branch = c.branches.get(it.branchId);
      const currency = branch?.currency ?? c.base;
      const rate = await this.rate(c, currency, it.date);
      if (rate == null) {
        const msg = `No ${currency}→${c.base} exchange rate on or before ${ymd(it.date)} (needed for ${branch?.name ?? 'a branch'}).`;
        if (!c.report.errors.includes(msg)) c.report.errors.push(msg);
        continue;
      }
      try {
        const res = await this.posting.postSystem(
          c.rootId,
          { type, id: it.id, event: it.event, hash: h, label: it.label },
          {
            date: it.date,
            currency,
            fxRate: rate,
            branchId: it.branchId,
            memo: it.memo,
            reference: it.reference,
            lines,
          },
        );
        if (res === 'posted') c.report.posted += 1;
        else if (res === 'reposted') c.report.reposted += 1;
        else if (res === 'reversed') c.report.reversed += 1;
        else if (res === 'failed') c.report.failed += 1;
      } catch (e) {
        c.report.failed += 1;
        const msg = `${it.label}: ${(e as Error).message}`;
        if (c.report.errors.length < 20) c.report.errors.push(msg);
      }
    }
  }

  /** Live journals whose source row no longer exists in `present` get reversed. */
  private async reverseMissing(
    c: SweepCtx,
    type: string,
    present: Set<string>,
  ) {
    const live = await this.posting.liveSources(c.rootId, type);
    const gone: Implied[] = live
      .filter((r) => r.sourceId && !present.has(r.sourceId))
      .map((r) => ({
        type,
        id: r.sourceId!,
        event: r.sourceEvent!,
        label: `${SOURCE_MODULE[type] ?? type} record removed`,
        reference: '',
        date: new Date(),
        branchId: c.rootId,
        memo: '',
        lines: [],
      }));
    if (gone.length) await this.apply(c, type, gone);
  }

  private dr = (
    accountId: string,
    amount: number,
    description: string,
    extra: Partial<LineInput> = {},
  ): LineInput => ({
    accountId,
    debit: r2(amount),
    credit: 0,
    description,
    ...extra,
  });
  private cr = (
    accountId: string,
    amount: number,
    description: string,
    extra: Partial<LineInput> = {},
  ): LineInput => ({
    accountId,
    debit: 0,
    credit: r2(amount),
    description,
    ...extra,
  });

  private tender(c: SweepCtx, method: string | null | undefined) {
    return CLEARING_METHODS.has(method ?? '')
      ? c.key('clearing')
      : c.key('cash_drawer');
  }

  // ── sales ────────────────────────────────────────────────────────────────

  private async orders(c: SweepCtx, ids: string[], since: Date | null) {
    const where: Prisma.OrderWhereInput = {
      businessId: { in: ids },
      isQuotation: false,
      ...(since ? { updatedAt: { gte: since } } : { status: 'completed' }),
    };
    let cursor: string | undefined;
    for (;;) {
      const rows = await this.prisma.order.findMany({
        where,
        take: 500,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
        select: {
          id: true,
          businessId: true,
          orderNo: true,
          status: true,
          customerId: true,
          tax: true,
          total: true,
          cogs: true,
          voucherAmountApplied: true,
          createdAt: true,
          items: {
            select: {
              price: true,
              qty: true,
              product: { select: { kind: true } },
            },
          },
        },
      });
      if (!rows.length) break;
      cursor = rows[rows.length - 1].id;
      const items: Implied[] = rows.map((o) => {
        const lines: LineInput[] = [];
        if (o.status === 'completed') {
          const total = num(o.total);
          const tax = num(o.tax);
          const voucher = Math.min(num(o.voucherAmountApplied), total);
          const net = r2(total - tax);
          const gross = o.items.reduce((a, i) => a + num(i.price) * i.qty, 0);
          const svcGross = o.items
            .filter((i) => i.product?.kind === 'service')
            .reduce((a, i) => a + num(i.price) * i.qty, 0);
          const svc = gross > 0 ? r2((net * svcGross) / gross) : 0;
          const prod = r2(net - svc);
          const ref = `Order #${o.orderNo}`;
          const cust = { customerId: o.customerId };
          if (r2(total - voucher))
            lines.push(
              this.dr(
                c.key('ar').id,
                total - voucher,
                `${ref} receivable`,
                cust,
              ),
            );
          if (voucher)
            lines.push(
              this.dr(c.key('vouchers').id, voucher, `${ref} paid by voucher`),
            );
          if (prod)
            lines.push(
              this.cr(c.key('sales').id, prod, `${ref} product sales`),
            );
          if (svc)
            lines.push(
              this.cr(c.key('service_sales').id, svc, `${ref} service revenue`),
            );
          if (tax)
            lines.push(
              this.cr(c.key('output_tax').id, tax, `${ref} output tax`, {
                taxCode: 'OUT',
              }),
            );
          const cogs = num(o.cogs);
          if (cogs > 0) {
            lines.push(
              this.dr(c.key('cogs').id, cogs, `${ref} cost of goods sold`),
            );
            lines.push(
              this.cr(c.key('inventory').id, cogs, `${ref} inventory relieved`),
            );
          }
        }
        return {
          type: 'order',
          id: o.id,
          event: 'sale',
          label: `Order #${o.orderNo}`,
          reference: `ORD-${o.orderNo}`,
          date: o.createdAt,
          branchId: o.businessId,
          memo: `Sale · Order #${o.orderNo}`,
          lines,
        };
      });
      await this.apply(c, 'order', items);
    }
  }

  /**
   * Payments settle the order's receivable. Cash tendered above what was due is change handed
   * back, so cumulative payments per order are capped at the order total less any voucher.
   */
  private async payments(c: SweepCtx, ids: string[], since: Date | null) {
    let orderIds: string[] | null = null;
    if (since) {
      const recent = await this.prisma.payment.findMany({
        where: {
          createdAt: { gte: since },
          order: { businessId: { in: ids } },
        },
        select: { orderId: true },
      });
      orderIds = [...new Set(recent.map((p) => p.orderId))];
      if (!orderIds.length) return;
    }
    let cursor: string | undefined;
    for (;;) {
      const orders = await this.prisma.order.findMany({
        where: {
          businessId: { in: ids },
          isQuotation: false,
          payments: { some: {} },
          ...(orderIds ? { id: { in: orderIds } } : {}),
        },
        take: 500,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
        select: {
          id: true,
          businessId: true,
          orderNo: true,
          customerId: true,
          total: true,
          voucherAmountApplied: true,
          payments: { orderBy: { createdAt: 'asc' } },
        },
      });
      if (!orders.length) break;
      cursor = orders[orders.length - 1].id;
      const items: Implied[] = [];
      for (const o of orders) {
        let room = r2(num(o.total) - num(o.voucherAmountApplied));
        for (const p of o.payments) {
          const amt =
            p.method === 'credit'
              ? 0
              : Math.max(0, Math.min(num(p.amount), room));
          room = r2(room - amt);
          const label = `Payment ${p.method} · Order #${o.orderNo}`;
          items.push({
            type: 'payment',
            id: p.id,
            event: 'receipt',
            label,
            reference: `ORD-${o.orderNo}`,
            date: p.createdAt,
            branchId: o.businessId,
            memo:
              amt < num(p.amount) && p.method !== 'credit'
                ? `${label} (${num(p.amount).toFixed(2)} tendered, ${amt.toFixed(2)} applied — the rest was change)`
                : label,
            lines: amt
              ? [
                  this.dr(this.tender(c, p.method).id, amt, label),
                  this.cr(c.key('ar').id, amt, `Settles Order #${o.orderNo}`, {
                    customerId: o.customerId,
                  }),
                ]
              : [],
          });
        }
      }
      await this.apply(c, 'payment', items);
    }
  }

  private async credit(c: SweepCtx, ids: string[], since: Date | null) {
    const rows = await this.prisma.creditEntry.findMany({
      where: {
        businessId: { in: ids },
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      select: {
        id: true,
        businessId: true,
        customerId: true,
        kind: true,
        amount: true,
        method: true,
        note: true,
        orderId: true,
        createdAt: true,
        customer: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const items: Implied[] = rows.map((e) => {
      const amt = num(e.amount);
      const who = e.customer?.name ?? 'customer';
      const cust = { customerId: e.customerId };
      let lines: LineInput[] = [];
      let label = `Credit ${e.kind} · ${who}`;
      // A sale on credit is already in the order's journal; a credit-refunded return in the return's.
      const fromOrder = e.kind === 'credit' && !!e.orderId;
      const fromReturn =
        e.kind === 'payment' && !!e.orderId && /^Return /.test(e.note ?? '');
      if (!fromOrder && !fromReturn) {
        if (e.kind === 'credit') {
          label = `Opening / imported balance · ${who}`;
          lines = [
            this.dr(
              c.key('ar').id,
              amt,
              `${e.note ?? 'Credit balance'} · ${who}`,
              cust,
            ),
            this.cr(
              c.key('opening_equity').id,
              amt,
              `Balance brought in · ${who}`,
            ),
          ];
        } else if (e.kind === 'payment') {
          label = `Credit payment · ${who}`;
          lines = [
            this.dr(this.tender(c, e.method).id, amt, label),
            this.cr(c.key('ar').id, amt, `Payment on account · ${who}`, cust),
          ];
        } else {
          label = `Write-off · ${who}`;
          lines = [
            this.dr(c.key('bad_debt').id, amt, label),
            this.cr(c.key('ar').id, amt, `Written off · ${who}`, cust),
          ];
        }
      }
      return {
        type: 'credit',
        id: e.id,
        event: e.kind,
        label,
        reference: e.orderId
          ? `CR-${e.id.slice(0, 8)}`
          : `CR-${e.id.slice(0, 8)}`,
        date: e.createdAt,
        branchId: e.businessId,
        memo: label,
        lines,
      };
    });
    await this.apply(c, 'credit', items);
  }

  private async returns(c: SweepCtx, ids: string[], since: Date | null) {
    const rows = await this.prisma.return.findMany({
      where: {
        businessId: { in: ids },
        ...(since ? { updatedAt: { gte: since } } : { status: 'approved' }),
      },
      select: {
        id: true,
        businessId: true,
        status: true,
        refundMethod: true,
        refundAmount: true,
        customerId: true,
        updatedAt: true,
        order: { select: { orderNo: true, tax: true, total: true } },
      },
    });
    const items: Implied[] = rows.map((r) => {
      const amt = num(r.refundAmount);
      const total = num(r.order.total);
      const taxShare = total > 0 ? r2((amt * num(r.order.tax)) / total) : 0;
      const label = `Return · Order #${r.order.orderNo}`;
      const tender =
        r.refundMethod === 'credit' || r.refundMethod === 'store_credit'
          ? c.key('ar')
          : this.tender(c, r.refundMethod);
      const lines =
        r.status === 'approved' && amt > 0
          ? [
              this.dr(c.key('sales_returns').id, amt - taxShare, label),
              ...(taxShare
                ? [
                    this.dr(
                      c.key('output_tax').id,
                      taxShare,
                      `${label} tax reversed`,
                      { taxCode: 'OUT' },
                    ),
                  ]
                : []),
              this.cr(
                tender.id,
                amt,
                `Refund (${r.refundMethod.replace('_', ' ')}) · ${label}`,
                {
                  customerId: tender.systemKey === 'ar' ? r.customerId : null,
                },
              ),
            ]
          : [];
      return {
        type: 'return',
        id: r.id,
        event: 'refund',
        label,
        reference: `RET-${r.id.slice(0, 8)}`,
        date: r.updatedAt,
        branchId: r.businessId,
        memo: label,
        lines,
      };
    });
    await this.apply(c, 'return', items);
  }

  // ── inventory ────────────────────────────────────────────────────────────

  private async stock(c: SweepCtx, ids: string[], since: Date | null) {
    let cursor: string | undefined;
    for (;;) {
      const rows = await this.prisma.stockMovement.findMany({
        where: {
          businessId: { in: ids },
          kind: { not: 'sale' },
          ...(since ? { createdAt: { gte: since } } : {}),
        },
        take: 1000,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
        select: {
          id: true,
          businessId: true,
          kind: true,
          qty: true,
          unitCost: true,
          supplierId: true,
          createdAt: true,
          product: { select: { name: true, costPrice: true } },
        },
      });
      if (!rows.length) break;
      cursor = rows[rows.length - 1].id;
      const items: Implied[] = rows.map((m) => {
        const costKnown = m.unitCost != null;
        const unit = costKnown ? num(m.unitCost) : num(m.product.costPrice);
        const value = r2(Math.abs(m.qty) * unit);
        const what = `${Math.abs(m.qty)} × ${m.product.name}`;
        const inv = c.key('inventory').id;
        const note = costKnown
          ? ''
          : ' (no unit cost on the movement — valued at the product’s current cost price)';
        let lines: LineInput[] = [];
        let label = '';
        switch (m.kind) {
          case 'purchase':
            label = `Goods received · ${what}`;
            lines = [
              this.dr(inv, value, label),
              this.cr(
                c.key('grni').id,
                value,
                `Awaiting supplier bill · ${what}`,
                { supplierId: m.supplierId },
              ),
            ];
            break;
          case 'return':
            label = `Returned to stock · ${what}`;
            lines = [
              this.dr(inv, value, label),
              this.cr(c.key('cogs').id, value, label),
            ];
            break;
          case 'wastage':
            label = `Wastage · ${what}`;
            lines = [
              this.dr(c.key('shrinkage').id, value, label),
              this.cr(inv, value, label),
            ];
            break;
          case 'adjustment':
            label = `Stock adjustment ${m.qty > 0 ? '+' : '−'}${what}`;
            lines =
              m.qty > 0
                ? [
                    this.dr(inv, value, label),
                    this.cr(c.key('shrinkage').id, value, label),
                  ]
                : [
                    this.dr(c.key('shrinkage').id, value, label),
                    this.cr(inv, value, label),
                  ];
            break;
          case 'transfer_out':
            label = `Transfer out · ${what}`;
            lines = [
              this.dr(c.key('inventory_transit').id, value, label),
              this.cr(inv, value, label),
            ];
            break;
          case 'transfer_in':
            label = `Transfer in · ${what}`;
            lines = [
              this.dr(inv, value, label),
              this.cr(c.key('inventory_transit').id, value, label),
            ];
            break;
          case 'maintenance':
            // Parts issued to (qty < 0) or returned from (qty > 0) a maintenance work order.
            label =
              m.qty < 0
                ? `Maintenance parts · ${what}`
                : `Maintenance parts returned · ${what}`;
            lines =
              m.qty < 0
                ? [
                    this.dr(c.key('repairs').id, value, label),
                    this.cr(inv, value, label),
                  ]
                : [
                    this.dr(inv, value, label),
                    this.cr(c.key('repairs').id, value, label),
                  ];
            break;
          case 'field_service':
            // Parts used on (qty < 0) or returned from (qty > 0) a customer field-service job. The
            // job's invoice is an order with cogs 0, so the cost is recognised here exactly once.
            label =
              m.qty < 0
                ? `Field service parts · ${what}`
                : `Field service parts returned · ${what}`;
            lines =
              m.qty < 0
                ? [
                    this.dr(c.key('cogs').id, value, label),
                    this.cr(inv, value, label),
                  ]
                : [
                    this.dr(inv, value, label),
                    this.cr(c.key('cogs').id, value, label),
                  ];
            break;
        }
        return {
          type: 'stock',
          id: m.id,
          event: m.kind,
          label,
          reference: `SM-${m.id.slice(0, 8)}`,
          date: m.createdAt,
          branchId: m.businessId,
          memo: label + note,
          lines: value ? lines : [],
        };
      });
      await this.apply(c, 'stock', items);
    }
  }

  private async vouchers(c: SweepCtx, ids: string[], since: Date | null) {
    const rows = await this.prisma.voucher.findMany({
      where: {
        businessId: { in: ids },
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      select: {
        id: true,
        businessId: true,
        code: true,
        initialValue: true,
        createdAt: true,
      },
    });
    await this.apply(
      c,
      'voucher',
      rows.map((v) => {
        const label = `Voucher ${v.code} issued`;
        return {
          type: 'voucher',
          id: v.id,
          event: 'issue',
          label,
          reference: v.code,
          date: v.createdAt,
          branchId: v.businessId,
          // Noxtill records no sale for a voucher, so its value is a promotional cost until redeemed.
          memo: `${label} — no sale is recorded for vouchers in Noxtill, so the value is booked as a promotional cost`,
          lines: [
            this.dr(c.key('marketing').id, num(v.initialValue), label),
            this.cr(
              c.key('vouchers').id,
              num(v.initialValue),
              `${label} — outstanding`,
            ),
          ],
        };
      }),
    );
  }

  // ── expenses & cash ──────────────────────────────────────────────────────

  expenseAccount(
    cfg: FinanceConfig,
    byCode: Map<string, FinAccount>,
    key: (k: string) => FinAccount,
    category: string,
  ) {
    const mapped = cfg.expenseMap[category.trim().toLowerCase()];
    if (mapped && byCode.get(mapped)) return byCode.get(mapped)!;
    for (const [re, k] of EXPENSE_KEYWORDS)
      if (re.test(category)) return key(k);
    return key('general');
  }

  private async expenses(c: SweepCtx, ids: string[], since: Date | null) {
    const rows = await this.prisma.expense.findMany({
      where: {
        businessId: { in: ids },
        ...(since ? { updatedAt: { gte: since } } : {}),
      },
      select: {
        id: true,
        businessId: true,
        description: true,
        category: true,
        amount: true,
        incurredOn: true,
      },
    });
    const paidFrom =
      c.byCode.get(c.cfg.expensePaidFrom) ?? c.key('cash_drawer');
    await this.apply(
      c,
      'expense',
      rows.map((e) => {
        const label = `Expense · ${e.category}`;
        const acct = this.expenseAccount(c.cfg, c.byCode, c.key, e.category);
        return {
          type: 'expense',
          id: e.id,
          event: 'expense',
          label,
          reference: `EXP-${e.id.slice(0, 8)}`,
          date: e.incurredOn,
          branchId: e.businessId,
          memo: `${label} · ${e.description}`.slice(0, 500),
          lines: [
            this.dr(acct.id, num(e.amount), e.description.slice(0, 280)),
            this.cr(paidFrom.id, num(e.amount), `Paid · ${e.category}`),
          ],
        };
      }),
    );
    // Expenses are hard-deleted in Noxtill: anything we posted that no longer exists is reversed.
    const present = new Set(
      (
        await this.prisma.expense.findMany({
          where: { businessId: { in: ids } },
          select: { id: true },
        })
      ).map((e) => e.id),
    );
    await this.reverseMissing(c, 'expense', present);
  }

  // ── payroll (People & Payroll runs) ────────────────────────────────────────

  /**
   * A finalized payroll run accrues wages: Dr Salaries (gross + employer contributions), Cr Income
   * Tax Payable (withholding), Cr Payroll Liabilities (net pay, employee deductions and employer
   * contributions) and Cr Suspense for Staff advances recovered — advances aren't carried on the
   * ledger as a receivable, so recoveries land in Suspense for the accountant to clear. Recorded
   * bank payouts then settle the liability: Dr Payroll Liabilities, Cr the account People &
   * Payroll says wages are paid from.
   */
  private async payroll(c: SweepCtx) {
    const runs = await this.prisma.ppRun.findMany({
      where: { businessId: c.rootId, status: { in: PAYROLL_POSTED } },
      include: { lines: true },
      orderBy: { createdAt: 'asc' },
    });
    const pp = await this.prisma.ppSettings.findUnique({
      where: { businessId: c.rootId },
      select: { config: true },
    });
    const ppCfg = (pp?.config ?? {}) as { payroll?: { paidFromCode?: string } };
    const paidFrom =
      c.byCode.get(ppCfg.payroll?.paidFromCode ?? '') ??
      c.byCode.get(c.cfg.expensePaidFrom) ??
      c.key('cash_drawer');
    const items: Implied[] = [];
    for (const r of runs) {
      const sum = (k: string) =>
        r2(
          r.lines.reduce(
            (a, l) => a + num((l.calc as Record<string, number>)[k] ?? 0),
            0,
          ),
        );
      const gross = sum('gross');
      const er = sum('er');
      const tax = sum('tax');
      const adv = sum('adv');
      const net = sum('net');
      const ded = r2(gross - tax - adv - net);
      const label = `Payroll ${r.number} · ${r.period}`;
      items.push({
        type: 'payroll',
        id: r.id,
        event: 'accrual',
        label,
        reference: r.number,
        date: r.payDate,
        branchId: c.rootId,
        memo: `${label} · ${r.lines.length} employee(s)`,
        lines: [
          this.dr(c.key('salaries').id, gross, 'Gross pay'),
          this.dr(c.key('salaries').id, er, 'Employer contributions'),
          this.cr(c.key('income_tax_payable').id, tax, 'Income tax withheld'),
          this.cr(
            c.key('payroll_liab').id,
            r2(net + ded + er),
            'Net pay, employee deductions and employer contributions payable',
          ),
          this.cr(
            c.key('suspense').id,
            adv,
            'Staff advances recovered (not on the ledger as a receivable)',
          ),
        ],
      });
      const paid = r.lines.filter((l) => l.payout === 'Paid');
      const paidNet = r2(paid.reduce((a, l) => a + num(l.net), 0));
      const last = paid
        .map((l) => l.paidAt)
        .filter((d): d is Date => !!d)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      items.push({
        type: 'payroll',
        id: r.id,
        event: 'payout',
        label: `${label} · payout`,
        reference: r.batchRef ?? r.number,
        date: last ?? r.payDate,
        branchId: c.rootId,
        memo: `${label} · ${paid.length} transfer(s) confirmed paid`,
        lines: paidNet
          ? [
              this.dr(c.key('payroll_liab').id, paidNet, 'Net pay settled'),
              this.cr(paidFrom.id, paidNet, `Paid from ${paidFrom.code}`),
            ]
          : [],
      });
    }
    await this.apply(c, 'payroll', items);
  }

  private async cash(c: SweepCtx, ids: string[], since: Date | null) {
    const moves = await this.prisma.cashMovement.findMany({
      where: {
        businessId: { in: ids },
        type: { in: ['cash_in', 'cash_out'] },
        ...(since ? { createdAt: { gte: since } } : {}),
      },
      select: {
        id: true,
        businessId: true,
        type: true,
        amount: true,
        note: true,
        createdAt: true,
      },
    });
    const drawer = c.key('cash_drawer').id;
    const suspense = c.key('suspense').id;
    await this.apply(
      c,
      'cash',
      moves.map((m) => {
        const label =
          `${m.type === 'cash_in' ? 'Cash in' : 'Cash out'}${m.note ? ` · ${m.note}` : ''}`.slice(
            0,
            200,
          );
        const amt = num(m.amount);
        return {
          type: 'cash',
          id: m.id,
          event: m.type,
          label,
          reference: `CM-${m.id.slice(0, 8)}`,
          date: m.createdAt,
          branchId: m.businessId,
          // The register records no counter-account, so the other side waits in Suspense.
          memo: `${label} — the register records no counter-account; reclassify from Suspense`,
          lines:
            m.type === 'cash_in'
              ? [this.dr(drawer, amt, label), this.cr(suspense, amt, label)]
              : [this.dr(suspense, amt, label), this.cr(drawer, amt, label)],
        };
      }),
    );
    const shifts = await this.prisma.cashShift.findMany({
      where: {
        businessId: { in: ids },
        variance: { not: null },
        ...(since ? { closedAt: { gte: since } } : {}),
      },
      select: {
        id: true,
        businessId: true,
        variance: true,
        closedAt: true,
        openedAt: true,
      },
    });
    await this.apply(
      c,
      'shift',
      shifts.map((s) => {
        const v = num(s.variance);
        const label = `Cash count variance ${v > 0 ? 'over' : 'short'}`;
        return {
          type: 'shift',
          id: s.id,
          event: 'variance',
          label,
          reference: `SHIFT-${s.id.slice(0, 8)}`,
          date: s.closedAt ?? s.openedAt,
          branchId: s.businessId,
          memo: label,
          lines:
            v > 0
              ? [
                  this.dr(drawer, v, label),
                  this.cr(c.key('cash_short').id, v, label),
                ]
              : [
                  this.dr(c.key('cash_short').id, -v, label),
                  this.cr(drawer, -v, label),
                ],
        };
      }),
    );
  }

  private async deposits(c: SweepCtx, ids: string[], since: Date | null) {
    const rows = await this.prisma.deposit.findMany({
      where: {
        businessId: { in: ids },
        status: { not: 'pending' },
        ...(since ? { updatedAt: { gte: since } } : {}),
      },
      select: {
        id: true,
        businessId: true,
        amount: true,
        method: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const dep = c.key('deposits').id;
    const items: Implied[] = [];
    for (const d of rows) {
      const amt = num(d.amount);
      const tender = this.tender(c, d.method).id;
      items.push({
        type: 'deposit',
        id: d.id,
        event: 'capture',
        label: 'Booking deposit received',
        reference: `DEP-${d.id.slice(0, 8)}`,
        date: d.createdAt,
        branchId: d.businessId,
        memo: 'Booking deposit received',
        lines: [
          this.dr(tender, amt, 'Deposit received'),
          this.cr(dep, amt, 'Held for the booking'),
        ],
      });
      items.push({
        type: 'deposit',
        id: d.id,
        event: 'refund',
        label: 'Booking deposit refunded',
        reference: `DEP-${d.id.slice(0, 8)}`,
        date: d.updatedAt,
        branchId: d.businessId,
        memo: 'Booking deposit refunded',
        lines:
          d.status === 'refunded'
            ? [
                this.dr(dep, amt, 'Deposit refunded'),
                this.cr(tender, amt, 'Deposit refunded'),
              ]
            : [],
      });
      items.push({
        type: 'deposit',
        id: d.id,
        event: 'forfeit',
        label: 'Booking deposit forfeited',
        reference: `DEP-${d.id.slice(0, 8)}`,
        date: d.updatedAt,
        branchId: d.businessId,
        memo: 'Booking deposit forfeited (no-show / late cancel)',
        lines:
          d.status === 'forfeited'
            ? [
                this.dr(dep, amt, 'Deposit forfeited'),
                this.cr(c.key('forfeit_income').id, amt, 'Deposit forfeited'),
              ]
            : [],
      });
    }
    await this.apply(c, 'deposit', items);
  }

  /** Source rows that exist but have no live journal yet (shown as "unposted documents"). */
  async backlog(rootId: string) {
    const s = await this.ctx.settingsRow(rootId);
    return {
      lastSweepAt: s.lastSweepAt,
      backfilledAt: s.backfilledAt,
      error: s.sweepError,
      running: this.running.has(rootId),
    };
  }

  // ── payment provider costs (Payments & Billing) ──────────────────────────

  /**
   * Fees a payment provider deducted, and chargebacks it took back, as reported by its balance
   * transactions (live mode only). Card money sits in Payment Clearing until the payout lands, so
   * each cost moves out of clearing: fees to bank fees, a lost chargeback to bad debt (a won
   * dispute's reversal posts back). Test-mode data never reaches the ledger.
   */
  private async providerCosts(c: SweepCtx, since: Date | null) {
    const rows = await this.prisma.payBalanceTxn.findMany({
      where: {
        businessId: c.rootId,
        env: 'live',
        ...(since ? { updatedAt: { gte: since } } : {}),
      },
      orderBy: { occurredAt: 'asc' },
    });
    const items: Implied[] = [];
    for (const b of rows) {
      if (b.currency !== c.base) {
        const msg = `Provider costs in ${b.currency} aren’t posted automatically (base is ${c.base}) — record them with a journal.`;
        if (!c.report.errors.includes(msg)) c.report.errors.push(msg);
        continue;
      }
      const fee = num(b.fee);
      const dispute =
        (b.category ?? '').startsWith('dispute') || b.type === 'dispute';
      const amt = num(b.amount);
      const lines: LineInput[] = [];
      if (fee)
        lines.push(
          this.dr(c.key('bank_fees').id, fee, `Provider fee · ${b.type}`),
          this.cr(
            c.key('clearing').id,
            fee,
            `Fee deducted by provider · ${b.providerTxnId}`,
          ),
        );
      if (dispute && amt < 0)
        lines.push(
          this.dr(
            c.key('bad_debt').id,
            -amt,
            `Chargeback · ${b.sourceObjectId ?? b.providerTxnId}`,
          ),
          this.cr(c.key('clearing').id, -amt, 'Taken back by provider'),
        );
      if (dispute && amt > 0)
        lines.push(
          this.dr(c.key('clearing').id, amt, 'Chargeback reversed by provider'),
          this.cr(
            c.key('bad_debt').id,
            amt,
            `Dispute won · ${b.sourceObjectId ?? b.providerTxnId}`,
          ),
        );
      if (!lines.length) continue;
      items.push({
        type: 'payprovider',
        id: b.id,
        event: 'cost',
        label: `Provider ${dispute ? 'chargeback' : 'fee'} · ${b.providerTxnId}`,
        reference: b.providerTxnId.slice(0, 60),
        date: b.occurredAt,
        branchId: c.rootId,
        memo: `${b.type}${b.category ? ` (${b.category})` : ''} reported by the payment provider`,
        lines,
      });
    }
    await this.apply(c, 'payprovider', items);
  }
}
