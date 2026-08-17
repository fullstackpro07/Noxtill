import { ReviewsService } from './reviews.service';
import { ReviewRequestsService } from './review-requests.service';
import { QrPosterService } from './qr-poster.service';
import { CreateReviewRequestDto } from './dto/create-review-request.dto';
import { QueryReviewsDto } from './dto/query-reviews.dto';
import { UpdateFeedbackDto } from './dto/update-feedback.dto';
import { ReplyFeedbackDto } from './dto/reply-feedback.dto';
import { GenerateQrPosterDto } from './dto/generate-qr-poster.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class ReviewsController {
    private readonly reviewsService;
    private readonly reviewRequests;
    private readonly qrPoster;
    constructor(reviewsService: ReviewsService, reviewRequests: ReviewRequestsService, qrPoster: QrPosterService);
    createRequest(user: AuthenticatedUser, dto: CreateReviewRequestDto): Promise<{
        message: string | null;
        id: string;
        createdAt: Date;
        businessId: string;
        token: string;
        customerId: string | null;
        source: string;
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
    summary(): Promise<{
        averageRating: number;
        distribution: {
            stars: number;
            count: number;
        }[];
        sparkline: number[];
        conversion: {
            requested: number;
            received: number;
        };
        latestReview: {
            id: string;
            platform: string;
            author: string | null;
            stars: number;
            text: string | null;
            createdAt: Date;
        } | null;
    }>;
    generateQrPoster(user: AuthenticatedUser, dto: GenerateQrPosterDto): Promise<{
        url: string;
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
    replyToFeedback(id: string, dto: ReplyFeedbackDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        locale: string;
        businessId: string;
        customerId: string | null;
        channel: import("generated/prisma").$Enums.MessageChannel;
        category: import("generated/prisma").$Enums.MessageCategory;
        templateKey: string;
        payload: import("generated/prisma/runtime/library").JsonValue;
        status: import("generated/prisma").$Enums.MessageStatus;
        providerRef: string | null;
        scheduledFor: Date | null;
        campaignId: string | null;
    }>;
}
