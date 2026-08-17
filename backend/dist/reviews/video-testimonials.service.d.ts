import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { SendGateService } from '../messaging/send-gate.service';
import { ActivityService } from '../activity/activity.service';
import { S3Service } from '../common/storage/s3.service';
import { RequestVideoTestimonialDto } from './dto/request-video-testimonial.dto';
import { RejectVideoTestimonialDto } from './dto/reject-video-testimonial.dto';
import { VideoTestimonialStatus } from '../../generated/prisma';
export declare class VideoTestimonialsService {
    private readonly tenantPrisma;
    private readonly sendGate;
    private readonly activity;
    private readonly s3;
    constructor(tenantPrisma: TenantPrismaService, sendGate: SendGateService, activity: ActivityService, s3: S3Service);
    request(businessId: string, dto: RequestVideoTestimonialDto): Promise<{
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
    approve(id: string, actorUserId?: string): Promise<{
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
    reject(id: string, dto: RejectVideoTestimonialDto, actorUserId?: string): Promise<{
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
    private withVideoUrl;
    private findRow;
}
