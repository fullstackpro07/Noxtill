import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import {
  BranchRow,
  BrainMetricsService,
  CreditState,
  PeriodMetrics,
  StockRow,
  median,
  pctChange,
} from './brain-metrics.service';
import { BrainContext, Finding } from './brain.types';
import { day, money, pct, plural } from './brain-context.service';

const DAY = 86400000;
const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export interface QuietWindow {
  weekday: string;
  avg: number;
  othersAvg: number;
  weeks: number;
}

export interface ReadingData {
  cur: PeriodMetrics;
  prev: PeriodMetrics;
  credit: CreditState;
  stock: StockRow[];
  missingCosts: { id: string; name: string; businessId: string }[];
  branches: BranchRow[];
  repeatCur: Map<string, { name: string; rev: number }>;
  repeatPrev: Map<string, { name: string; rev: number }>;
  quiet: QuietWindow | null;
  quotations: {
    id: string;
    orderNo: number;
    total: number;
    customer: string | null;
    acceptedAt: Date;
  }[];
  lapsed: {
    count: number;
    customerIds: string[];
    topProduct: { id: string; name: string } | null;
  };
  lastCampaignAt: Date | null;
  discountBreaches: {
    id: string;
    orderNo: number;
    pct: number;
    businessId: string;
    at: Date;
  }[];
  findings: Finding[];
}

/**
 * Turns real metrics into findings. A finding only exists when a recorded figure crosses one of
 * the business's own thresholds (Memory & Rules); every number in its text comes from the metrics
 * computed here, and anything that is an estimate says so in `limit`.
 */
