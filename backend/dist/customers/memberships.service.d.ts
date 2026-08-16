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
        name: string;
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        active: boolean;
        price: Prisma.Decimal;
        interval: import("../../generated/prisma").$Enums.BillingInterval;
        benefits: string | null;
        stripePriceId: string | null;
    }>;
    listPlans(): import("generated/prisma/runtime/library").PrismaPromise<{
        name: string;
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        active: boolean;
        price: Prisma.Decimal;
        interval: import("../../generated/prisma").$Enums.BillingInterval;
        benefits: string | null;
        stripePriceId: string | null;
    }[]>;
    create(businessId: string, dto: CreateMembershipDto): Promise<{
        membership: {
            id: string;
            businessId: string;
            createdAt: Date;
            updatedAt: Date;
            stripeSubscriptionId: string | null;
            planId: string;
            customerId: string;
            status: import("../../generated/prisma").$Enums.MembershipStatus;
            method: import("../../generated/prisma").$Enums.PaymentMethod;
            currentPeriodEnd: Date | null;
        };
        checkoutUrl: string | null;
    }>;
    listMemberships(customerId?: string): import("generated/prisma/runtime/library").PrismaPromise<({
        plan: {
            name: string;
            id: string;
            businessId: string;
            createdAt: Date;
            updatedAt: Date;
            active: boolean;
            price: Prisma.Decimal;
            interval: import("../../generated/prisma").$Enums.BillingInterval;
            benefits: string | null;
            stripePriceId: string | null;
        };
        customer: {
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
        };
    } & {
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        stripeSubscriptionId: string | null;
        planId: string;
        customerId: string;
        status: import("../../generated/prisma").$Enums.MembershipStatus;
        method: import("../../generated/prisma").$Enums.PaymentMethod;
        currentPeriodEnd: Date | null;
    })[]>;
    activate(id: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        stripeSubscriptionId: string | null;
        planId: string;
        customerId: string;
        status: import("../../generated/prisma").$Enums.MembershipStatus;
        method: import("../../generated/prisma").$Enums.PaymentMethod;
        currentPeriodEnd: Date | null;
    }>;
    cancel(id: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        stripeSubscriptionId: string | null;
        planId: string;
        customerId: string;
        status: import("../../generated/prisma").$Enums.MembershipStatus;
        method: import("../../generated/prisma").$Enums.PaymentMethod;
        currentPeriodEnd: Date | null;
    }>;
    private findPlan;
    private findMembership;
}
