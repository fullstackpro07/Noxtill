import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DAY = 86400000;

export type Comparison = 'week' | 'yesterday' | 'month' | 'custom';

export interface Window {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
  /** "vs the previous 7 days" etc. */
  label: string;
  comparison: Comparison;
}

export function resolveWindow(
  comparison: Comparison = 'week',
  from?: string,
  to?: string,
  now = new Date(),
): Window {
  if (comparison === 'custom' && from && to) {
    const start = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + DAY);
    const len = Math.max(DAY, end.getTime() - start.getTime());
    return {
      start,
      end,
      prevStart: new Date(start.getTime() - len),
      prevEnd: start,
      label: `vs the ${Math.round(len / DAY)} days before`,
      comparison,
    };
  }
  if (comparison === 'yesterday') {
    const start = new Date(now.getTime() - DAY);
    return {
      start,
      end: now,
      prevStart: new Date(now.getTime() - 2 * DAY),
      prevEnd: start,
      label: 'vs the 24 hours before',
      comparison,
    };
  }
  if (comparison === 'month') {
    return {
      start: new Date(now.getTime() - 30 * DAY),
      end: now,
      prevStart: new Date(now.getTime() - 60 * DAY),
      prevEnd: new Date(now.getTime() - 30 * DAY),
      label: 'vs the previous 30 days',
      comparison,
    };
  }
  return {
    start: new Date(now.getTime() - 7 * DAY),
    end: now,
    prevStart: new Date(now.getTime() - 14 * DAY),
    prevEnd: new Date(now.getTime() - 7 * DAY),
    label: 'vs the previous 7 days',
    comparison: 'week',
  };
}

export interface PeriodMetrics {
  revenue: number;
  orders: number;
  cogs: number;
  grossProfit: number;
  discounts: number;
  subtotal: number;
  /** Revenue on order lines whose cost was recorded as 0 — excluded from margin, never counted as profit. */
  unmeasuredRevenue: number;
  measuredRevenue: number;
  measuredCost: number;
  refunds: number;
  refundCount: number;
  repeatRevenue: number;
  newRevenue: number;
  repeatBuyers: number;
  newBuyers: number;
  bookings: number;
  deliveriesDone: number;
  deliveriesFailed: number;
  reviewCount: number;
  reviewSum: number;
  lowReviews: number;
  inboxFirstReplies: number[];
}

export interface CreditState {
  outstanding: number;
  overdue: number;
  overdueAccounts: {
    customerId: string;
    name: string;
    balance: number;
    days: number;
  }[];
  oldestDays: number;
  /** Total outstanding from the nightly snapshot closest to 7 days ago, when one exists. */
  outstandingWeekAgo: number | null;
}

export interface StockRow {
  id: string;
  businessId: string;
  name: string;
  stock: number;
  threshold: number;
  price: number;
  cost: number;
  perDay: number;
  coverDays: number | null;
}

export interface BranchRow {
  businessId: string;
  name: string;
  revenue: number;
  measuredRevenue: number;
  measuredCost: number;
  discounts: number;
  subtotal: number;
  margin: number | null;
  discountPct: number | null;
  productShare: Map<string, number>;
}

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

/**
 * Every figure the Brain reads, straight from the records, for an explicit set of business ids
 * (one branch, or the whole group). Same definitions as Profit & Analytics: completed, non-quotation
 * orders; gross profit = revenue − the cost snapshotted on each order line. Raw PrismaService with
 * explicit ids because an "All branches" read cannot go through the tenant-scoping extension.
 */
