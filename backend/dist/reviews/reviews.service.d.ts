import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { QueryReviewsDto } from './dto/query-reviews.dto';
import { UpdateFeedbackDto } from './dto/update-feedback.dto';
export declare class ReviewsService {
    private readonly tenantPrisma;
    private readonly aiInfra;
    private readonly cls;
    constructor(tenantPrisma: TenantPrismaService, aiInfra: AiInfraService, cls: ClsService);
    list(query: QueryReviewsDto): Promise<({
        source: "external";
        id: string;
        createdAt: Date;
        businessId: string;
        stars: number;
        platform: string;
        externalId: string;
        author: string | null;
        text: string | null;
        replyText: string | null;
        repliedAt: Date | null;
    } | {
        source: "private";
        message: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        customerId: string | null;
        status: import("../../generated/prisma").$Enums.FeedbackStatus;
        stars: number;
        reviewRequestId: string | null;
        assignedTo: string | null;
        resolutionNote: string | null;
    })[]>;
    updateFeedback(id: string, dto: UpdateFeedbackDto): Promise<{
        message: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        customerId: string | null;
        status: import("../../generated/prisma").$Enums.FeedbackStatus;
        stars: number;
        reviewRequestId: string | null;
        assignedTo: string | null;
        resolutionNote: string | null;
    }>;
    reply(id: string, replyText: string): Promise<{
        id: string;
        createdAt: Date;
        businessId: string;
        stars: number;
        platform: string;
        externalId: string;
        author: string | null;
        text: string | null;
        replyText: string | null;
        repliedAt: Date | null;
    }>;
    aiDraft(id: string): Promise<{
        draft: string;
    }>;
}
