import { HttpStatus, Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { EntitlementsService } from './entitlements.service';
import { CreditsService } from './credits.service';
import { MetersService } from './meters.service';
import { UsageStripeHelper } from './usage-stripe.helper';
import {
  PURCHASABLES,
  PurchaseKey,
  USAGE_ERROR_CODES,
} from './usage.constants';

/**
 * Buying extra capacity (spec §3.2, §13.2). Nothing is granted until Stripe confirms payment:
 * a credit pack is a one-off Checkout and lands in the purchased bucket from the webhook; a
 * recurring add-on (seat, location, number, agent seat) is added to the paid Stripe subscription
 * with `error_if_incomplete`, so it only activates when that charge actually succeeds.
 */
@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly credits: CreditsService,
    private readonly meters: MetersService,
    private readonly stripeHelper: UsageStripeHelper,
  ) {}

  async list(businessId: string) {
    const rootId = await this.entitlements.rootId(businessId);
    return this.prisma.capacityPurchase.findMany({
      where: { businessId: rootId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async start(
    businessId: string,
    actorUserId: string,
    key: PurchaseKey,
    approved: boolean,
  ): Promise<{
    status: 'checkout' | 'active';
    checkoutUrl?: string;
    purchaseId: string;
  }> {
    const def = PURCHASABLES[key];
    if (!def)
      throw new AppException(
        USAGE_ERROR_CODES.PURCHASE_NOT_AVAILABLE,
        'That item cannot be bought.',
        HttpStatus.BAD_REQUEST,
      );
    if (!approved) {
      throw new AppException(
        USAGE_ERROR_CODES.PURCHASE_NOT_AVAILABLE,
        'Approve the purchase at the price shown to continue.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const rootId = await this.entitlements.rootId(businessId);
    const sub = await this.entitlements.ensureSubscription(rootId);
    if (this.entitlements.statusFlags(sub).suspended) {
      throw new AppException(
        USAGE_ERROR_CODES.SUBSCRIPTION_PAUSED,
        'Reactivate your subscription before buying more.',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    if (
      def.recurring &&
      (sub.status === 'trialing' || !sub.stripeSubscriptionId)
    ) {
      throw new AppException(
        USAGE_ERROR_CODES.PURCHASE_NOT_AVAILABLE,
        sub.status === 'trialing'
          ? `${def.label} is added to a paid subscription. Choose a plan first — nothing is added during the trial.`
          : `${def.label} is added to your paid Stripe subscription, and this workspace doesn't have one yet. Choose a plan first.`,
        HttpStatus.FORBIDDEN,
      );
    }
    const unit = await this.meters.unitPrice(def.metricCode);
    if (unit == null)
      throw new AppException(
        USAGE_ERROR_CODES.PURCHASE_NOT_AVAILABLE,
        `${def.label} has no published price.`,
        HttpStatus.BAD_REQUEST,
      );
    const packPrice = Math.round(unit * def.quantity * 100) / 100;
    const stripe = this.stripeHelper.stripe();

    const purchase = await this.prisma.capacityPurchase.create({
      data: {
        businessId: rootId,
        metricCode: def.metricCode,
        quantity: def.quantity,
        unitPriceUsd: packPrice,
        recurring: def.recurring,
        status: 'pending',
        createdById: actorUserId,
      },
    });

    if (!def.recurring) {
      const customer = await this.stripeHelper.ensureCustomer(rootId);
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: Math.round(packPrice * 100),
              product: await this.stripeHelper.product(
                `addon:${key}`,
                `Noxtill ${def.label}`,
              ),
            },
          },
        ],
        client_reference_id: rootId,
        success_url: this.stripeHelper.frontendUrl(
          '/settings/usage/ai?purchase=success',
        ),
        cancel_url: this.stripeHelper.frontendUrl(
          '/settings/usage/ai?purchase=cancelled',
        ),
        metadata: {
          kind: 'usage_purchase',
          purchaseId: purchase.id,
          businessId: rootId,
        },
        payment_intent_data: {
          metadata: {
            kind: 'usage_purchase',
            purchaseId: purchase.id,
            businessId: rootId,
          },
        },
      });
      await this.prisma.capacityPurchase.update({
        where: { id: purchase.id },
        data: { stripeCheckoutId: session.id },
      });
      return {
        status: 'checkout',
        checkoutUrl: session.url ?? undefined,
        purchaseId: purchase.id,
      };
    }

    // Recurring: attached to the existing subscription; charged now (prorated) or not at all.
    const yearly = sub.billingInterval === 'year';
    let item: Stripe.SubscriptionItem;
    try {
      item = await stripe.subscriptionItems.create({
        subscription: sub.stripeSubscriptionId!,
        quantity: def.quantity,
        price_data: {
          currency: 'usd',
          product: await this.stripeHelper.product(
            `addon:${key}`,
            `Noxtill ${def.label}`,
          ),
          unit_amount: Math.round(packPrice * (yearly ? 12 : 1) * 100),
          recurring: { interval: yearly ? 'year' : 'month' },
        },
        proration_behavior: 'always_invoice',
        payment_behavior: 'error_if_incomplete',
        metadata: { noxtill_addon: key, purchaseId: purchase.id },
      });
    } catch (error) {
      await this.prisma.capacityPurchase.update({
        where: { id: purchase.id },
        data: { status: 'failed' },
      });
      throw new AppException(
        USAGE_ERROR_CODES.PURCHASE_NOT_AVAILABLE,
        `Payment wasn't confirmed, so nothing was added: ${(error as Error).message}`,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    await this.activate(purchase.id, item.id, actorUserId);
    return { status: 'active', purchaseId: purchase.id };
  }

  /** pending → active exactly once (webhook retries are harmless). */
  async activate(
    purchaseId: string,
    stripeItemId: string | null,
    actorUserId: string | null = null,
  ): Promise<boolean> {
    const purchase = await this.prisma.capacityPurchase.findUnique({
      where: { id: purchaseId },
    });
    if (!purchase) return false;
    const flipped = await this.prisma.capacityPurchase.updateMany({
      where: { id: purchaseId, status: 'pending' },
      data: {
        status: 'active',
        activeFrom: new Date(),
        stripeItemId: stripeItemId ?? undefined,
      },
    });
    if (flipped.count !== 1) return false;
    if (!purchase.recurring && purchase.metricCode === 'ai_credits') {
      await this.credits.grantPurchased(
        purchase.businessId,
        purchase.quantity,
        purchase.id,
      );
    }
    await this.prisma.entitlementAudit.create({
      data: {
        businessId: purchase.businessId,
        actorUserId,
        actorType: actorUserId ? 'user' : 'stripe',
        changeType: 'purchase',
        after: {
          metric: purchase.metricCode,
          quantity: purchase.quantity,
          priceUsd: Number(purchase.unitPriceUsd),
          recurring: purchase.recurring,
        },
        reason: 'Payment confirmed by Stripe',
      },
    });
    await this.entitlements.bumpVersion(purchase.businessId);
    return true;
  }

  async markFailed(purchaseId: string): Promise<void> {
    await this.prisma.capacityPurchase.updateMany({
      where: { id: purchaseId, status: 'pending' },
      data: { status: 'failed' },
    });
  }
}
