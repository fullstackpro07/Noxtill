import { NightlyCloseService } from './nightly-close.service';
import { UpdateNightlyCloseDto } from './dto/update-nightly-close.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class NightlyCloseController {
    private readonly nightlyClose;
    constructor(nightlyClose: NightlyCloseService);
    getDay(user: AuthenticatedUser, date: string): Promise<import("./nightly-close.types").NightlyCloseData>;
    updateSettings(user: AuthenticatedUser, dto: UpdateNightlyCloseDto): Promise<{
        name: string;
        id: string;
        locale: string;
        createdAt: Date;
        updatedAt: Date;
        msgQuota: number;
        slug: string;
        typeId: string | null;
        planId: string | null;
        currency: string;
        timezone: string;
        country: string | null;
        channelPref: import("generated/prisma").$Enums.MessageChannel;
        nightlyCloseTime: string;
        taxLabel: string;
        taxRate: import("generated/prisma/runtime/library").Decimal;
        msgUsed: number;
        branding: import("generated/prisma/runtime/library").JsonValue;
        dashboardConfig: import("generated/prisma/runtime/library").JsonValue;
        publicReviewUrl: string | null;
        workingHours: import("generated/prisma/runtime/library").JsonValue;
        referralSettings: import("generated/prisma/runtime/library").JsonValue;
        aiMonthlyCostCapUsd: import("generated/prisma/runtime/library").Decimal;
        aiRateLimitPerMinute: number;
        parentId: string | null;
        trialEndsAt: Date | null;
        stripeCustomerId: string | null;
        stripeSubscriptionId: string | null;
    }>;
}
