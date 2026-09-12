import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { PlanAssignmentService } from './plan-assignment.service';
import { StripeGatewayAdapter } from './adapters/stripe-gateway.adapter';
import { STRIPE_WEBHOOK_QUEUE } from './stripe-webhook.constants';

/**
 * Applies the effect of each Stripe event (BE-065). `checkout.session.completed`
 * links the business to its new Stripe customer/subscription and assigns the
 * purchased plan; `customer.subscription.updated` re-syncs on a plan change;
 * `customer.subscription.deleted` drops the business back to Basic.
 *
 * Membership depth fix (UPD-INT-007) — a `Membership`'s online (Stripe) subscription shares
 * this same processor (never a separate webhook endpoint), disambiguated by the real
 * `membershipId` metadata `MembershipsService.create()` stamps onto the subscription (never by
 * `client_reference_id`, which is a membership id here, not a business id — passing it to
 * `prisma.business.update()` would silently fail to match any row). Stripe's own recurring
 * billing engine is what actually "charges on schedule" — this processor's job is only to keep
 * `Membership.status`/`currentPeriodEnd` truthfully in sync with what Stripe already did.
 */
/** Stripe API version 2025+ moved `current_period_end` off the Subscription object onto each SubscriptionItem. */
function subscriptionPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const seconds = subscription.items.data[0]?.current_period_end;
  return seconds ? new Date(seconds * 1000) : null;
}

@Processor(STRIPE_WEBHOOK_QUEUE)
export class StripeWebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(StripeWebhookProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly planAssignment: PlanAssignmentService,
    private readonly stripeAdapter: StripeGatewayAdapter,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'checkout.session.completed':
        return this.handleCheckoutCompleted(
          job.data as Stripe.Checkout.Session,
        );
      case 'customer.subscription.updated':
        return this.handleSubscriptionUpdated(job.data as Stripe.Subscription);
      case 'customer.subscription.deleted':
        return this.handleSubscriptionDeleted(job.data as Stripe.Subscription);
      default:
        this.logger.debug(`Ignoring unhandled Stripe event type: ${job.name}`);
    }
  }

  private async handleCheckoutCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;
    if (!subscriptionId || !this.stripeAdapter.stripe) {
      this.logger.warn('checkout.session.completed missing subscription');
      return;
    }

    const subscription =
      await this.stripeAdapter.stripe.subscriptions.retrieve(subscriptionId);

    const membershipId = subscription.metadata?.membershipId;
    if (membershipId) {
      return this.activateMembershipCheckout(membershipId, subscription);
    }

    const businessId = session.client_reference_id;
    const customerId =
      typeof session.customer === 'string'
        ? session.customer
        : session.customer?.id;
    if (!businessId || !customerId) {
      this.logger.warn(
        'checkout.session.completed missing businessId/customer',
      );
      return;
    }

    const priceId = subscription.items.data[0]?.price.id;

    await this.prisma.business.update({
      where: { id: businessId },
      data: {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        trialEndsAt: null,
      },
    });

    if (priceId) {
      await this.planAssignment.assignByStripePriceId(businessId, priceId);
    }
  }

  /** Membership depth fix — a customer's online membership checkout completing activates it for real, instead of requiring staff to manually check Stripe's dashboard and call `POST /memberships/:id/activate`. */
  private async activateMembershipCheckout(
    membershipId: string,
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
    });
    if (!membership) {
      this.logger.warn(
        `checkout.session.completed referenced unknown membership ${membershipId}`,
      );
      return;
    }

    await this.prisma.membership.update({
      where: { id: membershipId },
      data: {
        status: 'active',
        stripeSubscriptionId: subscription.id,
        currentPeriodEnd: subscriptionPeriodEnd(subscription),
      },
    });
  }

  private async handleSubscriptionUpdated(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const business = await this.prisma.business.findUnique({
      where: { stripeSubscriptionId: subscription.id },
    });
    if (business) {
      const priceId = subscription.items.data[0]?.price.id;
      if (priceId) {
        await this.planAssignment.assignByStripePriceId(business.id, priceId);
      }
      return;
    }

    // Membership depth fix — Stripe's own recurring billing engine is what actually "charges
    // on schedule"; every real renewal fires this event, so this is where `currentPeriodEnd`
    // gets kept truthfully in sync rather than frozen at enrollment forever.
    const membership = await this.prisma.membership.findUnique({
      where: { stripeSubscriptionId: subscription.id },
    });
    if (!membership) return;

    await this.prisma.membership.update({
      where: { id: membership.id },
      data: {
        currentPeriodEnd: subscriptionPeriodEnd(subscription),
        status: subscription.status === 'active' ? 'active' : membership.status,
      },
    });
  }

  private async handleSubscriptionDeleted(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const business = await this.prisma.business.findUnique({
      where: { stripeSubscriptionId: subscription.id },
    });
    if (business) {
      await this.prisma.business.update({
        where: { id: business.id },
        data: { stripeSubscriptionId: null },
      });
      await this.planAssignment.downgradeToBasic(business.id);
      return;
    }

    // Membership depth fix — a real failed-payment cancellation (or manual cancellation from
    // Stripe's own dashboard) must not leave the local record silently claiming "active" forever.
    const membership = await this.prisma.membership.findUnique({
      where: { stripeSubscriptionId: subscription.id },
    });
    if (!membership) return;

    await this.prisma.membership.update({
      where: { id: membership.id },
      data: { status: 'expired' },
    });
  }
}
