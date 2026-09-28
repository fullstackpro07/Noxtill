import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BrainDetectorsService, ReadingData } from './brain-detectors.service';
import { BrainMetricsService, pctChange } from './brain-metrics.service';
import { BrainContext, DiagnoseTopic } from './brain.types';
import { day, money, pct, plural } from './brain-context.service';

export type Tone = 'bad' | 'warn' | 'good' | 'neutral';
export interface Node {
  n: string;
  d: string;
  v: string;
  tone: Tone;
  level: number;
  link?: { label: string; href: string };
}
export interface Step {
  n: string;
  r: string;
  done: boolean;
}

const TOPIC_WORDS: [DiagnoseTopic, string[]][] = [
  ['margin', ['margin', 'branch', 'behind', 'dha', 'gulberg']],
  [
    'credit',
    ['credit', 'overdue', 'owe', 'khata', 'collect', 'debt', 'ageing', 'aging'],
  ],
  [
    'repeat',
    [
      'repeat',
      'returning',
      'regular',
      'loyal',
      'come back',
      'customers buy less',
      'repeat customers',
    ],
  ],
  ['profit', ['profit', 'margin fell', 'losing money', 'cost', 'discount']],
  ['revenue', ['revenue', 'sales', 'turnover', 'income', 'selling']],
];

export function topicFor(question: string): DiagnoseTopic | null {
  const q = question.toLowerCase();
  for (const [topic, words] of TOPIC_WORDS)
    if (words.some((w) => q.includes(w))) return topic;
  return null;
}

/**
 * "Ask why". Breaks one figure into the recorded figures behind it and splits the change between
 * them arithmetically — the split is the working, not an opinion. Explanations the records can
 * check are checked; ones they cannot are listed as not checked, never as ruled out.
 */
