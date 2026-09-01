import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  CheckoutSession,
  CreateCheckoutParams,
  CreateSubscriptionCheckoutParams,
  PaymentGatewayAdapter,
  RefundResult,
} from './payment-gateway.adapter';

/**
 * Stripe implementation of PaymentGatewayAdapter (BE-064). Lazily
 * constructs the Stripe client only if a secret key is configured — like
 * every other external-API client in this codebase (ClaudeClient, Meta/
 * Twilio adapters), a missing key must never block app boot.
 */
@Injectable()
export class StripeGatewayAdapter implements PaymentGatewayAdapter {
  readonly key = 'stripe';
  private readonly logger = new Logger(StripeGatewayAdapter.name);
  private readonly client?: Stripe;

  constructor(private readonly config: ConfigService) {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (secretKey) {
      this.client = new Stripe(secretKey);
    } else {
      this.logger.warn(
        'STRIPE_SECRET_KEY not configured — Stripe billing is disabled',
      );
    }
  }

  get isConfigured(): boolean {
    return !!this.client;
  }

  get stripe(): Stripe | undefined {
    return this.client;
  }

  async createCheckoutSession(
    params: CreateCheckoutParams,
  ): Promise<CheckoutSession> {
    if (!this.client) {
      throw new Error('Stripe is not configured');
    }

    const session = await this.client.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: params.priceRef, quantity: 1 }],
      customer: params.existingCustomerRef,
      customer_email: params.existingCustomerRef
        ? undefined
        : params.customerEmail,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      client_reference_id: params.businessId,
      subscription_data: { metadata: { businessId: params.businessId } },
    });

    if (!session.url) {
      throw new Error('Stripe did not return a checkout URL');
    }

    return { url: session.url, sessionRef: session.id };
  }

  async refund(providerRef: string, amount: number): Promise<RefundResult> {
    if (!this.client) {
      throw new Error('Stripe is not configured');
    }
    const refund = await this.client.refunds.create({
      payment_intent: providerRef,
      amount: Math.round(amount * 100),
    });
    return { refundRef: refund.id };
  }

  /**
   * Deliberately does NOT set `businessId` anywhere — `client_reference_id` and the subscription
   * metadata key are both the caller-supplied `referenceKey`/`referenceId` (e.g. `membershipId`),
   * so this can never be picked up by `stripe-webhook.processor.ts`'s business-plan handlers,
   * which only ever look for `businessId`.
   */
  async createSubscriptionCheckout(
    params: CreateSubscriptionCheckoutParams,
  ): Promise<CheckoutSession> {
    if (!this.client) {
      throw new Error('Stripe is not configured');
    }

    const session = await this.client.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: params.priceRef, quantity: 1 }],
      customer_email: params.customerEmail,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      client_reference_id: params.referenceId,
      subscription_data: {
        metadata: { [params.referenceKey]: params.referenceId },
      },
    });

    if (!session.url) {
      throw new Error('Stripe did not return a checkout URL');
    }

    return { url: session.url, sessionRef: session.id };
  }

  async cancelSubscription(providerRef: string): Promise<void> {
    if (!this.client) {
      throw new Error('Stripe is not configured');
    }
    await this.client.subscriptions.cancel(providerRef);
  }

  /** Billing & Plan, extended (UPD-BE-121) — real invoice history straight from Stripe. */
  async listInvoices(customerRef: string): Promise<
    {
      id: string;
      number: string | null;
      status: string | null;
      amountDue: number;
      amountPaid: number;
      currency: string;
      createdAt: Date;
      hostedInvoiceUrl: string | null;
      invoicePdf: string | null;
    }[]
  > {
    if (!this.client) {
      return [];
    }
    const invoices = await this.client.invoices.list({
      customer: customerRef,
      limit: 24,
    });
    return invoices.data.map((invoice) => ({
      id: invoice.id ?? '',
      number: invoice.number,
      status: invoice.status,
      amountDue: invoice.amount_due / 100,
      amountPaid: invoice.amount_paid / 100,
      currency: invoice.currency,
      createdAt: new Date(invoice.created * 1000),
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      invoicePdf: invoice.invoice_pdf ?? null,
    }));
  }
}
