import { SocialAnalyticsService } from './social-analytics.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class SocialAnalyticsController {
    private readonly analytics;
    constructor(analytics: SocialAnalyticsService);
    summary(user: AuthenticatedUser): Promise<{
        totalFollowers: number;
        totalReach: number;
        totalEngagement: number;
        byPlatform: {
            id: string;
            businessId: string;
            createdAt: Date;
            platform: import("generated/prisma").$Enums.SocialPlatform;
            date: Date;
            followers: number;
            reach: number;
            engagement: number;
            impressions: number;
        }[];
    }>;
    list(user: AuthenticatedUser, platform: string): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        businessId: string;
        createdAt: Date;
        platform: import("generated/prisma").$Enums.SocialPlatform;
        date: Date;
        followers: number;
        reach: number;
        engagement: number;
        impressions: number;
    }[]>;
}
