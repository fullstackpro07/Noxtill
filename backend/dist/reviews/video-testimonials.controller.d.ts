import { VideoTestimonialsService } from './video-testimonials.service';
import { RequestVideoTestimonialDto } from './dto/request-video-testimonial.dto';
import { RejectVideoTestimonialDto } from './dto/reject-video-testimonial.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { VideoTestimonialStatus } from '../../generated/prisma';
export declare class VideoTestimonialsController {
    private readonly videoTestimonialsService;
    constructor(videoTestimonialsService: VideoTestimonialsService);
    request(user: AuthenticatedUser, dto: RequestVideoTestimonialDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        token: string;
        customerId: string | null;
        status: import("../../generated/prisma").$Enums.VideoTestimonialStatus;
        approvedByUserId: string | null;
        videoKey: string | null;
        caption: string | null;
    }>;
    list(status?: VideoTestimonialStatus): Promise<({
        customer: {
            id: string;
            email: string | null;
            phone: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            businessId: string;
            birthday: Date | null;
            address: string | null;
            notes: string | null;
            tags: string[];
            consentMarketing: boolean;
            optedOut: boolean;
            lifetimeSpend: import("generated/prisma/runtime/library").Decimal;
            visitCount: number;
            lastVisitAt: Date | null;
            referredByCustomerId: string | null;
            referralRewardedAt: Date | null;
        } | null;
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        token: string;
        customerId: string | null;
        status: import("../../generated/prisma").$Enums.VideoTestimonialStatus;
        approvedByUserId: string | null;
        videoKey: string | null;
        caption: string | null;
    } & {
        videoUrl: string | null;
    })[]>;
    findOne(id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        token: string;
        customerId: string | null;
        status: import("../../generated/prisma").$Enums.VideoTestimonialStatus;
        approvedByUserId: string | null;
        videoKey: string | null;
        caption: string | null;
    } & {
        videoUrl: string | null;
    }>;
    approve(user: AuthenticatedUser, id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        token: string;
        customerId: string | null;
        status: import("../../generated/prisma").$Enums.VideoTestimonialStatus;
        approvedByUserId: string | null;
        videoKey: string | null;
        caption: string | null;
    } & {
        videoUrl: string | null;
    }>;
    reject(user: AuthenticatedUser, id: string, dto: RejectVideoTestimonialDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        token: string;
        customerId: string | null;
        status: import("../../generated/prisma").$Enums.VideoTestimonialStatus;
        approvedByUserId: string | null;
        videoKey: string | null;
        caption: string | null;
    }>;
}
