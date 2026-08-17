import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { BillingService } from '../billing/billing.service';
import { CreateMembershipPlanDto } from './dto/create-membership-plan.dto';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { Prisma } from '../../generated/prisma';
export declare class MembershipsService {
    private readonly tenantPrisma;
    private readonly billing;
    constructor(tenantPrisma: TenantPrismaService, billing: BillingService);
    createPlan(dto: CreateMembershipPlanDto): import("generated/prisma/runtime/library").DynamicModelExtensionFluentApi<Prisma.TypeMap<import("generated/prisma/runtime/library").InternalArgs & {
        result: {};
        model: {};
        query: {};
        client: {};
    }, {}>, "MembershipPlan", "create", never> & import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        active: boolean;
        price: Prisma.Decimal;
        interval: import("../../generated/prisma").$Enums.BillingInterval;
        benefits: string | null;
        stripePriceId: string | null;
    }>;
    listPlans(): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        active: boolean;
        price: Prisma.Decimal;
        interval: import("../../generated/prisma").$Enums.BillingInterval;
        benefits: string | null;
        stripePriceId: string | null;
    }[]>;
    create(businessId: string, dto: CreateMembershipDto): Promise<{
        membership: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            stripeSubscriptionId: string | null;
            planId: string;
            businessId: string;
            customerId: string;
            status: import("../../generated/prisma").$Enums.MembershipStatus;
            method: import("../../generated/prisma").$Enums.PaymentMethod;
            currentPeriodEnd: Date | null;
        };
        checkoutUrl: string | null;
    }>;
    listMemberships(customerId?: string): import("generated/prisma/runtime/library").PrismaPromise<({
        plan: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            businessId: string;
            active: boolean;
            price: Prisma.Decimal;
            interval: import("../../generated/prisma").$Enums.BillingInterval;
            benefits: string | null;
            stripePriceId: string | null;
        };
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
            lifetimeSpend: Prisma.Decimal;
            visitCount: number;
            lastVisitAt: Date | null;
            referredByCustomerId: string | null;
            referralRewardedAt: Date | null;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        stripeSubscriptionId: string | null;
        planId: string;
        businessId: string;
        customerId: string;
        status: import("../../generated/prisma").$Enums.MembershipStatus;
        method: import("../../generated/prisma").$Enums.PaymentMethod;
        currentPeriodEnd: Date | null;
    })[]>;
    activate(id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        stripeSubscriptionId: string | null;
        planId: string;
        businessId: string;
        customerId: string;
        status: import("../../generated/prisma").$Enums.MembershipStatus;
        method: import("../../generated/prisma").$Enums.PaymentMethod;
        currentPeriodEnd: Date | null;
    }>;
    cancel(id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        stripeSubscriptionId: string | null;
        planId: string;
        businessId: string;
        customerId: string;
        status: import("../../generated/prisma").$Enums.MembershipStatus;
        method: import("../../generated/prisma").$Enums.PaymentMethod;
        currentPeriodEnd: Date | null;
    }>;
    private findPlan;
    private findMembership;
}
