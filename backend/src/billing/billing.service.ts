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
}
