import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { ActivityService } from '../activity/activity.service';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { CreateInstallmentPlanDto } from './dto/create-installment-plan.dto';
import { WriteOffCreditDto } from './dto/write-off-credit.dto';
export declare class CreditService {
    private readonly tenantPrisma;
    private readonly cls;
    private readonly auditService;
    private readonly activity;
    constructor(tenantPrisma: TenantPrismaService, cls: ClsService, auditService: AuditService, activity: ActivityService);
    listDebtors(): Promise<{
        customerId: string;
        name: string;
        phone: string;
        balance: number;
        lastEntryAt: Date;
        daysOutstanding: number;
        optedOutOfReminders: boolean;
    }[]>;
    getLedger(customerId: string): Promise<{
        customerId: string;
        name: string;
        phone: string;
        balance: number;
        entries: import("./credit.types").LedgerRow[];
    }>;
    getBalance(customerId: string): Promise<number>;
    recordPayment(dto: RecordPaymentDto): Promise<{
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
        balanceBefore: number;
        balanceAfter: number;
    }>;
    createInstallmentPlan(customerId: string, dto: CreateInstallmentPlanDto): Promise<{
        installments: {
            id: string;
            businessId: string;
            status: import("generated/prisma").$Enums.InstallmentStatus;
            amount: import("generated/prisma/runtime/library").Decimal;
            planId: string;
            seq: number;
            dueDate: Date;
            paidAt: Date | null;
            creditEntryId: string | null;
        }[];
    } & {
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        customerId: string;
        status: import("generated/prisma").$Enums.InstallmentPlanStatus;
        note: string | null;
        totalAmount: import("generated/prisma/runtime/library").Decimal;
    }>;
    listInstallmentPlans(customerId: string): import("generated/prisma/runtime/library").PrismaPromise<({
        installments: {
            id: string;
            businessId: string;
            status: import("generated/prisma").$Enums.InstallmentStatus;
            amount: import("generated/prisma/runtime/library").Decimal;
            planId: string;
            seq: number;
            dueDate: Date;
            paidAt: Date | null;
            creditEntryId: string | null;
        }[];
    } & {
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        customerId: string;
        status: import("generated/prisma").$Enums.InstallmentPlanStatus;
        note: string | null;
        totalAmount: import("generated/prisma/runtime/library").Decimal;
    })[]>;
    writeOff(customerId: string, dto: WriteOffCreditDto): Promise<{
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
        balanceBefore: number;
        balanceAfter: number;
    }>;
    createShareLink(customerId: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        customerId: string;
        token: string;
        revoked: boolean;
    }>;
    listShareLinks(customerId: string): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        businessId: string;
        createdAt: Date;
        customerId: string;
        token: string;
        revoked: boolean;
    }[]>;
    revokeShareLink(id: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        customerId: string;
        token: string;
        revoked: boolean;
    }>;
}
