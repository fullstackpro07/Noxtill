import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { AiInsightCategory } from '../../generated/prisma';
interface CategoryFact {
    category: AiInsightCategory;
    sourceFigure: string;
    context: string;
}
export declare class AiInsightsService {
    private readonly tenantPrisma;
    private readonly aiInfra;
    private readonly logger;
    constructor(tenantPrisma: TenantPrismaService, aiInfra: AiInfraService);
    list(businessId: string, category?: AiInsightCategory, status?: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        category: import("../../generated/prisma").$Enums.AiInsightCategory;
        status: import("../../generated/prisma").$Enums.AiInsightStatus;
        observation: string;
        sourceFigure: string;
    }[]>;
    setStatus(businessId: string, id: string, status: 'actioned' | 'dismissed'): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        category: import("../../generated/prisma").$Enums.AiInsightCategory;
        status: import("../../generated/prisma").$Enums.AiInsightStatus;
        observation: string;
        sourceFigure: string;
    }>;
    generateForBusiness(businessId: string): Promise<number>;
    private phraseObservations;
    private parseObservationArray;
    gatherFacts(businessId: string): Promise<CategoryFact[]>;
    private salesFact;
    private stockFact;
    private customersFact;
    private marketingFact;
    private creditFact;
}
export {};
