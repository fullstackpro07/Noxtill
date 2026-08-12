import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { PaymentGatewayAdapter } from './adapters/payment-gateway.adapter';
import { StripeGatewayAdapter } from './adapters/stripe-gateway.adapter';
import { JazzCashGatewayAdapter } from './adapters/jazzcash-gateway.adapter';
import { BILLING_ERROR_CODES } from './billing.constants';

/**
 * Checkout orchestration (BE-064). Deliberately gateway-agnostic: this
 * service never imports Stripe or JazzCash types directly for its logic,
 * only the shared PaymentGatewayAdapter contract — everything gateway-
 * specific lives inside each adapter (BE-066).
 */
@Injectable()
export class BillingService {
  private readonly adapters: Record<string, PaymentGatewayAdapter>;

  constructor(
    private readonly prisma: PrismaService,
    stripeAdapter: StripeGatewayAdapter,
    jazzCashAdapter: JazzCashGatewayAdapter,
  ) {
    this.adapters = {
      [stripeAdapter.key]: stripeAdapter,
      [jazzCashAdapter.key]: jazzCashAdapter,
    };
  }

  async createCheckout(businessId: string, dto: CreateCheckoutDto) {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      include: {
        businessUsers: { where: { role: 'owner' }, include: { user: true } },
      },
    });

    const plan = await this.prisma.plan.findUnique({
      where: { key: dto.planKey },
    });
    if (!plan) {
      throw new AppException(
        BILLING_ERROR_CODES.PLAN_NOT_FOUND,
        `Unknown plan: ${dto.planKey}`,
        HttpStatus.NOT_FOUND,
      );
    }

    const adapter = this.adapters[dto.gateway ?? 'stripe'];
    if (!adapter.isConfigured) {
      throw new AppException(
        BILLING_ERROR_CODES.GATEWAY_NOT_CONFIGURED,
        `Payment gateway "${adapter.key}" is not configured`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (!plan.stripePriceId && adapter.key === 'stripe') {
      throw new AppException(
        BILLING_ERROR_CODES.PLAN_NOT_FOUND,
        `Plan "${plan.key}" has no price configured yet`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const owner = business.businessUsers[0]?.user;
    const session = await adapter.createCheckoutSession({
      businessId,
      businessName: business.name,
      customerEmail: owner?.email ?? undefined,
      priceRef: plan.stripePriceId ?? plan.key,
      existingCustomerRef: business.stripeCustomerId ?? undefined,
      successUrl: dto.successUrl,
      cancelUrl: dto.cancelUrl,
    });

    return { url: session.url };
  }

  /**
   * Refunds a real gateway charge by its provider reference (UPD-BE-011 Returns & Refunds).
   * `gatewayKey` defaults to 'stripe' since `Payment` doesn't record which gateway processed it —
   * only Stripe is a real, currently-usable gateway; JazzCash's own adapter still reports itself
   * unimplemented, matching its checkout stub.
   */
  async refund(providerRef: string, amount: number, gatewayKey = 'stripe') {
    const adapter = this.adapters[gatewayKey];
    if (!adapter?.isConfigured) {
      throw new AppException(
        BILLING_ERROR_CODES.GATEWAY_NOT_CONFIGURED,
        `Payment gateway "${gatewayKey}" is not configured`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return adapter.refund(providerRef, amount);
  }

  /**
   * Real current plan + usage (INT-014) — nothing read this back before; the webhook only ever
   * wrote to `Business`. AI-cost aggregation mirrors `AiInfraService.enforceCostCap`'s exact
   * UTC-month-start query rather than reimplementing it.
   */
  async status(businessId: string) {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      include: { plan: true },
    });

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const aiAgg = await this.prisma.aiCallLog.aggregate({
      where: { businessId, createdAt: { gte: monthStart } },
      _sum: { estimatedCostUsd: true },
    });

    return {
      planKey: business.plan?.key ?? null,
      planName: business.plan?.name ?? null,
      price: business.plan ? Number(business.plan.price) : null,
      msgQuota: business.msgQuota,
      msgUsed: business.msgUsed,
      userLimit: business.plan?.userLimit ?? null,
      aiCostCapUsd: Number(business.aiMonthlyCostCapUsd),
      aiCostUsedUsd: Number(aiAgg._sum.estimatedCostUsd ?? 0),
      trialEndsAt: business.trialEndsAt,
      hasActiveSubscription: !!business.stripeSubscriptionId,
    };
  }
}
