import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StripeGatewayAdapter } from './adapters/stripe-gateway.adapter';

/**
 * Creates a Stripe Product + Price for any plan missing a `stripePriceId`
 * (BE-064). Runs after PlansSeedService, best-effort — if Stripe isn't
 * configured (or the API call fails), plans simply stay without a
 * stripePriceId and checkout will report BILLING_GATEWAY_NOT_CONFIGURED
 * rather than blocking app boot.
 */
@Injectable()
export class StripeSyncService implements OnModuleInit {
  private readonly logger = new Logger(StripeSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeAdapter: StripeGatewayAdapter,
  ) {}

  async onModuleInit() {
    if (!this.stripeAdapter.isConfigured || !this.stripeAdapter.stripe) {
      return;
    }
    const stripe = this.stripeAdapter.stripe;

    try {
      const plans = await this.prisma.plan.findMany({
        where: { stripePriceId: null },
      });
      for (const plan of plans) {
        if (Number(plan.price) === 0) continue; // free plan needs no Stripe price

        const product = await stripe.products.create({
          name: `Noxtill — ${plan.name}`,
        });
        const price = await stripe.prices.create({
          product: product.id,
          unit_amount: Math.round(Number(plan.price) * 100),
          currency: 'usd',
          recurring: { interval: 'month' },
        });

        await this.prisma.plan.update({
          where: { id: plan.id },
          data: { stripePriceId: price.id },
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to sync Stripe products/prices: ${(error as Error).message}`,
      );
    }
  }
}
