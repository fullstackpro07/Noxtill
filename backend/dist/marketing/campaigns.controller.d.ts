import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class CampaignsController {
    private readonly campaignsService;
    constructor(campaignsService: CampaignsService);
    create(user: AuthenticatedUser, dto: CreateCampaignDto): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        templateKey: string;
        scheduledFor: Date | null;
        segment: string;
        body: string;
        sentCount: number;
    }>;
    list(): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        templateKey: string;
        scheduledFor: Date | null;
        segment: string;
        body: string;
        sentCount: number;
    }[]>;
    report(id: string): Promise<{
        campaignId: string;
        segment: string;
        sent: number;
        delivered: number;
        read: number;
        failed: number;
    }>;
}
