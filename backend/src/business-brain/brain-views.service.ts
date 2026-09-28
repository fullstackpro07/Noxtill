import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  PoliciesService,
  resolvePolicies,
} from '../common/policies/policies.service';
import { CashForecastService } from '../profit/cash-forecast.service';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  BrainContextService,
  ScopeQuery,
  ago,
  day,
  money,
  plural,
} from './brain-context.service';
import { BrainDetectorsService } from './brain-detectors.service';
import { BrainReadingService, localDate } from './brain-reading.service';
import {
  BrainActionsService,
  ACTION_TYPE_LABEL,
  capabilityHolders,
} from './brain-actions.service';
import { BrainDecisionsService } from './brain-decisions.service';
import { BrainWatchService } from './brain-watch.service';
import { BRAIN_ERRORS, BRAIN_RULE_KEYS } from './brain.constants';
import { Finding } from './brain.types';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

const DAY = 86400000;

type Visible = Finding & { watching: boolean };

function card(f: Visible, preparedKeys: Set<string>) {
  return {
    key: f.key,
    kind: f.kind,
    t: f.t,
    d: f.d,
    src: f.src,
    impact: f.impactLabel,
    conf: f.conf,
    confWhy: f.confWhy,
    what: f.what,
    why: f.why,
    evidence: f.evidence,
    modules: f.modules,
    rec: f.rec,
    recWhy: f.recWhy,
    limit: f.limit,
    who: f.who,
    urgency: f.urgency,
    watching: f.watching,
    diagnose: f.diagnose,
    link: f.link,
    action: f.action
      ? {
          type: f.action.type,
          label: f.action.label,
          blockedReason: f.action.blockedReason ?? null,
          prepared: preparedKeys.has(f.key),
        }
      : null,
  };
}

