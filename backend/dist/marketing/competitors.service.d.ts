import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CreateCompetitorDto } from './dto/create-competitor.dto';
import { CompetitorSnapshotProcessor } from './jobs/competitor-snapshot.processor';
export declare class CompetitorsService {
    private readonly tenantPrisma;
    private readonly snapshotProcessor;
    constructor(tenantPrisma: TenantPrismaService, snapshotProcessor: CompetitorSnapshotProcessor);
    list(): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        platformRef: string;
        lastRating: import("generated/prisma/runtime/library").Decimal | null;
        lastReviewsCount: number | null;
    }[]>;
    create(businessId: string, dto: CreateCompetitorDto): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        platformRef: string;
        lastRating: import("generated/prisma/runtime/library").Decimal | null;
        lastReviewsCount: number | null;
    }>;
    remove(id: string): Promise<{
        success: boolean;
    }>;
    history(id: string): Promise<{
        rating: number;
        reviewsCount: number;
        capturedAt: string;
    }[]>;
    triggerSnapshot(id: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        platformRef: string;
        lastRating: import("generated/prisma/runtime/library").Decimal | null;
        lastReviewsCount: number | null;
    }>;
}
