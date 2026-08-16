import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { UpdateReferralSettingsDto } from './dto/update-referral-settings.dto';
import { RedeemReferralDto } from './dto/redeem-referral.dto';
import { Prisma } from '../../generated/prisma';
interface TxClient {
    customer: {
        findUnique(args: {
            where: {
                id: string;
            };
        }): Promise<{
            id: string;
            referredByCustomerId: string | null;
            referralRewardedAt: Date | null;
            visitCount: number;
        } | null>;
        update(args: {
            where: {
                id: string;
            };
            data: Record<string, unknown>;
        }): Promise<unknown>;
    };
    business: {
        findUniqueOrThrow(args: {
            where: {
                id: string;
            };
        }): Promise<{
            referralSettings: unknown;
        }>;
    };
    creditEntry: {
        create(args: {
            data: Record<string, unknown>;
        }): Promise<unknown>;
    };
}
export declare class ReferralsService {
    private readonly tenantPrisma;
    constructor(tenantPrisma: TenantPrismaService);
    issueRewardIfEligible(businessId: string, customerId: string, tx: TxClient): Promise<void>;
    updateSettings(businessId: string, dto: UpdateReferralSettingsDto): Promise<UpdateReferralSettingsDto>;
    getSettings(businessId: string): Promise<Prisma.JsonValue>;
    redeem(businessId: string, dto: RedeemReferralDto): Promise<{
        name: string;
        email: string | null;
        phone: string;
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        address: string | null;
        birthday: Date | null;
        notes: string | null;
        tags: string[];
        consentMarketing: boolean;
        optedOut: boolean;
        lifetimeSpend: Prisma.Decimal;
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
export {};
