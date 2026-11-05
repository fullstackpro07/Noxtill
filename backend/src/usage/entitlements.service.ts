import { Injectable } from '@nestjs/common';
import { Plan, PlanEntitlement, Prisma, Subscription } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementCacheService } from './entitlement-cache.service';
import {
  CAP_GROUP_METRICS,
  CapGroup,
  DEFAULT_MAX_CALL_MINUTES,
  DEFAULT_SPEND_CAPS,
  DUNNING_METERED_PAUSE_DAYS,
  DUNNING_SUSPEND_DAYS,
  EntitlementKind,
  METRICS,
  MetricCode,
  TRIAL_DAYS,
  TRIAL_PLAN_KEY,
} from './usage.constants';
import {
  addDaysUtc,
  addMonthsUtc,
  usageWindow,
  Window,
} from './usage-period.util';

export type SubscriptionWithPlan = Subscription & {
  plan: Plan & { entitlements: PlanEntitlement[] };
  scheduledPlan: Plan | null;
};

export type MetricState =
  | 'ok'
  | 'approaching'
  | 'at_limit'
  | 'exceeded'
  | 'not_configured'
  | 'unavailable';

export interface ResolvedMetric {
  code: string;
  kind: EntitlementKind;
  /** NULL = not_configured (never "unlimited"). */
  included: number | null;
  purchased: number;
  used: number;
  reserved: number;
  remaining: number | null;
  state: MetricState;
  /** Whether a not_configured value blocks usage (see MeterDefinition.enforced). */
  enforced: boolean;
  resetsAt: string | null;
}

export interface SpendCapState {
  group: CapGroup;
  capUsd: number;
  spentUsd: number;
  reservedUsd: number;
  remainingUsd: number;
  maxCallMinutes: number | null;
  fallback: string | null;
}

export interface EntitlementSet {
  businessId: string;
  resolvedAt: string;
  version: number;
  planKey: string;
  planName: string;
  /** The plan chosen to start after a trial / at the next renewal. */
  scheduledPlanKey: string | null;
  scheduledInterval: string | null;
  interval: string;
  status: string;
  /** past_due ≥ 8 days, or paused/cancelled: credits, SMS, email and voice are refused. */
  meteredPaused: boolean;
  /** paused, or past_due ≥ 15 days: read and export only. */
  suspended: boolean;
  billingPeriod: { start: string; end: string };
  usagePeriod: { start: string; end: string };
  trialEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  metrics: Record<string, ResolvedMetric>;
  spendCaps: Record<CapGroup, SpendCapState>;
  features: Record<string, boolean | null>;
}

export function stateFor(used: number, limit: number | null): MetricState {
  if (limit == null) return 'not_configured';
  if (limit <= 0) return used > 0 ? 'exceeded' : 'at_limit';
  const pct = (used / limit) * 100;
  if (pct >= 100) return 'exceeded';
  if (pct >= 90) return 'at_limit';
  if (pct >= 50) return 'approaching';
  return 'ok';
}

const TOLL_FREE_PREFIXES = [
  '+1800',
  '+1833',
  '+1844',
  '+1855',
  '+1866',
  '+1877',
  '+1888',
];
export function isTollFree(number: string): boolean {
  const n = number.replace(/[^+\d]/g, '');
  return TOLL_FREE_PREFIXES.some((p) => n.startsWith(p));
}

/**
 * Resolves a business's effective entitlement set (spec §6): plan entitlements + purchased
 * capacity − suspensions, with usage counted from real rows. Every business in a branch group
 * shares the group ROOT's subscription and allowances, so every entry point first maps the
 * caller's business id to its root.
 *
 * Uses `PrismaService` with explicit ids (not the CLS-scoped TenantPrismaService) because it is
 * also called from background jobs, Stripe webhooks and the public API, none of which carry a
 * tenant context. The caller always passes a business id taken from an authenticated context.
 */
