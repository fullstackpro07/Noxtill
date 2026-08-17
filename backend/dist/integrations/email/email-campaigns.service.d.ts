import { ConfigService } from '@nestjs/config';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { SegmentsService } from '../../customers/segments.service';
import { CreateEmailCampaignDto } from './dto/create-email-campaign.dto';
export declare class EmailCampaignsService {
    private readonly tenantPrisma;
    private readonly segments;
    private readonly config;
    private readonly logger;
    constructor(tenantPrisma: TenantPrismaService, segments: SegmentsService, config: ConfigService);
    create(businessId: string, dto: CreateEmailCampaignDto): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        scheduledFor: Date | null;
        segment: string;
        body: string;
        sentCount: number;
        subject: string;
    }>;
    list(businessId: string): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        scheduledFor: Date | null;
        segment: string;
        body: string;
        sentCount: number;
        subject: string;
    }[]>;
    funnel(businessId: string, campaignId: string): Promise<{
        campaignId: string;
        sent: number;
        delivered: number;
        opened: number;
        clicked: number;
        unsubscribed: number;
    }>;
    listHealth(businessId: string): Promise<{
        subscribed: number;
        unsubscribed: number;
        bounced: number;
    }>;
    unsubscribe(token: string): Promise<{
        ok: boolean;
    }>;
    private isSuppressed;
    private sendOne;
    private unsubscribeSecret;
}