@Injectable()
export class BrainMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async period(ids: string[], start: Date, end: Date): Promise<PeriodMetrics> {
    const orderWhere: Prisma.OrderWhereInput = {
      businessId: { in: ids },
      status: 'completed',
      isQuotation: false,
      createdAt: { gte: start, lt: end },
    };
    const [
      agg,
      lines,
      returns,
      buyers,
      bookings,
      deliveries,
      reviews,
      external,
      inbox,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: orderWhere,
        _sum: { total: true, cogs: true, discount: true, subtotal: true },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<
        { measured: unknown; cost: unknown; unmeasured: unknown }[]
      >`
        SELECT
          SUM(CASE WHEN oi.cost > 0 THEN oi.price * oi.qty ELSE 0 END) AS measured,
          SUM(CASE WHEN oi.cost > 0 THEN oi.cost * oi.qty ELSE 0 END) AS cost,
          SUM(CASE WHEN oi.cost > 0 THEN 0 ELSE oi.price * oi.qty END) AS unmeasured
        FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.business_id IN (${Prisma.join(ids)}) AND o.status = 'completed' AND o.is_quotation = false
          AND o.created_at >= ${start} AND o.created_at < ${end}
      `,
      this.prisma.return.aggregate({
        where: {
          businessId: { in: ids },
          status: 'approved',
          createdAt: { gte: start, lt: end },
        },
        _sum: { refundAmount: true },
        _count: { _all: true },
      }),
      // Buyer type per customer: "repeat" when they had a completed order before this window began.
      this.prisma.$queryRaw<
        {
          repeat_rev: unknown;
          new_rev: unknown;
          repeat_n: unknown;
          new_n: unknown;
        }[]
      >`
        SELECT
          SUM(CASE WHEN first_at < ${start} THEN spend ELSE 0 END) AS repeat_rev,
          SUM(CASE WHEN first_at >= ${start} THEN spend ELSE 0 END) AS new_rev,
          SUM(CASE WHEN first_at < ${start} THEN 1 ELSE 0 END) AS repeat_n,
          SUM(CASE WHEN first_at >= ${start} THEN 1 ELSE 0 END) AS new_n
        FROM (
          SELECT o.customer_id, SUM(o.total) AS spend,
            (SELECT MIN(o2.created_at) FROM orders o2 WHERE o2.customer_id = o.customer_id AND o2.status = 'completed' AND o2.is_quotation = false) AS first_at
          FROM orders o
          WHERE o.business_id IN (${Prisma.join(ids)}) AND o.customer_id IS NOT NULL AND o.status = 'completed'
            AND o.is_quotation = false AND o.created_at >= ${start} AND o.created_at < ${end}
          GROUP BY o.customer_id
        ) t
      `,
      this.prisma.appointment.count({
        where: {
          businessId: { in: ids },
          startsAt: { gte: start, lt: end },
          status: { notIn: ['cancelled'] },
        },
      }),
      this.prisma.delivery.groupBy({
        by: ['status'],
        where: {
          businessId: { in: ids },
          updatedAt: { gte: start, lt: end },
          status: { in: ['delivered', 'failed'] },
        },
        _count: { _all: true },
      }),
      this.prisma.reviewRequest.findMany({
        where: {
          businessId: { in: ids },
          stars: { not: null },
          respondedAt: { gte: start, lt: end },
        },
        select: { stars: true },
      }),
      this.prisma.externalReview.findMany({
        where: { businessId: { in: ids }, createdAt: { gte: start, lt: end } },
        select: { stars: true },
      }),
      this.prisma.inboxConversation.findMany({
        where: {
          businessId: { in: ids },
          firstReplyAt: { gte: start, lt: end },
          firstReplyMinutes: { not: null },
        },
        select: { firstReplyMinutes: true },
      }),
    ]);
    const l = lines[0] ?? { measured: 0, cost: 0, unmeasured: 0 };
    const b = buyers[0] ?? { repeat_rev: 0, new_rev: 0, repeat_n: 0, new_n: 0 };
    const stars = [
      ...reviews.map((r) => r.stars!),
      ...external.map((r) => r.stars),
    ];
    const revenue = n(agg._sum.total);
    const cogs = n(agg._sum.cogs);
    return {
      revenue,
      orders: agg._count._all,
      cogs,
      grossProfit: revenue - cogs,
      discounts: n(agg._sum.discount),
      subtotal: n(agg._sum.subtotal),
      unmeasuredRevenue: n(l.unmeasured),
      measuredRevenue: n(l.measured),
      measuredCost: n(l.cost),
      refunds: n(returns._sum.refundAmount),
      refundCount: returns._count._all,
      repeatRevenue: n(b.repeat_rev),
      newRevenue: n(b.new_rev),
      repeatBuyers: n(b.repeat_n),
      newBuyers: n(b.new_n),
      bookings,
      deliveriesDone:
        deliveries.find((d) => d.status === 'delivered')?._count._all ?? 0,
      deliveriesFailed:
        deliveries.find((d) => d.status === 'failed')?._count._all ?? 0,
      reviewCount: stars.length,
      reviewSum: stars.reduce((s, v) => s + v, 0),
      lowReviews: stars.filter((s) => s <= 2).length,
      inboxFirstReplies: inbox.map((c) => c.firstReplyMinutes!),
    };
  }

  async credit(ids: string[], overdueDays: number): Promise<CreditState> {
    const rows = await this.prisma.$queryRaw<
      {
        customer_id: string;
        name: string;
        balance: unknown;
        days_outstanding: unknown;
      }[]
    >`
      SELECT v.customer_id, c.name, v.balance, v.days_outstanding
      FROM v_credit_balances v JOIN customers c ON c.id = v.customer_id
      WHERE v.business_id IN (${Prisma.join(ids)}) AND v.balance > 0
      ORDER BY v.balance DESC, v.customer_id
    `;
    const all = rows.map((r) => ({
      customerId: r.customer_id,
      name: r.name,
      balance: n(r.balance),
      days: n(r.days_outstanding),
    }));
    const overdueAccounts = all.filter((r) => r.days >= overdueDays);
    const weekAgo = new Date(Date.now() - 7 * DAY);
    const snaps = await this.prisma.creditBalanceSnapshot.findMany({
      where: {
        businessId: { in: ids },
        snapshotDate: {
          lte: weekAgo,
          gte: new Date(weekAgo.getTime() - 3 * DAY),
        },
      },
      orderBy: { snapshotDate: 'desc' },
    });
    const perBusiness = new Map<string, number>();
    for (const s of snaps)
      if (!perBusiness.has(s.businessId))
        perBusiness.set(s.businessId, Number(s.balance));
    return {
      outstanding: all.reduce((s, r) => s + r.balance, 0),
      overdue: overdueAccounts.reduce((s, r) => s + r.balance, 0),
      overdueAccounts,
      oldestDays: overdueAccounts.reduce((m, r) => Math.max(m, r.days), 0),
      outstandingWeekAgo:
        perBusiness.size === ids.length
          ? [...perBusiness.values()].reduce((s, v) => s + v, 0)
          : null,
    };
  }

  /** Customers who have cleared a credit balance to zero before — "have paid off before", read from their ledger. */
  async clearedBefore(
    ids: string[],
    customerIds: string[],
  ): Promise<Set<string>> {
    if (!customerIds.length) return new Set();
    const entries = await this.prisma.creditEntry.findMany({
      where: { businessId: { in: ids }, customerId: { in: customerIds } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { customerId: true, kind: true, amount: true },
    });
    const running = new Map<string, number>();
    const cleared = new Set<string>();
    for (const e of entries) {
      const v =
        (running.get(e.customerId) ?? 0) +
        (e.kind === 'credit' ? Number(e.amount) : -Number(e.amount));
      running.set(e.customerId, v);
      if (v <= 0.005 && e.kind !== 'credit') cleared.add(e.customerId);
    }
    return cleared;
  }

  /** Stock with its real 14-day sales rate. `coverDays` is stock ÷ that rate — an estimate, labelled as one. */
  async stock(ids: string[]): Promise<StockRow[]> {
    const since = new Date(Date.now() - 14 * DAY);
    const [products, sold] = await Promise.all([
      this.prisma.product.findMany({
        where: { businessId: { in: ids }, active: true, kind: 'product' },
        select: {
          id: true,
          businessId: true,
          name: true,
          stockQty: true,
          lowStockThreshold: true,
          sellingPrice: true,
          costPrice: true,
        },
      }),
      this.prisma.$queryRaw<{ product_id: string; qty: unknown }[]>`
        SELECT oi.product_id, SUM(oi.qty) AS qty FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.business_id IN (${Prisma.join(ids)}) AND o.status = 'completed' AND o.is_quotation = false
          AND o.created_at >= ${since} AND oi.product_id IS NOT NULL
        GROUP BY oi.product_id ORDER BY oi.product_id
      `,
    ]);
    const qty = new Map(sold.map((s) => [s.product_id, n(s.qty)]));
    return products.map((p) => {
      const perDay = (qty.get(p.id) ?? 0) / 14;
      return {
        id: p.id,
        businessId: p.businessId,
        name: p.name,
        stock: p.stockQty,
        threshold: p.lowStockThreshold,
        price: Number(p.sellingPrice),
        cost: Number(p.costPrice),
        perDay,
        coverDays: perDay > 0 ? p.stockQty / perDay : null,
      };
    });
  }

  /** Products sold in the last 30 days that have no cost price — they are left out of margin. */
  async missingCosts(
    ids: string[],
  ): Promise<{ id: string; name: string; businessId: string }[]> {
    const since = new Date(Date.now() - 30 * DAY);
    return this.prisma.$queryRaw<
      { id: string; name: string; businessId: string }[]
    >`
      SELECT DISTINCT p.id, p.name, p.business_id AS businessId FROM products p
      JOIN order_items oi ON oi.product_id = p.id JOIN orders o ON o.id = oi.order_id
      WHERE p.business_id IN (${Prisma.join(ids)}) AND p.kind = 'product' AND p.cost_price <= 0
        AND o.status = 'completed' AND o.created_at >= ${since}
      ORDER BY p.name
    `;
  }

  async branches(ids: string[], start: Date, end: Date): Promise<BranchRow[]> {
    const [biz, rows, lines] = await Promise.all([
      this.prisma.business.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      }),
      this.prisma.order.groupBy({
        by: ['businessId'],
        where: {
          businessId: { in: ids },
          status: 'completed',
          isQuotation: false,
          createdAt: { gte: start, lt: end },
        },
        _sum: { total: true, discount: true, subtotal: true },
      }),
      this.prisma.$queryRaw<
        {
          business_id: string;
          product_id: string | null;
          rev: unknown;
          measured: unknown;
          cost: unknown;
        }[]
      >`
        SELECT o.business_id, oi.product_id, SUM(oi.price * oi.qty) AS rev,
          SUM(CASE WHEN oi.cost > 0 THEN oi.price * oi.qty ELSE 0 END) AS measured,
          SUM(CASE WHEN oi.cost > 0 THEN oi.cost * oi.qty ELSE 0 END) AS cost
        FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.business_id IN (${Prisma.join(ids)}) AND o.status = 'completed' AND o.is_quotation = false
          AND o.created_at >= ${start} AND o.created_at < ${end}
        GROUP BY o.business_id, oi.product_id ORDER BY o.business_id, oi.product_id
      `,
    ]);
    return biz.map((b) => {
      const agg = rows.find((r) => r.businessId === b.id);
      const mine = lines.filter((l) => l.business_id === b.id);
      const measured = mine.reduce((s, l) => s + n(l.measured), 0);
      const cost = mine.reduce((s, l) => s + n(l.cost), 0);
      const totalLines = mine.reduce((s, l) => s + n(l.rev), 0);
      const share = new Map<string, number>();
      for (const l of mine)
        if (l.product_id && totalLines > 0)
          share.set(l.product_id, n(l.rev) / totalLines);
      const subtotal = n(agg?._sum.subtotal);
      const discounts = n(agg?._sum.discount);
      return {
        businessId: b.id,
        name: b.name,
        revenue: n(agg?._sum.total),
        measuredRevenue: measured,
        measuredCost: cost,
        discounts,
        subtotal,
        margin: measured > 0 ? ((measured - cost) / measured) * 100 : null,
        discountPct: subtotal > 0 ? (discounts / subtotal) * 100 : null,
        productShare: share,
      };
    });
  }

  /** Revenue per product from buyers who had bought before the window — for "where did repeat spend go". */
  async repeatByProduct(
    ids: string[],
    start: Date,
    end: Date,
  ): Promise<Map<string, { name: string; rev: number }>> {
    const rows = await this.prisma.$queryRaw<
      { product_id: string | null; name: string; rev: unknown }[]
    >`
      SELECT oi.product_id, MAX(oi.name) AS name, SUM(oi.price * oi.qty) AS rev
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.business_id IN (${Prisma.join(ids)}) AND o.status = 'completed' AND o.is_quotation = false
        AND o.created_at >= ${start} AND o.created_at < ${end} AND o.customer_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM orders o2 WHERE o2.customer_id = o.customer_id AND o2.status = 'completed'
                    AND o2.is_quotation = false AND o2.created_at < ${start})
      GROUP BY oi.product_id ORDER BY oi.product_id
    `;
    return new Map(
      rows
        .filter((r) => r.product_id)
        .map((r) => [r.product_id!, { name: r.name, rev: n(r.rev) }]),
    );
  }

  /** Similarity of two product mixes: the share of revenue they have in common (0–100). */
  static mixSimilarity(
    a: Map<string, number>,
    b: Map<string, number>,
  ): number | null {
    if (a.size === 0 || b.size === 0) return null;
    let common = 0;
    for (const [k, v] of a) common += Math.min(v, b.get(k) ?? 0);
    return common * 100;
  }
}

export function pctChange(cur: number, prev: number): number | null {
  if (prev === 0) return cur === 0 ? 0 : null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
