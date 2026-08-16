import { InstallmentsService } from './installments.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class InstallmentsController {
    private readonly installmentsService;
    constructor(installmentsService: InstallmentsService);
    list(due?: 'today'): import("generated/prisma/runtime/library").PrismaPromise<({
        plan: {
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
            status: import("generated/prisma").$Enums.InstallmentPlanStatus;
            note: string | null;
            totalAmount: import("generated/prisma/runtime/library").Decimal;
        };
    } & {
        id: string;
        businessId: string;
        planId: string;
        status: import("generated/prisma").$Enums.InstallmentStatus;
        amount: import("generated/prisma/runtime/library").Decimal;
        seq: number;
        dueDate: Date;
        paidAt: Date | null;
        creditEntryId: string | null;
    })[]>;
    pay(user: AuthenticatedUser, id: string): Promise<{
        entry: {
            id: string;
            businessId: string;
            createdAt: Date;
            kind: import("generated/prisma").$Enums.CreditEntryKind;
            customerId: string;
            amount: import("generated/prisma/runtime/library").Decimal;
            method: import("generated/prisma").$Enums.PaymentMethod | null;
            note: string | null;
            orderId: string | null;
        };
        installment: {
            creditEntryId: string;
            id: string;
            businessId: string;
            planId: string;
            status: import("generated/prisma").$Enums.InstallmentStatus;
            amount: import("generated/prisma/runtime/library").Decimal;
            seq: number;
            dueDate: Date;
            paidAt: Date | null;
        };
    }>;
}
