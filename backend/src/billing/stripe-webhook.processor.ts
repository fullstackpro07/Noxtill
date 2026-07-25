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
 */
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
    const businessId = session.client_reference_id;
    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;
    const customerId =
      typeof session.customer === 'string'
        ? session.customer
        : session.customer?.id;
    if (
      !businessId ||
      !subscriptionId ||
      !customerId ||
      !this.stripeAdapter.stripe
    ) {
      this.logger.warn(
        'checkout.session.completed missing businessId/subscription/customer',
      );
      return;
    }

    const subscription =
      await this.stripeAdapter.stripe.subscriptions.retrieve(subscriptionId);
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

  private async handleSubscriptionUpdated(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const business = await this.prisma.business.findUnique({
      where: { stripeSubscriptionId: subscription.id },
    });
    if (!business) return;

    const priceId = subscription.items.data[0]?.price.id;
    if (priceId) {
      await this.planAssignment.assignByStripePriceId(business.id, priceId);
    }
  }

  private async handleSubscriptionDeleted(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const business = await this.prisma.business.findUnique({
      where: { stripeSubscriptionId: subscription.id },
    });
    if (!business) return;

    await this.prisma.business.update({
      where: { id: business.id },
      data: { stripeSubscriptionId: null },
    });
    await this.planAssignment.downgradeToBasic(business.id);
  }
}
