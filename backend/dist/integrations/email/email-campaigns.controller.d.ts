import { EmailCampaignsService } from './email-campaigns.service';
import { CreateEmailCampaignDto } from './dto/create-email-campaign.dto';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
export declare class EmailCampaignsController {
    private readonly emailCampaigns;
    constructor(emailCampaigns: EmailCampaignsService);
    create(user: AuthenticatedUser, dto: CreateEmailCampaignDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        body: string;
        scheduledFor: Date | null;
        segment: string;
        sentCount: number;
        subject: string;
    }>;
    list(user: AuthenticatedUser): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        body: string;
        scheduledFor: Date | null;
        segment: string;
        sentCount: number;
        subject: string;
    }[]>;
    funnel(user: AuthenticatedUser, id: string): Promise<{
        campaignId: string;
        sent: number;
        delivered: number;
        opened: number;
        clicked: number;
        unsubscribed: number;
    }>;
    listHealth(user: AuthenticatedUser): Promise<{
        subscribed: number;
        unsubscribed: number;
        bounced: number;
    }>;
    unsubscribe(token: string): Promise<{
        ok: boolean;
    }>;
}
