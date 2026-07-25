import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CreateCompetitorDto } from './dto/create-competitor.dto';
export declare class CompetitorsService {
    private readonly tenantPrisma;
    constructor(tenantPrisma: TenantPrismaService);
    list(): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        platformRef: string;
        lastRating: import("generated/prisma/runtime/library").Decimal | null;
        lastReviewsCount: number | null;
    }[]>;
    create(businessId: string, dto: CreateCompetitorDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        platformRef: string;
        lastRating: import("generated/prisma/runtime/library").Decimal | null;
        lastReviewsCount: number | null;
    }>;
    remove(id: string): Promise<{
        success: boolean;
    }>;
}
