import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementsService } from './entitlements.service';
import { SubscriptionService, Interval } from './subscription.service';
import { PurchasesService } from './purchases.service';
import { PaymentMethodsService } from './payment-methods.service';

function itemPeriod(
  sub: Stripe.Subscription,
): { start: Date; end: Date } | null {
  const item = sub.items?.data?.[0];
  if (!item?.current_period_start || !item?.current_period_end) return null;
  return {
    start: new Date(item.current_period_start * 1000),
    end: new Date(item.current_period_end * 1000),
  };
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parent = (
    invoice as unknown as {
      parent?: {
        subscription_details?: { subscription?: string | { id: string } };
      };
    }
  ).parent;
  const fromParent = parent?.subscription_details?.subscription;
  const legacy = (
    invoice as unknown as { subscription?: string | { id: string } | null }
  ).subscription;
  const ref = fromParent ?? legacy;
  return typeof ref === 'string' ? ref : (ref?.id ?? null);
}

/**
 * Usage & Limits' side of the Stripe webhooks (spec §13.3). Runs after the existing billing
 * processor for every event; each handler is idempotent (the webhook controller already dedupes
 * on the Stripe event id, and every state transition here is conditional).
 */
@Injectable()
export class UsageStripeEventsService {
  private readonly logger = new Logger(UsageStripeEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly subscriptions: SubscriptionService,
    private readonly purchases: PurchasesService,
    private readonly paymentMethods: PaymentMethodsService,
  ) {}

  async handle(type: string, object: unknown): Promise<void> {
    switch (type) {
      case 'checkout.session.completed':
        return this.checkoutCompleted(object as Stripe.Checkout.Session);
      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed': {
        const s = object as Stripe.Checkout.Session;
        if (s.metadata?.kind === 'usage_purchase' && s.metadata.purchaseId)
          await this.purchases.markFailed(s.metadata.purchaseId);
        return;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        return this.subscriptionSynced(object as Stripe.Subscription);
      case 'customer.subscription.deleted':
        return this.subscriptionDeleted(object as Stripe.Subscription);
      case 'invoice.payment_failed':
        return this.paymentFailed(object as Stripe.Invoice);
      case 'invoice.payment_succeeded':
      case 'invoice.paid':
        return this.paymentSucceeded(object as Stripe.Invoice);
      default:
        return;
    }
  }

