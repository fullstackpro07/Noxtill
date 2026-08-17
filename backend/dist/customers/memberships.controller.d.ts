import { MembershipsService } from './memberships.service';
import { CreateMembershipPlanDto } from './dto/create-membership-plan.dto';
import { CreateMembershipDto } from './dto/create-membership.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class MembershipsController {
    private readonly membershipsService;
    constructor(membershipsService: MembershipsService);
    createPlan(dto: CreateMembershipPlanDto): import("generated/prisma/runtime/library").DynamicModelExtensionFluentApi<import("generated/prisma").Prisma.TypeMap<import("generated/prisma/runtime/library").InternalArgs & {
        result: {};
        model: {};
        query: {};
        client: {};
    }, {}>, "MembershipPlan", "create", never> & import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        businessId: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        price: import("generated/prisma/runtime/library").Decimal;
        stripePriceId: string | null;
        active: boolean;
        interval: import("generated/prisma").$Enums.BillingInterval;
        benefits: string | null;
    }>;
    listPlans(): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        businessId: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        price: import("generated/prisma/runtime/library").Decimal;
        stripePriceId: string | null;
        active: boolean;
        interval: import("generated/prisma").$Enums.BillingInterval;
        benefits: string | null;
    }[]>;
    create(user: AuthenticatedUser, dto: CreateMembershipDto): Promise<{
        membership: {
            id: string;
            businessId: string;
            createdAt: Date;
            updatedAt: Date;
            planId: string;
            stripeSubscriptionId: string | null;
            customerId: string;
            status: import("generated/prisma").$Enums.MembershipStatus;
            method: import("generated/prisma").$Enums.PaymentMethod;
            currentPeriodEnd: Date | null;
        };
        checkoutUrl: string | null;
    }>;
    list(customerId?: string): import("generated/prisma/runtime/library").PrismaPromise<({
        plan: {
            id: string;
            businessId: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            price: import("generated/prisma/runtime/library").Decimal;
            stripePriceId: string | null;
            active: boolean;
            interval: import("generated/prisma").$Enums.BillingInterval;
            benefits: string | null;
        };
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
            lifetimeSpend: import("generated/prisma/runtime/library").Decimal;
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
        planId: string;
        stripeSubscriptionId: string | null;
        customerId: string;
        status: import("generated/prisma").$Enums.MembershipStatus;
        method: import("generated/prisma").$Enums.PaymentMethod;
        currentPeriodEnd: Date | null;
    })[]>;
    activate(id: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        planId: string;
        stripeSubscriptionId: string | null;
        customerId: string;
        status: import("generated/prisma").$Enums.MembershipStatus;
        method: import("generated/prisma").$Enums.PaymentMethod;
        currentPeriodEnd: Date | null;
    }>;
    cancel(id: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        planId: string;
        stripeSubscriptionId: string | null;
        customerId: string;
        status: import("generated/prisma").$Enums.MembershipStatus;
        method: import("generated/prisma").$Enums.PaymentMethod;
        currentPeriodEnd: Date | null;
    }>;
}
