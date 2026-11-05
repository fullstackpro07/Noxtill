import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { Plan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StripeGatewayAdapter } from '../billing/adapters/stripe-gateway.adapter';
import { AppException } from '../common/filters/app.exception';
import { USAGE_ERROR_CODES } from './usage.constants';

/**
 * Stripe plumbing shared by subscription changes, purchases and payment methods. Stripe is the
 * merchant of record (spec §13.1): it takes the money and computes tax; this system only decides
 * entitlements. Every caller fails with STRIPE_NOT_CONFIGURED (503) while keys are absent —
 * never a fake success.
 */
@Injectable()
export class UsageStripeHelper {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adapter: StripeGatewayAdapter,
    private readonly config: ConfigService,
  ) {}

  get configured(): boolean {
    return this.adapter.isConfigured;
  }

  stripe(): Stripe {
    const s = this.adapter.stripe;
    if (!s) {
      throw new AppException(
        USAGE_ERROR_CODES.STRIPE_NOT_CONFIGURED,
        "Payments aren't connected yet (Stripe isn't configured), so nothing can be bought or charged right now.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return s;
  }

  frontendUrl(path: string): string {
    const base = (
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'
    ).replace(/\/$/, '');
    return `${base}${path}`;
  }

  async ensureCustomer(rootId: string): Promise<string> {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: rootId },
      include: {
        businessUsers: {
          where: { role: 'owner' },
          include: { user: { select: { email: true } } },
          take: 1,
        },
      },
    });
    if (business.stripeCustomerId) return business.stripeCustomerId;
    const customer = await this.stripe().customers.create({
      name: business.name,
      email: business.businessUsers[0]?.user.email ?? undefined,
      metadata: { businessId: rootId },
    });
    await this.prisma.business.update({
      where: { id: rootId },
      data: { stripeCustomerId: customer.id },
    });
    return customer.id;
  }

  /** Recurring Stripe Price for a plan at an interval, created once and remembered on the plan. */
  async planPrice(plan: Plan, interval: 'month' | 'year'): Promise<string> {
    const stripe = this.stripe();
    const existing =
      interval === 'month' ? plan.stripePriceId : plan.stripeYearlyPriceId;
    if (existing) return existing;
    const amount =
      interval === 'month' ? Number(plan.price) : Number(plan.yearlyPrice ?? 0);
    if (!(amount > 0)) {
      throw new AppException(
        USAGE_ERROR_CODES.PLAN_NOT_AVAILABLE,
        `${plan.name} has no ${interval === 'month' ? 'monthly' : 'yearly'} price.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const product = await this.product(
      `plan:${plan.key}`,
      `Noxtill ${plan.name}`,
    );
    const price = await stripe.prices.create({
      product,
      currency: 'usd',
      unit_amount: Math.round(amount * 100),
      recurring: { interval },
      metadata: { planKey: plan.key, interval },
    });
    await this.prisma.plan.update({
      where: { id: plan.id },
      data:
        interval === 'month'
          ? { stripePriceId: price.id }
          : { stripeYearlyPriceId: price.id },
    });
    return price.id;
  }

  /** A Stripe Product per Noxtill item, found again by metadata so it is created exactly once. */
  async product(noxtillKey: string, name: string): Promise<string> {
    const stripe = this.stripe();
    const found = await stripe.products.search({
      query: `metadata['noxtill_key']:'${noxtillKey}'`,
      limit: 1,
    });
    if (found.data[0]) return found.data[0].id;
    const created = await stripe.products.create({
      name,
      metadata: { noxtill_key: noxtillKey },
    });
    return created.id;
  }
}