@Injectable()
export class BrainViewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: PoliciesService,
    private readonly context: BrainContextService,
    private readonly detectors: BrainDetectorsService,
    private readonly reading: BrainReadingService,
    private readonly actions: BrainActionsService,
    private readonly decisions: BrainDecisionsService,
    private readonly watch: BrainWatchService,
    private readonly cash: CashForecastService,
  ) {}

  private async openActionKeys(businessId: string) {
    const rows = await this.prisma.brainAction.findMany({
      where: {
        businessId,
        status: { in: ['prepared', 'approved', 'blocked'] },
      },
      select: { findingKey: true },
    });
    return new Set(
      rows.map((r) => r.findingKey).filter((k): k is string => !!k),
    );
  }

  async command(user: AuthenticatedUser, q: ScopeQuery) {
    const ctx = await this.context.build(user, q);
    await this.actions.refreshBlocked(user, q);
    const x = await this.detectors.read(ctx);
    const findings = await this.reading.visibleFindings(ctx, x);
    const weekAgoSnap = await this.prisma.brainSnapshot.findFirst({
      where: {
        businessId: user.businessId,
        day: { lte: new Date(Date.now() - 6.5 * DAY) },
      },
      orderBy: { day: 'desc' },
    });
    const signals = this.reading.signals(ctx, x, weekAgoSnap);
    const state = this.reading.state(ctx, x, findings);
    const [trust, actionList, openKeys, pendingDecisions] = await Promise.all([
      this.reading.trust(ctx, x),
      this.actions.list(user),
      this.openActionKeys(user.businessId),
      this.pendingDecisions(user.businessId, findings),
    ]);
    const prepared = actionList.filter((a) =>
      ['prepared', 'approved', 'blocked'].includes(a.status),
    );
    await this.reading.saveSnapshot(ctx, state, signals, findings, x);
    return {
      scope: { label: ctx.scopeLabel, compare: ctx.window.label },
      state,
      trust,
      attention: findings
        .filter((f) => f.kind !== 'Improving')
        .map((f) => card(f, openKeys)),
      brief: this.reading.brief(ctx, x, findings, signals, prepared.length),
      prepared: prepared.slice(0, 6),
      preparedCount: prepared.length,
      signals,
      positives: findings
        .filter((f) => f.kind === 'Improving')
        .map((f) => ({ t: f.t, d: f.d })),
      badges: {
        command: state.counts.critical + state.counts.attention,
        decisions: pendingDecisions.length,
        actions: prepared.filter((a) => a.status !== 'blocked').length,
      },
      readAt: new Date().toISOString(),
    };
  }

  async situation(user: AuthenticatedUser, q: ScopeQuery) {
    const ctx = await this.context.build(user, q);
    const x = await this.detectors.read(ctx);
    const findings = await this.reading.visibleFindings(ctx, x);
    const signals = this.reading.signals(ctx, x, null);
    const [changes, ev] = await Promise.all([
      this.reading.changes(ctx, x, findings, signals),
      this.reading.events(ctx, x),
    ]);
    return {
      scope: { label: ctx.scopeLabel, compare: ctx.window.label },
      chain: this.reading.chain(ctx, x),
      changes,
      events: ev.events,
      totalRecords: ev.totalRecords,
    };
  }

  async opportunity(user: AuthenticatedUser, q: ScopeQuery) {
    const ctx = await this.context.build(user, q);
    const x = await this.detectors.read(ctx);
    const findings = await this.reading.visibleFindings(ctx, x);
    const openKeys = await this.openActionKeys(user.businessId);
    const current = new Set(x.findings.map((f) => f.key));
    const snaps = await this.prisma.brainSnapshot.findMany({
      where: {
        businessId: user.businessId,
        day: { gte: new Date(Date.now() - 30 * DAY) },
      },
      orderBy: { day: 'asc' },
    });
    const seen = new Map<
      string,
      { t: string; d: string; kind: string; first: Date; last: Date }
    >();
    for (const s of snaps) {
      for (const f of (s.findings as {
        key: string;
        t: string;
        d: string;
        kind: string;
      }[]) ?? []) {
        if (f.kind === 'Improving') continue;
        const prev = seen.get(f.key);
        seen.set(f.key, {
          t: f.t,
          d: f.d,
          kind: f.kind,
          first: prev?.first ?? s.day,
          last: s.day,
        });
      }
    }
    const resolved = [...seen.entries()]
      .filter(([k]) => !current.has(k))
      .map(([key, v]) => ({
        key,
        t: v.t,
        d: `Raised ${day(ctx.business, v.first)}; last seen in the reading of ${day(ctx.business, v.last)} and no longer true.`,
        kind: v.kind,
        closed: day(ctx.business, new Date(v.last.getTime() + DAY)),
      }))
      .reverse();
    const watches = await this.watch.list(user);
    return {
      opportunities: findings
        .filter((f) => f.kind === 'Opportunity')
        .map((f) => card(f, openKeys)),
      risks: findings
        .filter((f) => f.kind === 'Critical' || f.kind === 'Attention')
        .map((f) => card(f, openKeys)),
      resolved,
      watches,
      historyDays: snaps.length,
    };
  }

  async outlook(user: AuthenticatedUser, q: ScopeQuery) {
    const ctx = await this.context.build(user, q);
    const b = ctx.business;
    const x = await this.detectors.read(ctx);
    const now = new Date();
    const [
      forecast,
      obligations,
      bookingsNext,
      bookingsLast,
      quotesExpiring,
      expensesRecorded,
    ] = await Promise.all([
      this.cash.forecast(user.businessId, 30),
      this.prisma.recurringObligation.findMany({
        where: {
          businessId: { in: ctx.ids },
          active: true,
          nextDueDate: { lte: new Date(now.getTime() + 30 * DAY) },
        },
        orderBy: { nextDueDate: 'asc' },
        take: 10,
      }),
      this.prisma.appointment.count({
        where: {
          businessId: { in: ctx.ids },
          startsAt: { gte: now, lt: new Date(now.getTime() + 7 * DAY) },
          status: { notIn: ['cancelled'] },
        },
      }),
      this.prisma.appointment.count({
        where: {
          businessId: { in: ctx.ids },
          startsAt: { gte: new Date(now.getTime() - 7 * DAY), lt: now },
          status: { notIn: ['cancelled'] },
        },
      }),
      this.prisma.order.findMany({
        where: {
          businessId: { in: ctx.ids },
          isQuotation: true,
          quotationStatus: 'sent',
          quotationValidUntil: {
            gte: now,
            lt: new Date(now.getTime() + 7 * DAY),
          },
        },
        select: {
          orderNo: true,
          total: true,
          quotationValidUntil: true,
          customer: { select: { name: true } },
        },
        orderBy: { quotationValidUntil: 'asc' },
      }),
      // Same window the cash forecast averages expenses over, so "none recorded" is exact.
      this.prisma.expense.count({
        where: {
          businessId: user.businessId,
          incurredOn: { gte: new Date(now.getTime() - 30 * DAY) },
        },
      }),
    ]);
    const proj = forecast.projection as unknown as {
      date: string;
      cumulativeNet: number;
    }[];
    const end = proj[proj.length - 1];
    const runouts = x.stock
      .filter((s) => s.perDay > 0 && s.coverDays !== null && s.coverDays <= 14)
      .sort((a, c) => a.coverDays! - c.coverDays!)
      .slice(0, 8)
      .map((s) => ({
        n: s.name,
        stock: s.stock,
        perDay: Number(s.perDay.toFixed(1)),
        date: day(b, new Date(now.getTime() + s.coverDays! * DAY)),
        days: Math.max(0, Math.round(s.coverDays!)),
      }));
    const soonOverdue = (
      await this.prisma.$queryRaw<
        {
          customer_id: string;
          name: string;
          balance: unknown;
          days_outstanding: unknown;
        }[]
      >`
      SELECT v.customer_id, c.name, v.balance, v.days_outstanding FROM v_credit_balances v JOIN customers c ON c.id = v.customer_id
      WHERE v.business_id IN (${Prisma.join(ctx.ids)}) AND v.balance > 0 AND v.days_outstanding >= ${ctx.thresholds.overdueDays - 7} AND v.days_outstanding < ${ctx.thresholds.overdueDays}
      ORDER BY v.days_outstanding DESC, v.customer_id LIMIT 10
    `
    ).map((r) => ({
      n: r.name,
      balance: money(b, Number(r.balance)),
      inDays: ctx.thresholds.overdueDays - Number(r.days_outstanding),
      customerId: r.customer_id,
    }));
    return {
      cash: {
        dailyRevenue: money(b, forecast.dailyAvgRevenue),
        dailyExpense: money(b, forecast.dailyAvgExpense),
        expensesRecorded,
        net30: end ? money(b, end.cumulativeNet) : '—',
        netPositive: end ? end.cumulativeNet >= 0 : true,
        shortfalls: forecast.shortfallDates
          .slice(0, 5)
          .map((d) => day(b, new Date(`${d}T12:00:00Z`))),
        points: proj.map((p) => ({
          d: p.date,
          v: Math.round(p.cumulativeNet),
        })),
        basis:
          'Projected from the trailing 30-day average of revenue and expenses, plus recurring obligations on the days they fall due. Covers this business only, not other branches.',
      },
      obligations: obligations.map((o) => ({
        n: o.name,
        amount: money(b, Number(o.amount)),
        due: day(b, o.nextDueDate),
      })),
      runouts,
      bookings: { next7: bookingsNext, last7: bookingsLast },
      soonOverdue,
      quotesExpiring: quotesExpiring.map((qq) => ({
        n: `#${qq.orderNo}${qq.customer ? ` · ${qq.customer.name}` : ''}`,
        total: money(b, Number(qq.total)),
        until: day(b, qq.quotationValidUntil!),
      })),
    };
  }

  private async pendingDecisions(businessId: string, findings: Visible[]) {
    const [states, open] = await Promise.all([
      this.prisma.brainFindingState.findMany({ where: { businessId } }),
      this.openActionKeys(businessId),
    ]);
    const decided = new Set(states.map((s) => s.key));
    return findings.filter(
      (f) =>
        (f.kind === 'Critical' || f.kind === 'Attention') &&
        !decided.has(f.key) &&
        !open.has(f.key),
    );
  }

  async decisionsView(user: AuthenticatedUser, q: ScopeQuery) {
    const ctx = await this.context.build(user, q);
    const x = await this.detectors.read(ctx);
    const findings = await this.reading.visibleFindings(ctx, x);
    const open = await this.openActionKeys(user.businessId);
    const pending = await this.pendingDecisions(user.businessId, findings);
    const log = await this.decisions.logList(user.businessId);
    return {
      pending: pending.map((f) => card(f, open)),
      log: log.map((l) => ({
        id: l.id,
        t: l.title,
        decision: l.decision,
        reason: l.reason,
        who: l.actorName ?? 'Business Brain',
        when: `${day(ctx.business, l.createdAt)} ${ago(l.createdAt)}`,
        findingKey: l.findingKey,
      })),
    };
  }

  async memory(user: AuthenticatedUser) {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: user.businessId },
    });
    const p = resolvePolicies(business);
    const [states, canEdit] = await Promise.all([
      this.decisions.states(user.businessId),
      this.policies.actorCan(CAPABILITIES.BRAIN_APPROVE),
    ]);
    return {
      rules: BRAIN_RULE_KEYS.map((r) => ({
        key: r.key,
        label: r.label,
        unit: r.unit,
        d: r.d,
        value: p.num(r.key as never),
      })),
      discountLimit: p.num('sales.maxDiscountPercent'),
      dismissed: states
        .filter((s) => s.status === 'dismissed')
        .map((s) => ({
          key: s.key,
          t: s.title,
          reason: s.reason,
          who: s.actorName,
          when: day({ ...business, id: business.id }, s.updatedAt),
        })),
      watching: states
        .filter((s) => s.status === 'watching')
        .map((s) => ({
          key: s.key,
          t: s.title,
          who: s.actorName,
          when: day({ ...business, id: business.id }, s.updatedAt),
        })),
      canEdit,
    };
  }

  async setRule(user: AuthenticatedUser, key: string, value: number) {
    if (!BRAIN_RULE_KEYS.some((r) => r.key === key))
      throw new AppException(
        BRAIN_ERRORS.BAD_RULE,
        'Unknown rule.',
        HttpStatus.BAD_REQUEST,
      );
    const normalized = this.policies.normalize(key, value);
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: user.businessId },
      select: { policies: true },
    });
    const next = {
      ...((business.policies as Record<string, unknown>) ?? {}),
      [key]: normalized,
    };
    await this.prisma.business.update({
      where: { id: user.businessId },
      data: { policies: next as Prisma.InputJsonValue },
    });
    await this.decisions.log(user.businessId, {
      title: `Rule changed: ${BRAIN_RULE_KEYS.find((r) => r.key === key)!.label} ${String(normalized)}`,
      decision: 'rule',
      actor: {
        id: user.sub,
        name:
          (
            await this.prisma.user.findUnique({
              where: { id: user.sub },
              select: { name: true },
            })
          )?.name ?? null,
      },
    });
    return this.memory(user);
  }

  async history(user: AuthenticatedUser) {
    const b = await this.prisma.business.findUniqueOrThrow({
      where: { id: user.businessId },
      select: {
        id: true,
        name: true,
        currency: true,
        locale: true,
        timezone: true,
      },
    });
    const [snaps, questions] = await Promise.all([
      this.prisma.brainSnapshot.findMany({
        where: { businessId: user.businessId },
        orderBy: { day: 'desc' },
        take: 60,
      }),
      this.prisma.brainQuestion.findMany({
        where: { businessId: user.businessId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    const today = localDate(b.timezone).getTime();
    return {
      readings: snaps.map((s, i) => {
        const keys = new Set(
          ((s.findings as { key: string }[]) ?? []).map((f) => f.key),
        );
        const older = snaps[i + 1];
        const olderKeys = new Set(
          ((older?.findings as { key: string }[]) ?? []).map((f) => f.key),
        );
        return {
          id: s.id,
          day: s.day.getTime() === today ? 'Today' : day(b, s.day),
          label: s.stateLabel,
          summary: s.summary,
          counts: s.counts,
          findings: (
            (s.findings as { key: string; kind: string; t: string }[]) ?? []
          ).map((f) => ({
            kind: f.kind,
            t: f.t,
            isNew: older ? !olderKeys.has(f.key) : false,
          })),
          cleared: older
            ? (
                (older.findings as {
                  key: string;
                  t: string;
                  kind: string;
                }[]) ?? []
              )
                .filter((f) => !keys.has(f.key) && f.kind !== 'Improving')
                .map((f) => f.t)
            : [],
        };
      }),
      questions: questions.map((qq) => ({
        id: qq.id,
        kind: qq.kind,
        q: qq.question,
        a: qq.answer,
        source:
          qq.source === 'assistant'
            ? 'Noxtill assistant'
            : 'Business Brain reading',
        when: `${day(b, qq.createdAt)} · ${ago(qq.createdAt)}`,
      })),
    };
  }

  async governance(user: AuthenticatedUser, q: ScopeQuery) {
    const ctx = await this.context.build(user, q);
    const x = await this.detectors.read(ctx);
    const [trust, customRoles, actions, noReorder, ai] = await Promise.all([
      this.reading.trust(ctx, x),
      this.prisma.customRole.findMany({
        where: { businessId: user.businessId },
        select: { name: true, capabilities: true },
      }),
      this.prisma.brainAction.groupBy({
        by: ['type', 'status'],
        where: { businessId: user.businessId },
        _count: { _all: true },
      }),
      this.prisma.product.count({
        where: {
          businessId: { in: ctx.ids },
          active: true,
          kind: 'product',
          lowStockThreshold: 0,
        },
      }),
      this.prisma.aiCallLog.groupBy({
        by: ['kind'],
        where: {
          businessId: user.businessId,
          kind: { in: ['assistant_chat'] },
          createdAt: { gte: new Date(Date.now() - 30 * DAY) },
        },
        _count: { _all: true },
      }),
    ]);
    const count = (type: string, status: string) =>
      actions.find((a) => a.type === type && a.status === status)?._count
        ._all ?? 0;
    const approvals = Object.entries(ACTION_TYPE_LABEL).map(([type, label]) => {
      const cap =
        type === 'credit_reminders'
          ? CAPABILITIES.CREDIT_MANAGE
          : type === 'reorder_draft'
            ? CAPABILITIES.PURCHASES_MANAGE
            : CAPABILITIES.BRAIN_APPROVE;
      return {
        type,
        label,
        who: capabilityHolders(cap, customRoles),
        prepared: count(type, 'prepared') + count(type, 'blocked'),
        done: count(type, 'done'),
        failed: count(type, 'failed'),
      };
    });
    return {
      sources: trust,
      gaps: [
        {
          t: x.missingCosts.length
            ? `${plural(x.missingCosts.length, 'product')} sold without a cost price`
            : 'Every product sold has a cost price',
          d: x.missingCosts.length
            ? 'Left out of margin figures.'
            : 'Margin figures cover every product sold in the last 30 days.',
          level: x.missingCosts.length ? 'bad' : 'ok',
          items: x.missingCosts.slice(0, 20).map((m) => m.name),
          link: x.missingCosts.length
            ? { label: 'Open Products', href: '/products' }
            : null,
        },
        {
          t: noReorder
            ? `${plural(noReorder, 'product')} with no reorder level`
            : 'Every product has a reorder level',
          d: noReorder
            ? 'Stock warnings rely on the sales rate alone for these.'
            : 'Stock warnings use your reorder levels as well as the sales rate.',
          level: noReorder ? 'warn' : 'ok',
          items: [],
          link: noReorder
            ? { label: 'Open Inventory', href: '/inventory' }
            : null,
        },
        {
          t: 'Marketing attribution',
          d: 'Sales are not linked to campaigns, so return on marketing is never shown.',
          level: 'bad',
          items: [],
          link: null,
        },
      ],
      approvals,
      ai: [
        {
          t: 'Readings, findings and root causes',
          d: 'Arithmetic on your records — no AI is involved, and every figure links to its records.',
          ai: false,
        },
        {
          t: 'Ask Business Brain',
          d: `Questions the Brain has a reading for are answered from it. Others go to the Noxtill assistant, which uses read-only lookups. ${ai.find((a) => a.kind === 'assistant_chat')?._count._all ?? 0} assistant calls in the last 30 days across all of Noxtill, not only from here.`,
          ai: true,
        },
        {
          t: 'Quiet-day offer wording',
          d: 'Drafted by AI when you prepare the action; you can edit it before approving.',
          ai: true,
        },
        {
          t: 'Nothing runs by itself',
          d: 'Every action needs a person with the right permission to approve it, then to run it. The decision log records both names.',
          ai: false,
        },
      ],
    };
  }
}
