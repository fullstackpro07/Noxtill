import { PrismaService } from '../prisma/prisma.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { StripeGatewayAdapter } from './adapters/stripe-gateway.adapter';
import { JazzCashGatewayAdapter } from './adapters/jazzcash-gateway.adapter';
export declare class BillingService {
    private readonly prisma;
    private readonly adapters;
    constructor(prisma: PrismaService, stripeAdapter: StripeGatewayAdapter, jazzCashAdapter: JazzCashGatewayAdapter);
    createCheckout(businessId: string, dto: CreateCheckoutDto): Promise<{
        url: string;
    }>;
}
