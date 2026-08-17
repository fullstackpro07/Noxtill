import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { ActivityService } from '../activity/activity.service';
export declare class InstallmentsService {
    private readonly tenantPrisma;
    private readonly auditService;
    private readonly activity;
    constructor(tenantPrisma: TenantPrismaService, auditService: AuditService, activity: ActivityService);
    list(due?: 'today'): import("generated/prisma/runtime/library").PrismaPromise<({
        plan: {
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
            customerId: string;
            status: import("../../generated/prisma").$Enums.InstallmentPlanStatus;
            note: string | null;
            totalAmount: import("generated/prisma/runtime/library").Decimal;
        };
    } & {
        id: string;
        businessId: string;
        planId: string;
        status: import("../../generated/prisma").$Enums.InstallmentStatus;
        amount: import("generated/prisma/runtime/library").Decimal;
        seq: number;
        dueDate: Date;
        paidAt: Date | null;
        creditEntryId: string | null;
    })[]>;
    pay(businessId: string, id: string): Promise<{
        entry: {
            id: string;
            businessId: string;
            createdAt: Date;
            customerId: string;
            orderId: string | null;
            method: import("../../generated/prisma").$Enums.PaymentMethod | null;
            kind: import("../../generated/prisma").$Enums.CreditEntryKind;
            amount: import("generated/prisma/runtime/library").Decimal;
            note: string | null;
        };
        installment: {
            creditEntryId: string;
            id: string;
            businessId: string;
            planId: string;
            status: import("../../generated/prisma").$Enums.InstallmentStatus;
            amount: import("generated/prisma/runtime/library").Decimal;
            seq: number;
            dueDate: Date;
            paidAt: Date | null;
        };
    }>;
}
