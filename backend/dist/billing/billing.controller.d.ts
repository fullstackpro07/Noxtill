import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class BillingController {
    private readonly billingService;
    constructor(billingService: BillingService);
    checkout(user: AuthenticatedUser, dto: CreateCheckoutDto): Promise<{
        url: string;
    }>;
}
