import { LoyaltyService } from './loyalty.service';
import { CreateLoyaltyProgramDto } from './dto/create-loyalty-program.dto';
import { EnrollLoyaltyMemberDto } from './dto/enroll-loyalty-member.dto';
export declare class LoyaltyController {
    private readonly loyaltyService;
    constructor(loyaltyService: LoyaltyService);
    create(dto: CreateLoyaltyProgramDto): import("generated/prisma/runtime/library").DynamicModelExtensionFluentApi<import("generated/prisma").Prisma.TypeMap<import("generated/prisma/runtime/library").InternalArgs & {
        result: {};
        model: {};
        query: {};
        client: {};
    }, {}>, "LoyaltyProgram", "create", never> & import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        type: import("generated/prisma").$Enums.LoyaltyProgramType;
        businessId: string;
        active: boolean;
        stampsRequired: number;
        rewardDescription: string | null;
        tiers: import("generated/prisma/runtime/library").JsonValue;
    }>;
    list(): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        type: import("generated/prisma").$Enums.LoyaltyProgramType;
        businessId: string;
        active: boolean;
        stampsRequired: number;
        rewardDescription: string | null;
        tiers: import("generated/prisma/runtime/library").JsonValue;
    }[]>;
    enroll(id: string, dto: EnrollLoyaltyMemberDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        customerId: string;
        programId: string;
        stampCount: number;
        redeemedCount: number;
    }>;
    listMembers(id: string): Promise<({
        customer: {
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
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        customerId: string;
        programId: string;
        stampCount: number;
        redeemedCount: number;
    })[]>;
    redeem(id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        customerId: string;
        programId: string;
        stampCount: number;
        redeemedCount: number;
    }>;
}
