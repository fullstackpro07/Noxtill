import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { BulkPriceDto } from './dto/bulk-price.dto';
import { Prisma } from '../../generated/prisma';
export declare class PricingService {
    private readonly tenantPrisma;
    private readonly cls;
    private readonly aiInfra;
    private readonly logger;
    constructor(tenantPrisma: TenantPrismaService, cls: ClsService, aiInfra: AiInfraService);
    bulkPrice(dto: BulkPriceDto): Promise<{
        dryRun: boolean;
        changes: {
            productId: string;
            name: string;
            oldPrice: number;
            newPrice: number;
        }[];
    }>;
    priceHistory(productId: string): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        businessId: string;
        createdAt: Date;
        note: string | null;
        productId: string;
        oldPrice: Prisma.Decimal;
        newPrice: Prisma.Decimal;
        changedByUserId: string | null;
    }[]>;
    suggestedPrice(businessId: string, productId: string): Promise<{
        productId: string;
        costPrice: number;
        currentPrice: number;
        currentMarginPercent: number;
        suggestedPrice: number;
        rationale: string;
    }>;
    private phraseRationale;
}
