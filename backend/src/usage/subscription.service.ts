import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import {
  EntitlementsService,
  SubscriptionWithPlan,
} from './entitlements.service';
import { CreditsService } from './credits.service';
import { UsageStripeHelper } from './usage-stripe.helper';
import {
  ENTERPRISE_PLAN_KEY,
  TRIAL_PLAN_KEY,
  USAGE_ERROR_CODES,
} from './usage.constants';
import { addMonthsUtc, formatDateUtc, usageWindow } from './usage-period.util';

export type Interval = 'month' | 'year';

export interface PlanChangeResult {
  kind: 'upgrade' | 'downgrade' | 'interval' | 'trial_selection';
  effective: 'immediate' | 'period_end' | 'trial_end';
  effectiveAt: string;
  checkoutUrl?: string;
  message: string;
}

/**
 * Plan changes (spec §14). Upgrades apply immediately — the included allowance rises and usage
 * already consumed this period CARRIES (so upgrade → consume → downgrade earns nothing, PL-04).
 * Downgrades and interval switches apply at the period end and are blocked while a capacity
 * metric is over the target plan (PL-02). During a trial, choosing a plan only records the
 * choice: nothing is charged until the trial ends with a card on file (spec §15.2).
 */
@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly credits: CreditsService,
    private readonly stripeHelper: UsageStripeHelper,
  ) {}

  async catalog(businessId: string) {
    const rootId = await this.entitlements.rootId(businessId);
    const sub = await this.entitlements.ensureSubscription(rootId);
    const plans = await this.prisma.plan.findMany({
      // Catalog plans carry a display position; rows without one (ad-hoc/test plans) aren't sold here.
      where: {
        OR: [
          { status: 'active', displayOrder: { gt: 0 } },
          { key: TRIAL_PLAN_KEY },
          { id: sub.planId },
        ],
      },
      include: { entitlements: true },
      orderBy: { displayOrder: 'asc' },
    });
    return {
      currentPlanKey: sub.plan.key,
      scheduledPlanKey: sub.scheduledPlan?.key ?? null,
      plans: plans
        .filter((p) => p.key !== 'basic' || p.id === sub.planId)
        .map((p) => ({
          key: p.key,
          name: p.name,
          status: p.status,
          purchasable: p.purchasable,
          monthly: p.key === ENTERPRISE_PLAN_KEY ? null : Number(p.price),
          yearly: p.yearlyPrice == null ? null : Number(p.yearlyPrice),
          trialDays: p.trialDays,
          current: p.id === sub.planId,
          entitlements: Object.fromEntries(
            p.entitlements.map((e) => [
              e.metricCode,
              e.includedQuantity == null ? null : Number(e.includedQuantity),
            ]),
          ),
        })),
    };
  }

  private async capacityBlockers(
    rootId: string,
    sub: SubscriptionWithPlan,
    targetPlanId: string,
  ): Promise<string[]> {
    const target = await this.prisma.plan.findUniqueOrThrow({
      where: { id: targetPlanId },
      include: { entitlements: true },
    });
    const inc = (m: string) => {
      const v = target.entitlements.find(
        (e) => e.metricCode === m,
      )?.includedQuantity;
      return v == null ? null : Number(v);
    };
    const blockers: string[] = [];
    const seats = await this.entitlements.seatCounts(rootId);
    const seatsPurchased = await this.entitlements.purchasedCapacity(
      rootId,
      'users',
    );
    const curUsers = this.entitlements.includedFor(sub, 'users');
    const targetUsers = inc('users');
    if (targetUsers != null && seats.total > targetUsers + seatsPurchased) {
      blockers.push(
        `${sub.plan.name} includes ${curUsers ?? '—'} users and you have ${seats.total}. ${target.name} includes ${targetUsers}. Remove ${seats.total - targetUsers - seatsPurchased} user${seats.total - targetUsers - seatsPurchased === 1 ? '' : 's'} before downgrading, or keep ${sub.plan.name}.`,
      );
    }
    const locations = await this.entitlements.locationCount(rootId);
    const locPurchased = await this.entitlements.purchasedCapacity(
      rootId,
      'locations',
    );
    const targetLocs = inc('locations');
    if (targetLocs != null && locations > targetLocs + locPurchased) {
      blockers.push(
        `You have ${locations} locations and ${target.name} includes ${targetLocs}. Deactivate ${locations - targetLocs - locPurchased} before downgrading, or keep ${sub.plan.name}.`,
      );
    }
    return blockers;
  }

  async changePlan(
    businessId: string,
    actorUserId: string,
    input: { planKey: string; interval: Interval; authorized?: boolean },
  ): Promise<PlanChangeResult> {
    const rootId = await this.entitlements.rootId(businessId);
    const sub = await this.entitlements.ensureSubscription(rootId);
    const target = await this.prisma.plan.findUnique({
      where: { key: input.planKey },
    });
    if (
      !target ||
      target.status !== 'active' ||
      !target.purchasable ||
      target.key === TRIAL_PLAN_KEY
    ) {
      throw new AppException(
        USAGE_ERROR_CODES.PLAN_NOT_AVAILABLE,
        target?.key === ENTERPRISE_PLAN_KEY
          ? 'Enterprise plans are arranged with Noxtill sales.'
          : 'That plan is not available.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (input.interval === 'year' && target.yearlyPrice == null) {
      throw new AppException(
        USAGE_ERROR_CODES.PLAN_NOT_AVAILABLE,
        `${target.name} has no yearly price.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (sub.status === 'trialing') {
      await this.prisma.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { id: sub.id },
          data: {
            scheduledPlanId: target.id,
            scheduledInterval: input.interval,
          },
        });
        await tx.entitlementAudit.create({
          data: {
            businessId: rootId,
            actorUserId,
            actorType: 'user',
            changeType: 'plan_change',
            before: { scheduled: sub.scheduledPlan?.key ?? null },
            after: { scheduled: target.key, interval: input.interval },
            reason: 'Plan chosen to start after the trial',
          },
        });
      });
      await this.entitlements.bumpVersion(rootId);
      return {
        kind: 'trial_selection',
        effective: 'trial_end',
        effectiveAt: (sub.trialEndsAt ?? sub.periodEnd).toISOString(),
        message: `${target.name} will start after your trial on ${formatDateUtc(sub.trialEndsAt ?? sub.periodEnd)}. Nothing is charged today.`,
      };
    }

    if (
      ['paused', 'cancelled'].includes(sub.status) &&
      !sub.stripeSubscriptionId
    ) {
      // Restarting after a trial ended without a card: a fresh paid subscription via checkout.
      return this.startCheckout(rootId, target.key, input.interval, 'upgrade');
    }

    const rank = (order: number) => order;
    const isSamePlan = target.id === sub.planId;
    if (isSamePlan && input.interval === sub.billingInterval) {
      throw new AppException(
        USAGE_ERROR_CODES.PLAN_NOT_AVAILABLE,
        `You're already on ${target.name} (${input.interval === 'year' ? 'yearly' : 'monthly'}).`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const upgrade =
      !isSamePlan && rank(target.displayOrder) > rank(sub.plan.displayOrder);

    if (!upgrade) {
      const blockers = isSamePlan
        ? []
        : await this.capacityBlockers(rootId, sub, target.id);
      if (blockers.length) {
        throw new AppException(
          USAGE_ERROR_CODES.DOWNGRADE_BLOCKED,
          blockers.join(' '),
          HttpStatus.CONFLICT,
        );
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { id: sub.id },
          data: {
            scheduledPlanId: target.id,
            scheduledInterval: input.interval,
          },
        });
        await tx.entitlementAudit.create({
          data: {
            businessId: rootId,
            actorUserId,
            actorType: 'user',
            changeType: 'plan_change',
            before: { plan: sub.plan.key, interval: sub.billingInterval },
            after: { scheduled: target.key, interval: input.interval },
            reason: isSamePlan
              ? 'Billing interval change scheduled for renewal'
              : 'Downgrade scheduled for renewal',
          },
        });
      });
      await this.entitlements.bumpVersion(rootId);
      return {
        kind: isSamePlan ? 'interval' : 'downgrade',
        effective: 'period_end',
        effectiveAt: sub.periodEnd.toISOString(),
        message: `Takes effect at your next renewal on ${formatDateUtc(sub.periodEnd)}. No charge today.`,
      };
    }

    // Upgrade: charged now (Stripe prorates), applied immediately.
    if (!input.authorized) {
      throw new AppException(
        USAGE_ERROR_CODES.PAYMENT_METHOD_REQUIRED,
        'Confirm that you authorize the charge for this upgrade.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!sub.stripeSubscriptionId)
      return this.startCheckout(rootId, target.key, input.interval, 'upgrade');
    const stripe = this.stripeHelper.stripe();
    const priceId = await this.stripeHelper.planPrice(target, input.interval);
    const remote = await stripe.subscriptions.retrieve(
      sub.stripeSubscriptionId,
    );
    const baseItem =
      remote.items.data.find((i) => !i.metadata?.noxtill_addon) ??
      remote.items.data[0];
    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      items: [{ id: baseItem.id, price: priceId }],
      proration_behavior: 'always_invoice',
      payment_behavior: 'error_if_incomplete',
      metadata: { businessId: rootId },
    });
    await this.applyPlan(rootId, target.id, input.interval, {
      actorUserId,
      actorType: 'user',
      reason: 'Upgrade (immediate)',
      resetPeriod: true,
    });
    return {
      kind: 'upgrade',
      effective: 'immediate',
      effectiveAt: new Date().toISOString(),
      message: `Upgraded to ${target.name}. Stripe charged the prorated difference to your default card.`,
    };
  }

  /** New paid subscription through Stripe Checkout; activated by the webhook, never before. */
  async startCheckout(
    rootId: string,
    planKey: string,
    interval: Interval,
    kind: PlanChangeResult['kind'],
  ): Promise<PlanChangeResult> {
    const stripe = this.stripeHelper.stripe();
    const plan = await this.prisma.plan.findUniqueOrThrow({
      where: { key: planKey },
    });
    const priceId = await this.stripeHelper.planPrice(plan, interval);
    const customer = await this.stripeHelper.ensureCustomer(rootId);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: rootId,
      success_url: this.stripeHelper.frontendUrl(
        '/settings/account/plan?checkout=success',
      ),
      cancel_url: this.stripeHelper.frontendUrl(
        '/settings/account/plan?checkout=cancelled',
      ),
      subscription_data: {
        metadata: { businessId: rootId, planKey, interval },
      },
      metadata: {
        kind: 'plan_checkout',
        businessId: rootId,
        planKey,
        interval,
      },
    });
    return {
      kind,
      effective: 'immediate',
      effectiveAt: new Date().toISOString(),
      checkoutUrl: session.url ?? undefined,
      message:
        'Continue to Stripe to confirm payment. The plan starts once payment is confirmed.',
    };
  }

  /**
   * Switches the subscription's plan locally. `used` always carries: the credit balance keeps its
   * consumed amount and only the included quantity changes (spec §14.1 decision).
   */
  async applyPlan(
    rootId: string,
    planId: string,
    interval: Interval,
    audit: {
      actorUserId?: string | null;
      actorType: 'user' | 'system' | 'stripe';
      reason: string;
      resetPeriod: boolean;
    },
    extra: Prisma.SubscriptionUpdateInput = {},
  ): Promise<void> {
    const sub = await this.entitlements.ensureSubscription(rootId);
    const plan = await this.prisma.plan.findUniqueOrThrow({
      where: { id: planId },
      include: { entitlements: true },
    });
    const now = new Date();
    const included = plan.entitlements.find(
      (e) => e.metricCode === 'ai_credits',
    )?.includedQuantity;
    await this.prisma.$transaction(async (tx) => {
      const periodStart = audit.resetPeriod ? now : sub.periodStart;
      const periodEnd = audit.resetPeriod
        ? addMonthsUtc(now, interval === 'year' ? 12 : 1)
        : sub.periodEnd;
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          plan: { connect: { id: planId } },
          billingInterval: interval,
          status:
            sub.status === 'trialing' || sub.status === 'paused'
              ? 'active'
              : undefined,
          trialEndsAt: sub.status === 'trialing' ? null : undefined,
          periodStart,
          periodEnd,
          scheduledPlan: { disconnect: true },
          scheduledInterval: null,
          version: { increment: 1 },
          ...extra,
        },
      });
      await tx.business.update({
        where: { id: rootId },
        data: { planId, trialEndsAt: null },
      });
      const win = usageWindow(
        { status: 'active', periodStart, periodEnd, trialEndsAt: null },
        now,
      );
      // Included rises (or drops at renewal); used carries; purchased untouched.
      await tx.creditBalance.updateMany({
        where: { businessId: rootId },
        data: {
          includedQuantity: included == null ? 0 : Number(included),
          ...(audit.resetPeriod
            ? { periodStart: win.start, periodEnd: win.end }
            : {}),
        },
      });
      await tx.entitlementAudit.create({
        data: {
          businessId: rootId,
          actorUserId: audit.actorUserId ?? null,
          actorType: audit.actorType,
          changeType: 'plan_change',
          before: {
            plan: sub.plan.key,
            interval: sub.billingInterval,
            status: sub.status,
          },
          after: { plan: plan.key, interval },
          reason: audit.reason,
        },
      });
      await tx.usageOutbox.create({
        data: {
          businessId: rootId,
          type: 'subscription.plan_changed',
          payload: {
            from: sub.plan.key,
            to: plan.key,
            effective: audit.resetPeriod ? 'immediate' : 'period_end',
          },
        },
      });
    });
    await this.entitlements.invalidate(rootId);
  }

  async cancelScheduled(
    businessId: string,
    actorUserId: string,
  ): Promise<void> {
    const rootId = await this.entitlements.rootId(businessId);
    const sub = await this.entitlements.ensureSubscription(rootId);
    await this.prisma.$transaction([
      this.prisma.subscription.update({
        where: { id: sub.id },
        data: {
          scheduledPlanId: null,
          scheduledInterval: null,
          cancelAtPeriodEnd: false,
        },
      }),
      this.prisma.entitlementAudit.create({
        data: {
          businessId: rootId,
          actorUserId,
          actorType: 'user',
          changeType: 'plan_change',
          before: {
            scheduled: sub.scheduledPlan?.key ?? null,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
          },
          after: { scheduled: null },
          reason: 'Scheduled change cancelled',
        },
      }),
    ]);
    if (
      sub.cancelAtPeriodEnd &&
      sub.stripeSubscriptionId &&
      this.stripeHelper.configured
    ) {
      await this.stripeHelper
        .stripe()
        .subscriptions.update(sub.stripeSubscriptionId, {
          cancel_at_period_end: false,
        });
    }
    await this.entitlements.bumpVersion(rootId);
  }

  async cancel(
    businessId: string,
    actorUserId: string,
  ): Promise<{ accessUntil: string }> {
    const rootId = await this.entitlements.rootId(businessId);
    const sub = await this.entitlements.ensureSubscription(rootId);
    if (sub.stripeSubscriptionId) {
      await this.stripeHelper
        .stripe()
        .subscriptions.update(sub.stripeSubscriptionId, {
          cancel_at_period_end: true,
        });
    }
    await this.prisma.$transaction([
      this.prisma.subscription.update({
        where: { id: sub.id },
        data: { cancelAtPeriodEnd: true },
      }),
      this.prisma.entitlementAudit.create({
        data: {
          businessId: rootId,
          actorUserId,
          actorType: 'user',
          changeType: 'plan_change',
          before: { cancelAtPeriodEnd: false },
          after: { cancelAtPeriodEnd: true },
          reason: 'Cancelled at period end',
        },
      }),
    ]);
    await this.entitlements.bumpVersion(rootId);
    return {
      accessUntil: (sub.status === 'trialing'
        ? (sub.trialEndsAt ?? sub.periodEnd)
        : sub.periodEnd
      ).toISOString(),
    };
  }

  async verifyPassword(
    userId: string,
    password: string | undefined,
  ): Promise<void> {
    if (!password)
      throw new AppException(
        USAGE_ERROR_CODES.PASSWORD_REQUIRED,
        'Confirm your password to change payment details.',
        HttpStatus.BAD_REQUEST,
      );
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      throw new AppException(
        USAGE_ERROR_CODES.INVALID_PASSWORD,
        "That password doesn't match. Try again.",
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  // ─────────────────────────── renewal / trial / dunning (job) ───────────────────────────

  /** Applies due period ends: scheduled downgrades, cancellations, and local period rolls. */
  async rollDuePeriods(now = new Date()): Promise<number> {
    const due = await this.prisma.subscription.findMany({
      where: {
        status: { in: ['active', 'past_due'] },
        periodEnd: { lte: now },
      },
      include: { plan: true, scheduledPlan: true },
      take: 200,
    });
    for (const sub of due) {
      try {
        if (sub.cancelAtPeriodEnd) {
          await this.prisma.$transaction([
            this.prisma.subscription.update({
              where: { id: sub.id },
              data: { status: 'cancelled', version: { increment: 1 } },
            }),
            this.prisma.entitlementAudit.create({
              data: {
                businessId: sub.businessId,
                actorType: 'system',
                changeType: 'suspension',
                before: { status: sub.status },
                after: { status: 'cancelled' },
                reason: 'Cancelled at period end; data retention clock started',
              },
            }),
          ]);
          await this.entitlements.invalidate(sub.businessId);
          continue;
        }
        const interval = (sub.scheduledInterval ??
          sub.billingInterval) as Interval;
        if (sub.scheduledPlanId) {
          if (sub.stripeSubscriptionId && this.stripeHelper.configured) {
            const stripe = this.stripeHelper.stripe();
            const plan = await this.prisma.plan.findUniqueOrThrow({
              where: { id: sub.scheduledPlanId },
            });
            const priceId = await this.stripeHelper.planPrice(plan, interval);
            const remote = await stripe.subscriptions.retrieve(
              sub.stripeSubscriptionId,
            );
            const baseItem =
              remote.items.data.find((i) => !i.metadata?.noxtill_addon) ??
              remote.items.data[0];
            await stripe.subscriptions.update(sub.stripeSubscriptionId, {
              items: [{ id: baseItem.id, price: priceId }],
              proration_behavior: 'none',
            });
          }
          await this.applyPlan(
            sub.businessId,
            sub.scheduledPlanId,
            interval,
            {
              actorType: 'system',
              reason: 'Scheduled change applied at renewal',
              resetPeriod: false,
            },
            {
              periodStart: sub.periodEnd,
              periodEnd: addMonthsUtc(
                sub.periodEnd,
                interval === 'year' ? 12 : 1,
              ),
            },
          );
        } else {
          // Stripe-backed periods are re-synced by the subscription webhook; this keeps a local
          // period moving forward regardless, so allowances always reset on time.
          await this.prisma.subscription.update({
            where: { id: sub.id },
            data: {
              periodStart: sub.periodEnd,
              periodEnd: addMonthsUtc(
                sub.periodEnd,
                interval === 'year' ? 12 : 1,
              ),
            },
          });
        }
        await this.credits.ensureBalance(sub.businessId, undefined, now);
        await this.prisma.usageAlert.deleteMany({
          where: { businessId: sub.businessId, periodStart: { lt: now } },
        });
        await this.entitlements.invalidate(sub.businessId);
      } catch (error) {
        this.logger.error(
          `Period roll failed for ${sub.businessId}: ${(error as Error).message}`,
        );
      }
    }
    return due.length;
  }

  /**
   * Trial end (spec §15.2): with a card on file AND an explicit plan choice, convert to that plan
   * (Stripe charges now); otherwise move to `paused` — read and export only, nothing deleted.
   */
  async endDueTrials(
    now = new Date(),
  ): Promise<{ converted: number; paused: number }> {
    const due = await this.prisma.subscription.findMany({
      where: { status: 'trialing', trialEndsAt: { lte: now } },
      include: { scheduledPlan: true },
      take: 200,
    });
    let converted = 0;
    let paused = 0;
    for (const sub of due) {
      try {
        const card = await this.prisma.platformPaymentMethod.findFirst({
          where: { businessId: sub.businessId, isDefault: true },
        });
        if (
          !sub.cancelAtPeriodEnd &&
          card &&
          sub.scheduledPlan &&
          this.stripeHelper.configured
        ) {
          const interval = (sub.scheduledInterval ?? 'month') as Interval;
          const stripe = this.stripeHelper.stripe();
          const customer = await this.stripeHelper.ensureCustomer(
            sub.businessId,
          );
          const remote: Stripe.Subscription = await stripe.subscriptions.create(
            {
              customer,
              items: [
                {
                  price: await this.stripeHelper.planPrice(
                    sub.scheduledPlan,
                    interval,
                  ),
                },
              ],
              default_payment_method: card.stripePaymentMethodId,
              payment_behavior: 'error_if_incomplete',
              metadata: {
                businessId: sub.businessId,
                planKey: sub.scheduledPlan.key,
                interval,
              },
            },
          );
          await this.prisma.business.update({
            where: { id: sub.businessId },
            data: { stripeSubscriptionId: remote.id },
          });
          await this.applyPlan(
            sub.businessId,
            sub.scheduledPlan.id,
            interval,
            {
              actorType: 'system',
              reason: 'Trial converted with the chosen plan and card on file',
              resetPeriod: true,
            },
            { stripeSubscriptionId: remote.id },
          );
          await this.credits.ensureBalance(sub.businessId);
          converted++;
          continue;
        }
        await this.prisma.$transaction([
          this.prisma.subscription.update({
            where: { id: sub.id },
            data: { status: 'paused', version: { increment: 1 } },
          }),
          this.prisma.entitlementAudit.create({
            data: {
              businessId: sub.businessId,
              actorType: 'system',
              changeType: 'suspension',
              before: { status: 'trialing' },
              after: { status: 'paused' },
              reason: card
                ? 'Trial ended without a plan chosen'
                : 'Trial ended without a payment method',
            },
          }),
        ]);
        await this.entitlements.invalidate(sub.businessId);
        paused++;
      } catch (error) {
        this.logger.error(
          `Trial end failed for ${sub.businessId}: ${(error as Error).message}`,
        );
      }
    }
    return { converted, paused };
  }
}
