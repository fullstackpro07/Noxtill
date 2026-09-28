import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BrainDetectorsService, ReadingData } from './brain-detectors.service';
import { BrainContext, Finding } from './brain.types';
import { ago, clock, day, money, pct, plural } from './brain-context.service';
import { median, pctChange } from './brain-metrics.service';

const DAY = 86400000;

export type Tone = 'good' | 'bad' | 'neutral';

export interface Signal {
  key: string;
  n: string;
  v: string;
  ch: string;
  why: string;
  tone: Tone;
  rows: { l: string; v: string }[];
  definition: string;
}

/** Local midnight in the business's timezone, as a UTC instant. */
export function startOfLocalDay(timezone: string, now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const localMs = Date.UTC(
    g('year'),
    g('month') - 1,
    g('day'),
    g('hour'),
    g('minute'),
    g('second'),
  );
  const offset = localMs - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(g('year'), g('month') - 1, g('day')) - offset);
}

/** The local calendar date, as the UTC-midnight Date Prisma stores in a @db.Date column. */
export function localDate(timezone: string, now = new Date()): Date {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return new Date(`${iso}T00:00:00.000Z`);
}

@Injectable()
export class BrainReadingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly detectors: BrainDetectorsService,
  ) {}

  /** Findings with anything a person dismissed removed, and watched ones marked. */
  async visibleFindings(ctx: BrainContext, data: ReadingData) {
    const states = await this.prisma.brainFindingState.findMany({
      where: { businessId: ctx.callerBusinessId },
    });
    const byKey = new Map(states.map((s) => [s.key, s]));
    return data.findings
      .filter((f) => byKey.get(f.key)?.status !== 'dismissed')
      .map((f) => ({
        ...f,
        watching: byKey.get(f.key)?.status === 'watching',
      }));
  }

  signals(
    ctx: BrainContext,
    x: ReadingData,
    prevSnapshot: { counts: Prisma.JsonValue } | null,
  ): Signal[] {
    const b = ctx.business;
    const w = ctx.window;
    const th = ctx.thresholds;
    const tone = (change: number | null, upIsGood = true): Tone => {
      if (change === null || Math.abs(change) < 0.5) return 'neutral';
      return change > 0 === upIsGood ? 'good' : 'bad';
    };
    const revCh = pctChange(x.cur.revenue, x.prev.revenue);
    const gpCh = pctChange(x.cur.grossProfit, x.prev.grossProfit);
    const ordCh = pctChange(x.cur.orders, x.prev.orders);
    const bkCh = pctChange(x.cur.bookings, x.prev.bookings);
    const newCh = pctChange(x.cur.newBuyers, x.prev.newBuyers);
    const repeatCh = pctChange(x.cur.repeatRevenue, x.prev.repeatRevenue);
    const aovC = x.cur.orders ? x.cur.revenue / x.cur.orders : 0;
    const aovP = x.prev.orders ? x.prev.revenue / x.prev.orders : 0;
    const doneC = x.cur.deliveriesDone + x.cur.deliveriesFailed;
    const doneP = x.prev.deliveriesDone + x.prev.deliveriesFailed;
    const dsC = doneC ? (x.cur.deliveriesDone / doneC) * 100 : null;
    const dsP = doneP ? (x.prev.deliveriesDone / doneP) * 100 : null;
    const rvC = x.cur.reviewCount ? x.cur.reviewSum / x.cur.reviewCount : null;
    const rvP = x.prev.reviewCount
      ? x.prev.reviewSum / x.prev.reviewCount
      : null;
    const risk = x.stock.filter(
      (s) =>
        s.stock <= s.threshold ||
        (s.coverDays !== null && s.coverDays <= th.stockCoverDays),
    );
    const riskPrev = prevSnapshot
      ? Number(
          (prevSnapshot.counts as Record<string, unknown>)?.inventoryRisk ??
            NaN,
        )
      : NaN;
    const worstRisk = [...risk].sort(
      (a, c) => (a.coverDays ?? 999) - (c.coverDays ?? 999),
    )[0];
    const credCh =
      x.credit.outstandingWeekAgo !== null
        ? pctChange(x.credit.outstanding, x.credit.outstandingWeekAgo)
        : null;
    const unmeasuredShare =
      x.cur.revenue > 0 ? x.cur.unmeasuredRevenue / x.cur.revenue : 0;
    const prevLabel = w.label
      .replace('vs ', '')
      .replace(/^\w/, (c) => c.toUpperCase());

    return [
      {
        key: 'revenue',
        n: 'Revenue',
        v: money(b, x.cur.revenue, true),
        ch: pct(revCh),
        why: `Orders ${pct(ordCh, 0)}, returning-buyer spend ${pct(repeatCh, 0)}`,
        tone: tone(revCh),
        rows: [
          { l: 'This period', v: money(b, x.cur.revenue) },
          { l: prevLabel, v: money(b, x.prev.revenue) },
        ],
        definition:
          'Completed, non-quotation sales — the same figure Profit & Analytics uses.',
      },
      {
        key: 'profit',
        n: 'Gross profit',
        v: money(b, x.cur.grossProfit, true),
        ch: pct(gpCh),
        why:
          unmeasuredShare > 0.02
            ? `${Math.round(unmeasuredShare * 100)}% of sales have no cost recorded`
            : 'Revenue minus the cost recorded on each sale',
        tone: tone(gpCh),
        rows: [
          { l: 'This period', v: money(b, x.cur.grossProfit) },
          { l: prevLabel, v: money(b, x.prev.grossProfit) },
          {
            l: 'Sales with no cost recorded',
            v: money(b, x.cur.unmeasuredRevenue),
          },
        ],
        definition:
          'Revenue minus the cost snapshotted on each sale line. Lines with no cost count as zero cost here, so this can read high when costs are missing.',
      },
      {
        key: 'orders',
        n: 'Orders',
        v: String(x.cur.orders),
        ch: pct(ordCh),
        why: `Average order ${money(b, aovC)}${aovP ? ` against ${money(b, aovP)}` : ''}`,
        tone: tone(ordCh),
        rows: [
          { l: 'This period', v: String(x.cur.orders) },
          { l: prevLabel, v: String(x.prev.orders) },
        ],
        definition: 'Completed orders, quotations excluded.',
      },
      {
        key: 'bookings',
        n: 'Bookings',
        v: String(x.cur.bookings),
        ch: pct(bkCh),
        why: 'Appointments starting in the period, cancellations excluded',
        tone: tone(bkCh),
        rows: [
          { l: 'This period', v: String(x.cur.bookings) },
          { l: prevLabel, v: String(x.prev.bookings) },
        ],
        definition:
          'Appointments whose start time falls in the period and that were not cancelled.',
      },
      {
        key: 'customers',
        n: 'Customers',
        v: `${x.cur.newBuyers} new`,
        ch:
          newCh === null ? '—' : Math.abs(newCh) < 0.5 ? 'flat' : pct(newCh, 0),
        why: `${plural(x.cur.repeatBuyers, 'returning buyer')} against ${x.prev.repeatBuyers}`,
        tone: tone(newCh),
        rows: [
          {
            l: 'First-time buyers',
            v: `${x.cur.newBuyers} (was ${x.prev.newBuyers})`,
          },
          {
            l: 'Returning buyers',
            v: `${x.cur.repeatBuyers} (was ${x.prev.repeatBuyers})`,
          },
        ],
        definition:
          'A first-time buyer’s first completed order falls in the period; a returning buyer had bought before it.',
      },
      {
        key: 'credit',
        n: 'Overdue credit',
        v: money(b, x.credit.overdue, true),
        ch: credCh === null ? '—' : pct(credCh, 0),
        why: `${plural(x.credit.overdueAccounts.length, 'account')} ${th.overdueDays}+ days${credCh === null ? '' : '; change is total outstanding vs a week ago'}`,
        tone:
          credCh === null
            ? x.credit.overdue > 0
              ? 'bad'
              : 'neutral'
            : tone(credCh, false),
        rows: [
          { l: 'Overdue', v: money(b, x.credit.overdue) },
          { l: 'Total outstanding', v: money(b, x.credit.outstanding) },
          {
            l: 'Outstanding a week ago',
            v:
              x.credit.outstandingWeekAgo === null
                ? 'No snapshot'
                : money(b, x.credit.outstandingWeekAgo),
          },
        ],
        definition: `Balances owed for ${th.overdueDays} days or more, aged from when each account was last fully paid.`,
      },
      {
        key: 'inventory',
        n: 'Inventory risk',
        v: plural(risk.length, 'product'),
        ch: Number.isNaN(riskPrev)
          ? '—'
          : `${risk.length - riskPrev >= 0 ? '+' : ''}${risk.length - riskPrev}`,
        why: worstRisk
          ? `${worstRisk.name} is the most urgent`
          : 'Nothing at or below its reorder level',
        tone: risk.length ? 'bad' : 'good',
        rows: risk.slice(0, 5).map((r) => ({
          l: r.name,
          v: `${r.stock} left${r.coverDays !== null ? ` · ~${Math.round(r.coverDays)} days` : ''}`,
        })),
        definition: `Products at or below their reorder level, or with ${th.stockCoverDays} days or less of stock at the 14-day sales rate.`,
      },
      {
        key: 'delivery',
        n: 'Delivery success',
        v: dsC === null ? 'No deliveries' : `${Math.round(dsC)}%`,
        ch:
          dsC === null || dsP === null
            ? '—'
            : `${dsC - dsP >= 0 ? '+' : ''}${Math.round(dsC - dsP)} pts`,
        why: `${plural(x.cur.deliveriesFailed, 'failed delivery', 'failed deliveries')} against ${x.prev.deliveriesFailed}`,
        tone: dsC === null || dsP === null ? 'neutral' : tone(dsC - dsP),
        rows: [
          { l: 'Delivered', v: String(x.cur.deliveriesDone) },
          { l: 'Failed', v: String(x.cur.deliveriesFailed) },
        ],
        definition:
          'Delivered ÷ (delivered + failed) for deliveries that reached a final status in the period.',
      },
      {
        key: 'reviews',
        n: 'Reviews',
        v: rvC === null ? 'None' : rvC.toFixed(1),
        ch:
          rvC === null || rvP === null
            ? '—'
            : `${rvC - rvP >= 0 ? '+' : ''}${(rvC - rvP).toFixed(1)}`,
        why: `${plural(x.cur.reviewCount, 'new review')}${x.cur.lowReviews ? `, ${x.cur.lowReviews} of two stars or less` : ''}`,
        tone: rvC === null || rvP === null ? 'neutral' : tone(rvC - rvP),
        rows: [
          { l: 'Reviews', v: String(x.cur.reviewCount) },
          { l: 'Two stars or less', v: String(x.cur.lowReviews) },
        ],
        definition:
          'Star ratings from review requests and connected review sites.',
      },
      {
        key: 'marketing',
        n: 'Marketing',
        v: 'Not measured',
        ch: '—',
        why: 'Noxtill does not link sales to campaigns, so no attribution',
        tone: 'neutral',
        rows: [
          {
            l: 'Last campaign',
            v: x.lastCampaignAt ? day(b, x.lastCampaignAt) : 'None sent',
          },
        ],
        definition:
          'Campaign delivery is tracked in Marketing, but no sale is linked to the campaign that prompted it — so return on marketing is not calculated rather than estimated.',
      },
    ];
  }

  state(ctx: BrainContext, x: ReadingData, findings: Finding[]) {
    const b = ctx.business;
    const th = ctx.thresholds;
    const counts = {
      critical: findings.filter((f) => f.kind === 'Critical').length,
      attention: findings.filter((f) => f.kind === 'Attention').length,
      opportunity: findings.filter((f) => f.kind === 'Opportunity').length,
      improving: findings.filter((f) => f.kind === 'Improving').length,
    };
    const label = counts.critical
      ? 'Action needed'
      : counts.attention
        ? 'Attention needed'
        : 'Steady';
    const revCh = pctChange(x.cur.revenue, x.prev.revenue);
    const ordCh = pctChange(x.cur.orders, x.prev.orders);
    let opening: string;
    if (x.cur.revenue === 0 && x.prev.revenue === 0)
      opening =
        'No completed sales in either period yet, so there is no trading to read.';
    else if (
      revCh !== null &&
      ordCh !== null &&
      Math.abs(revCh) < th.notableChangePercent &&
      Math.abs(ordCh) < th.notableChangePercent
    )
      opening = `Trading is steady — revenue and order volume are both within ${th.notableChangePercent}% of ${ctx.window.label.replace('vs ', '')}.`;
    else
      opening = `Revenue is ${revCh === null ? 'new this period' : `${revCh >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(revCh))}%`} (${money(b, x.cur.revenue)}) and orders ${ordCh === null ? 'are new' : `${ordCh >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(ordCh))}%`}.`;
    const against = findings
      .filter((f) => f.kind === 'Critical' || f.kind === 'Attention')
      .slice(0, 3);
    const words = ['One thing is', 'Two things are', 'Three things are'];
    const summary = against.length
      ? `${opening} ${words[against.length - 1]} working against you: ${against
          .map((f) => f.phrase)
          .join(', ')
          .replace(/, ([^,]*)$/, ', and $1')}.`
      : `${opening} Nothing crossed your thresholds for attention.`;
    const now = new Date();
    return {
      label,
      at: clock(b, now),
      window: `compared ${ctx.window.label}`,
      summary,
      basis: `Read from Orders, Customers, Credit, Inventory, Bookings, Delivery, Reviews and the Unified Inbox for ${ctx.scopeLabel}. Marketing attribution is excluded — Noxtill does not link sales to campaigns.${x.missingCosts.length ? ` ${plural(x.missingCosts.length, 'product')} with no cost price ${x.missingCosts.length === 1 ? 'is' : 'are'} left out of margin.` : ''}`,
      counts,
    };
  }

  async trust(ctx: BrainContext, x: ReadingData) {
    const ids = ctx.ids;
    const [order, credit, appt, delivery, review, ext, campaign] =
      await Promise.all([
        this.prisma.order.findFirst({
          where: { businessId: { in: ids } },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
        this.prisma.creditEntry.findFirst({
          where: { businessId: { in: ids } },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
        this.prisma.appointment.findFirst({
          where: { businessId: { in: ids } },
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true },
        }),
        this.prisma.delivery.findFirst({
          where: { businessId: { in: ids } },
          orderBy: { updatedAt: 'desc' },
          select: { updatedAt: true },
        }),
        this.prisma.reviewRequest.findFirst({
          where: { businessId: { in: ids }, respondedAt: { not: null } },
          orderBy: { respondedAt: 'desc' },
          select: { respondedAt: true },
        }),
        this.prisma.externalReview.findFirst({
          where: { businessId: { in: ids } },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
        this.prisma.campaign.count({ where: { businessId: { in: ids } } }),
      ]);
    const src = (n: string, at: Date | null | undefined, what: string) => {
      if (!at)
        return {
          n,
          st: 'No records yet',
          level: 'none',
          why: `No ${what} recorded yet.`,
        };
      const hrs = (Date.now() - at.getTime()) / 3600000;
      return {
        n,
        st: `Last ${ago(at)}`,
        level: hrs <= 24 ? 'ok' : hrs <= 24 * 7 ? 'stale' : 'old',
        why: `Read live; the newest ${what} is from ${ago(at)}.`,
      };
    };
    const reviewAt = [review?.respondedAt, ext?.createdAt]
      .filter((d): d is Date => !!d)
      .sort((a, c) => c.getTime() - a.getTime())[0];
    return [
      src('Fast Sale, Orders, Customers', order?.createdAt, 'sale'),
      src('Credit', credit?.createdAt, 'credit entry'),
      src('Bookings', appt?.updatedAt, 'booking'),
      src('Delivery', delivery?.updatedAt, 'delivery update'),
      {
        n: 'Inventory',
        st: 'Live',
        level: 'ok',
        why: 'Stock counts change with every sale, purchase and adjustment.',
      },
      src('Reviews', reviewAt, 'review'),
      {
        n: 'Marketing attribution',
        st: 'Not measured',
        level: 'bad',
        why: `Noxtill records ${plural(campaign, 'campaign')} but does not link sales to them.`,
      },
      x.missingCosts.length
        ? {
            n: `${plural(x.missingCosts.length, 'product')} missing cost`,
            st: 'Affects margin',
            level: 'bad',
            why: 'Sold in the last 30 days with a cost price of 0; left out of margin.',
          }
        : {
            n: 'Product costs',
            st: 'All recorded',
            level: 'ok',
            why: 'Every product sold in the last 30 days has a cost price.',
          },
    ];
  }

  brief(
    ctx: BrainContext,
    x: ReadingData,
    findings: Finding[],
    signals: Signal[],
    preparedCount: number,
  ) {
    const b = ctx.business;
    const moved = signals.filter(
      (s) => s.tone !== 'neutral' && s.ch !== '—' && s.ch !== 'flat',
    );
    const bad = findings.filter(
      (f) => f.kind === 'Critical' || f.kind === 'Attention',
    );
    const good = findings.filter((f) => f.kind === 'Improving');
    const changed = [
      ...moved.map(
        (s) =>
          `${s.n} ${s.ch.startsWith('-') ? 'fell' : 'rose'} ${s.ch.replace(/^[-+]/, '')} — ${s.v} (${s.why.charAt(0).toLowerCase()}${s.why.slice(1)}).`,
      ),
      // The revenue signal above already says this; don't repeat it as a finding.
      ...good
        .filter(
          (f) =>
            !(f.key === 'revenue_up' && moved.some((m) => m.key === 'revenue')),
        )
        .map((f) => `${f.t}: ${f.d}`),
    ];
    const why = bad.map((f) =>
      f.evidence[0]
        ? `${f.t}: ${f.evidence[0].t} — ${f.evidence[0].d}`
        : `${f.t}: ${f.d}`,
    );
    const matters = [...bad]
      .sort((a, c) => (c.impactValue ?? 0) - (a.impactValue ?? 0))
      .map(
        (f) =>
          `${f.t}${f.impactValue ? ` — ${money(b, f.impactValue)} of ${f.impactLabel.toLowerCase()}` : ` — ${f.impactLabel.toLowerCase()}`}.${f.limit ? ` Note: ${f.limit}` : ''}`,
      );
    const next = [...bad, ...findings.filter((f) => f.kind === 'Opportunity')]
      .filter((f) => f.rec)
      .map((f) => `${f.rec}.`);
    const head = (lines: string[], fallback: string, max = 3) =>
      lines.length
        ? lines
            .slice(0, max)
            // Split at a clause break only — never inside a figure like "+152.6%" or "4:14".
            .map((l) => l.split(/\s—\s|:\s|\.(?:\s|$)/)[0].trim())
            .join('; ')
        : fallback;
    return [
      {
        k: 'What changed',
        head: head(
          moved.map((s) => `${s.n} ${s.ch}`),
          'Nothing moved past your thresholds',
        ),
        lines: changed.length ? changed : ['No figure moved enough to report.'],
      },
      {
        k: 'Why',
        head: bad.length
          ? head(
              bad.map((f) => f.t),
              '',
              2,
            )
          : 'Nothing needs explaining',
        lines: why.length ? why : ['No finding needed a cause this period.'],
      },
      {
        k: 'What matters',
        head: bad.length
          ? `${bad[0].impactLabel} first${bad[1] ? `, then ${bad[1].impactLabel.toLowerCase()}` : ''}`
          : 'Nothing urgent',
        lines: matters.length
          ? matters
          : ['Nothing is working against you right now.'],
      },
      {
        k: 'What to do next',
        head: `${plural(next.length, 'step')}${preparedCount ? `, ${preparedCount} already prepared` : ''}`,
        lines: next.length
          ? next
          : ['Nothing to do — keep an eye on the watchlist.'],
      },
    ];
  }

  /** "How it connects": gross profit followed down through the recorded figures behind it. Stops where records stop. */
  chain(ctx: BrainContext, x: ReadingData) {
    const b = ctx.business;
    const rows: {
      n: string;
      ch: string;
      d: string;
      src: string;
      tone: Tone;
      level: number;
    }[] = [];
    if (x.cur.revenue === 0 && x.prev.revenue === 0) return rows;
    const gpCh = pctChange(x.cur.grossProfit, x.prev.grossProfit);
    rows.push({
      n: 'Gross profit',
      ch: pct(gpCh),
      d: `${money(b, x.cur.grossProfit)} against ${money(b, x.prev.grossProfit)}.`,
      src: 'Profit',
      tone: gpCh !== null && gpCh < 0 ? 'bad' : 'good',
      level: 0,
    });
    const revCh = pctChange(x.cur.revenue, x.prev.revenue);
    rows.push({
      n: 'Revenue',
      ch: pct(revCh),
      d:
        revCh !== null && gpCh !== null && Math.abs(revCh) < Math.abs(gpCh) / 2
          ? 'Moved far less than profit, so the change is on the cost side.'
          : `${money(b, x.cur.revenue)} against ${money(b, x.prev.revenue)}.`,
      src: 'Fast Sale',
      tone: revCh !== null && revCh < 0 ? 'bad' : 'good',
      level: 1,
    });
    const dC = x.cur.subtotal ? (x.cur.discounts / x.cur.subtotal) * 100 : 0;
    const dP = x.prev.subtotal ? (x.prev.discounts / x.prev.subtotal) * 100 : 0;
    if (x.cur.discounts > 0 || x.prev.discounts > 0) {
      rows.push({
        n: 'Discounts given',
        ch: `${dC - dP >= 0 ? '+' : ''}${(dC - dP).toFixed(1)} pts`,
        d: `${dC.toFixed(1)}% of sales (${money(b, x.cur.discounts)}) against ${dP.toFixed(1)}%.`,
        src: 'Fast Sale',
        tone: dC > dP ? 'bad' : 'good',
        level: 2,
      });
      const withD = x.branches.filter((r) => r.discountPct !== null);
      if (withD.length >= 2) {
        const top = withD.reduce((a, c) =>
          c.discountPct! > a.discountPct! ? c : a,
        );
        rows.push({
          n: top.name,
          ch: `${top.discountPct!.toFixed(1)}% discounts`,
          d: `${top.margin !== null ? `${top.margin.toFixed(1)}% margin. ` : ''}The highest discount rate of your branches over 30 days.`,
          src: 'Branches',
          tone: 'bad',
          level: 3,
        });
      }
    }
    if (x.prev.repeatRevenue > 0 || x.cur.repeatRevenue > 0) {
      const d = x.cur.repeatRevenue - x.prev.repeatRevenue;
      rows.push({
        n: 'Returning-buyer spend',
        ch: `${d >= 0 ? '+' : '-'}${money(b, Math.abs(d))}`,
        d: `${money(b, x.cur.repeatRevenue)} against ${money(b, x.prev.repeatRevenue)}.`,
        src: 'Customers',
        tone: d < 0 ? 'bad' : 'good',
        level: 1,
      });
      if (d < 0) {
        const drops = [...x.repeatPrev.entries()]
          .map(([id, p]) => ({
            id,
            name: p.name,
            drop: p.rev - (x.repeatCur.get(id)?.rev ?? 0),
          }))
          .filter((r) => r.drop > 0)
          .sort((a, c) => c.drop - a.drop);
        if (drops[0])
          rows.push({
            n: drops[0].name,
            ch: `-${money(b, drops[0].drop)}`,
            d: 'The product with the largest fall in returning-buyer spend. The chain stops here — nothing in the records explains the product itself.',
            src: 'Products',
            tone: 'bad',
            level: 2,
          });
      }
    }
    return rows;
  }

  async changes(
    ctx: BrainContext,
    x: ReadingData,
    findings: Finding[],
    signals: Signal[],
  ) {
    const th = ctx.thresholds;
    const out: {
      kind: string;
      t: string;
      d: string;
      tone: 'bad' | 'warn' | 'good' | 'neutral';
    }[] = [];
    for (const s of signals) {
      const v = parseFloat(s.ch);
      if (
        !Number.isFinite(v) ||
        s.ch.includes('pts') ||
        Math.abs(v) < th.notableChangePercent
      )
        continue;
      if (s.tone === 'good')
        out.push({
          kind: 'Better',
          t: `${s.n} ${v > 0 ? 'up' : 'down'} ${Math.abs(Math.round(v))}%`,
          d: `${s.v} — ${s.why}.`,
          tone: 'good',
        });
      else if (s.tone === 'bad')
        out.push({
          kind:
            Math.abs(v) >= th.notableChangePercent * 2 ? 'Unusual' : 'Worse',
          t: `${s.n} ${v > 0 ? 'up' : 'down'} ${Math.abs(Math.round(v))}%`,
          d: `${s.v} — ${s.why}.`,
          tone: Math.abs(v) >= th.notableChangePercent * 2 ? 'bad' : 'warn',
        });
    }
    const snaps = await this.prisma.brainSnapshot.findMany({
      where: { businessId: ctx.callerBusinessId },
      orderBy: { day: 'desc' },
      take: 14,
    });
    const keysOn = (i: number) =>
      new Set(
        ((snaps[i]?.findings as { key: string }[] | undefined) ?? []).map(
          (f) => f.key,
        ),
      );
    const weekAgo = snaps.find(
      (s) => Date.now() - s.day.getTime() >= 6.5 * DAY,
    );
    for (const f of findings.filter((g) => g.kind !== 'Improving')) {
      let streak = 0;
      for (let i = 0; i < snaps.length; i++) {
        if (keysOn(i).has(f.key)) streak++;
        else break;
      }
      if (streak >= 3)
        out.push({
          kind: 'Pattern',
          t: `${f.t}`,
          d: `Raised in each of the last ${streak} daily readings — long enough to be a pattern rather than a bad day.`,
          tone: 'warn',
        });
      else if (
        weekAgo &&
        !((weekAgo.findings as { key: string }[]) ?? []).some(
          (g) => g.key === f.key,
        )
      )
        out.push({
          kind: 'New',
          t: f.t,
          d: `Not raised in the reading of ${day(ctx.business, weekAgo.day)}.`,
          tone: 'warn',
        });
    }
    out.push({
      kind: 'Watch',
      t: 'Marketing cannot be judged',
      d: 'No sale is linked to the campaign that prompted it, so attribution is not calculated rather than estimated.',
      tone: 'neutral',
    });
    if (!snaps.length)
      out.push({
        kind: 'Watch',
        t: 'History starts today',
        d: 'Patterns and “new” changes need earlier daily readings; they appear as readings build up.',
        tone: 'neutral',
      });
    return out;
  }

  /** Today's notable events — the unusual ones kept, ordinary transactions left out. */
  async events(ctx: BrainContext, x: ReadingData) {
    const b = ctx.business;
    const ids = ctx.ids;
    const since = startOfLocalDay(b.timezone);
    type Ev = {
      at: Date;
      title: string;
      d: string;
      src: string;
      sev: 'Critical' | 'Important' | 'Opportunity' | 'Positive';
      rel: string;
      link: { label: string; href: string } | null;
    };
    const ev: Ev[] = [];
    const [
      lowStock,
      failed,
      returns,
      reviewsIn,
      extIn,
      integrations,
      quotes,
      recordCounts,
      avgOrder,
      bigOrders,
    ] = await Promise.all([
      this.prisma.$queryRaw<
        {
          id: string;
          name: string;
          stock_qty: number;
          low_stock_threshold: number;
          at: Date;
        }[]
      >`
        SELECT p.id, p.name, p.stock_qty, p.low_stock_threshold, MAX(m.created_at) AS at
        FROM stock_movements m JOIN products p ON p.id = m.product_id
        WHERE m.business_id IN (${Prisma.join(ids)}) AND m.kind = 'sale' AND m.created_at >= ${since} AND p.stock_qty <= p.low_stock_threshold
        GROUP BY p.id, p.name, p.stock_qty, p.low_stock_threshold ORDER BY at DESC LIMIT 10
      `,
      this.prisma.delivery.findMany({
        where: {
          businessId: { in: ids },
          status: 'failed',
          updatedAt: { gte: since },
        },
        select: {
          updatedAt: true,
          failureReason: true,
          order: { select: { orderNo: true } },
        },
        take: 10,
      }),
      this.prisma.return.findMany({
        where: { businessId: { in: ids }, createdAt: { gte: since } },
        select: {
          createdAt: true,
          refundAmount: true,
          reason: true,
          order: { select: { orderNo: true } },
        },
        take: 10,
      }),
      this.prisma.reviewRequest.findMany({
        where: {
          businessId: { in: ids },
          respondedAt: { gte: since },
          stars: { not: null },
        },
        select: { stars: true, respondedAt: true },
      }),
      this.prisma.externalReview.findMany({
        where: { businessId: { in: ids }, createdAt: { gte: since } },
        select: { stars: true, createdAt: true },
      }),
      this.prisma.integration.findMany({
        where: {
          businessId: { in: ids },
          status: 'needs_attention',
          updatedAt: { gte: since },
        },
        select: { provider: true, updatedAt: true },
      }),
      this.prisma.order.findMany({
        where: {
          businessId: { in: ids },
          isQuotation: true,
          quotationStatus: 'accepted',
          updatedAt: { gte: since },
        },
        select: { orderNo: true, total: true, updatedAt: true },
      }),
      Promise.all([
        this.prisma.order.count({
          where: { businessId: { in: ids }, createdAt: { gte: since } },
        }),
        this.prisma.stockMovement.count({
          where: { businessId: { in: ids }, createdAt: { gte: since } },
        }),
        this.prisma.creditEntry.count({
          where: { businessId: { in: ids }, createdAt: { gte: since } },
        }),
        this.prisma.appointment.count({
          where: { businessId: { in: ids }, updatedAt: { gte: since } },
        }),
        this.prisma.delivery.count({
          where: { businessId: { in: ids }, updatedAt: { gte: since } },
        }),
        this.prisma.message.count({
          where: { businessId: { in: ids }, createdAt: { gte: since } },
        }),
        this.prisma.inboxMessage.count({
          where: { businessId: { in: ids }, createdAt: { gte: since } },
        }),
      ]),
      this.prisma.order.aggregate({
        where: {
          businessId: { in: ids },
          status: 'completed',
          isQuotation: false,
          createdAt: { gte: new Date(Date.now() - 30 * DAY) },
        },
        _avg: { total: true },
      }),
      this.prisma.order.findMany({
        where: {
          businessId: { in: ids },
          status: 'completed',
          isQuotation: false,
          createdAt: { gte: since },
        },
        select: {
          orderNo: true,
          total: true,
          createdAt: true,
          customer: { select: { name: true } },
        },
        orderBy: { total: 'desc' },
        take: 3,
      }),
    ]);
    for (const s of lowStock) {
      const row = x.stock.find((r) => r.id === s.id);
      ev.push({
        at: new Date(s.at),
        title:
          s.stock_qty <= 0
            ? `${s.name} sold out`
            : `${s.name} dropped to ${plural(s.stock_qty, 'unit')}`,
        d:
          row && row.coverDays !== null && s.stock_qty > 0
            ? `At the 14-day rate that is about ${Math.max(1, Math.round(row.coverDays))} days of stock.`
            : `At or below its reorder level of ${s.low_stock_threshold}.`,
        src: 'Inventory',
        sev: s.stock_qty <= 0 ? 'Critical' : 'Important',
        rel: 'Product',
        link: { label: 'Open Inventory', href: '/inventory/low-stock' },
      });
    }
    for (const f of failed)
      ev.push({
        at: f.updatedAt,
        title: `Delivery for order #${f.order.orderNo} failed`,
        d: f.failureReason ?? 'No reason recorded.',
        src: 'Delivery',
        sev: 'Important',
        rel: `Order #${f.order.orderNo}`,
        link: { label: 'Open Exceptions', href: '/deliveries/exceptions' },
      });
    for (const r of returns)
      ev.push({
        at: r.createdAt,
        title: `Return on order #${r.order.orderNo}`,
        d: `${money(b, Number(r.refundAmount))} — ${r.reason}`,
        src: 'Orders',
        sev: 'Important',
        rel: `Order #${r.order.orderNo}`,
        link: { label: 'Open Returns', href: '/orders/returns' },
      });
    for (const o of x.discountBreaches.filter((o) => o.at >= since))
      ev.push({
        at: o.at,
        title: `A sale went out at ${o.pct.toFixed(0)}% discount`,
        d: `Order #${o.orderNo}. Above the ${ctx.thresholds.maxDiscountPercent}% limit in your own sales policy.`,
        src: 'Fast Sale',
        sev: 'Important',
        rel: `Order #${o.orderNo}`,
        link: { label: 'Open Orders', href: '/orders' },
      });
    for (const a of x.credit.overdueAccounts.filter(
      (a) =>
        a.days === ctx.thresholds.overdueDays ||
        a.days === ctx.thresholds.overdueDays * 2,
    )) {
      ev.push({
        at: since,
        title: `${a.name} passed ${a.days} days overdue`,
        d: `${money(b, a.balance)} outstanding.`,
        src: 'Credit',
        sev: 'Critical',
        rel: 'Credit account',
        link: { label: 'Open the account', href: `/credit/${a.customerId}` },
      });
    }
    const stars = [
      ...reviewsIn.map((r) => ({ s: r.stars!, at: r.respondedAt! })),
      ...extIn.map((r) => ({ s: r.stars, at: r.createdAt })),
    ];
    if (stars.length) {
      const low = stars.filter((r) => r.s <= 2).length;
      const avg = stars.reduce((s, r) => s + r.s, 0) / stars.length;
      ev.push({
        at: stars.map((r) => r.at).sort((a, c) => c.getTime() - a.getTime())[0],
        title: `${plural(stars.length, 'review')} came in${low ? `, ${low} of two stars or less` : `, none below ${Math.min(...stars.map((r) => r.s))} stars`}`,
        d: `Average ${avg.toFixed(1)} stars.`,
        src: 'Reviews',
        sev: low ? 'Important' : 'Positive',
        rel: 'Reputation',
        link: { label: 'Open Reviews', href: '/reviews' },
      });
    }
    for (const i of integrations)
      ev.push({
        at: i.updatedAt,
        title: `${i.provider.replace(/_/g, ' ')} needs reconnecting`,
        d: 'The connection stopped working and is marked as needing attention.',
        src: 'Integrations',
        sev: 'Important',
        rel: 'Integration',
        link: { label: 'Open Integrations', href: '/integrations' },
      });
    for (const q of quotes)
      ev.push({
        at: q.updatedAt,
        title: `Quotation #${q.orderNo} accepted`,
        d: `${money(b, Number(q.total))} — not yet converted into an order.`,
        src: 'Orders',
        sev: 'Opportunity',
        rel: `Quotation #${q.orderNo}`,
        link: { label: 'Open quotations', href: '/orders/quotations' },
      });
    const avg = Number(avgOrder._avg.total ?? 0);
    for (const o of bigOrders.filter(
      (o) => avg > 0 && Number(o.total) >= avg * 3,
    ))
      ev.push({
        at: o.createdAt,
        title: `A ${money(b, Number(o.total))} order came in`,
        d: `Order #${o.orderNo}${o.customer ? ` from ${o.customer.name}` : ''} — ${Math.round(Number(o.total) / avg)}× your average order.`,
        src: 'Fast Sale',
        sev: 'Positive',
        rel: `Order #${o.orderNo}`,
        link: { label: 'Open Orders', href: '/orders' },
      });

    const totalRecords = recordCounts.reduce((s, v) => s + v, 0);
    return {
      totalRecords,
      events: ev
        .sort((a, c) => c.at.getTime() - a.at.getTime())
        .map((e) => ({ ...e, t: clock(b, e.at) })),
    };
  }

  /** Keep today's reading so History and "Resolved" have something real to compare against. */
  async saveSnapshot(
    ctx: BrainContext,
    state: ReturnType<BrainReadingService['state']>,
    signals: Signal[],
    findings: Finding[],
    x: ReadingData,
  ) {
    if (ctx.ids.length !== 1 || ctx.ids[0] !== ctx.callerBusinessId) return; // only the business's own reading is kept
    const dayDate = localDate(ctx.business.timezone);
    const risk = x.stock.filter(
      (s) =>
        s.stock <= s.threshold ||
        (s.coverDays !== null && s.coverDays <= ctx.thresholds.stockCoverDays),
    ).length;
    const data = {
      stateLabel: state.label,
      summary: state.summary,
      counts: {
        ...state.counts,
        inventoryRisk: risk,
        revenue: x.cur.revenue,
        grossProfit: x.cur.grossProfit,
        overdue: x.credit.overdue,
      } as Prisma.InputJsonValue,
      signals: signals.map((s) => ({
        key: s.key,
        n: s.n,
        v: s.v,
        ch: s.ch,
        tone: s.tone,
      })) as Prisma.InputJsonValue,
      findings: findings.map((f) => ({
        key: f.key,
        kind: f.kind,
        t: f.t,
        d: f.d,
        impactLabel: f.impactLabel,
      })) as Prisma.InputJsonValue,
    };
    await this.prisma.brainSnapshot.upsert({
      where: {
        businessId_day: { businessId: ctx.callerBusinessId, day: dayDate },
      },
      create: { businessId: ctx.callerBusinessId, day: dayDate, ...data },
      update: data,
    });
  }

  medianReply(x: ReadingData) {
    return median(x.cur.inboxFirstReplies);
  }
}
