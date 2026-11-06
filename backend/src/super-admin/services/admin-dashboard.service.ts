import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BUSINESS_MODULES } from '../../business-modules/business-modules.constants';
import { dateRange, num } from '../super-admin.util';

type Range = { gte?: Date; lte?: Date };

const DAY = 86_400_000;

function days(range: Range): string[] {
  const start = new Date(range.gte!);
  start.setUTCHours(0, 0, 0, 0);
  const end = range.lte ?? new Date();
  const out: string[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += DAY)
    out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

function bucket<T>(rows: T[], at: (r: T) => Date, keys: string[]) {
  const map = new Map(keys.map((k) => [k, 0]));
  for (const r of rows) {
    const k = at(r).toISOString().slice(0, 10);
    if (map.has(k)) map.set(k, map.get(k)! + 1);
  }
  return keys.map((date) => ({ date, count: map.get(date)! }));
}

/**
 * Platform dashboard (PRD §3). All figures are computed from real rows at request time. Reporting
 * timezone is UTC. Revenue treatment (shown on the page):
 *  - MRR = sum over subscriptions in `active` or `past_due` of the plan's list price — monthly
 *    plans at `price`, yearly plans at `yearlyPrice / 12`. Trials, paused and cancelled-and-ended
 *    subscriptions count 0.
 *  - Discounts, coupons, taxes and refunds are NOT reflected: Noxtill does not store Stripe
 *    invoices locally (they are fetched live per customer), so list price is the honest basis.
 *  - ARR = MRR × 12.
 */
@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(q: { from?: string; to?: string }) {
    const range: Range = dateRange(q.from, q.to) ?? {
      gte: new Date(Date.now() - 29 * DAY),
    };
    const now = new Date();
    const active30 = new Date(Date.now() - 30 * DAY);

    const [
      totalBusinesses,
      suspendedBusinesses,
      archivedBusinesses,
      subs,
      totalUsers,
      activeUsers,
      creditsConsumed,
      usageEvents,
      newBusinesses,
      newUsers,
      signIns,
      failedLogins,
      planChanges,
      roots,
    ] = await Promise.all([
      this.prisma.business.count({ where: { parentId: null } }),
      this.prisma.business.count({
        where: { parentId: null, platformStatus: 'suspended' },
      }),
      this.prisma.business.count({
        where: { parentId: null, platformStatus: 'archived' },
      }),
      this.prisma.subscription.findMany({
        select: {
          businessId: true,
          status: true,
          billingInterval: true,
          periodEnd: true,
          pastDueSince: true,
          cancelAtPeriodEnd: true,
          plan: {
            select: { key: true, name: true, price: true, yearlyPrice: true },
          },
        },
      }),
      this.prisma.user.count(),
      this.prisma.session
        .groupBy({ by: ['userId'], where: { lastUsedAt: { gte: active30 } } })
        .then((r) => r.length),
      this.prisma.creditLedger.aggregate({
        where: { state: 'committed', settledAt: range },
        _sum: { actualQty: true },
      }),
      this.prisma.usageEvent.groupBy({
        by: ['metricCode'],
        where: { status: 'completed', occurredAt: range },
        _sum: { quantity: true },
        _count: { _all: true },
      }),
      this.prisma.business.findMany({
        where: { parentId: null, createdAt: range },
        select: { createdAt: true },
      }),
      this.prisma.user.findMany({
        where: { createdAt: range },
        select: { createdAt: true },
      }),
      this.prisma.securityEvent.findMany({
        where: {
          type: { in: ['login_success', 'login_new_device'] },
          createdAt: range,
        },
        select: { createdAt: true, userId: true },
      }),
      this.prisma.securityEvent.findMany({
        where: {
          type: {
            in: [
              'login_failed',
              'login_unknown_account',
              'account_locked',
              'two_factor_failed',
            ],
          },
          createdAt: range,
        },
        select: { createdAt: true },
      }),
      this.prisma.entitlementAudit.findMany({
        where: { changeType: 'plan_change', createdAt: range },
        select: { before: true, after: true, createdAt: true, reason: true },
      }),
      this.prisma.business.findMany({
        where: { parentId: null },
        select: { id: true, platformStatus: true, disabledModules: true },
      }),
    ]);

    // Platform-suspended/archived businesses are excluded from billing-state counts.
    const blocked = new Set(
      roots.filter((r) => r.platformStatus !== 'active').map((r) => r.id),
    );
    const live = subs.filter((s) => !blocked.has(s.businessId));
    const statusCount = (st: string) =>
      live.filter((s) => s.status === st).length;
    const paying = live.filter(
      (s) => s.status === 'active' || s.status === 'past_due',
    );
    const mrr = paying.reduce((acc, s) => {
      if (s.billingInterval === 'year')
        return (
          acc +
          (s.plan.yearlyPrice == null ? 0 : Number(s.plan.yearlyPrice) / 12)
        );
      return acc + Number(s.plan.price);
    }, 0);
    const accessStatuses = ['active', 'trialing', 'past_due'];
    const activeBusinesses = live.filter(
      (s) =>
        accessStatuses.includes(s.status) &&
        !(s.status === 'cancelled' && s.periodEnd <= now),
    ).length;

    const keys = days(range);
    const signInsByDay = new Map(keys.map((k) => [k, new Set<string>()]));
    for (const e of signIns) {
      const k = e.createdAt.toISOString().slice(0, 10);
      if (e.userId) signInsByDay.get(k)?.add(e.userId);
    }

    const planDist = new Map<
      string,
      { key: string; name: string; count: number }
    >();
    for (const s of live) {
      const cur = planDist.get(s.plan.key) ?? {
        key: s.plan.key,
        name: s.plan.name,
        count: 0,
      };
      cur.count += 1;
      planDist.set(s.plan.key, cur);
    }

    // Trial → paid and cancellations inside the range, from the real entitlement audit trail.
    let conversions = 0;
    let cancellations = 0;
    for (const a of planChanges) {
      const before = (a.before ?? {}) as Record<string, unknown>;
      const after = (a.after ?? {}) as Record<string, unknown>;
      if (before.status === 'trialing' && after.plan && after.plan !== 'trial')
        conversions += 1;
      if (after.cancelAtPeriodEnd === true) cancellations += 1;
    }
    const trialsEnded = await this.prisma.entitlementAudit.count({
      // `endDueTrials` (usage/subscription.service.ts) writes exactly this on a lapsed trial.
      where: {
        changeType: 'suspension',
        createdAt: range,
        reason: { startsWith: 'Trial ended' },
      },
    });

    const moduleOn = BUSINESS_MODULES.map((m) => ({
      key: m.key,
      label: m.label,
      enabledFor: roots.filter(
        (r) =>
          !(
            Array.isArray(r.disabledModules) &&
            r.disabledModules.includes(m.key)
          ),
      ).length,
    }));

    const metric = (code: string) =>
      usageEvents.find((u) => u.metricCode === code);

    return {
      timezone: 'UTC',
      range: { from: range.gte ?? null, to: range.lte ?? now },
      kpis: {
        totalBusinesses,
        activeBusinesses,
        trialBusinesses: statusCount('trialing'),
        suspendedBusinesses,
        archivedBusinesses,
        totalUsers,
        activeUsers30d: activeUsers,
        mrrUsd: Math.round(mrr * 100) / 100,
        arrUsd: Math.round(mrr * 12 * 100) / 100,
        activeSubscriptions: statusCount('active'),
        pastDueSubscriptions: statusCount('past_due'),
        pausedSubscriptions: statusCount('paused'),
        cancellingSubscriptions: live.filter((s) => s.cancelAtPeriodEnd).length,
        businessesWithoutSubscriptionRecord: Math.max(
          0,
          totalBusinesses - subs.length,
        ),
        aiCreditsConsumed: num(creditsConsumed._sum.actualQty),
        meteredEvents: usageEvents.reduce((a, u) => a + u._count._all, 0),
      },
      revenueBasis:
        'List price of active and past-due subscriptions (yearly ÷ 12). Discounts, coupons, taxes and refunds are not reflected — Stripe invoices are not stored in Noxtill.',
      trends: {
        businessRegistrations: bucket(newBusinesses, (r) => r.createdAt, keys),
        userRegistrations: bucket(newUsers, (r) => r.createdAt, keys),
        dailySignIns: keys.map((date) => ({
          date,
          count: signInsByDay.get(date)!.size,
        })),
        failedLogins: bucket(failedLogins, (r) => r.createdAt, keys),
      },
      subscriptions: {
        byPlan: [...planDist.values()].sort((a, b) => b.count - a.count),
        byStatus: ['trialing', 'active', 'past_due', 'paused', 'cancelled'].map(
          (s) => ({
            status: s,
            count: statusCount(s),
          }),
        ),
        trialConversions: conversions,
        trialsEndedWithoutPlan: trialsEnded,
        cancellations,
      },
      modules: moduleOn,
      communications: {
        whatsapp: num(metric('whatsapp_messages')?._sum.quantity),
        sms: num(metric('sms_segments')?._sum.quantity),
        email: num(metric('emails')?._sum.quantity),
      },
      notTracked: [
        'MRR history (no revenue snapshots are stored, so only the current MRR is shown)',
      ],
    };
  }

  /** Recent platform events (PRD §3.3), each linking to its record. */
  async feed() {
    const [businesses, adminActions, billing, security, users] =
      await Promise.all([
        this.prisma.business.findMany({
          where: { parentId: null },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          take: 10,
          select: { id: true, name: true, createdAt: true },
        }),
        this.prisma.platformAuditLog.findMany({
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          take: 15,
        }),
        this.prisma.entitlementAudit.findMany({
          where: { actorType: { in: ['user', 'stripe'] } },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          take: 15,
        }),
        this.prisma.securityEvent.findMany({
          where: { severity: { in: ['high', 'critical'] } },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          take: 15,
        }),
        this.prisma.user.findMany({
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          take: 10,
          select: { id: true, name: true, createdAt: true },
        }),
      ]);
    const names = new Map(
      (
        await this.prisma.business.findMany({
          where: {
            id: {
              in: [
                ...billing.map((b) => b.businessId),
                ...adminActions
                  .map((a) => a.businessId)
                  .filter((x): x is string => !!x),
                ...security
                  .map((s) => s.businessId)
                  .filter((x): x is string => !!x),
              ],
            },
          },
          select: { id: true, name: true },
        })
      ).map((b) => [b.id, b.name]),
    );
    const items = [
      ...businesses.map((b) => ({
        kind: 'business_registered',
        at: b.createdAt,
        title: `${b.name} registered`,
        href: `/super-admin/businesses/${b.id}`,
        severity: null as string | null,
      })),
      ...users.map((u) => ({
        kind: 'user_registered',
        at: u.createdAt,
        title: `${u.name} joined`,
        href: `/super-admin/users/${u.id}`,
        severity: null,
      })),
      ...adminActions.map((a) => ({
        kind: 'admin_action',
        at: a.createdAt,
        title: `${a.adminEmail}: ${a.action.replace(/[._]/g, ' ')}${a.businessId ? ` — ${names.get(a.businessId) ?? ''}` : ''}`,
        href: a.businessId
          ? `/super-admin/businesses/${a.businessId}`
          : '/super-admin/admin/audit',
        severity: null,
      })),
      ...billing.map((b) => ({
        kind: `billing_${b.changeType}`,
        at: b.createdAt,
        title: `${names.get(b.businessId) ?? 'A business'}: ${b.reason ?? b.changeType}`,
        href: `/super-admin/businesses/${b.businessId}?tab=subscription`,
        severity: null,
      })),
      ...security.map((s) => ({
        kind: 'security_alert',
        at: s.createdAt,
        title: `${s.type.replace(/_/g, ' ')}${s.identifier ? ` — ${s.identifier}` : ''}${s.businessId ? ` (${names.get(s.businessId) ?? ''})` : ''}`,
        href: s.userId
          ? `/super-admin/users/${s.userId}`
          : '/super-admin/security?tab=events',
        severity: s.severity,
      })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 30);
    return { items };
  }
}