  private async checkoutCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const kind = session.metadata?.kind;
    if (kind === 'usage_purchase' && session.metadata?.purchaseId) {
      if (
        session.payment_status === 'paid' ||
        session.payment_status === 'no_payment_required'
      ) {
        await this.purchases.activate(session.metadata.purchaseId, null);
      }
      return;
    }
    if (kind === 'payment_method_setup') {
      await this.paymentMethods.completeSetup(session);
      return;
    }
    if (kind === 'plan_checkout') {
      const rootId =
        session.metadata?.businessId ?? session.client_reference_id;
      const planKey = session.metadata?.planKey;
      const subscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id;
      if (!rootId || !planKey || !subscriptionId) return;
      const plan = await this.prisma.plan.findUnique({
        where: { key: planKey },
      });
      if (!plan) return;
      const current = await this.entitlements.ensureSubscription(rootId);
      if (
        current.stripeSubscriptionId === subscriptionId &&
        current.planId === plan.id
      )
        return;
      await this.subscriptions.applyPlan(
        rootId,
        plan.id,
        (session.metadata?.interval as Interval) ?? 'month',
        {
          actorType: 'stripe',
          reason: 'Stripe checkout completed',
          resetPeriod: true,
        },
        {
          stripeSubscriptionId: subscriptionId,
          status: 'active',
          pastDueSince: null,
        },
      );
    }
  }

  private async findLocal(stripeSubscriptionId: string) {
    const bySub = await this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId },
    });
    if (bySub) return bySub;
    const business = await this.prisma.business.findUnique({
      where: { stripeSubscriptionId },
      select: { id: true },
    });
    return business
      ? this.prisma.subscription.findUnique({
          where: { businessId: business.id },
        })
      : null;
  }

  private async subscriptionSynced(remote: Stripe.Subscription): Promise<void> {
    const local = await this.findLocal(remote.id);
    if (!local) return; // a membership subscription, or not ours
    const period = itemPeriod(remote);
    const status =
      remote.status === 'past_due' || remote.status === 'unpaid'
        ? 'past_due'
        : remote.status === 'canceled'
          ? 'cancelled'
          : remote.status === 'active' || remote.status === 'trialing'
            ? 'active'
            : local.status;
    const basePrice = (
      remote.items.data.find((i) => !i.metadata?.noxtill_addon) ??
      remote.items.data[0]
    )?.price;
    const plan = basePrice?.id
      ? await this.prisma.plan.findFirst({
          where: {
            OR: [
              { stripePriceId: basePrice.id },
              { stripeYearlyPriceId: basePrice.id },
            ],
          },
        })
      : null;
    if (plan && plan.id !== local.planId) {
      await this.subscriptions.applyPlan(
        local.businessId,
        plan.id,
        basePrice?.recurring?.interval === 'year' ? 'year' : 'month',
        {
          actorType: 'stripe',
          reason: 'Plan changed in Stripe',
          resetPeriod: false,
        },
      );
    }
    await this.prisma.subscription.update({
      where: { id: local.id },
      data: {
        stripeSubscriptionId: remote.id,
        status,
        cancelAtPeriodEnd: remote.cancel_at_period_end,
        pastDueSince:
          status === 'past_due' ? (local.pastDueSince ?? new Date()) : null,
        ...(period ? { periodStart: period.start, periodEnd: period.end } : {}),
        version: { increment: 1 },
      },
    });
    await this.entitlements.invalidate(local.businessId);
  }

  private async subscriptionDeleted(
    remote: Stripe.Subscription,
  ): Promise<void> {
    const local = await this.findLocal(remote.id);
    if (!local) return;
    await this.prisma.$transaction([
      this.prisma.subscription.update({
        where: { id: local.id },
        data: {
          status: 'cancelled',
          cancelAtPeriodEnd: false,
          version: { increment: 1 },
        },
      }),
      this.prisma.entitlementAudit.create({
        data: {
          businessId: local.businessId,
          actorType: 'stripe',
          changeType: 'suspension',
          before: { status: local.status },
          after: { status: 'cancelled' },
          reason: 'Stripe subscription ended; data retention clock started',
        },
      }),
    ]);
    await this.entitlements.invalidate(local.businessId);
  }

  private async paymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const id = invoiceSubscriptionId(invoice);
    if (!id) return;
    const local = await this.findLocal(id);
    if (!local) return;
    await this.prisma.$transaction([
      this.prisma.subscription.update({
        where: { id: local.id },
        data: {
          status: 'past_due',
          pastDueSince: local.pastDueSince ?? new Date(),
          version: { increment: 1 },
        },
      }),
      this.prisma.entitlementAudit.create({
        data: {
          businessId: local.businessId,
          actorType: 'stripe',
          changeType: 'suspension',
          before: { status: local.status },
          after: { status: 'past_due' },
          reason: 'Subscription payment failed (Stripe retries automatically)',
        },
      }),
    ]);
    await this.entitlements.invalidate(local.businessId);
    this.logger.warn(`Subscription payment failed for ${local.businessId}`);
  }

  private async paymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    const id = invoiceSubscriptionId(invoice);
    if (!id) return;
    const local = await this.findLocal(id);
    if (!local || local.status !== 'past_due') return;
    await this.prisma.$transaction([
      this.prisma.subscription.update({
        where: { id: local.id },
        data: {
          status: 'active',
          pastDueSince: null,
          version: { increment: 1 },
        },
      }),
      this.prisma.entitlementAudit.create({
        data: {
          businessId: local.businessId,
          actorType: 'stripe',
          changeType: 'suspension',
          before: { status: 'past_due' },
          after: { status: 'active' },
          reason: 'Overdue payment collected',
        },
      }),
    ]);
    await this.entitlements.invalidate(local.businessId);
  }
}
