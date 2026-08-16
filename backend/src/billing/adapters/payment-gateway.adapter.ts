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
 * Subject-agnostic subscription checkout (UPD-BE-025 Memberships) — deliberately NOT shaped like
 * `CreateCheckoutParams` (no `businessId`/`businessName`). `referenceId` is whatever the caller
 * wants to find the resulting subscription by later (e.g. a `Membership.id`) and is carried as
 * `client_reference_id` + subscription metadata under a caller-chosen key, never assumed to be a
 * businessId — this is what lets a customer-membership subscription and the business's own
 * Stripe billing plan share one adapter without either one's webhook path being able to touch
 * the other's data.
 */
export interface CreateSubscriptionCheckoutParams {
  referenceId: string;
  referenceKey: string;
  customerEmail?: string;
  priceRef: string;
  successUrl: string;
  cancelUrl: string;
}

/**
 * Adapter interface every payment gateway implements (BE-066, `refund` added UPD-BE-011 for
 * Returns & Refunds, `createSubscriptionCheckout`/`cancelSubscription` added UPD-BE-025 for
 * Memberships). Adding a new regional gateway means writing one class against this contract plus
 * a config row selecting it — nothing else in BillingService should need to change. Webhook
 * handling is necessarily provider-specific and stays in each provider's own webhook
 * controller/processor.
 */
export interface PaymentGatewayAdapter {
  readonly key: string;
  readonly isConfigured: boolean;
  createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutSession>;
  /** `providerRef` is the original charge/payment-intent reference from that gateway. */
  refund(providerRef: string, amount: number): Promise<RefundResult>;
  createSubscriptionCheckout(
    params: CreateSubscriptionCheckoutParams,
  ): Promise<CheckoutSession>;
  cancelSubscription(providerRef: string): Promise<void>;
}
