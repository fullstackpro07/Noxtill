import { ConfigService } from '@nestjs/config';
import { CheckoutSession, CreateCheckoutParams, PaymentGatewayAdapter, RefundResult } from './payment-gateway.adapter';
export declare class JazzCashGatewayAdapter implements PaymentGatewayAdapter {
    private readonly config;
    readonly key = "jazzcash";
    private readonly logger;
    private readonly merchantId?;
    constructor(config: ConfigService);
    get isConfigured(): boolean;
    createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutSession>;
    refund(providerRef: string, amount: number): Promise<RefundResult>;
}
