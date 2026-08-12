export interface CreateCheckoutParams {
  businessId: string;
  businessName: string;
  customerEmail?: string;
  /** Provider-specific price/plan reference (e.g. a Stripe Price id). */
  priceRef: string;
  existingCustomerRef?: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  url: string;
  /** Provider-specific session/customer reference, stored so a later webhook can be matched back to this business. */
  sessionRef: string;
}

export interface RefundResult {
  /** Provider-specific refund reference, for audit/reconciliation. */
  refundRef: string;
}

/**
 * Adapter interface every payment gateway implements (BE-066, `refund` added UPD-BE-011 for
 * Returns & Refunds). Adding a new regional gateway means writing one class against this
 * contract plus a config row selecting it — nothing else in BillingService should need to
 * change. Webhook handling is necessarily provider-specific and stays in each provider's own
 * webhook controller/processor.
 */
export interface PaymentGatewayAdapter {
  readonly key: string;
  readonly isConfigured: boolean;
  createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutSession>;
  /** `providerRef` is the original charge/payment-intent reference from that gateway. */
  refund(providerRef: string, amount: number): Promise<RefundResult>;
}
