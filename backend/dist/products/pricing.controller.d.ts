import { PricingService } from './pricing.service';
import { BulkPriceDto } from './dto/bulk-price.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class PricingController {
    private readonly pricingService;
    constructor(pricingService: PricingService);
    bulkPrice(dto: BulkPriceDto): Promise<{
        dryRun: boolean;
        changes: {
            productId: string;
            name: string;
            oldPrice: number;
            newPrice: number;
        }[];
    }>;
    priceHistory(id: string): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        createdAt: Date;
        businessId: string;
        note: string | null;
        productId: string;
        oldPrice: import("generated/prisma/runtime/library").Decimal;
        newPrice: import("generated/prisma/runtime/library").Decimal;
        changedByUserId: string | null;
    }[]>;
    suggestedPrice(user: AuthenticatedUser, id: string): Promise<{
        productId: string;
        costPrice: number;
        currentPrice: number;
        currentMarginPercent: number;
        suggestedPrice: number;
        rationale: string;
    }>;
}
