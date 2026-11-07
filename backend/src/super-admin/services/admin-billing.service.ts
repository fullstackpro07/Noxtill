import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementsService } from '../../usage/entitlements.service';
import { SubscriptionService } from '../../usage/subscription.service';
import { addDaysUtc } from '../../usage/usage-period.util';
import { AdminAuditService } from './admin-audit.service';
import { AdminTenantsService } from './admin-tenants.service';
import type { AdminAuditContext } from '../super-admin.decorators';
import { badRequest, notFound, pageArgs, PageQuery } from '../super-admin.util';

const PLAN_STATUSES = ['draft', 'active', 'retired'];
const ENTITLEMENT_KINDS = [
  'capacity',
  'allowance',
  'spend_cap',
  'feature',
  'passthrough',
];
const RESET_RULES = ['none', 'period', 'one_off'];
const SUB_STATUSES = ['trialing', 'active', 'past_due', 'paused', 'cancelled'];

export interface PlanInput {
  key?: string;
  name?: string;
  price?: number;
  yearlyPrice?: number | null;
  trialDays?: number;
  displayOrder?: number;
  purchasable?: boolean;
  status?: string;
  stripePriceId?: string | null;
  stripeYearlyPriceId?: string | null;
}

export interface EntitlementInput {
  metricCode: string;
  kind: string;
  includedQuantity: number | null;
  resetRule?: string;
}

/**
 * Plans and subscriptions (PRD §7). Plans are data (`plans` + `plan_entitlements`) — the existing
 * Usage & Limits engine already resolves everything from these rows, so editing them here changes
 * real enforcement for every business on the plan. Subscription changes go through the existing
 * `SubscriptionService` paths; no charge is ever made from the admin console.
 */
