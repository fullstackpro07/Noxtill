import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { CheckoutSession, CreateCheckoutParams, CreateSubscriptionCheckoutParams, PaymentGatewayAdapter, RefundResult } from './payment-gateway.adapter';
export declare class StripeGatewayAdapter implements PaymentGatewayAdapter {
    private readonly config;
    readonly key = "stripe";
    private readonly logger;
    private readonly client?;
    constructor(config: ConfigService);
    get isConfigured(): boolean;
    get stripe(): Stripe | undefined;
    createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutSession>;
    refund(providerRef: string, amount: number): Promise<RefundResult>;
    createSubscriptionCheckout(params: CreateSubscriptionCheckoutParams): Promise<CheckoutSession>;
    cancelSubscription(providerRef: string): Promise<void>;
}
