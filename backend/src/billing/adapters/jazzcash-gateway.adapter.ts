import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CheckoutSession,
  CreateCheckoutParams,
  PaymentGatewayAdapter,
  RefundResult,
} from './payment-gateway.adapter';

/**
 * JazzCash (regional Pakistani gateway) implementation of
 * PaymentGatewayAdapter (BE-066) — demonstrates that a second gateway is
 * "only a new adapter + a config row": this class implements the exact
 * same interface as StripeGatewayAdapter, and BillingService picks between
 * them purely by `key`, never branching on gateway-specific logic. The
 * actual JazzCash merchant API call is stubbed pending real merchant
 * credentials — structurally correct, reports itself unconfigured until then.
 */
@Injectable()
export class JazzCashGatewayAdapter implements PaymentGatewayAdapter {
  readonly key = 'jazzcash';
  private readonly logger = new Logger(JazzCashGatewayAdapter.name);
  private readonly merchantId?: string;

  constructor(private readonly config: ConfigService) {
    this.merchantId = this.config.get<string>('JAZZCASH_MERCHANT_ID');
    if (!this.merchantId) {
      this.logger.warn(
        'JAZZCASH_MERCHANT_ID not configured — JazzCash billing is disabled',
      );
    }
  }

  get isConfigured(): boolean {
    return !!this.merchantId;
  }

  createCheckoutSession(
    params: CreateCheckoutParams,
  ): Promise<CheckoutSession> {
    void params;
    if (!this.merchantId) {
      throw new Error('JazzCash is not configured');
    }
    // Stub pending real JazzCash merchant integration — same seam StripeGatewayAdapter fills for Stripe.
    return Promise.reject(
      new Error('JazzCash checkout is not yet implemented'),
    );
  }

  refund(providerRef: string, amount: number): Promise<RefundResult> {
    void providerRef;
    void amount;
    if (!this.merchantId) {
      throw new Error('JazzCash is not configured');
    }
    return Promise.reject(
      new Error('JazzCash refunds are not yet implemented'),
    );
  }
}