@Injectable()
export class AdminBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly subscriptions: SubscriptionService,
    private readonly tenants: AdminTenantsService,
    private readonly audit: AdminAuditService,
  ) {}

  // ------------------------------------------------------------------ plans

  async plans() {
    const [plans, counts, meters] = await Promise.all([
      this.prisma.plan.findMany({
        orderBy: [{ displayOrder: 'asc' }, { key: 'asc' }],
        include: { entitlements: { orderBy: { metricCode: 'asc' } } },
      }),
      this.prisma.subscription.groupBy({
        by: ['planId', 'status'],
        _count: { _all: true },
      }),
      this.prisma.meterDefinition.findMany({
        orderBy: [{ sortOrder: 'asc' }, { metricCode: 'asc' }],
      }),
    ]);
    return {
      plans: plans.map((p) => ({
        id: p.id,
        key: p.key,
        name: p.name,
        price: Number(p.price),
        yearlyPrice: p.yearlyPrice == null ? null : Number(p.yearlyPrice),
        trialDays: p.trialDays,
        displayOrder: p.displayOrder,
        purchasable: p.purchasable,
        status: p.status,
        stripeLinked: !!(p.stripePriceId || p.stripeYearlyPriceId),
        stripePriceId: p.stripePriceId,
        stripeYearlyPriceId: p.stripeYearlyPriceId,
        entitlements: p.entitlements.map((e) => ({
          metricCode: e.metricCode,
          kind: e.kind,
          includedQuantity:
            e.includedQuantity == null ? null : Number(e.includedQuantity),
          resetRule: e.resetRule,
        })),
        subscribers: Object.fromEntries(
          counts
            .filter((c) => c.planId === p.id)
            .map((c) => [c.status, c._count._all]),
        ),
        updatedAt: p.updatedAt,
      })),
      meters,
    };
  }

  async createPlan(input: PlanInput, reason: string, ctx: AdminAuditContext) {
    const key = (input.key ?? '').trim().toLowerCase();
    if (!/^[a-z0-9_]{2,40}$/.test(key))
      throw badRequest(
        'Plan key: 2–40 lower-case letters, digits or underscores.',
      );
    if (!input.name?.trim()) throw badRequest('Plan name is required.');
    if (input.price == null || input.price < 0)
      throw badRequest('Monthly price must be 0 or more.');
    if (await this.prisma.plan.findUnique({ where: { key } }))
      throw badRequest('A plan with that key already exists.');
    return this.audit.run(
      ctx,
      (tx) =>
        tx.plan.create({
          data: {
            key,
            name: input.name!.trim(),
            price: input.price!,
            yearlyPrice: input.yearlyPrice ?? null,
            trialDays: input.trialDays ?? 0,
            displayOrder: input.displayOrder ?? 0,
            purchasable: input.purchasable ?? false,
            // New plans start as drafts so nobody can buy one before its entitlements are set.
            status: 'draft',
            // Legacy columns from before plan_entitlements; enforcement never reads them.
            msgQuota: 0,
            userLimit: 0,
            stripePriceId: input.stripePriceId || null,
            stripeYearlyPriceId: input.stripeYearlyPriceId || null,
          },
        }),
      (p) => ({
        action: 'plan.created',
        resourceType: 'plan',
        resourceId: p.id,
        after: { ...input, key },
        reason,
      }),
    );
  }

  async updatePlan(
    key: string,
    input: PlanInput,
    reason: string,
    ctx: AdminAuditContext,
  ) {
    const plan = await this.prisma.plan.findUnique({ where: { key } });
    if (!plan) throw notFound('Plan');
    const priceChange =
      (input.price != null && input.price !== Number(plan.price)) ||
      (input.yearlyPrice !== undefined &&
        (input.yearlyPrice == null ? null : Number(input.yearlyPrice)) !==
          (plan.yearlyPrice == null ? null : Number(plan.yearlyPrice)));
    const nextStripe =
      input.stripePriceId !== undefined
        ? input.stripePriceId
        : plan.stripePriceId;
    const nextStripeYear =
      input.stripeYearlyPriceId !== undefined
        ? input.stripeYearlyPriceId
        : plan.stripeYearlyPriceId;
    if (
      priceChange &&
      (nextStripe || nextStripeYear) &&
      input.stripePriceId === undefined &&
      input.stripeYearlyPriceId === undefined
    ) {
      throw badRequest(
        'This plan is linked to Stripe prices, which cannot be edited. Create the new price in Stripe and set its price ID here together with the new amount.',
      );
    }
    if (input.status && !PLAN_STATUSES.includes(input.status))
      throw badRequest('Status must be draft, active or retired.');
    if (input.price != null && input.price < 0)
      throw badRequest('Monthly price must be 0 or more.');
    const data: Prisma.PlanUpdateInput = {
      ...(input.name ? { name: input.name.trim() } : {}),
      ...(input.price != null ? { price: input.price } : {}),
      ...(input.yearlyPrice !== undefined
        ? { yearlyPrice: input.yearlyPrice }
        : {}),
      ...(input.trialDays != null ? { trialDays: input.trialDays } : {}),
      ...(input.displayOrder != null
        ? { displayOrder: input.displayOrder }
        : {}),
      ...(input.purchasable != null ? { purchasable: input.purchasable } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.stripePriceId !== undefined
        ? { stripePriceId: input.stripePriceId || null }
        : {}),
      ...(input.stripeYearlyPriceId !== undefined
        ? { stripeYearlyPriceId: input.stripeYearlyPriceId || null }
        : {}),
    };
    return this.audit.run(
      ctx,
      (tx) => tx.plan.update({ where: { id: plan.id }, data }),
      () => ({
        action: priceChange ? 'plan.price_changed' : 'plan.updated',
        resourceType: 'plan',
        resourceId: plan.id,
        before: {
          name: plan.name,
          price: Number(plan.price),
          yearlyPrice:
            plan.yearlyPrice == null ? null : Number(plan.yearlyPrice),
          trialDays: plan.trialDays,
          status: plan.status,
          purchasable: plan.purchasable,
          displayOrder: plan.displayOrder,
          stripePriceId: plan.stripePriceId,
          stripeYearlyPriceId: plan.stripeYearlyPriceId,
        },
        after: input,
        reason,
      }),
    );
  }

  /** Replaces a plan's entitlement rows; every subscriber's cached entitlements are invalidated. */
  async setEntitlements(
    key: string,
    rows: EntitlementInput[],
    reason: string,
    ctx: AdminAuditContext,
  ) {
    const plan = await this.prisma.plan.findUnique({
      where: { key },
      include: { entitlements: true },
    });
    if (!plan) throw notFound('Plan');
    const meters = new Set(
      (
        await this.prisma.meterDefinition.findMany({
          select: { metricCode: true },
        })
      ).map((m) => m.metricCode),
    );
    const seen = new Set<string>();
    for (const r of rows) {
      if (!meters.has(r.metricCode))
        throw badRequest(`Unknown metric "${r.metricCode}".`);
      if (seen.has(r.metricCode))
        throw badRequest(`"${r.metricCode}" appears twice.`);
      seen.add(r.metricCode);
      if (!ENTITLEMENT_KINDS.includes(r.kind))
        throw badRequest(`Invalid kind for ${r.metricCode}.`);
      if (r.resetRule && !RESET_RULES.includes(r.resetRule))
        throw badRequest(`Invalid reset rule for ${r.metricCode}.`);
      if (
        r.includedQuantity != null &&
        (!Number.isFinite(r.includedQuantity) || r.includedQuantity < 0)
      )
        throw badRequest(
          `Included quantity for ${r.metricCode} must be 0 or more (or empty for Not configured).`,
        );
    }
    const before = plan.entitlements.map((e) => ({
      metricCode: e.metricCode,
      kind: e.kind,
      includedQuantity:
        e.includedQuantity == null ? null : Number(e.includedQuantity),
      resetRule: e.resetRule,
    }));
    const subs = await this.prisma.subscription.findMany({
      where: { planId: plan.id },
      select: { businessId: true },
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.planEntitlement.deleteMany({
        where: { planId: plan.id, metricCode: { notIn: [...seen] } },
      });
      for (const r of rows) {
        await tx.planEntitlement.upsert({
          where: {
            planId_metricCode: { planId: plan.id, metricCode: r.metricCode },
          },
          create: {
            planId: plan.id,
            metricCode: r.metricCode,
            kind: r.kind,
            includedQuantity: r.includedQuantity,
            resetRule: r.resetRule ?? 'period',
          },
          update: {
            kind: r.kind,
            includedQuantity: r.includedQuantity,
            resetRule: r.resetRule ?? 'period',
          },
        });
      }
      // AI credits are held on the per-business balance row; keep it in step for subscribers
      // without their own override.
      const credits = rows.find((r) => r.metricCode === 'ai_credits');
      if (subs.length) {
        const overridden = new Set(
          (
            await tx.entitlementOverride.findMany({
              where: {
                businessId: { in: subs.map((s) => s.businessId) },
                metricCode: 'ai_credits',
                revokedAt: null,
              },
              select: { businessId: true },
            })
          ).map((o) => o.businessId),
        );
        await tx.creditBalance.updateMany({
          where: {
            businessId: {
              in: subs
                .map((s) => s.businessId)
                .filter((b) => !overridden.has(b)),
            },
          },
          data: {
            includedQuantity: Math.round(credits?.includedQuantity ?? 0),
          },
        });
        await tx.subscription.updateMany({
          where: { planId: plan.id },
          data: { version: { increment: 1 } },
        });
      }
      await this.audit.record(tx, ctx, {
        action: 'plan.entitlements_changed',
        resourceType: 'plan',
        resourceId: plan.id,
        before,
        after: rows,
        reason,
      });
    });
    await Promise.all(
      subs.map((s) => this.entitlements.invalidate(s.businessId)),
    );
    return { updated: rows.length, subscribersAffected: subs.length };
  }

  // ---------------------------------------------------------- subscriptions

  async subscriptionList(
    q: PageQuery & {
      status?: string;
      plan?: string;
      interval?: string;
      search?: string;
    },
  ) {
    const { page, pageSize, skip, take } = pageArgs(q);
    const where: Prisma.SubscriptionWhereInput = {
      ...(q.status && SUB_STATUSES.includes(q.status)
        ? { status: q.status }
        : {}),
      ...(q.status === 'payment_failed'
        ? { pastDueSince: { not: null }, status: 'past_due' }
        : {}),
      ...(q.status === 'cancelling' ? { cancelAtPeriodEnd: true } : {}),
      ...(q.plan ? { plan: { key: q.plan } } : {}),
      ...(q.interval === 'month' || q.interval === 'year'
        ? { billingInterval: q.interval }
        : {}),
    };
    if (q.search?.trim()) {
      const s = q.search.trim();
      const biz = await this.prisma.business.findMany({
        where: { parentId: null, OR: [{ name: { contains: s } }, { id: s }] },
        select: { id: true },
        take: 500,
      });
      where.OR = [
        { id: s },
        { stripeSubscriptionId: s },
        { businessId: { in: biz.map((b) => b.id) } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.subscription.count({ where }),
      this.prisma.subscription.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip,
        take,
        include: {
          plan: {
            select: { key: true, name: true, price: true, yearlyPrice: true },
          },
          scheduledPlan: { select: { key: true, name: true } },
        },
      }),
    ]);
    const names = await this.prisma.business.findMany({
      where: { id: { in: rows.map((r) => r.businessId) } },
      select: { id: true, name: true, currency: true },
    });
    return {
      items: rows.map((r) => {
        const amount =
          r.billingInterval === 'year' ? r.plan.yearlyPrice : r.plan.price;
        return {
          id: r.id,
          business: names.find((n) => n.id === r.businessId) ?? {
            id: r.businessId,
            name: '—',
          },
          plan: { key: r.plan.key, name: r.plan.name },
          scheduledPlan: r.scheduledPlan,
          billingInterval: r.billingInterval,
          amountUsd: amount == null ? null : Number(amount),
          status: r.status,
          periodStart: r.periodStart,
          periodEnd: r.periodEnd,
          trialEndsAt: r.trialEndsAt,
          cancelAtPeriodEnd: r.cancelAtPeriodEnd,
          pastDueSince: r.pastDueSince,
          stripeBilled: !!r.stripeSubscriptionId,
          createdAt: r.createdAt,
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  async tenantSubscription(id: string) {
    const rootId = await this.tenants.rootIdOrThrow(id);
    const sub = await this.entitlements.ensureSubscription(rootId);
    const [history, invoices] = await Promise.all([
      this.prisma.entitlementAudit.findMany({
        where: { businessId: rootId },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 50,
      }),
      this.tenants.invoices(rootId),
    ]);
    return {
      subscription: {
        id: sub.id,
        plan: {
          key: sub.plan.key,
          name: sub.plan.name,
          price: Number(sub.plan.price),
          yearlyPrice:
            sub.plan.yearlyPrice == null ? null : Number(sub.plan.yearlyPrice),
        },
        scheduledPlan: sub.scheduledPlan
          ? { key: sub.scheduledPlan.key, name: sub.scheduledPlan.name }
          : null,
        scheduledInterval: sub.scheduledInterval,
        status: sub.status,
        billingInterval: sub.billingInterval,
        periodStart: sub.periodStart,
        periodEnd: sub.periodEnd,
        trialEndsAt: sub.trialEndsAt,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        pastDueSince: sub.pastDueSince,
        stripeBilled: !!sub.stripeSubscriptionId,
        createdAt: sub.createdAt,
        flags: this.entitlements.statusFlags(sub),
      },
      history,
      invoices,
    };
  }

  /**
   * Assign a plan directly (a custom / complimentary subscription). Refused for a Stripe-billed
   * subscription — changing it here would leave Stripe charging the old price; that business
   * changes plan through its own Billing screen (which charges with its consent).
   */
  async assignPlan(
    id: string,
    planKey: string,
    interval: 'month' | 'year',
    reason: string,
    ctx: AdminAuditContext,
  ) {
    const rootId = await this.tenants.rootIdOrThrow(id);
    const text = AdminAuditService.requireReason(reason);
    const sub = await this.entitlements.ensureSubscription(rootId);
    if (sub.stripeSubscriptionId)
      throw badRequest(
        'This subscription is billed through Stripe. Changing its plan here would desync what Stripe charges. The business can change plan from Settings → Billing, or cancel the Stripe subscription first.',
      );
    const plan = await this.prisma.plan.findUnique({ where: { key: planKey } });
    if (!plan) throw notFound('Plan');
    if (plan.status === 'retired') throw badRequest('That plan is retired.');
    if (interval !== 'month' && interval !== 'year')
      throw badRequest('Interval must be month or year.');
    await this.subscriptions.applyPlan(
      rootId,
      plan.id,
      interval,
      {
        actorUserId: ctx.admin.id,
        actorType: 'admin',
        reason: `Super Admin: ${text}`,
        resetPeriod: true,
      },
      { status: 'active', cancelAtPeriodEnd: false, pastDueSince: null },
    );
    await this.audit.record(this.prisma, ctx, {
      action: 'subscription.plan_assigned',
      resourceType: 'subscription',
      resourceId: sub.id,
      businessId: rootId,
      before: {
        plan: sub.plan.key,
        interval: sub.billingInterval,
        status: sub.status,
      },
      after: { plan: plan.key, interval, status: 'active', charged: false },
      reason: text,
    });
    await this.entitlements.invalidate(rootId);
    return this.tenantSubscription(rootId);
  }

  async extendTrial(
    id: string,
    days: number,
    reason: string,
    ctx: AdminAuditContext,
  ) {
    const rootId = await this.tenants.rootIdOrThrow(id);
    if (!Number.isInteger(days) || days < 1 || days > 90)
      throw badRequest('Extend by 1–90 days.');
    const sub = await this.entitlements.ensureSubscription(rootId);
    if (sub.status !== 'trialing')
      throw badRequest(
        'Only a subscription that is still in trial can be extended.',
      );
    const from = sub.trialEndsAt ?? sub.periodEnd;
    const until = addDaysUtc(from, days);
    await this.audit.run(
      ctx,
      async (tx) => {
        await tx.subscription.update({
          where: { id: sub.id },
          data: {
            trialEndsAt: until,
            periodEnd: until,
            version: { increment: 1 },
          },
        });
        await tx.business.update({
          where: { id: rootId },
          data: { trialEndsAt: until },
        });
        await tx.entitlementAudit.create({
          data: {
            businessId: rootId,
            actorUserId: ctx.admin.id,
            actorType: 'admin',
            changeType: 'trial',
            before: { trialEndsAt: from.toISOString() },
            after: { trialEndsAt: until.toISOString() },
            reason: `Super Admin: ${reason}`,
          },
        });
      },
      () => ({
        action: 'subscription.trial_extended',
        resourceType: 'subscription',
        resourceId: sub.id,
        businessId: rootId,
        before: { trialEndsAt: from },
        after: { trialEndsAt: until, days },
        reason,
      }),
    );
    await this.entitlements.invalidate(rootId);
    return this.tenantSubscription(rootId);
  }

  async cancel(id: string, reason: string, ctx: AdminAuditContext) {
    const rootId = await this.tenants.rootIdOrThrow(id);
    const text = AdminAuditService.requireReason(reason);
    const sub = await this.entitlements.ensureSubscription(rootId);
    if (sub.cancelAtPeriodEnd)
      throw badRequest('This subscription is already set to cancel.');
    const r = await this.subscriptions.cancel(rootId, ctx.admin.id, 'admin');
    await this.audit.record(this.prisma, ctx, {
      action: 'subscription.cancelled',
      resourceType: 'subscription',
      resourceId: sub.id,
      businessId: rootId,
      before: { cancelAtPeriodEnd: false },
      after: { cancelAtPeriodEnd: true, accessUntil: r.accessUntil },
      reason: text,
    });
    return this.tenantSubscription(rootId);
  }

  async undoCancel(id: string, reason: string, ctx: AdminAuditContext) {
    const rootId = await this.tenants.rootIdOrThrow(id);
    const text = AdminAuditService.requireReason(reason);
    const sub = await this.entitlements.ensureSubscription(rootId);
    if (!sub.cancelAtPeriodEnd && !sub.scheduledPlanId)
      throw badRequest('There is no scheduled cancellation or change to undo.');
    await this.subscriptions.cancelScheduled(rootId, ctx.admin.id, 'admin');
    await this.audit.record(this.prisma, ctx, {
      action: 'subscription.cancellation_undone',
      resourceType: 'subscription',
      resourceId: sub.id,
      businessId: rootId,
      before: {
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        scheduled: sub.scheduledPlan?.key ?? null,
      },
      after: { cancelAtPeriodEnd: false, scheduled: null },
      reason: text,
    });
    return this.tenantSubscription(rootId);
  }
}
