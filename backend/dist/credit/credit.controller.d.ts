import { CreditService } from './credit.service';
import { CreditReminderService } from './credit-reminder.service';
import { CreditStatementService } from './credit-statement.service';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { RemindDto } from './dto/remind.dto';
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
            customerId: string;
            createdAt: Date;
            kind: import("generated/prisma").$Enums.CreditEntryKind;
            orderId: string | null;
            method: import("generated/prisma").$Enums.PaymentMethod | null;
            amount: import("generated/prisma/runtime/library").Decimal;
            note: string | null;
        };
        balanceBefore: number;
        balanceAfter: number;
    }>;
    remind(user: AuthenticatedUser, dto: RemindDto): Promise<import("./credit-reminder.service").RemindResult>;
    statement(user: AuthenticatedUser, customerId: string): Promise<{
        url: string;
    }>;
}
