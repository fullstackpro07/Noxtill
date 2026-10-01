import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { CreditReminderService } from '../credit/credit-reminder.service';
import {
  FinActor,
  FinanceContextService,
  dayOf,
  num,
  r2,
} from './finance-context.service';
import { FIN_ERRORS } from './finance.constants';

export interface ArItem {
  /** Order id, or `open:<creditEntryId>` for an opening/imported balance. */
  id: string;
  orderId: string | null;
  orderNo: number | null;
  customerId: string | null;
  customer: string;
  branchId: string;
  currency: string;
  date: Date;
  due: Date;
  original: number;
  paid: number;
  balance: number;
  /** Base currency at today's rate. */
  balanceBase: number;
  daysPastDue: number;
  bucket: 'Current' | '1–30' | '31–60' | '61–90' | '90+';
  dispute: string | null;
  payments: { label: string; date: Date; amount: number }[];
}

export const BUCKETS = ['Current', '1–30', '31–60', '61–90', '90+'] as const;

const bucketOf = (d: number): ArItem['bucket'] =>
  d <= 0
    ? 'Current'
    : d <= 30
      ? '1–30'
      : d <= 60
        ? '31–60'
        : d <= 90
          ? '61–90'
          : '90+';

/**
 * The receivables subledger, computed straight from the same records the ledger posts from
 * (completed orders, payments, customer credit, credit-refunded returns), so its total is the
 * independent check on control account 1200.
 */
@Injectable()
export class FinanceReceivablesService {
  private readonly logger = new Logger(FinanceReceivablesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FinanceContextService,
    private readonly cls: ClsService,
    private readonly reminders: CreditReminderService,
  ) {}

