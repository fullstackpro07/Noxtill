import { RollupService } from './rollup.service';
import { BranchAdvisorService } from './branch-advisor.service';
import { BranchManagementService } from './branch-management.service';
import { BranchAdvisorDto } from './dto/branch-advisor.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class BranchesController {
    private readonly rollupService;
    private readonly branchAdvisorService;
    private readonly branchManagementService;
    constructor(rollupService: RollupService, branchAdvisorService: BranchAdvisorService, branchManagementService: BranchManagementService);
    createBranch(user: AuthenticatedUser, dto: CreateBranchDto): Promise<{
        business: {
            name: string;
            country: string | null;
            currency: string;
            locale: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            planId: string | null;
            stripeSubscriptionId: string | null;
            msgQuota: number;
            slug: string;
            typeId: string | null;
            timezone: string;
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
            healthScoreWeights: import("generated/prisma/runtime/library").JsonValue;
            aiMonthlyCostCapUsd: import("generated/prisma/runtime/library").Decimal;
            aiRateLimitPerMinute: number;
            overtimeThresholdHoursPerWeek: number;
            parentId: string | null;
            trialEndsAt: Date | null;
            stripeCustomerId: string | null;
            msgQuotaResetAt: Date | null;
        };
        businessUser: {
            user: {
                name: string;
                email: string | null;
                phone: string | null;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                passwordHash: string;
                failedLoginAttempts: number;
                lockedUntil: Date | null;
                twoFactorEnabled: boolean;
            };
        } & {
            id: string;
            businessId: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            role: import("generated/prisma").$Enums.Role;
            commissionRule: import("generated/prisma/runtime/library").JsonValue;
            customRoleId: string | null;
        };
        tempPassword: string | undefined;
    }>;
    listBranches(user: AuthenticatedUser): Promise<{
        name: string;
        country: string | null;
        currency: string;
        locale: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        planId: string | null;
        stripeSubscriptionId: string | null;
        msgQuota: number;
        slug: string;
        typeId: string | null;
        timezone: string;
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
        healthScoreWeights: import("generated/prisma/runtime/library").JsonValue;
        aiMonthlyCostCapUsd: import("generated/prisma/runtime/library").Decimal;
        aiRateLimitPerMinute: number;
        overtimeThresholdHoursPerWeek: number;
        parentId: string | null;
        trialEndsAt: Date | null;
        stripeCustomerId: string | null;
        msgQuotaResetAt: Date | null;
    }[]>;
    dashboard(user: AuthenticatedUser, days?: string): Promise<{
        totals: {
            ordersCount: number;
            revenue: number;
            grossProfit: number;
        };
        branches: {
            businessId: string;
            name: string;
            ordersCount: number;
            revenue: number;
            grossProfit: number;
            reviewAvg: number | null;
        }[];
    }>;
    compare(user: AuthenticatedUser, weeks?: string): Promise<{
        businessId: string;
        name: string;
        weeks: {
            weekStart: string;
            ordersCount: number;
            revenue: number;
            grossProfit: number;
        }[];
    }[]>;
    branchAdvisor(user: AuthenticatedUser, dto: BranchAdvisorDto): Promise<{
        answer: string;
        disclaimer: string;
    }>;
}
