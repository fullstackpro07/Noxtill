import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { UpdateReferralSettingsDto } from './dto/update-referral-settings.dto';
import { RedeemReferralDto } from './dto/redeem-referral.dto';
import { Prisma } from '../../generated/prisma';
export declare class ReferralsService {
    private readonly tenantPrisma;
    constructor(tenantPrisma: TenantPrismaService);
    updateSettings(businessId: string, dto: UpdateReferralSettingsDto): Promise<UpdateReferralSettingsDto>;
    getSettings(businessId: string): Promise<Prisma.JsonValue>;
    redeem(businessId: string, dto: RedeemReferralDto): Promise<{
        name: string;
        email: string | null;
        phone: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
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
    }>;
    stats(): Promise<{
        totalReferred: number;
        leaderboard: {
            customerId: string;
            name: string;
            count: number;
        }[];
    }>;
}
