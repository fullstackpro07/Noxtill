import { AiInsightsService } from './ai-insights.service';
import { UpdateInsightStatusDto } from './dto/update-insight-status.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { AiInsightCategory } from '../../generated/prisma';
export declare class AiInsightsController {
    private readonly aiInsightsService;
    constructor(aiInsightsService: AiInsightsService);
    list(user: AuthenticatedUser, category?: AiInsightCategory, status?: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        category: import("../../generated/prisma").$Enums.AiInsightCategory;
        status: import("../../generated/prisma").$Enums.AiInsightStatus;
        observation: string;
        sourceFigure: string;
    }[]>;
    updateStatus(user: AuthenticatedUser, id: string, dto: UpdateInsightStatusDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        category: import("../../generated/prisma").$Enums.AiInsightCategory;
        status: import("../../generated/prisma").$Enums.AiInsightStatus;
        observation: string;
        sourceFigure: string;
    }>;
}
