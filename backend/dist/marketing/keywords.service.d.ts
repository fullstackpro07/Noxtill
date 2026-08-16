import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CreateTrackedKeywordDto } from './dto/create-tracked-keyword.dto';
import { KeywordRankProcessor } from './jobs/keyword-rank.processor';
export declare class KeywordsService {
    private readonly tenantPrisma;
    private readonly rankProcessor;
    constructor(tenantPrisma: TenantPrismaService, rankProcessor: KeywordRankProcessor);
    list(): Promise<{
        id: string;
        keyword: string;
        latestRank: number | null;
        lastCheckedAt: string;
    }[]>;
    create(businessId: string, dto: CreateTrackedKeywordDto): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        keyword: string;
    }>;
    remove(id: string): Promise<{
        success: boolean;
    }>;
    history(id: string): Promise<{
        rank: number | null;
        capturedAt: string;
    }[]>;
    triggerCheck(businessId: string, id: string): Promise<{
        rank: number | null;
        capturedAt: string;
    }[]>;
}
