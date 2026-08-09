import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class BillingController {
    private readonly billingService;
    constructor(billingService: BillingService);
    status(user: AuthenticatedUser): Promise<{
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
    checkout(user: AuthenticatedUser, dto: CreateCheckoutDto): Promise<{
        url: string;
    }>;
}
