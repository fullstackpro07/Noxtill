import { PrismaService } from '../prisma/prisma.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { CreateSubscriptionCheckoutParams } from './adapters/payment-gateway.adapter';
import { StripeGatewayAdapter } from './adapters/stripe-gateway.adapter';
import { JazzCashGatewayAdapter } from './adapters/jazzcash-gateway.adapter';
export declare class BillingService {
    private readonly prisma;
    private readonly adapters;
    constructor(prisma: PrismaService, stripeAdapter: StripeGatewayAdapter, jazzCashAdapter: JazzCashGatewayAdapter);
    createCheckout(businessId: string, dto: CreateCheckoutDto): Promise<{
        url: string;
    }>;
    refund(providerRef: string, amount: number, gatewayKey?: string): Promise<import("./adapters/payment-gateway.adapter").RefundResult>;
    createSubscriptionCheckout(params: CreateSubscriptionCheckoutParams, gatewayKey?: string): Promise<import("./adapters/payment-gateway.adapter").CheckoutSession>;
    cancelSubscription(providerRef: string, gatewayKey?: string): Promise<void>;
    status(businessId: string): Promise<{
        planKey: string | null;
        planName: string | null;
        price: number | null;
        msgQuota: number;
        msgUsed: number;
        userLimit: number | null;
        aiCostCapUsd: number;
        aiCostUsedUsd: number;
        trialEndsAt: Date | null;
        hasActiveSubscription: boolean;
    }>;
}
