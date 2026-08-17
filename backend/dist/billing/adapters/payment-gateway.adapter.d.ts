export interface CreateCheckoutParams {
    businessId: string;
    businessName: string;
    customerEmail?: string;
    priceRef: string;
    existingCustomerRef?: string;
    successUrl: string;
    cancelUrl: string;
}
export interface CheckoutSession {
    url: string;
    sessionRef: string;
}
export interface RefundResult {
    refundRef: string;
}
export interface CreateSubscriptionCheckoutParams {
    referenceId: string;
    referenceKey: string;
    customerEmail?: string;
    priceRef: string;
    successUrl: string;
    cancelUrl: string;
}
export interface PaymentGatewayAdapter {
    readonly key: string;
    readonly isConfigured: boolean;
    createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutSession>;
    refund(providerRef: string, amount: number): Promise<RefundResult>;
    createSubscriptionCheckout(params: CreateSubscriptionCheckoutParams): Promise<CheckoutSession>;
    cancelSubscription(providerRef: string): Promise<void>;
}
