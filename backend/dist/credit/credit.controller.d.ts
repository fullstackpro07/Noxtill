import { CreditService } from './credit.service';
import { CreditReminderService } from './credit-reminder.service';
import { CreditStatementService } from './credit-statement.service';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { RemindDto } from './dto/remind.dto';
import { CreateInstallmentPlanDto } from './dto/create-installment-plan.dto';
import { WriteOffCreditDto } from './dto/write-off-credit.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class CreditController {
    private readonly creditService;
    private readonly reminderService;
    private readonly statementService;
    constructor(creditService: CreditService, reminderService: CreditReminderService, statementService: CreditStatementService);
    listDebtors(): Promise<{
        customerId: string;
        name: string;
        phone: string;
        balance: number;
        lastEntryAt: Date;
        daysOutstanding: number;
        optedOutOfReminders: boolean;
    }[]>;
    entries(customerId: string): Promise<{
        customerId: string;
        name: string;
        phone: string;
        balance: number;
        entries: import("./credit.types").LedgerRow[];
    }>;
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
    remind(user: AuthenticatedUser, dto: RemindDto): Promise<import("./credit-reminder.service").RemindResult>;
    statement(user: AuthenticatedUser, customerId: string): Promise<{
        url: string;
    }>;
    createInstallmentPlan(customerId: string, dto: CreateInstallmentPlanDto): Promise<{
        installments: {
            id: string;
            businessId: string;
            planId: string;
            status: import("generated/prisma").$Enums.InstallmentStatus;
            amount: import("generated/prisma/runtime/library").Decimal;
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
            planId: string;
            status: import("generated/prisma").$Enums.InstallmentStatus;
            amount: import("generated/prisma/runtime/library").Decimal;
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
}