@Injectable()
export class BrainDetectorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: BrainMetricsService,
  ) {}

  async read(ctx: BrainContext): Promise<ReadingData> {
    const { ids, window: w, thresholds: th } = ctx;
    const monthStart = new Date(Date.now() - 30 * DAY);
    const [
      cur,
      prev,
      credit,
      stock,
      missingCosts,
      branches,
      repeatCur,
      repeatPrev,
      quiet,
      quotations,
      lapsed,
      lastCampaign,
      discountBreaches,
    ] = await Promise.all([
      this.metrics.period(ids, w.start, w.end),
      this.metrics.period(ids, w.prevStart, w.prevEnd),
      this.metrics.credit(ids, th.overdueDays),
      this.metrics.stock(ids),
      this.metrics.missingCosts(ids),
      ids.length > 1
        ? this.metrics.branches(ids, monthStart, new Date())
        : Promise.resolve([] as BranchRow[]),
      this.metrics.repeatByProduct(ids, w.start, w.end),
      this.metrics.repeatByProduct(ids, w.prevStart, w.prevEnd),
      this.quietWindow(ctx),
      this.prisma.order.findMany({
        where: {
          businessId: { in: ids },
          isQuotation: true,
          quotationStatus: 'accepted',
        },
        orderBy: { total: 'desc' },
        take: 5,
        select: {
          id: true,
          orderNo: true,
          total: true,
          updatedAt: true,
          customer: { select: { name: true } },
        },
      }),
      this.lapsedBuyers(ctx),
      this.prisma.campaign.findFirst({
        where: { businessId: { in: ids } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      th.maxDiscountPercent === null
        ? Promise.resolve([])
        : this.discountBreaches(ctx, th.maxDiscountPercent),
    ]);
    const data: ReadingData = {
      cur,
      prev,
      credit,
      stock,
      missingCosts,
      branches,
      repeatCur,
      repeatPrev,
      quiet,
      quotations: quotations.map((q) => ({
        id: q.id,
        orderNo: q.orderNo,
        total: Number(q.total),
        customer: q.customer?.name ?? null,
        acceptedAt: q.updatedAt,
      })),
      lapsed,
      lastCampaignAt: lastCampaign?.createdAt ?? null,
      discountBreaches,
      findings: [],
    };
    data.findings = await this.detect(ctx, data);
    return data;
  }

  private async quietWindow(ctx: BrainContext): Promise<QuietWindow | null> {
    const since = new Date(Date.now() - 35 * DAY);
    const rows = await this.prisma.$queryRaw<
      { d: Date | string; rev: unknown }[]
    >`
      SELECT DATE(created_at) AS d, SUM(total) AS rev FROM orders
      WHERE business_id IN (${Prisma.join(ctx.ids)}) AND status = 'completed' AND is_quotation = false AND created_at >= ${since}
      GROUP BY DATE(created_at) ORDER BY d
    `;
    if (rows.length < 15) return null; // not enough trading days to call anything a pattern
    const byDay = new Map<number, number[]>();
    for (const r of rows) {
      const date = new Date(
        typeof r.d === 'string'
          ? `${r.d}T12:00:00Z`
          : r.d.getTime() + 12 * 3600000,
      );
      const wd = date.getUTCDay();
      byDay.set(wd, [...(byDay.get(wd) ?? []), Number(r.rev)]);
    }
    const avgs = [...byDay.entries()]
      .filter(([, v]) => v.length >= 3)
      .map(([wd, v]) => ({
        wd,
        avg: v.reduce((s, x) => s + x, 0) / v.length,
        weeks: v.length,
      }));
    if (avgs.length < 4) return null;
    const lowest = avgs.reduce((a, b) => (b.avg < a.avg ? b : a));
    const others = avgs.filter((a) => a.wd !== lowest.wd);
    const othersAvg = others.reduce((s, a) => s + a.avg, 0) / others.length;
    if (othersAvg <= 0 || lowest.avg > othersAvg * 0.6) return null;
    return {
      weekday: WEEKDAYS[lowest.wd],
      avg: lowest.avg,
      othersAvg,
      weeks: lowest.weeks,
    };
  }

  private async lapsedBuyers(
    ctx: BrainContext,
  ): Promise<ReadingData['lapsed']> {
    const cutoff = new Date(Date.now() - ctx.thresholds.lapsedDays * DAY);
    const rows = await this.prisma.$queryRaw<{ customer_id: string }[]>`
      SELECT o.customer_id FROM orders o JOIN customers c ON c.id = o.customer_id
      WHERE o.business_id IN (${Prisma.join(ctx.ids)}) AND o.status = 'completed' AND o.is_quotation = false AND c.opted_out = false
      GROUP BY o.customer_id HAVING COUNT(*) >= 2 AND MAX(o.created_at) < ${cutoff}
      ORDER BY o.customer_id LIMIT 2000
    `;
    const customerIds = rows.map((r) => r.customer_id);
    if (!customerIds.length)
      return { count: 0, customerIds: [], topProduct: null };
    const top = await this.prisma.$queryRaw<
      { product_id: string; name: string }[]
    >`
      SELECT oi.product_id, MAX(oi.name) AS name FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.customer_id IN (${Prisma.join(customerIds.slice(0, 500))}) AND o.status = 'completed' AND oi.product_id IS NOT NULL
      GROUP BY oi.product_id ORDER BY SUM(oi.price * oi.qty) DESC, oi.product_id LIMIT 1
    `;
    return {
      count: customerIds.length,
      customerIds,
      topProduct: top[0] ? { id: top[0].product_id, name: top[0].name } : null,
    };
  }

  private async discountBreaches(
    ctx: BrainContext,
    limitPct: number,
  ): Promise<ReadingData['discountBreaches']> {
    const orders = await this.prisma.order.findMany({
      where: {
        businessId: { in: ctx.ids },
        status: 'completed',
        isQuotation: false,
        createdAt: { gte: ctx.window.start, lt: ctx.window.end },
        discount: { gt: 0 },
      },
      select: {
        id: true,
        orderNo: true,
        discount: true,
        subtotal: true,
        businessId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });
    return orders
      .map((o) => ({
        id: o.id,
        orderNo: o.orderNo,
        businessId: o.businessId,
        at: o.createdAt,
        pct:
          Number(o.subtotal) > 0
            ? (Number(o.discount) / Number(o.subtotal)) * 100
            : 0,
      }))
      .filter((o) => o.pct > limitPct + 0.001);
  }

  private async supplierFor(
    productId: string,
  ): Promise<{ supplierId: string; unitCost: number } | null> {
    const lastPo = await this.prisma.purchaseOrderItem.findFirst({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      select: {
        unitCost: true,
        purchaseOrder: { select: { supplierId: true } },
      },
    });
    if (lastPo)
      return {
        supplierId: lastPo.purchaseOrder.supplierId,
        unitCost: Number(lastPo.unitCost),
      };
    const mv = await this.prisma.stockMovement.findFirst({
      where: { productId, kind: 'purchase', supplierId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { supplierId: true, unitCost: true },
    });
    return mv?.supplierId
      ? { supplierId: mv.supplierId, unitCost: Number(mv.unitCost ?? 0) }
      : null;
  }

  private async detect(ctx: BrainContext, x: ReadingData): Promise<Finding[]> {
    const b = ctx.business;
    const th = ctx.thresholds;
    const w = ctx.window;
    const out: Finding[] = [];
    const missing = x.missingCosts.length;

    // ── Overdue credit ────────────────────────────────────────────────
    if (x.credit.overdueAccounts.length > 0) {
      const accts = x.credit.overdueAccounts;
      const cleared = await this.metrics.clearedBefore(
        ctx.ids,
        accts.map((a) => a.customerId),
      );
      const reliable = accts.filter((a) => cleared.has(a.customerId));
      const top3 = accts.slice(0, 3);
      const top3Sum = top3.reduce((s, a) => s + a.balance, 0);
      const critical = x.credit.oldestDays >= th.overdueDays * 2;
      const growth =
        x.credit.outstandingWeekAgo !== null
          ? pctChange(x.credit.outstanding, x.credit.outstandingWeekAgo)
          : null;
      const targets = (reliable.length ? reliable : accts).map(
        (a) => a.customerId,
      );
      out.push({
        key: 'credit_overdue',
        kind: critical ? 'Critical' : 'Attention',
        phrase: `${money(b, x.credit.overdue)} of credit is overdue`,
        t: `${plural(accts.length, 'customer')} ${accts.length === 1 ? 'is' : 'are'} ${th.overdueDays}+ days overdue`,
        d: `${money(b, x.credit.overdue)} is overdue across ${plural(accts.length, 'credit account')}. ${reliable.length} of them ${reliable.length === 1 ? 'has' : 'have'} cleared a balance before, so this reads as a collection gap more than bad debt.`,
        src: 'Customer Credit',
        modules: ['Customer Credit', 'Customers', 'Orders'],
        impactLabel: 'Cash collection',
        impactValue: x.credit.overdue,
        conf: 'High',
        confWhy:
          'Every figure is a recorded ledger entry. Nothing here is estimated.',
        what: `${plural(accts.length, 'account')} ${accts.length === 1 ? 'has' : 'have'} owed money for ${th.overdueDays} days or more. The oldest is ${x.credit.oldestDays} days. ${money(b, x.credit.overdue)} in total, of which ${money(b, top3Sum)} sits with ${top3.map((a) => a.name).join(', ')}.${growth !== null ? ` Total outstanding credit is ${pct(growth)} on a week ago.` : ''}`,
        why: 'This is money already earned. It needs a conversation, not a sale.',
        evidence: [
          {
            t: `${money(b, x.credit.overdue)} across ${plural(accts.length, 'account')}`,
            d: `Credit ledger, aged from when each balance was last cleared (${th.overdueDays}+ days).`,
            link: { label: 'Open Customer Credit', href: '/credit/overdue' },
          },
          {
            t: `${reliable.length} of ${accts.length} have cleared a balance before`,
            d: 'Read from each customer’s own credit ledger history.',
            link: { label: 'Open the ledger', href: '/credit' },
          },
          {
            t: `The top ${top3.length} hold ${Math.round((top3Sum / x.credit.overdue) * 100)}% of it`,
            d: top3.map((a) => `${a.name} ${money(b, a.balance)}`).join(' · '),
            link: {
              label: 'Open the largest account',
              href: `/credit/${top3[0].customerId}`,
            },
          },
        ],
        rec: reliable.length
          ? `Send a reminder to the ${plural(reliable.length, 'account')} that ${reliable.length === 1 ? 'has' : 'have'} paid off before`
          : 'Send a reminder to the overdue accounts',
        recWhy:
          'A reminder is the least awkward first step. Larger balances are usually better handled with a call.',
        limit:
          'Expected recovery is not shown — there is no honest basis for putting a number on how much will come back.',
        who: plural(accts.length, 'account'),
        urgency: critical ? 'Today' : 'This week',
        action: {
          type: 'credit_reminders',
          label: 'Prepare reminders',
          title: `Credit reminders for ${plural(targets.length, 'account')}`,
          detail: `One reminder each through your usual channel, with the balance filled from the ledger. ${money(
            b,
            accts
              .filter((a) => targets.includes(a.customerId))
              .reduce((s, a) => s + a.balance, 0),
          )} covered.`,
          payload: { customerIds: targets },
          capability: CAPABILITIES.CREDIT_MANAGE,
        },
        link: { label: 'Open Customer Credit', href: '/credit/overdue' },
        diagnose: 'credit',
      });
    }

    // ── Stock that runs out before it is replaced ─────────────────────
    const runouts = x.stock
      .filter(
        (s) =>
          s.perDay > 0 &&
          (s.stock <= 0 ||
            (s.coverDays !== null && s.coverDays <= th.stockCoverDays)),
      )
      .sort((a, c) => (a.coverDays ?? 0) - (c.coverDays ?? 0))
      .slice(0, 3);
    for (const s of runouts) {
      const openPo = await this.prisma.purchaseOrderItem.findFirst({
        where: {
          productId: s.id,
          purchaseOrder: {
            status: { in: ['sent', 'confirmed', 'partially_received'] },
          },
        },
        select: {
          qtyOrdered: true,
          purchaseOrder: {
            select: { status: true, createdAt: true, confirmedAt: true },
          },
        },
      });
      const supplier = await this.supplierFor(s.id);
      const cover = s.coverDays ?? 0;
      const weekValue = s.perDay * 7 * s.price;
      const qty = Math.max(
        1,
        Math.ceil(s.perDay * th.stockCoverDays * 2 - Math.max(0, s.stock)),
      );
      const unitCost = s.cost > 0 ? s.cost : (supplier?.unitCost ?? 0);
      out.push({
        key: `stock_runout:${s.id}`,
        kind: s.stock <= 0 || cover <= 2 ? 'Critical' : 'Attention',
        phrase: `${s.name} is ${s.stock <= 0 ? 'out of stock' : 'close to running out'}`,
        t:
          s.stock <= 0
            ? `${s.name} is out of stock and still selling`
            : `${s.name} will run out in about ${Math.max(1, Math.round(cover))} ${Math.round(cover) === 1 ? 'day' : 'days'}`,
        d: `${plural(s.stock, 'unit')} left, selling about ${s.perDay.toFixed(1)} a day over the last 14 days.${openPo ? ` A purchase order is ${openPo.purchaseOrder.status.replace('_', ' ')}.` : ' No open purchase order includes it.'}`,
        src: 'Inventory + Orders',
        modules: ['Inventory', 'Products', 'Orders'],
        impactLabel: 'Lost sales',
        impactValue: weekValue,
        conf: 'Medium',
        confWhy:
          'The stock count is exact. The run-out day rests on a 14-day sales average, so it is medium, not high.',
        what: `Stock on hand is ${plural(s.stock, 'unit')}. The last 14 days averaged ${s.perDay.toFixed(1)} sold a day. ${openPo ? `A purchase order raised on ${day(b, openPo.purchaseOrder.createdAt)} is ${openPo.purchaseOrder.status.replace('_', ' ')}${openPo.purchaseOrder.confirmedAt ? '' : ' and not confirmed by the supplier'}.` : 'There is no open purchase order for it.'}`,
        why: `At the recent rate it sells about ${money(b, weekValue)} a week. Running dry sends those buyers elsewhere.`,
        evidence: [
          {
            t: `${plural(s.stock, 'unit')} on hand`,
            d: 'The live stock count, updated with every sale.',
            link: { label: 'Open Inventory', href: '/inventory' },
          },
          {
            t: `${s.perDay.toFixed(1)} units a day, 14-day average`,
            d: 'From completed sales over the last 14 days.',
            link: { label: 'Open Products', href: '/products' },
          },
          openPo
            ? {
                t: `Purchase order ${openPo.purchaseOrder.status.replace('_', ' ')}`,
                d: `${plural(openPo.qtyOrdered, 'unit')} ordered on ${day(b, openPo.purchaseOrder.createdAt)}.`,
                link: {
                  label: 'Open purchase orders',
                  href: '/inventory/purchases',
                },
              }
            : {
                t: 'No open purchase order',
                d: 'Nothing sent or confirmed includes this product.',
                link: {
                  label: 'Open purchase orders',
                  href: '/inventory/purchases',
                },
              },
        ],
        rec: openPo
          ? 'Chase the open purchase order'
          : `Draft a reorder for ${plural(qty, 'unit')}`,
        recWhy: openPo
          ? 'An order already exists; confirming its arrival date is faster than raising another.'
          : `Enough for about ${th.stockCoverDays * 2} days at the recent rate.`,
        limit:
          'The run-out day is an estimate from the 14-day average, not a fact. Demand could differ this week.',
        who: plural(1, 'product'),
        urgency: s.stock <= 0 || cover <= 2 ? 'Today' : 'This week',
        action: openPo
          ? null
          : {
              type: 'reorder_draft',
              label: 'Prepare a reorder',
              title: `Reorder draft for ${s.name}`,
              detail: `${plural(qty, 'unit')}${unitCost > 0 ? ` at ${money(b, unitCost)} each` : ''}. Saved as a draft purchase order — nothing is sent to the supplier.`,
              payload: {
                productId: s.id,
                businessId: s.businessId,
                qty,
                unitCost,
                supplierId: supplier?.supplierId ?? null,
              },
              capability: CAPABILITIES.PURCHASES_MANAGE,
              blockedReason: supplier
                ? undefined
                : 'No supplier is on record for this product, so a purchase order cannot be drafted. Add one in Inventory first.',
            },
        link: { label: 'Open Inventory', href: '/inventory' },
        diagnose: null,
      });
    }

    // ── Repeat customers buying less ─────────────────────────────────
    const repeatChange = pctChange(x.cur.repeatRevenue, x.prev.repeatRevenue);
    if (
      x.prev.repeatRevenue > 0 &&
      repeatChange !== null &&
      repeatChange <= -th.repeatDropPercent
    ) {
      const drops = [...x.repeatPrev.entries()]
        .map(([id, p]) => ({
          id,
          name: p.name,
          drop: p.rev - (x.repeatCur.get(id)?.rev ?? 0),
        }))
        .filter((d) => d.drop > 0)
        .sort((a, c) => c.drop - a.drop);
      const delta = x.prev.repeatRevenue - x.cur.repeatRevenue;
      const top = drops[0];
      out.push({
        key: 'repeat_drop',
        kind: 'Attention',
        phrase: 'repeat customers bought less',
        t: 'Repeat customers bought less',
        d: `Spend from customers who had bought before fell ${Math.abs(Math.round(repeatChange))}% ${w.label}. First-time buyers: ${x.cur.newBuyers} against ${x.prev.newBuyers}.`,
        src: 'Customers + Orders',
        modules: ['Customers', 'Fast Sale', 'Products', 'Marketing'],
        impactLabel: 'Revenue',
        impactValue: delta,
        conf: 'High',
        confWhy:
          'Both periods are completed, recorded sales compared like for like.',
        what: `Repeat buyer revenue was ${money(b, x.cur.repeatRevenue)} against ${money(b, x.prev.repeatRevenue)}. ${x.cur.repeatBuyers} returning buyers against ${x.prev.repeatBuyers}.`,
        why: 'Returning buyers are the cheapest revenue there is. Losing them shows up in profit later, once replacing them costs money.',
        evidence: [
          {
            t: `${money(b, delta)} less from returning buyers`,
            d: `Completed sales, ${w.label}.`,
            link: { label: 'Open Customers', href: '/customers' },
          },
          top
            ? {
                t: `${top.name} accounts for ${money(b, top.drop)} of it`,
                d: `${Math.round((top.drop / delta) * 100)}% of the fall sits in one product.`,
                link: { label: 'Open Products', href: '/products' },
              }
            : {
                t: 'Spread across products',
                d: 'No single product explains most of it.',
              },
          {
            t: x.lastCampaignAt
              ? `Last campaign went out ${day(b, x.lastCampaignAt)}`
              : 'No campaign has been sent',
            d: 'From your Campaigns list.',
            link: { label: 'Open Marketing', href: '/marketing' },
          },
        ],
        rec:
          top && top.drop / delta >= 0.4
            ? `Look at ${top.name} before assuming a customer problem`
            : 'Find out what returning buyers stopped buying',
        recWhy:
          top && top.drop / delta >= 0.4
            ? 'Most of the fall sits in one product. A stock or price change there would explain it better than the customers.'
            : 'The drop is spread out, so the product-level view is the next place to look.',
        limit: '',
        who: plural(x.prev.repeatBuyers, 'returning buyer'),
        urgency: 'This week',
        action: null,
        link: { label: 'Open Customers', href: '/customers' },
        diagnose: 'repeat',
      });
    }

    // ── One branch behind on margin ──────────────────────────────────
    const withMargin = x.branches.filter(
      (r) => r.margin !== null && r.measuredRevenue > 0,
    );
    if (withMargin.length >= 2) {
      const best = withMargin.reduce((a, c) => (c.margin! > a.margin! ? c : a));
      const worst = withMargin.reduce((a, c) =>
        c.margin! < a.margin! ? c : a,
      );
      const gap = best.margin! - worst.margin!;
      if (gap >= th.marginGapPoints) {
        const mix = BrainMetricsService.mixSimilarity(
          best.productShare,
          worst.productShare,
        );
        const worstMissing = x.missingCosts.filter(
          (m) => m.businessId === worst.businessId,
        ).length;
        const gapValue = (gap / 100) * worst.measuredRevenue;
        out.push({
          key: `margin_gap:${worst.businessId}`,
          kind: 'Attention',
          phrase: `${worst.name} is behind on margin`,
          t: `${worst.name} is behind ${best.name} on margin`,
          d: `${gap.toFixed(1)} points less gross margin over the last 30 days${mix !== null ? ` on a ${Math.round(mix)}% similar product mix` : ''}. Discounts there were ${(worst.discountPct ?? 0).toFixed(1)}% of sales against ${(best.discountPct ?? 0).toFixed(1)}%.`,
          src: 'Profit + Branches',
          modules: ['Profit & Analytics', 'Branches', 'Products'],
          impactLabel: 'Profit',
          impactValue: gapValue,
          conf: worstMissing > 0 ? 'Medium' : 'High',
          confWhy:
            worstMissing > 0
              ? `${plural(worstMissing, 'product')} sold at ${worst.name} ${worstMissing === 1 ? 'has' : 'have'} no cost price, which caps this at medium.`
              : 'Margin is from the cost recorded on every sale line.',
          what: `${worst.name} returned ${worst.margin!.toFixed(1)}% gross margin against ${best.margin!.toFixed(1)}% at ${best.name} over 30 days. Recorded discounts: ${(worst.discountPct ?? 0).toFixed(1)}% against ${(best.discountPct ?? 0).toFixed(1)}% of sales.`,
          why: `On ${worst.name}'s measured sales the gap is about ${money(b, gapValue)} of gross profit over the month.`,
          evidence: [
            {
              t: `${worst.margin!.toFixed(1)}% vs ${best.margin!.toFixed(1)}% gross margin`,
              d: 'Last 30 days, from the cost recorded on each sale line.',
              link: { label: 'Open Profit', href: '/profit' },
            },
            {
              t: `Discounts ${(worst.discountPct ?? 0).toFixed(1)}% vs ${(best.discountPct ?? 0).toFixed(1)}% of sales`,
              d: 'Discounts recorded at the till.',
              link: { label: 'Open Orders', href: '/orders' },
            },
            mix !== null
              ? {
                  t: `Product mix is ${Math.round(mix)}% similar`,
                  d:
                    mix >= 80
                      ? 'So mix does not explain the gap.'
                      : 'Mix differs enough to explain part of the gap.',
                }
              : {
                  t: 'Product mix not comparable',
                  d: 'One branch has no product-level sales.',
                },
          ],
          rec:
            (worst.discountPct ?? 0) - (best.discountPct ?? 0) >= 1
              ? `Check who is authorising discounts at ${worst.name}`
              : `Compare ${worst.name}'s prices and costs product by product`,
          recWhy:
            (worst.discountPct ?? 0) - (best.discountPct ?? 0) >= 1
              ? 'Discounting is the difference a person controls directly.'
              : 'Discounts are similar, so the gap is in prices or costs.',
          limit:
            worstMissing > 0
              ? `${plural(worstMissing, 'product')} at ${worst.name} ${worstMissing === 1 ? 'is' : 'are'} missing a cost price, so the true gap could be wider or narrower. Fix those costs before acting on the money figure.`
              : '',
          who: worst.name,
          urgency: 'This week',
          action: null,
          link: { label: 'Open Branches', href: '/branches' },
          diagnose: 'margin',
        });
      }
    }

    // ── Discounts above your own limit ───────────────────────────────
    if (x.discountBreaches.length && th.maxDiscountPercent !== null) {
      const worst = x.discountBreaches.reduce((a, c) =>
        c.pct > a.pct ? c : a,
      );
      out.push({
        key: 'discount_policy',
        kind: 'Attention',
        phrase: 'discounts went above your limit',
        t: `${plural(x.discountBreaches.length, 'sale')} went out above your ${th.maxDiscountPercent}% discount limit`,
        d: `The largest was ${worst.pct.toFixed(0)}% on order #${worst.orderNo}. Your limit is set in Settings → Sales & POS.`,
        src: 'Fast Sale',
        modules: ['Fast Sale', 'Orders', 'Staff'],
        impactLabel: 'Margin',
        impactValue: null,
        conf: 'High',
        confWhy: 'Read from the discount recorded on each completed sale.',
        what: `${plural(x.discountBreaches.length, 'completed sale')} ${w.label.replace('vs', 'in the period compared')} had a discount above ${th.maxDiscountPercent}% of the subtotal.`,
        why: 'A discount above your own limit means someone had the right to override it — worth knowing who.',
        evidence: x.discountBreaches.slice(0, 3).map((o) => ({
          t: `Order #${o.orderNo}: ${o.pct.toFixed(0)}% off`,
          d: `${day(b, o.at)}.`,
          link: { label: 'Open Orders', href: '/orders' },
        })),
        rec: 'Check who approved the overrides',
        recWhy:
          'Only people with the discount-override right can go past your limit.',
        limit: '',
        who: plural(x.discountBreaches.length, 'sale'),
        urgency: 'This week',
        action: null,
        link: { label: 'Open Orders', href: '/orders' },
        diagnose: 'profit',
      });
    }

    // ── Products sold with no cost price ─────────────────────────────
    if (missing > 0) {
      out.push({
        key: 'missing_costs',
        kind: 'Attention',
        phrase: `${plural(missing, 'product')} ${missing === 1 ? 'has' : 'have'} no cost price`,
        t: `${plural(missing, 'product')} sold this month ${missing === 1 ? 'has' : 'have'} no cost price`,
        d: 'They are left out of margin figures rather than counted as pure profit, so every margin number here is on the rest of the sales.',
        src: 'Products',
        modules: ['Products', 'Profit & Analytics'],
        impactLabel: 'Data quality',
        impactValue: null,
        conf: 'High',
        confWhy: 'A cost price of zero is recorded on the product itself.',
        what: `${x.missingCosts
          .slice(0, 5)
          .map((m) => m.name)
          .join(
            ', ',
          )}${missing > 5 ? ` and ${missing - 5} more` : ''} sold in the last 30 days with no cost price.`,
        why: 'Until costs are entered, margin and profit readings cannot be trusted for those products.',
        evidence: x.missingCosts.slice(0, 3).map((m) => ({
          t: m.name,
          d: 'Cost price is 0.',
          link: { label: 'Open Products', href: '/products' },
        })),
        rec: 'Enter the missing cost prices',
        recWhy:
          'It is the one fix that makes every margin reading trustworthy.',
        limit: '',
        who: plural(missing, 'product'),
        urgency: 'This week',
        action: null,
        link: { label: 'Open Products', href: '/products' },
        diagnose: null,
      });
    }

    // ── Quietest trading day (opportunity) ───────────────────────────
    if (x.quiet) {
      const q = x.quiet;
      out.push({
        key: `quiet_day:${q.weekday}`,
        kind: 'Opportunity',
        phrase: `${q.weekday}s are quiet`,
        t: `${q.weekday}s are your quietest trading day`,
        d: `${q.weekday}s averaged ${money(b, q.avg)} over the last ${q.weeks} weeks against ${money(b, q.othersAvg)} on other days.`,
        src: 'Orders',
        modules: ['Fast Sale', 'Marketing', 'Customers'],
        impactLabel: 'Revenue',
        impactValue: null,
        conf: q.weeks >= 5 ? 'High' : 'Medium',
        confWhy: `${q.weeks} weeks of completed sales on that day.`,
        what: `Across the last five weeks, ${q.weekday} averaged ${Math.round((q.avg / q.othersAvg) * 100)}% of an ordinary day's revenue.`,
        why: 'Your costs are already paid on a quiet day. Anything that brings people in then is close to pure margin.',
        evidence: [
          {
            t: `${money(b, q.avg)} average on ${q.weekday}s`,
            d: `${q.weeks} ${q.weekday}s of completed sales.`,
            link: { label: 'Open Profit by time', href: '/profit' },
          },
          {
            t: `${money(b, q.othersAvg)} on other days`,
            d: 'The average of every other weekday in the same weeks.',
          },
        ],
        rec: `Send a ${q.weekday} offer to your customers`,
        recWhy:
          'An offer aimed at your slowest day moves demand without discounting your busy days.',
        limit:
          'No revenue figure is attached — there is no past offer on this day to base one on.',
        who: 'Your customers',
        urgency: 'This week',
        action: {
          type: 'quiet_offer',
          label: 'Prepare the offer',
          title: `${q.weekday} offer to your customers`,
          detail:
            'An offer message drafted for your slowest day. Nothing is sent until it is approved and run.',
          payload: { weekday: q.weekday, segment: 'all' },
          capability: CAPABILITIES.BRAIN_APPROVE,
        },
        link: null,
        diagnose: 'revenue',
      });
    }

    // ── Accepted quotations never turned into orders ─────────────────
    if (x.quotations.length) {
      const q = x.quotations[0];
      out.push({
        key: `quotation:${q.id}`,
        kind: 'Opportunity',
        phrase: `quotation #${q.orderNo} is still unconverted`,
        t: `Convert quotation #${q.orderNo} before it goes cold`,
        d: `${money(b, q.total)}${q.customer ? ` for ${q.customer}` : ''}, accepted and never turned into an order.${x.quotations.length > 1 ? ` ${x.quotations.length - 1} more accepted quotations are also waiting.` : ''}`,
        src: 'Orders + Customers',
        modules: ['Orders', 'Customers'],
        impactLabel: `${money(b, q.total)} order value`,
        impactValue: q.total,
        conf: 'High',
        confWhy: 'The quotation and its acceptance are recorded.',
        what: `Quotation #${q.orderNo} is marked accepted and has not been converted into an order.`,
        why: 'The customer already said yes. It only needs turning into an order.',
        evidence: x.quotations.slice(0, 3).map((o) => ({
          t: `#${o.orderNo} · ${money(b, o.total)}`,
          d: `${o.customer ?? 'No customer'} · last updated ${day(b, o.acceptedAt)}.`,
          link: { label: 'Open quotations', href: '/orders/quotations' },
        })),
        rec: 'Open the quotation and convert it',
        recWhy: 'Conversion creates the real order and stock movements.',
        limit: '',
        who: q.customer ?? 'One customer',
        urgency: 'This week',
        action: null,
        link: { label: 'Open quotations', href: '/orders/quotations' },
        diagnose: null,
      });
    }

    // ── Past buyers who have gone quiet ──────────────────────────────
    if (x.lapsed.count > 0) {
      const top = x.lapsed.topProduct;
      const topStock = top ? x.stock.find((s) => s.id === top.id) : undefined;
      const blocked =
        topStock && topStock.stock <= topStock.threshold
          ? `Held back on purpose — ${top!.name} is down to ${plural(topStock.stock, 'unit')}. Messaging past buyers before restock invites disappointment.`
          : undefined;
      out.push({
        key: 'lapsed_buyers',
        kind: 'Opportunity',
        phrase: `${plural(x.lapsed.count, 'past buyer')} have gone quiet`,
        t: `${plural(x.lapsed.count, 'regular customer')} ${x.lapsed.count === 1 ? 'has' : 'have'} gone quiet`,
        d: `Each bought at least twice and nothing in the last ${th.lapsedDays} days.${top ? ` The product they bought most is ${top.name}.` : ''}`,
        src: 'Customers + Orders',
        modules: ['Customers', 'Marketing'],
        impactLabel: 'Not estimated',
        impactValue: null,
        conf: 'High',
        confWhy:
          'Read from each customer’s completed orders; opted-out customers are excluded.',
        what: `${plural(x.lapsed.count, 'customer')} with two or more past orders have not bought for ${th.lapsedDays}+ days and have not opted out of messages.`,
        why: 'People who already bought twice are far easier to bring back than new customers are to find.',
        evidence: [
          {
            t: plural(x.lapsed.count, 'customer'),
            d: `2+ completed orders, none in ${th.lapsedDays} days.`,
            link: { label: 'Open Customers', href: '/customers' },
          },
          top
            ? {
                t: `Most bought: ${top.name}`,
                d: topStock
                  ? `${plural(topStock.stock, 'unit')} in stock now.`
                  : 'Not a stocked product.',
              }
            : {
                t: 'No single favourite product',
                d: 'Their purchases are spread out.',
              },
        ],
        rec: 'Send a follow-up to them',
        recWhy:
          'A personal follow-up to regulars is the cheapest win-back there is.',
        limit:
          blocked ??
          'No return figure is attached — there is nothing to base it on.',
        who: plural(x.lapsed.count, 'customer'),
        urgency: blocked ? 'After restock' : 'This week',
        action: {
          type: 'lapsed_followup',
          label: 'Prepare the follow-up',
          title: `Follow-up to ${plural(x.lapsed.count, 'past buyer')}`,
          detail: `One message each to customers who bought twice or more and nothing in ${th.lapsedDays} days. Opt-outs and your message limits still apply.`,
          payload: {
            customerIds: x.lapsed.customerIds.slice(0, 500),
            body: `Hi from ${b.name} — it has been a while and we would love to see you again.`,
          },
          capability: CAPABILITIES.BRAIN_APPROVE,
          blockedReason: blocked,
        },
        link: { label: 'Open Customers', href: '/customers' },
        diagnose: null,
      });
    }

    // ── Deliveries failing more often ────────────────────────────────
    const doneC = x.cur.deliveriesDone + x.cur.deliveriesFailed;
    const doneP = x.prev.deliveriesDone + x.prev.deliveriesFailed;
    if (
      doneC >= 5 &&
      x.cur.deliveriesFailed > x.prev.deliveriesFailed &&
      x.cur.deliveriesFailed / doneC >= 0.1
    ) {
      out.push({
        key: 'delivery_failures',
        kind: 'Attention',
        phrase: 'more deliveries failed',
        t: `${plural(x.cur.deliveriesFailed, 'delivery')} failed, up from ${x.prev.deliveriesFailed}`,
        d: `${Math.round((x.cur.deliveriesDone / doneC) * 100)}% first-time success ${w.label.replace('vs', 'against')} ${doneP ? `${Math.round((x.prev.deliveriesDone / doneP) * 100)}%` : 'no deliveries'}.`,
        src: 'Delivery',
        modules: ['Delivery', 'Orders'],
        impactLabel: 'Customer experience',
        impactValue: null,
        conf: 'High',
        confWhy: 'Each delivery’s final status is recorded.',
        what: `${x.cur.deliveriesFailed} of ${doneC} deliveries ended as failed.`,
        why: 'A failed delivery costs a second trip and often a refund.',
        evidence: [
          {
            t: `${x.cur.deliveriesFailed} failed of ${doneC}`,
            d: 'Delivery records with a final status.',
            link: { label: 'Open Exceptions', href: '/deliveries/exceptions' },
          },
        ],
        rec: 'Look at the failure reasons',
        recWhy: 'Reasons are recorded on each failed delivery.',
        limit: '',
        who: plural(x.cur.deliveriesFailed, 'delivery'),
        urgency: 'This week',
        action: null,
        link: { label: 'Open Exceptions', href: '/deliveries/exceptions' },
        diagnose: null,
      });
    }

    // ── Low reviews ──────────────────────────────────────────────────
    if (x.cur.lowReviews > 0) {
      out.push({
        key: 'low_reviews',
        kind: 'Attention',
        phrase: `${plural(x.cur.lowReviews, 'low review')} came in`,
        t: `${plural(x.cur.lowReviews, 'review')} of two stars or less`,
        d: `Out of ${plural(x.cur.reviewCount, 'review')} in the period.`,
        src: 'Reviews',
        modules: ['Reviews'],
        impactLabel: 'Reputation',
        impactValue: null,
        conf: 'High',
        confWhy: 'Star ratings are recorded as given.',
        what: `${plural(x.cur.lowReviews, 'customer')} left one or two stars.`,
        why: 'A quick, personal reply to a low review is the thing most likely to change it.',
        evidence: [
          {
            t: `${x.cur.lowReviews} of ${x.cur.reviewCount}`,
            d: 'Private feedback and connected review sites.',
            link: { label: 'Open Reviews', href: '/reviews' },
          },
        ],
        rec: 'Reply to them today',
        recWhy: 'Replies are drafted in Reviews for a person to send.',
        limit: '',
        who: plural(x.cur.lowReviews, 'customer'),
        urgency: 'Today',
        action: null,
        link: { label: 'Open Reviews', href: '/reviews' },
        diagnose: null,
      });
    }

    // ── Going the right way ──────────────────────────────────────────
    const refundRateC = x.cur.orders ? x.cur.refundCount / x.cur.orders : null;
    const refundRateP = x.prev.orders
      ? x.prev.refundCount / x.prev.orders
      : null;
    if (
      refundRateC !== null &&
      refundRateP !== null &&
      refundRateP > 0 &&
      refundRateC < refundRateP
    ) {
      out.push(
        this.improving(
          'refunds_down',
          'Refund rate fell',
          `${(refundRateC * 100).toFixed(1)}% of orders against ${(refundRateP * 100).toFixed(1)}% ${w.label.replace('vs ', 'in ')}.`,
          'Orders',
        ),
      );
    }
    if (doneC >= 5 && doneP >= 5) {
      const sC = x.cur.deliveriesDone / doneC;
      const sP = x.prev.deliveriesDone / doneP;
      if (sC - sP >= 0.02)
        out.push(
          this.improving(
            'delivery_up',
            `Delivery success up ${Math.round((sC - sP) * 100)} points`,
            `${Math.round(sC * 100)}% of deliveries succeeded. Failed: ${x.cur.deliveriesFailed} against ${x.prev.deliveriesFailed}.`,
            'Delivery',
          ),
        );
    }
    if (x.cur.reviewCount >= 3 && x.cur.reviewSum / x.cur.reviewCount >= 4) {
      out.push(
        this.improving(
          'reviews_good',
          `Reviews averaged ${(x.cur.reviewSum / x.cur.reviewCount).toFixed(1)} stars`,
          `${plural(x.cur.reviewCount, 'review')} in the period${x.cur.lowReviews ? `, ${x.cur.lowReviews} below three stars` : ', none below three stars'}.`,
          'Reviews',
        ),
      );
    }
    const fr = median(x.cur.inboxFirstReplies);
    if (fr !== null && x.cur.inboxFirstReplies.length >= 3) {
      const target = await this.prisma.inboxSettings.findUnique({
        where: { businessId: ctx.callerBusinessId },
        select: { firstReplyTargetMin: true },
      });
      const t = target?.firstReplyTargetMin ?? 15;
      if (fr <= t)
        out.push(
          this.improving(
            'inbox_fast',
            `Inbox first reply is ${Math.round(fr)} min`,
            `Median over ${plural(x.cur.inboxFirstReplies.length, 'conversation')}, inside your ${t}-minute target.`,
            'Unified Inbox',
          ),
        );
    }
    const revChange = pctChange(x.cur.revenue, x.prev.revenue);
    if (revChange !== null && revChange >= th.notableChangePercent) {
      out.push(
        this.improving(
          'revenue_up',
          `Revenue up ${Math.round(revChange)}%`,
          `${money(b, x.cur.revenue)} against ${money(b, x.prev.revenue)} ${w.label.replace('vs ', 'in ')}.`,
          'Orders',
        ),
      );
    }

    // Ordered by what it costs, not when it happened: money first, then severity.
    const rank: Record<string, number> = {
      Critical: 0,
      Attention: 1,
      Opportunity: 2,
      Improving: 3,
    };
    return out.sort(
      (a, c) =>
        rank[a.kind] - rank[c.kind] ||
        (c.impactValue ?? -1) - (a.impactValue ?? -1),
    );
  }

  private improving(key: string, t: string, d: string, src: string): Finding {
    return {
      key,
      kind: 'Improving',
      phrase: t.toLowerCase(),
      t,
      d,
      src,
      modules: [src],
      impactLabel: '',
      impactValue: null,
      conf: 'High',
      confWhy: 'Recorded figures, both periods.',
      what: d,
      why: '',
      evidence: [],
      rec: '',
      recWhy: '',
      limit: '',
      who: '',
      urgency: '',
      action: null,
      link: null,
      diagnose: null,
    };
  }
}
