import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { SendGateService } from '../messaging/send-gate.service';
import { SegmentsService } from '../customers/segments.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
export declare class CampaignsService {
    private readonly tenantPrisma;
    private readonly sendGate;
    private readonly segments;
    constructor(tenantPrisma: TenantPrismaService, sendGate: SendGateService, segments: SegmentsService);
    create(businessId: string, dto: CreateCampaignDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        templateKey: string;
        scheduledFor: Date | null;
        segment: string;
        body: string;
        sentCount: number;
    }>;
    list(): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        templateKey: string;
        scheduledFor: Date | null;
        segment: string;
        body: string;
        sentCount: number;
    }[]>;
    report(campaignId: string): Promise<{
        campaignId: string;
        segment: string;
        sent: number;
        delivered: number;
        read: number;
        failed: number;
    }>;
}
