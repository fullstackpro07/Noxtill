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
export interface PaymentGatewayAdapter {
    readonly key: string;
    readonly isConfigured: boolean;
    createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutSession>;
}
