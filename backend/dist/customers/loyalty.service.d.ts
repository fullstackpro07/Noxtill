import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CreateLoyaltyProgramDto } from './dto/create-loyalty-program.dto';
import { EnrollLoyaltyMemberDto } from './dto/enroll-loyalty-member.dto';
import { Prisma } from '../../generated/prisma';
interface LoyaltyTxClient {
    loyaltyProgram: {
        findFirst(args: {
            where: Record<string, unknown>;
        }): Promise<{
            id: string;
        } | null>;
    };
    loyaltyMember: {
        upsert(args: {
            where: Record<string, unknown>;
            create: Record<string, unknown>;
            update: Record<string, unknown>;
        }): Promise<{
            id: string;
        }>;
    };
    stamp: {
        create(args: {
            data: Record<string, unknown>;
        }): Promise<unknown>;
    };
}
export declare class LoyaltyService {
    private readonly tenantPrisma;
    constructor(tenantPrisma: TenantPrismaService);
    createProgram(dto: CreateLoyaltyProgramDto): import("generated/prisma/runtime/library").DynamicModelExtensionFluentApi<Prisma.TypeMap<import("generated/prisma/runtime/library").InternalArgs & {
        result: {};
        model: {};
        query: {};
        client: {};
    }, {}>, "LoyaltyProgram", "create", never> & import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        businessId: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        type: import("../../generated/prisma").$Enums.LoyaltyProgramType;
        stampsRequired: number;
        rewardDescription: string | null;
        tiers: Prisma.JsonValue;
        active: boolean;
    }>;
    listPrograms(): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        businessId: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        type: import("../../generated/prisma").$Enums.LoyaltyProgramType;
        stampsRequired: number;
        rewardDescription: string | null;
        tiers: Prisma.JsonValue;
        active: boolean;
    }[]>;
    enroll(programId: string, dto: EnrollLoyaltyMemberDto): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        programId: string;
        customerId: string;
        stampCount: number;
        redeemedCount: number;
    }>;
    listMembers(programId: string): Promise<({
        customer: {
            id: string;
            businessId: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            email: string | null;
            phone: string;
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
        };
    } & {
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        programId: string;
        customerId: string;
        stampCount: number;
        redeemedCount: number;
    })[]>;
    redeem(memberId: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        programId: string;
        customerId: string;
        stampCount: number;
        redeemedCount: number;
    }>;
    issueStampIfEligible(businessId: string, customerId: string, orderId: string, tx: LoyaltyTxClient): Promise<void>;
    private computeTier;
    private findProgram;
}
export {};
