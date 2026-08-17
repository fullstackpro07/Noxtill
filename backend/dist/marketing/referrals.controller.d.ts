import { ReferralsService } from './referrals.service';
import { UpdateReferralSettingsDto } from './dto/update-referral-settings.dto';
import { RedeemReferralDto } from './dto/redeem-referral.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class ReferralsController {
    private readonly referralsService;
    constructor(referralsService: ReferralsService);
    updateSettings(user: AuthenticatedUser, dto: UpdateReferralSettingsDto): Promise<UpdateReferralSettingsDto>;
    getSettings(user: AuthenticatedUser): Promise<import("generated/prisma/runtime/library").JsonValue>;
    redeem(user: AuthenticatedUser, dto: RedeemReferralDto): Promise<{
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
    }>;
    stats(): Promise<{
        totalReferred: number;
        converted: number;
        rewardsIssued: number;
        leaderboard: {
            customerId: string;
            name: string;
            count: number;
        }[];
    }>;
}
