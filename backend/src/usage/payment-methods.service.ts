import { HttpStatus, Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { EntitlementsService } from './entitlements.service';
import { SubscriptionService } from './subscription.service';
import { UsageStripeHelper } from './usage-stripe.helper';

/**
 * Cards that pay for the Noxtill subscription. Card numbers are entered on Stripe's own hosted
 * page (Checkout in setup mode) and never reach Noxtill; only brand, last four and expiry are kept.
 * Every change re-verifies the signed-in user's password first (design: "confirm it's you").
 */
@Injectable()
export class PaymentMethodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly subscriptions: SubscriptionService,
    private readonly stripeHelper: UsageStripeHelper,
  ) {}

  async list(businessId: string) {
    const rootId = await this.entitlements.rootId(businessId);
    const rows = await this.prisma.platformPaymentMethod.findMany({
      where: { businessId: rootId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return {
      stripeConfigured: this.stripeHelper.configured,
      methods: rows.map((r) => ({
        id: r.id,
        brand: r.brand,
        last4: r.last4,
        expMonth: r.expMonth,
        expYear: r.expYear,
        isDefault: r.isDefault,
        createdAt: r.createdAt,
      })),
    };
  }

  async startSetup(
    businessId: string,
    userId: string,
    input: { password?: string; makeDefault?: boolean; replaceId?: string },
  ) {
    await this.subscriptions.verifyPassword(userId, input.password);
    const rootId = await this.entitlements.rootId(businessId);
    if (input.replaceId) {
      const target = await this.prisma.platformPaymentMethod.findFirst({
        where: { id: input.replaceId, businessId: rootId },
      });
      if (!target)
        throw new AppException(
          'PAYMENT_METHOD_NOT_FOUND',
          'Card not found',
          HttpStatus.NOT_FOUND,
        );
    }
    const stripe = this.stripeHelper.stripe();
    const customer = await this.stripeHelper.ensureCustomer(rootId);
    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      customer,
      payment_method_types: ['card'],
      success_url: this.stripeHelper.frontendUrl(
        '/settings/account/payment?setup=success',
      ),
      cancel_url: this.stripeHelper.frontendUrl(
        '/settings/account/payment?setup=cancelled',
      ),
      metadata: {
        kind: 'payment_method_setup',
        businessId: rootId,
        makeDefault: input.makeDefault || input.replaceId ? '1' : '0',
        replaceId: input.replaceId ?? '',
      },
    });
    return { checkoutUrl: session.url };
  }

  /** From the webhook: store the card Stripe just saved, set default / replace as requested. */
  async completeSetup(session: Stripe.Checkout.Session): Promise<void> {
    const rootId = session.metadata?.businessId;
    const setupIntentId =
      typeof session.setup_intent === 'string'
        ? session.setup_intent
        : session.setup_intent?.id;
    if (!rootId || !setupIntentId) return;
    const stripe = this.stripeHelper.stripe();
    const intent = await stripe.setupIntents.retrieve(setupIntentId);
    const pmId =
      typeof intent.payment_method === 'string'
        ? intent.payment_method
        : intent.payment_method?.id;
    if (!pmId) return;
    const pm = await stripe.paymentMethods.retrieve(pmId);
    const card = pm.card;
    if (!card) return;
    const replaceId = session.metadata?.replaceId || null;
    const replaced = replaceId
      ? await this.prisma.platformPaymentMethod.findFirst({
          where: { id: replaceId, businessId: rootId },
        })
      : null;
    const existingCount = await this.prisma.platformPaymentMethod.count({
      where: { businessId: rootId },
    });
    const makeDefault =
      session.metadata?.makeDefault === '1' ||
      existingCount === 0 ||
      !!replaced?.isDefault;
    const row = await this.prisma.platformPaymentMethod.upsert({
      where: { stripePaymentMethodId: pm.id },
      create: {
        businessId: rootId,
        stripePaymentMethodId: pm.id,
        brand: card.brand,
        last4: card.last4,
        expMonth: card.exp_month,
        expYear: card.exp_year,
      },
      update: {},
    });
    if (makeDefault) await this.setDefaultInternal(rootId, row.id);
    if (replaced && replaced.id !== row.id) {
      await stripe.paymentMethods
        .detach(replaced.stripePaymentMethodId)
        .catch(() => undefined);
      await this.prisma.platformPaymentMethod.delete({
        where: { id: replaced.id },
      });
    }
    await this.prisma.entitlementAudit.create({
      data: {
        businessId: rootId,
        actorType: 'stripe',
        changeType: 'purchase',
        after: {
          paymentMethod: `${card.brand} •••• ${card.last4}`,
          default: makeDefault,
          replaced: replaced
            ? `${replaced.brand} •••• ${replaced.last4}`
            : null,
        },
        reason: 'Payment method saved',
      },
    });
  }

  async makeDefault(
    businessId: string,
    userId: string,
    id: string,
    password?: string,
  ) {
    await this.subscriptions.verifyPassword(userId, password);
    const rootId = await this.entitlements.rootId(businessId);
    const target = await this.prisma.platformPaymentMethod.findFirst({
      where: { id, businessId: rootId },
    });
    if (!target)
      throw new AppException(
        'PAYMENT_METHOD_NOT_FOUND',
        'Card not found',
        HttpStatus.NOT_FOUND,
      );
    this.stripeHelper.stripe();
    await this.setDefaultInternal(rootId, id);
    return this.list(businessId);
  }

  private async setDefaultInternal(rootId: string, id: string) {
    const row = await this.prisma.platformPaymentMethod.findUniqueOrThrow({
      where: { id },
    });
    const stripe = this.stripeHelper.stripe();
    const customer = await this.stripeHelper.ensureCustomer(rootId);
    await stripe.customers.update(customer, {
      invoice_settings: { default_payment_method: row.stripePaymentMethodId },
    });
    const sub = await this.prisma.subscription.findUnique({
      where: { businessId: rootId },
    });
    if (sub?.stripeSubscriptionId) {
      await stripe.subscriptions.update(sub.stripeSubscriptionId, {
        default_payment_method: row.stripePaymentMethodId,
      });
    }
    await this.prisma.$transaction([
      this.prisma.platformPaymentMethod.updateMany({
        where: { businessId: rootId },
        data: { isDefault: false },
      }),
      this.prisma.platformPaymentMethod.update({
        where: { id },
        data: { isDefault: true },
      }),
    ]);
  }
}
