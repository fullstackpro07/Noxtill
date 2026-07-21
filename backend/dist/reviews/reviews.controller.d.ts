import { ReviewsService } from './reviews.service';
import { ReviewRequestsService } from './review-requests.service';
import { CreateReviewRequestDto } from './dto/create-review-request.dto';
import { QueryReviewsDto } from './dto/query-reviews.dto';
import { UpdateFeedbackDto } from './dto/update-feedback.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class ReviewsController {
    private readonly reviewsService;
    private readonly reviewRequests;
    constructor(reviewsService: ReviewsService, reviewRequests: ReviewRequestsService);
    createRequest(user: AuthenticatedUser, dto: CreateReviewRequestDto): Promise<{
        message: string | null;
        id: string;
        createdAt: Date;
        businessId: string;
        customerId: string | null;
        source: string;
        token: string;
        sourceId: string | null;
        stars: number | null;
        routedTo: import("generated/prisma").$Enums.ReviewRoute | null;
        reminderCount: number;
        respondedAt: Date | null;
    }>;
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
        status: import("generated/prisma").$Enums.FeedbackStatus;
        stars: number;
        reviewRequestId: string | null;
        assignedTo: string | null;
        resolutionNote: string | null;
    })[]>;
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
    updateFeedback(id: string, dto: UpdateFeedbackDto): Promise<{
        message: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        customerId: string | null;
        status: import("generated/prisma").$Enums.FeedbackStatus;
        stars: number;
        reviewRequestId: string | null;
        assignedTo: string | null;
        resolutionNote: string | null;
    }>;
}