@Injectable()
export class BrainCauseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly detectors: BrainDetectorsService,
  ) {}

  async investigate(ctx: BrainContext, topic: DiagnoseTopic, question: string) {
    const x = await this.detectors.read(ctx);
    const b = ctx.business;
    const period = `${day(b, ctx.window.start)} – ${day(b, new Date(ctx.window.end.getTime() - 1))}`;
    const base = {
      topic,
      question,
      period,
      branches: ctx.scopeLabel,
      compare: ctx.window.label,
      multiBranch: x.branches.length >= 2,
      missingCosts: x.missingCosts.length,
    };
    if (x.cur.orders === 0 && x.prev.orders === 0) {
      return {
        ...base,
        empty: true,
        headline: 'There are no completed sales in either period',
        body: 'Nothing to investigate until sales are recorded.',
        tree: [],
        reading: null,
        steps: [],
      };
    }
    const r =
      topic === 'profit'
        ? await this.profit(ctx, x)
        : topic === 'revenue'
          ? await this.revenue(ctx, x)
          : topic === 'repeat'
            ? this.repeat(ctx, x)
            : topic === 'credit'
              ? await this.credit(ctx, x)
              : this.margin(ctx, x);
    return { ...base, empty: false, ...r };
  }

  private confidence(x: ReadingData) {
    const share =
      x.cur.revenue > 0 ? x.cur.unmeasuredRevenue / x.cur.revenue : 0;
    if (share < 0.05) return { conf: 'High', caveat: '' };
    return {
      conf: share < 0.2 ? 'Medium' : 'Low',
      caveat: `Confidence is ${share < 0.2 ? 'medium' : 'low'}, not high. ${plural(x.missingCosts.length, 'product')} sold without a cost price (${Math.round(share * 100)}% of sales), so the true margin could be higher or lower than shown.`,
    };
  }

  private share(parts: { t: string; v: number }[]) {
    const neg = parts.filter((p) => p.v < 0);
    const pool = neg.length ? neg : parts.filter((p) => p.v > 0);
    const total = pool.reduce((s, p) => s + Math.abs(p.v), 0) || 1;
    const words = (f: number) =>
      f >= 0.9
        ? 'nearly all of it'
        : f >= 0.6
          ? 'about two thirds'
          : f >= 0.45
            ? 'about half'
            : f >= 0.3
              ? 'about a third'
              : f >= 0.2
                ? 'about a quarter'
                : 'a smaller part';
    return pool
      .sort((a, c) => Math.abs(c.v) - Math.abs(a.v))
      .map((p) => ({
        t: p.t,
        share: `${words(Math.abs(p.v) / total)} (${Math.round((Math.abs(p.v) / total) * 100)}%)`,
        v: p.v,
      }));
  }

  private async productShares(ctx: BrainContext, start: Date, end: Date) {
    const rows = await this.prisma.$queryRaw<
      { product_id: string; name: string; rev: unknown }[]
    >`
      SELECT oi.product_id, MAX(oi.name) AS name, SUM(oi.price * oi.qty) AS rev FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.business_id IN (${Prisma.join(ctx.ids)}) AND o.status = 'completed' AND o.is_quotation = false
        AND o.created_at >= ${start} AND o.created_at < ${end} AND oi.product_id IS NOT NULL
      GROUP BY oi.product_id ORDER BY oi.product_id
    `;
    const total = rows.reduce((s, r) => s + Number(r.rev), 0);
    return {
      total,
      rows: rows.map((r) => ({
        id: r.product_id,
        name: r.name,
        rev: Number(r.rev),
      })),
      share: new Map(
        rows.map((r) => [r.product_id, total ? Number(r.rev) / total : 0]),
      ),
    };
  }

  private async purchaseCostRises(ctx: BrainContext) {
    const rows = await this.prisma.$queryRaw<
      { product_id: string; name: string; cur: unknown; prev: unknown }[]
    >`
      SELECT m.product_id, MAX(p.name) AS name,
        AVG(CASE WHEN m.created_at >= ${ctx.window.start} THEN m.unit_cost END) AS cur,
        AVG(CASE WHEN m.created_at < ${ctx.window.start} THEN m.unit_cost END) AS prev
      FROM stock_movements m JOIN products p ON p.id = m.product_id
      WHERE m.business_id IN (${Prisma.join(ctx.ids)}) AND m.kind = 'purchase' AND m.unit_cost IS NOT NULL
        AND m.created_at >= ${ctx.window.prevStart} AND m.created_at < ${ctx.window.end}
      GROUP BY m.product_id ORDER BY m.product_id
    `;
    const compared = rows.filter((r) => r.cur !== null && r.prev !== null);
    return {
      compared: compared.length,
      rose: compared
        .filter((r) => Number(r.cur) > Number(r.prev) * 1.02)
        .map((r) => r.name),
    };
  }

  private async profit(ctx: BrainContext, x: ReadingData) {
    const b = ctx.business;
    const { cur: c, prev: p } = x;
    const gpCh = pctChange(c.grossProfit, p.grossProfit);
    const revCh = pctChange(c.revenue, p.revenue);
    const mP = p.revenue ? p.grossProfit / p.revenue : 0;
    const mC = c.revenue ? c.grossProfit / c.revenue : 0;
    const volumeEffect = (c.revenue - p.revenue) * mP;
    const dC = c.subtotal ? c.discounts / c.subtotal : 0;
    const dP = p.subtotal ? p.discounts / p.subtotal : 0;
    const discountEffect = -(dC - dP) * c.subtotal;
    const rateEffect = c.revenue * (mC - mP);
    const costEffect = rateEffect - discountEffect;
    const parts = this.share([
      { t: 'Change in how much was sold (revenue)', v: volumeEffect },
      { t: 'Change in discounts given', v: discountEffect },
      { t: 'Change in cost per sale (prices, costs, mix)', v: costEffect },
    ]);
    const [costRise, mixCur, mixPrev] = await Promise.all([
      this.purchaseCostRises(ctx),
      this.productShares(ctx, ctx.window.start, ctx.window.end),
      this.productShares(ctx, ctx.window.prevStart, ctx.window.prevEnd),
    ]);
    const mix = BrainMetricsService.mixSimilarity(mixCur.share, mixPrev.share);
    const topDiscount = x.branches
      .filter((r) => r.discounts > 0)
      .sort((a, c2) => c2.discounts - a.discounts)[0];
    const totalBranchDiscount = x.branches.reduce((s, r) => s + r.discounts, 0);
    const conf = this.confidence(x);
    const fell = c.grossProfit < p.grossProfit;
    const tree: Node[] = [
      {
        n: 'Gross profit',
        d: `${money(b, c.grossProfit)} against ${money(b, p.grossProfit)}`,
        v: pct(gpCh),
        tone: fell ? 'bad' : 'good',
        level: 0,
        link: { label: 'Open Profit', href: '/profit' },
      },
      {
        n: 'Revenue',
        d: `${money(b, c.revenue, true)} against ${money(b, p.revenue, true)}`,
        v: pct(revCh),
        tone: (revCh ?? 0) < 0 ? 'warn' : 'good',
        level: 1,
      },
      {
        n: 'Cost of goods',
        d: `${money(b, c.cogs)} against ${money(b, p.cogs)}${c.unmeasuredRevenue > 0 ? ` — ${money(b, c.unmeasuredRevenue)} of sales have no cost recorded, so partly unmeasured` : ''}`,
        v: pct(pctChange(c.cogs, p.cogs)),
        tone: 'neutral',
        level: 1,
      },
      {
        n: 'Discounts given',
        d: `${money(b, c.discounts)} against ${money(b, p.discounts)}`,
        v: pct(pctChange(c.discounts, p.discounts), 0),
        tone: c.discounts > p.discounts ? 'bad' : 'good',
        level: 1,
        link: { label: 'Open Orders', href: '/orders' },
      },
    ];
    if (topDiscount && totalBranchDiscount > 0 && x.branches.length >= 2) {
      tree.push({
        n: topDiscount.name,
        d: `${money(b, topDiscount.discounts)} of the last 30 days’ discounts sit at this branch`,
        v: `${Math.round((topDiscount.discounts / totalBranchDiscount) * 100)}%`,
        tone: 'bad',
        level: 2,
      });
    }
    tree.push({
      n: 'Refunds',
      d: `${money(b, c.refunds)} against ${money(b, p.refunds)} — shown for context; refunds are not in gross profit`,
      v: pct(pctChange(c.refunds, p.refunds), 0),
      tone: c.refunds <= p.refunds ? 'good' : 'warn',
      level: 1,
    });
    tree.push({
      n: 'Returning-buyer spend',
      d: `${money(b, c.repeatRevenue)} against ${money(b, p.repeatRevenue)}`,
      v: pct(pctChange(c.repeatRevenue, p.repeatRevenue), 0),
      tone: c.repeatRevenue < p.repeatRevenue ? 'warn' : 'good',
      level: 1,
    });
    const main = parts[0];
    const mainText = main.t.startsWith('Change in discounts')
      ? {
          t: 'Discounting',
          d: `Discounts were ${(dC * 100).toFixed(1)}% of sales against ${(dP * 100).toFixed(1)}%.${topDiscount && x.branches.length >= 2 ? ` ${topDiscount.name} gave the most over the last 30 days.` : ''}`,
        }
      : main.t.startsWith('Change in how much')
        ? {
            t: fell ? 'Less was sold' : 'More was sold',
            d: `Revenue moved ${pct(revCh)} at roughly the same margin, which carries profit with it.`,
          }
        : {
            t: 'Cost per sale changed',
            d: `Gross margin moved from ${(mP * 100).toFixed(1)}% to ${(mC * 100).toFixed(1)}% beyond what discounts explain — prices, costs or the product mix.`,
          };
    return {
      headline: `Gross profit ${fell ? 'fell' : 'rose'} ${Math.abs(Math.round((gpCh ?? 0) * 10) / 10)}% while revenue ${(revCh ?? 0) < 0 ? 'fell' : 'rose'} ${Math.abs(Math.round((revCh ?? 0) * 10) / 10)}%`,
      body: `${money(b, c.grossProfit)} against ${money(b, p.grossProfit)} ${ctx.window.label}.${revCh !== null && gpCh !== null && Math.abs(revCh) < Math.abs(gpCh) / 2 ? ' Because revenue barely moved, the change is on the cost side, not the sales side.' : ''}`,
      tree,
      reading: {
        mainLabel: fell ? 'Most likely main cause' : 'Main driver',
        main: {
          t: mainText.t,
          d: `${mainText.d} That accounts for ${main.share} of the ${fell ? 'fall' : 'rise'}.`,
        },
        contrib: parts.slice(1).map((pp) => ({ t: pp.t, share: pp.share })),
        alts: [
          costRise.compared === 0
            ? {
                t: 'Supplier prices rose',
                d: 'Not checked — no product has purchase costs recorded in both periods.',
              }
            : costRise.rose.length
              ? {
                  t: 'Supplier prices rose',
                  d: `Partly true: ${costRise.rose.slice(0, 3).join(', ')} cost more to buy than in the previous period.`,
                }
              : {
                  t: 'Supplier prices rose',
                  d: `Checked and ruled out. None of the ${plural(costRise.compared, 'product')} bought in both periods cost more.`,
                },
          mix === null
            ? {
                t: 'Product mix shifted',
                d: 'Not checked — not enough product-level sales in both periods.',
              }
            : {
                t: 'Product mix shifted',
                d:
                  mix >= 85
                    ? `Ruled out. The product mix is ${Math.round(mix)}% the same as the previous period.`
                    : `Possible: the product mix is only ${Math.round(mix)}% the same as the previous period.`,
              },
          {
            t: 'Staff commission changed',
            d: 'Cannot explain it — commission is paid through payroll, not counted in gross profit.',
          },
        ],
        caveat: conf.caveat,
        conf: conf.conf,
      },
      steps: [
        {
          n: 'Read completed sales for both periods',
          r: plural(c.orders + p.orders, 'record'),
          done: true,
        },
        {
          n: 'Compared the cost recorded on each sale line',
          r: x.missingCosts.length
            ? `${plural(x.missingCosts.length, 'gap')} found`
            : 'no gaps',
          done: x.missingCosts.length === 0,
        },
        {
          n: 'Checked discounts',
          r: `${(dC * 100).toFixed(1)}% vs ${(dP * 100).toFixed(1)}%`,
          done: true,
        },
        {
          n: 'Checked purchase prices',
          r: costRise.compared
            ? `${plural(costRise.compared, 'product')} compared`
            : 'no data',
          done: costRise.compared > 0,
        },
        {
          n: 'Checked returning buyers',
          r: pct(pctChange(c.repeatRevenue, p.repeatRevenue), 0),
          done: true,
        },
        {
          n: 'Checked marketing attribution',
          r: 'not measurable',
          done: false,
        },
      ] as Step[],
    };
  }

  private async revenue(ctx: BrainContext, x: ReadingData) {
    const b = ctx.business;
    const { cur: c, prev: p } = x;
    const aovC = c.orders ? c.revenue / c.orders : 0;
    const aovP = p.orders ? p.revenue / p.orders : 0;
    const countEffect = (c.orders - p.orders) * aovP;
    const aovEffect = c.orders * (aovC - aovP);
    const [mixCur, mixPrev] = await Promise.all([
      this.productShares(ctx, ctx.window.start, ctx.window.end),
      this.productShares(ctx, ctx.window.prevStart, ctx.window.prevEnd),
    ]);
    const deltas = [
      ...new Set([
        ...mixCur.rows.map((r) => r.id),
        ...mixPrev.rows.map((r) => r.id),
      ]),
    ]
      .map((id) => ({
        id,
        name:
          mixCur.rows.find((r) => r.id === id)?.name ??
          mixPrev.rows.find((r) => r.id === id)?.name ??
          '',
        d:
          (mixCur.rows.find((r) => r.id === id)?.rev ?? 0) -
          (mixPrev.rows.find((r) => r.id === id)?.rev ?? 0),
      }))
      .sort((a, c2) => Math.abs(c2.d) - Math.abs(a.d));
    const revCh = pctChange(c.revenue, p.revenue);
    const fell = c.revenue < p.revenue;
    const parts = this.share([
      { t: 'Fewer or more orders', v: countEffect },
      { t: 'Smaller or larger orders', v: aovEffect },
    ]);
    const tree: Node[] = [
      {
        n: 'Revenue',
        d: `${money(b, c.revenue)} against ${money(b, p.revenue)}`,
        v: pct(revCh),
        tone: fell ? 'bad' : 'good',
        level: 0,
      },
      {
        n: 'Orders',
        d: `${c.orders} against ${p.orders}`,
        v: pct(pctChange(c.orders, p.orders), 0),
        tone: c.orders < p.orders ? 'warn' : 'good',
        level: 1,
      },
      {
        n: 'Average order',
        d: `${money(b, aovC)} against ${money(b, aovP)}`,
        v: pct(pctChange(aovC, aovP), 0),
        tone: aovC < aovP ? 'warn' : 'good',
        level: 1,
      },
      {
        n: 'Returning buyers',
        d: `${money(b, c.repeatRevenue)} against ${money(b, p.repeatRevenue)}`,
        v: pct(pctChange(c.repeatRevenue, p.repeatRevenue), 0),
        tone: c.repeatRevenue < p.repeatRevenue ? 'warn' : 'good',
        level: 1,
      },
      {
        n: 'First-time buyers',
        d: `${money(b, c.newRevenue)} from ${c.newBuyers} against ${money(b, p.newRevenue)} from ${p.newBuyers}`,
        v: pct(pctChange(c.newRevenue, p.newRevenue), 0),
        tone: c.newRevenue < p.newRevenue ? 'warn' : 'good',
        level: 1,
      },
      ...deltas.slice(0, 3).map((d): Node => ({
        n: d.name,
        d: 'Product revenue change between the periods',
        v: `${d.d >= 0 ? '+' : '-'}${money(b, Math.abs(d.d))}`,
        tone: d.d < 0 ? 'bad' : 'good',
        level: 2,
      })),
    ];
    const top = deltas[0];
    return {
      headline: `Revenue ${fell ? 'fell' : 'rose'} ${Math.abs(Math.round((revCh ?? 0) * 10) / 10)}%`,
      body: `${money(b, c.revenue)} against ${money(b, p.revenue)} ${ctx.window.label}.`,
      tree,
      reading: {
        mainLabel: fell ? 'Most likely main cause' : 'Main driver',
        main: {
          t: parts[0].t,
          d: `${parts[0].t.startsWith('Fewer') ? `${c.orders} orders against ${p.orders}` : `Average order ${money(b, aovC)} against ${money(b, aovP)}`} — ${parts[0].share} of the change.${top ? ` The single largest product move was ${top.name} (${top.d >= 0 ? '+' : '-'}${money(b, Math.abs(top.d))}).` : ''}`,
        },
        contrib: parts.slice(1).map((pp) => ({ t: pp.t, share: pp.share })),
        alts: [
          {
            t: 'Marketing',
            d: 'Not checked — Noxtill does not link sales to campaigns.',
          },
        ],
        caveat: '',
        conf: 'High',
      },
      steps: [
        {
          n: 'Read completed sales for both periods',
          r: plural(c.orders + p.orders, 'record'),
          done: true,
        },
        {
          n: 'Split by number of orders and order size',
          r: 'done',
          done: true,
        },
        {
          n: 'Split by returning and first-time buyers',
          r: 'done',
          done: true,
        },
        {
          n: 'Compared revenue product by product',
          r: plural(deltas.length, 'product'),
          done: true,
        },
        {
          n: 'Checked marketing attribution',
          r: 'not measurable',
          done: false,
        },
      ] as Step[],
    };
  }

  private repeat(ctx: BrainContext, x: ReadingData) {
    const b = ctx.business;
    const { cur: c, prev: p } = x;
    const spC = c.repeatBuyers ? c.repeatRevenue / c.repeatBuyers : 0;
    const spP = p.repeatBuyers ? p.repeatRevenue / p.repeatBuyers : 0;
    const countEffect = (c.repeatBuyers - p.repeatBuyers) * spP;
    const spendEffect = c.repeatBuyers * (spC - spP);
    const drops = [...x.repeatPrev.entries()]
      .map(([id, pr]) => ({
        id,
        name: pr.name,
        d: (x.repeatCur.get(id)?.rev ?? 0) - pr.rev,
      }))
      .sort((a, c2) => a.d - c2.d);
    const parts = this.share([
      { t: 'Fewer returning buyers came back', v: countEffect },
      { t: 'Each returning buyer spent less', v: spendEffect },
    ]);
    const change = pctChange(c.repeatRevenue, p.repeatRevenue);
    const fell = c.repeatRevenue < p.repeatRevenue;
    const total = Math.abs(c.repeatRevenue - p.repeatRevenue) || 1;
    const top = drops[0] && drops[0].d < 0 ? drops[0] : null;
    return {
      headline: `Returning-buyer spend ${fell ? 'fell' : 'rose'} ${Math.abs(Math.round(change ?? 0))}%`,
      body: `${money(b, c.repeatRevenue)} against ${money(b, p.repeatRevenue)} ${ctx.window.label}.`,
      tree: [
        {
          n: 'Returning-buyer spend',
          d: `${money(b, c.repeatRevenue)} against ${money(b, p.repeatRevenue)}`,
          v: pct(change, 0),
          tone: fell ? 'bad' : 'good',
          level: 0,
        },
        {
          n: 'Returning buyers',
          d: `${c.repeatBuyers} against ${p.repeatBuyers}`,
          v: pct(pctChange(c.repeatBuyers, p.repeatBuyers), 0),
          tone: c.repeatBuyers < p.repeatBuyers ? 'warn' : 'good',
          level: 1,
        },
        {
          n: 'Spend per returning buyer',
          d: `${money(b, spC)} against ${money(b, spP)}`,
          v: pct(pctChange(spC, spP), 0),
          tone: spC < spP ? 'warn' : 'good',
          level: 1,
        },
        ...drops
          .filter((d) => d.d < 0)
          .slice(0, 3)
          .map((d) => ({
            n: d.name,
            d: `Returning buyers spent ${money(b, Math.abs(d.d))} less on it`,
            v: `${Math.round((Math.abs(d.d) / total) * 100)}%`,
            tone: 'bad',
            level: 2,
            link: { label: 'Open Products', href: '/products' },
          })),
      ] as Node[],
      reading: {
        mainLabel: fell ? 'Most likely main cause' : 'Main driver',
        main:
          top && Math.abs(top.d) / total >= 0.4
            ? {
                t: `${top.name}`,
                d: `${Math.round((Math.abs(top.d) / total) * 100)}% of the fall sits in this one product. Check its stock and price before assuming a customer problem.`,
              }
            : { t: parts[0].t, d: `${parts[0].share} of the change.` },
        contrib: (top && Math.abs(top.d) / total >= 0.4
          ? parts
          : parts.slice(1)
        ).map((pp) => ({ t: pp.t, share: pp.share })),
        alts: [
          {
            t: 'Customers moved to a competitor',
            d: 'Not checked — nothing in Noxtill records where a customer bought instead.',
          },
          {
            t: x.lastCampaignAt
              ? `Last campaign: ${day(b, x.lastCampaignAt)}`
              : 'No campaign has been sent',
            d: 'Campaign timing is recorded, but sales are not linked to campaigns.',
          },
        ],
        caveat: '',
        conf: 'High',
      },
      steps: [
        {
          n: 'Found buyers who had bought before the period',
          r: plural(c.repeatBuyers + p.repeatBuyers, 'buyer'),
          done: true,
        },
        {
          n: 'Split into buyer count and spend per buyer',
          r: 'done',
          done: true,
        },
        {
          n: 'Compared their spend product by product',
          r: plural(drops.length, 'product'),
          done: true,
        },
        { n: 'Checked where lost buyers went', r: 'not recorded', done: false },
      ] as Step[],
    };
  }

  private async credit(ctx: BrainContext, x: ReadingData) {
    const b = ctx.business;
    const [given, paid] = await Promise.all([
      this.prisma.creditEntry.aggregate({
        where: {
          businessId: { in: ctx.ids },
          kind: 'credit',
          createdAt: { gte: ctx.window.start, lt: ctx.window.end },
        },
        _sum: { amount: true },
      }),
      this.prisma.creditEntry.aggregate({
        where: {
          businessId: { in: ctx.ids },
          kind: 'payment',
          createdAt: { gte: ctx.window.start, lt: ctx.window.end },
        },
        _sum: { amount: true },
      }),
    ]);
    const g = Number(given._sum.amount ?? 0);
    const pd = Number(paid._sum.amount ?? 0);
    const cr = x.credit;
    return {
      headline: `${money(b, cr.overdue)} is overdue across ${plural(cr.overdueAccounts.length, 'account')}`,
      body: `${money(b, g)} of new credit was given in the period and ${money(b, pd)} was collected.${cr.outstandingWeekAgo !== null ? ` Total outstanding is ${pct(pctChange(cr.outstanding, cr.outstandingWeekAgo), 0)} on a week ago.` : ''}`,
      tree: [
        {
          n: 'Total outstanding',
          d: money(b, cr.outstanding),
          v:
            cr.outstandingWeekAgo !== null
              ? pct(pctChange(cr.outstanding, cr.outstandingWeekAgo), 0)
              : '—',
          tone: 'neutral',
          level: 0,
          link: { label: 'Open Credit', href: '/credit' },
        },
        {
          n: 'Credit given',
          d: `New credit sales in the period`,
          v: money(b, g),
          tone: g > pd ? 'warn' : 'neutral',
          level: 1,
        },
        {
          n: 'Collected',
          d: 'Credit payments received in the period',
          v: money(b, pd),
          tone: pd >= g ? 'good' : 'warn',
          level: 1,
        },
        {
          n: `Overdue (${ctx.thresholds.overdueDays}+ days)`,
          d: `${plural(cr.overdueAccounts.length, 'account')}, oldest ${cr.oldestDays} days`,
          v: money(b, cr.overdue),
          tone: cr.overdue > 0 ? 'bad' : 'good',
          level: 1,
          link: { label: 'Open overdue', href: '/credit/overdue' },
        },
        ...cr.overdueAccounts.slice(0, 3).map((a) => ({
          n: a.name,
          d: `${a.days} days`,
          v: money(b, a.balance),
          tone: 'bad',
          level: 2,
          link: { label: 'Open account', href: `/credit/${a.customerId}` },
        })),
      ] as Node[],
      reading: {
        mainLabel: 'Most likely main cause',
        main:
          g > pd
            ? {
                t: 'More credit given than collected',
                d: `${money(b, g)} given against ${money(b, pd)} collected in the period, so the book grew.`,
              }
            : {
                t: 'Older balances are not being cleared',
                d: 'Collections kept up with new credit, but the oldest balances are still standing.',
              },
        contrib: cr.overdueAccounts.length
          ? [
              {
                t: `The top ${Math.min(3, cr.overdueAccounts.length)} accounts`,
                share: `${Math.round((cr.overdueAccounts.slice(0, 3).reduce((s, a) => s + a.balance, 0) / (cr.overdue || 1)) * 100)}% of the overdue total`,
              },
            ]
          : [],
        alts: [
          {
            t: 'Customers cannot pay',
            d: 'Not checked — Noxtill has no record of why a customer has not paid.',
          },
        ],
        caveat:
          cr.outstandingWeekAgo === null
            ? 'No credit snapshot from a week ago exists yet, so the week-on-week change is not shown.'
            : '',
        conf: 'High',
      },
      steps: [
        {
          n: 'Read every credit balance',
          r: plural(cr.overdueAccounts.length, 'overdue account'),
          done: true,
        },
        {
          n: 'Compared credit given with credit collected',
          r: 'done',
          done: true,
        },
        {
          n: 'Compared with a week ago',
          r: cr.outstandingWeekAgo === null ? 'no snapshot yet' : 'done',
          done: cr.outstandingWeekAgo !== null,
        },
      ] as Step[],
    };
  }

  private margin(ctx: BrainContext, x: ReadingData) {
    const b = ctx.business;
    const rows = x.branches.filter((r) => r.margin !== null);
    if (rows.length < 2) {
      return {
        headline: 'Branch margins cannot be compared',
        body:
          ctx.ids.length < 2
            ? 'This reading covers one business. Choose “All branches” at the top to compare branches.'
            : 'Fewer than two branches have measured sales in the last 30 days.',
        tree: [],
        reading: null,
        steps: [
          {
            n: 'Looked for two branches with measured sales',
            r: `${rows.length} found`,
            done: false,
          },
        ] as Step[],
      };
    }
    const best = rows.reduce((a, c) => (c.margin! > a.margin! ? c : a));
    const worst = rows.reduce((a, c) => (c.margin! < a.margin! ? c : a));
    const gap = best.margin! - worst.margin!;
    const discountGap = (worst.discountPct ?? 0) - (best.discountPct ?? 0);
    const mix = BrainMetricsService.mixSimilarity(
      best.productShare,
      worst.productShare,
    );
    const missing = x.missingCosts.filter(
      (m) => m.businessId === worst.businessId,
    ).length;
    const discShare = gap > 0 ? Math.max(0, Math.min(1, discountGap / gap)) : 0;
    return {
      headline: `${worst.name} is ${gap.toFixed(1)} points behind ${best.name} on margin`,
      body: `${worst.margin!.toFixed(1)}% against ${best.margin!.toFixed(1)}% gross margin over the last 30 days.`,
      tree: rows
        .sort((a, c) => c.margin! - a.margin!)
        .flatMap((r) => [
          {
            n: r.name,
            d: `${money(b, r.revenue, true)} revenue, ${(r.discountPct ?? 0).toFixed(1)}% discounts`,
            v: `${r.margin!.toFixed(1)}%`,
            tone:
              r.businessId === worst.businessId
                ? 'bad'
                : r.businessId === best.businessId
                  ? 'good'
                  : 'neutral',
            level: 0,
          },
        ]),
      reading: {
        mainLabel: 'Most likely main cause',
        main:
          discShare >= 0.5
            ? {
                t: `Discounting at ${worst.name}`,
                d: `Discounts were ${(worst.discountPct ?? 0).toFixed(1)}% of sales against ${(best.discountPct ?? 0).toFixed(1)}% at ${best.name}${mix !== null ? ` on a ${Math.round(mix)}% similar product mix` : ''}. That difference accounts for roughly ${Math.round(discShare * 100)}% of the gap.`,
              }
            : {
                t: 'Prices or costs per product',
                d: `Discounts differ by only ${discountGap.toFixed(1)} points, so most of the gap is in what each product earns.`,
              },
        contrib: [
          {
            t: 'Discount difference',
            share: `${Math.round(discShare * 100)}%`,
          },
          {
            t: 'Prices, costs and mix',
            share: `${Math.round((1 - discShare) * 100)}%`,
          },
        ],
        alts: [
          mix === null
            ? {
                t: 'Product mix',
                d: 'Not checked — not enough product-level sales.',
              }
            : {
                t: 'Product mix',
                d:
                  mix >= 85
                    ? `Ruled out. The mixes are ${Math.round(mix)}% the same.`
                    : `Possible — the mixes are only ${Math.round(mix)}% the same.`,
              },
        ],
        caveat: missing
          ? `${plural(missing, 'product')} sold at ${worst.name} ${missing === 1 ? 'has' : 'have'} no cost price, so the true gap could be wider or narrower than ${gap.toFixed(1)} points.`
          : '',
        conf: missing ? 'Medium' : 'High',
      },
      steps: [
        {
          n: 'Read 30 days of sales for each branch',
          r: plural(rows.length, 'branch', 'branches'),
          done: true,
        },
        {
          n: 'Compared discounts by branch',
          r: `${discountGap >= 0 ? '+' : ''}${discountGap.toFixed(1)} pts`,
          done: true,
        },
        {
          n: 'Compared product mix',
          r: mix === null ? 'no data' : `${Math.round(mix)}% similar`,
          done: mix !== null,
        },
        {
          n: 'Checked cost prices',
          r: missing ? `${missing} gaps` : 'complete',
          done: !missing,
        },
      ] as Step[],
    };
  }
}