@Injectable()
export class EntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: EntitlementCacheService,
  ) {}

  async rootId(businessId: string): Promise<string> {
    const b = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, parentId: true },
    });
    return b?.parentId ?? b?.id ?? businessId;
  }

  async groupIds(rootId: string): Promise<string[]> {
    const rows = await this.prisma.business.findMany({
      where: { OR: [{ id: rootId }, { parentId: rootId }] },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /**
   * Returns the root's subscription, creating it on first touch. A business already paying
   * through Stripe becomes `active` on its plan; any other business starts (or keeps) a 14-day
   * trial — an existing business whose trial had lapsed gets a fresh one from today (decided with
   * the product owner when this system was introduced).
   */
  async ensureSubscription(rootId: string): Promise<SubscriptionWithPlan> {
    const include = {
      plan: { include: { entitlements: true } },
      scheduledPlan: true,
    } as const;
    const existing = await this.prisma.subscription.findUnique({
      where: { businessId: rootId },
      include,
    });
    if (existing) return existing;

    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: rootId },
      include: { plan: true },
    });
    const now = new Date();
    const paying =
      !!business.stripeSubscriptionId &&
      !!business.plan &&
      !['basic', TRIAL_PLAN_KEY].includes(business.plan.key);
    const trialPlan = await this.prisma.plan.findUniqueOrThrow({
      where: { key: TRIAL_PLAN_KEY },
    });
    const trialEndsAt =
      business.trialEndsAt && business.trialEndsAt > now
        ? business.trialEndsAt
        : addDaysUtc(now, TRIAL_DAYS);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.subscription.create({
          data: paying
            ? {
                businessId: rootId,
                planId: business.planId!,
                status: 'active',
                periodStart: now,
                periodEnd: addMonthsUtc(now, 1),
                stripeSubscriptionId: business.stripeSubscriptionId,
                trialRemindersSent: [],
              }
            : {
                businessId: rootId,
                planId: trialPlan.id,
                status: 'trialing',
                periodStart: now,
                periodEnd: trialEndsAt,
                trialEndsAt,
                // A business that had already picked a paid plan keeps it as the after-trial choice.
                scheduledPlanId:
                  business.plan &&
                  !['basic', TRIAL_PLAN_KEY].includes(business.plan.key)
                    ? business.planId
                    : null,
                scheduledInterval: 'month',
                trialRemindersSent: [],
              },
        });
        for (const [group, capUsd] of Object.entries(DEFAULT_SPEND_CAPS)) {
          await tx.usageSpendCap.upsert({
            where: {
              businessId_capGroup: { businessId: rootId, capGroup: group },
            },
            create: {
              businessId: rootId,
              capGroup: group,
              capUsd,
              ...(group === 'voice'
                ? {
                    maxCallMinutes: DEFAULT_MAX_CALL_MINUTES,
                    fallback: 'voicemail',
                  }
                : {}),
            },
            update: {},
          });
        }
        await tx.entitlementAudit.create({
          data: {
            businessId: rootId,
            actorType: 'system',
            changeType: paying ? 'plan_change' : 'trial',
            after: {
              status: paying ? 'active' : 'trialing',
              plan: paying ? business.plan!.key : TRIAL_PLAN_KEY,
            },
            reason: 'Subscription record created',
          },
        });
      });
    } catch (error) {
      // A concurrent first touch created it — fine, read it back.
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      )
        throw error;
    }
    return this.prisma.subscription.findUniqueOrThrow({
      where: { businessId: rootId },
      include,
    });
  }

  includedFor(sub: SubscriptionWithPlan, metric: string): number | null {
    const row = sub.plan.entitlements.find((e) => e.metricCode === metric);
    return row?.includedQuantity == null ? null : Number(row.includedQuantity);
  }

  async purchasedCapacity(rootId: string, metric: string): Promise<number> {
    const agg = await this.prisma.capacityPurchase.aggregate({
      where: {
        businessId: rootId,
        metricCode: metric,
        status: 'active',
        recurring: true,
      },
      _sum: { quantity: true },
    });
    return agg._sum.quantity ?? 0;
  }

  /** Seats (spec CP-02..04): active members + pending invites, owner included, each person once. */
  async seatCounts(
    rootId: string,
  ): Promise<{ active: number; pending: number; total: number }> {
    const ids = await this.groupIds(rootId);
    const links = await this.prisma.businessUser.findMany({
      where: { businessId: { in: ids }, active: true },
      select: {
        userId: true,
        user: { select: { _count: { select: { sessions: true } } } },
      },
    });
    const byUser = new Map<string, boolean>();
    for (const l of links) {
      byUser.set(
        l.userId,
        (byUser.get(l.userId) ?? false) || l.user._count.sessions > 0,
      );
    }
    const active = [...byUser.values()].filter(Boolean).length;
    const pending = byUser.size - active;
    return { active, pending, total: byUser.size };
  }

  async locationCount(rootId: string): Promise<number> {
    return this.prisma.business.count({
      where: { OR: [{ id: rootId }, { parentId: rootId }], active: true },
    });
  }

  async numberCounts(rootId: string): Promise<{
    local: number;
    tollfree: number;
    numbers: { number: string; tollfree: boolean; since: Date }[];
  }> {
    const ids = await this.groupIds(rootId);
    const [main, tracking] = await Promise.all([
      this.prisma.phoneNumber.findMany({ where: { businessId: { in: ids } } }),
      this.prisma.voiceTrackingNumber.findMany({
        where: { businessId: { in: ids }, active: true },
      }),
    ]);
    const numbers = [
      ...main.map((n) => ({ number: n.phoneNumber, since: n.provisionedAt })),
      ...tracking.map((n) => ({ number: n.phoneNumber, since: n.createdAt })),
    ].map((n) => ({ ...n, tollfree: isTollFree(n.number) }));
    return {
      local: numbers.filter((n) => !n.tollfree).length,
      tollfree: numbers.filter((n) => n.tollfree).length,
      numbers,
    };
  }

  /** Usage-derived counters for the window, all from real rows. */
  private async usedCounts(
    rootId: string,
    win: Window,
  ): Promise<Record<string, number>> {
    const ids = await this.groupIds(rootId);
    const inGroup = { businessId: { in: ids } };
    const inWindow = { gte: win.start, lt: win.end };
    const [
      events,
      runs,
      pages,
      unpaged,
      keywords,
      esign,
      websites,
      integrations,
      agents,
    ] = await Promise.all([
      this.prisma.usageEvent.groupBy({
        by: ['metricCode'],
        where: {
          businessId: rootId,
          occurredAt: inWindow,
          status: 'completed',
        },
        _sum: { quantity: true },
      }),
      this.prisma.workflowRun.count({
        where: { ...inGroup, createdAt: inWindow },
      }),
      this.prisma.importBatch.aggregate({
        where: {
          ...inGroup,
          source: 'photo',
          createdAt: inWindow,
          status: { not: 'failed' },
        },
        _sum: { pageCount: true },
      }),
      this.prisma.importBatch.count({
        where: {
          ...inGroup,
          source: 'photo',
          createdAt: inWindow,
          status: { not: 'failed' },
          pageCount: null,
        },
      }),
      this.prisma.trackedKeyword.count({ where: inGroup }),
      this.prisma.ctSignRequest.count({
        where: { ...inGroup, sentAt: inWindow },
      }),
      this.prisma.websiteSite.count({ where: inGroup }),
      this.prisma.integration.count({
        where: { ...inGroup, status: 'connected' },
      }),
      this.prisma.voiceHumanAgentProfile.count({
        where: { ...inGroup, active: true },
      }),
    ]);
    const fromEvents: Record<string, number> = {};
    for (const e of events)
      fromEvents[e.metricCode] = Number(e._sum.quantity ?? 0);
    return {
      ...fromEvents,
      automation_runs: runs,
      // A scan with no recorded page count is one page.
      digitizer_pages: (pages._sum.pageCount ?? 0) + unpaged,
      seo_keywords: keywords,
      esign_transactions: esign,
      websites,
      integrations,
      agent_seats: agents,
    };
  }

  async spendCaps(
    rootId: string,
    win: Window,
  ): Promise<Record<CapGroup, SpendCapState>> {
    const [caps, allowances] = await Promise.all([
      this.prisma.usageSpendCap.findMany({ where: { businessId: rootId } }),
      this.prisma.allowance.findMany({
        where: {
          businessId: rootId,
          periodStart: win.start,
          metricCode: { in: ['spend:voice', 'spend:messaging'] },
        },
      }),
    ]);
    const out = {} as Record<CapGroup, SpendCapState>;
    for (const group of Object.keys(CAP_GROUP_METRICS) as CapGroup[]) {
      const cap = caps.find((c) => c.capGroup === group);
      const a = allowances.find((x) => x.metricCode === `spend:${group}`);
      const capUsd = cap ? Number(cap.capUsd) : DEFAULT_SPEND_CAPS[group];
      const spentUsd = a ? Number(a.spentUsd) : 0;
      const reservedUsd = a ? Number(a.reservedUsd) : 0;
      out[group] = {
        group,
        capUsd,
        spentUsd,
        reservedUsd,
        remainingUsd: Math.max(0, capUsd - spentUsd - reservedUsd),
        maxCallMinutes:
          group === 'voice'
            ? (cap?.maxCallMinutes ?? DEFAULT_MAX_CALL_MINUTES)
            : null,
        fallback: group === 'voice' ? (cap?.fallback ?? 'voicemail') : null,
      };
    }
    return out;
  }

  statusFlags(
    sub: Subscription,
    now = new Date(),
  ): { meteredPaused: boolean; suspended: boolean } {
    const daysPastDue = sub.pastDueSince
      ? (now.getTime() - sub.pastDueSince.getTime()) / 86_400_000
      : 0;
    const suspended =
      sub.status === 'paused' ||
      (sub.status === 'cancelled' && sub.periodEnd <= now) ||
      (sub.status === 'past_due' && daysPastDue >= DUNNING_SUSPEND_DAYS);
    const meteredPaused =
      suspended ||
      (sub.status === 'past_due' && daysPastDue >= DUNNING_METERED_PAUSE_DAYS);
    return { meteredPaused, suspended };
  }

  async invalidate(rootId: string): Promise<void> {
    await this.cache.invalidate(rootId);
  }

  /** Bumps the monotonic entitlement version and drops the cached set (spec §6.3). */
  async bumpVersion(
    rootId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? this.prisma).subscription.updateMany({
      where: { businessId: rootId },
      data: { version: { increment: 1 } },
    });
    await this.cache.invalidate(rootId);
  }

  /** Read path (screens, badges). May be served from the 60s cache. */
  async resolve(
    businessId: string,
    opts: { fresh?: boolean } = {},
  ): Promise<EntitlementSet> {
    const rootId = await this.rootId(businessId);
    if (!opts.fresh) {
      const cached = await this.cache.get<EntitlementSet>(rootId);
      if (cached) return cached;
    }
    const set = await this.compute(rootId);
    await this.cache.set(rootId, set);
    return set;
  }

  private async compute(rootId: string): Promise<EntitlementSet> {
    const now = new Date();
    const sub = await this.ensureSubscription(rootId);
    const win = usageWindow(sub, now);
    const flags = this.statusFlags(sub, now);
    const [defs, seats, locations, numbers, used, credit, caps] =
      await Promise.all([
        this.prisma.meterDefinition.findMany({ orderBy: { sortOrder: 'asc' } }),
        this.seatCounts(rootId),
        this.locationCount(rootId),
        this.numberCounts(rootId),
        this.usedCounts(rootId, win),
        this.prisma.creditBalance.findUnique({ where: { businessId: rootId } }),
        this.spendCaps(rootId, win),
      ]);
    const purchases = await this.prisma.capacityPurchase.groupBy({
      by: ['metricCode'],
      where: { businessId: rootId, status: 'active', recurring: true },
      _sum: { quantity: true },
    });
    const purchased = (m: string) =>
      purchases.find((p) => p.metricCode === m)?._sum.quantity ?? 0;

    const metrics: Record<string, ResolvedMetric> = {};
    const features: Record<string, boolean | null> = {};
    const resetsAt = win.end.toISOString();
    for (const def of defs) {
      const code = def.metricCode as MetricCode;
      const kind = def.kind as EntitlementKind;
      const included = this.includedFor(sub, code);
      if (kind === 'feature') {
        features[code] = included == null ? null : included > 0;
        continue;
      }
      let usedQty = used[code] ?? 0;
      let reserved = 0;
      let purchasedQty = purchased(code);
      let inc = included;
      if (code === METRICS.USERS) usedQty = seats.total;
      if (code === METRICS.LOCATIONS) usedQty = locations;
      if (code === METRICS.PHONE_NUMBERS_LOCAL) usedQty = numbers.local;
      if (code === METRICS.PHONE_NUMBERS_TOLLFREE) usedQty = numbers.tollfree;
      if (code === METRICS.AI_CREDITS) {
        inc = credit ? credit.includedQuantity : included;
        usedQty = credit ? credit.includedUsed + credit.purchasedUsed : 0;
        reserved = credit?.reserved ?? 0;
        purchasedQty = credit
          ? credit.purchasedBalance + credit.purchasedUsed
          : 0;
      }
      const limit = inc == null ? null : inc + purchasedQty;
      metrics[code] = {
        code,
        kind,
        included: inc,
        purchased: purchasedQty,
        used: usedQty,
        reserved,
        remaining:
          limit == null ? null : Math.max(0, limit - usedQty - reserved),
        state:
          kind === 'passthrough' ? 'ok' : stateFor(usedQty + reserved, limit),
        enforced: def.enforced,
        resetsAt: def.resetRule === 'period' ? resetsAt : null,
      };
    }
    return {
      businessId: rootId,
      resolvedAt: now.toISOString(),
      version: sub.version,
      planKey: sub.plan.key,
      planName: sub.plan.name,
      scheduledPlanKey: sub.scheduledPlan?.key ?? null,
      scheduledInterval: sub.scheduledInterval,
      interval: sub.billingInterval,
      status: sub.status,
      meteredPaused: flags.meteredPaused,
      suspended: flags.suspended,
      billingPeriod: {
        start: sub.periodStart.toISOString(),
        end: sub.periodEnd.toISOString(),
      },
      usagePeriod: {
        start: win.start.toISOString(),
        end: win.end.toISOString(),
      },
      trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      metrics,
      spendCaps: caps,
      features,
    };
  }
}
