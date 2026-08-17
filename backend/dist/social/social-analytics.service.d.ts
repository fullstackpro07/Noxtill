import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { SocialAccountsService } from './social-accounts.service';
import { SocialConnectorRegistry } from './connectors/social-connector-registry';
import { SocialPlatform } from '../../generated/prisma';
export declare class SocialAnalyticsService {
    private readonly tenantPrisma;
    private readonly accounts;
    private readonly connectors;
    constructor(tenantPrisma: TenantPrismaService, accounts: SocialAccountsService, connectors: SocialConnectorRegistry);
    list(businessId: string, platform?: SocialPlatform): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        businessId: string;
        createdAt: Date;
        platform: import("../../generated/prisma").$Enums.SocialPlatform;
        date: Date;
        followers: number;
        reach: number;
        engagement: number;
        impressions: number;
    }[]>;
    summary(businessId: string): Promise<{
        totalFollowers: number;
        totalReach: number;
        totalEngagement: number;
        byPlatform: {
            id: string;
            businessId: string;
            createdAt: Date;
            platform: import("../../generated/prisma").$Enums.SocialPlatform;
            date: Date;
            followers: number;
            reach: number;
            engagement: number;
            impressions: number;
        }[];
    }>;
    pullForAccount(businessId: string, platform: SocialPlatform): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        platform: import("../../generated/prisma").$Enums.SocialPlatform;
        date: Date;
        followers: number;
        reach: number;
        engagement: number;
        impressions: number;
    }>;
}