  async items(
    rootId: string,
    opts: { includeSettled?: boolean } = {},
  ): Promise<ArItem[]> {
    const branches = await this.ctx.branches(rootId);
    const ids = branches.map((b) => b.id);
    const cur = new Map(branches.map((b) => [b.id, b.currency]));
    const base = await this.ctx.baseCurrency(rootId);
    const cfg = await this.ctx.config(rootId);
    const today = dayOf(new Date());
    const rates = new Map<string, number>();
    for (const c of new Set(cur.values()))
      rates.set(c, (await this.ctx.rateOn(rootId, c, today, base)) ?? 1);

    const [orders, credit, returns, disputes] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          businessId: { in: ids },
          isQuotation: false,
          status: 'completed',
        },
        select: {
          id: true,
          businessId: true,
          orderNo: true,
          customerId: true,
          total: true,
          voucherAmountApplied: true,
          createdAt: true,
          customer: { select: { name: true } },
          payments: {
            orderBy: { createdAt: 'asc' },
            select: { method: true, amount: true, createdAt: true },
          },
        },
      }),
      this.prisma.creditEntry.findMany({
        where: { businessId: { in: ids } },
        select: {
          id: true,
          businessId: true,
          customerId: true,
          kind: true,
          amount: true,
          note: true,
          orderId: true,
          createdAt: true,
          customer: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.return.findMany({
        where: {
          businessId: { in: ids },
          status: 'approved',
          refundMethod: { in: ['credit', 'store_credit'] },
        },
        select: { orderId: true, refundAmount: true, updatedAt: true },
      }),
      this.prisma.finArDispute.findMany({
        where: { businessId: rootId, resolvedAt: null },
      }),
    ]);
    const disputeBy = new Map(disputes.map((d) => [d.orderId, d.reason]));
    const items = new Map<string, ArItem>();
    const mk = (o: {
      id: string;
      orderId: string | null;
      orderNo: number | null;
      customerId: string | null;
      customer: string;
      branchId: string;
      date: Date;
      original: number;
    }): ArItem => ({
      ...o,
      currency: cur.get(o.branchId) ?? base,
      due: new Date(dayOf(o.date).getTime() + cfg.arTermsDays * 86_400_000),
      paid: 0,
      balance: o.original,
      balanceBase: 0,
      daysPastDue: 0,
      bucket: 'Current',
      dispute: o.orderId ? (disputeBy.get(o.orderId) ?? null) : null,
      payments: [],
    });
    for (const o of orders) {
      const original = r2(num(o.total) - num(o.voucherAmountApplied));
      const it = mk({
        id: o.id,
        orderId: o.id,
        orderNo: o.orderNo,
        customerId: o.customerId,
        customer: o.customer?.name ?? 'Walk-in customer',
        branchId: o.businessId,
        date: o.createdAt,
        original,
      });
      let room = original;
      for (const p of o.payments) {
        if (p.method === 'credit') continue;
        const amt = Math.max(0, Math.min(num(p.amount), room));
        room = r2(room - amt);
        if (amt)
          it.payments.push({
            label: `Payment · ${p.method}`,
            date: p.createdAt,
            amount: amt,
          });
      }
      items.set(o.id, it);
    }
    for (const r of returns) {
      const it = items.get(r.orderId);
      if (it)
        it.payments.push({
          label: 'Return refunded to credit',
          date: r.updatedAt,
          amount: num(r.refundAmount),
        });
    }
    // Customer-level credit: opening balances are their own items; payments and write-offs not
    // tied to a return settle the customer's oldest open items first.
    const fifo: typeof credit = [];
    for (const e of credit) {
      if (e.kind === 'credit' && !e.orderId) {
        items.set(
          `open:${e.id}`,
          mk({
            id: `open:${e.id}`,
            orderId: null,
            orderNo: null,
            customerId: e.customerId,
            customer: e.customer?.name ?? 'Customer',
            branchId: e.businessId,
            date: e.createdAt,
            original: num(e.amount),
          }),
        );
      } else if (
        e.kind !== 'credit' &&
        !(e.kind === 'payment' && e.orderId && /^Return /.test(e.note ?? ''))
      )
        fifo.push(e);
    }
    const byCustomer = new Map<string, ArItem[]>();
    for (const it of items.values()) {
      if (!it.customerId) continue;
      byCustomer.set(it.customerId, [
        ...(byCustomer.get(it.customerId) ?? []),
        it,
      ]);
    }
    for (const list of byCustomer.values())
      list.sort((a, b) => a.date.getTime() - b.date.getTime());
    const settled = (it: ArItem) =>
      r2(it.original - it.payments.reduce((a, p) => a + p.amount, 0));
    for (const e of fifo) {
      let left = num(e.amount);
      const list = byCustomer.get(e.customerId) ?? [];
      // An entry tied to an order settles that order first.
      const ordered = e.orderId
        ? [
            ...list.filter((i) => i.orderId === e.orderId),
            ...list.filter((i) => i.orderId !== e.orderId),
          ]
        : list;
      for (const it of ordered) {
        if (left <= 0) break;
        const open = settled(it);
        if (open <= 0) continue;
        const take = Math.min(open, left);
        it.payments.push({
          label: e.kind === 'write_off' ? 'Written off' : 'Payment on account',
          date: e.createdAt,
          amount: r2(take),
        });
        left = r2(left - take);
      }
      if (left > 0) {
        // Paid more than owed: a credit balance in the customer's favour.
        const key = `adv:${e.customerId}`;
        const it =
          items.get(key) ??
          mk({
            id: key,
            orderId: null,
            orderNo: null,
            customerId: e.customerId,
            customer: e.customer?.name ?? 'Customer',
            branchId: e.businessId,
            date: e.createdAt,
            original: 0,
          });
        it.payments.push({
          label: 'Unapplied payment',
          date: e.createdAt,
          amount: r2(left),
        });
        items.set(key, it);
      }
    }
    const out: ArItem[] = [];
    for (const it of items.values()) {
      it.paid = r2(it.payments.reduce((a, p) => a + p.amount, 0));
      it.balance = r2(it.original - it.paid);
      it.balanceBase = r2(it.balance * (rates.get(it.currency) ?? 1));
      it.daysPastDue = Math.floor(
        (today.getTime() - dayOf(it.due).getTime()) / 86_400_000,
      );
      it.bucket = it.balance > 0 ? bucketOf(it.daysPastDue) : 'Current';
      if (opts.includeSettled || it.balance !== 0) out.push(it);
    }
    return out.sort((a, b) => b.daysPastDue - a.daysPastDue);
  }

  async dispute(actor: FinActor, orderId: string, reason: string) {
    this.ctx.need(actor, 'manage', 'Flagging a dispute');
    const ids = (await this.ctx.branches(actor.rootId)).map((b) => b.id);
    const o = await this.prisma.order.findFirst({
      where: { id: orderId, businessId: { in: ids } },
      select: { orderNo: true },
    });
    if (!o)
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Order not found',
        HttpStatus.NOT_FOUND,
      );
    const open = await this.prisma.finArDispute.findFirst({
      where: { businessId: actor.rootId, orderId, resolvedAt: null },
    });
    if (open)
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        'Already flagged as disputed.',
        HttpStatus.CONFLICT,
      );
    await this.prisma.finArDispute.create({
      data: {
        businessId: actor.rootId,
        orderId,
        reason: reason.slice(0, 300),
        raisedById: actor.userId,
      },
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'ar.disputed',
      'ar',
      orderId,
      `Order #${o.orderNo}: ${reason}`,
    );
  }

  async resolveDispute(actor: FinActor, orderId: string, resolution: string) {
    this.ctx.need(actor, 'manage', 'Resolving a dispute');
    const d = await this.prisma.finArDispute.findFirst({
      where: { businessId: actor.rootId, orderId, resolvedAt: null },
    });
    if (!d)
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'No open dispute on this receivable.',
        HttpStatus.NOT_FOUND,
      );
    await this.prisma.finArDispute.update({
      where: { id: d.id },
      data: { resolvedAt: new Date(), resolution: resolution.slice(0, 300) },
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'ar.dispute_resolved',
      'ar',
      orderId,
      resolution,
    );
  }

  /** Collections hand-off: the existing Credit reminder (WhatsApp/SMS/email per the customer's channel). */
  async collections(
    actor: FinActor,
    itemId: string,
    tone: 'gentle' | 'firm' | 'final',
  ) {
    this.ctx.need(actor, 'manage', 'Sending to collections');
    const it = (await this.items(actor.rootId)).find((i) => i.id === itemId);
    if (!it)
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Receivable not found or already settled.',
        HttpStatus.NOT_FOUND,
      );
    if (!it.customerId)
      throw new AppException(
        FIN_ERRORS.INVALID,
        'Walk-in sales have no customer to remind.',
        HttpStatus.BAD_REQUEST,
      );
    if (it.dispute)
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        'Disputed items are excluded from collections.',
        HttpStatus.CONFLICT,
      );
    if (it.daysPastDue <= 0)
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        'Not overdue yet.',
        HttpStatus.CONFLICT,
      );
    const res = await this.cls.run(async () => {
      this.cls.set(CLS_KEY_BUSINESS_ID, it.branchId);
      return this.reminders.bulkRemind(it.branchId, [it.customerId!], tone);
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'ar.collections',
      'ar',
      itemId,
      `${tone} reminder to ${it.customer}: ${res.sent} sent, ${res.skipped} skipped`,
    );
    return res;
  }
}
