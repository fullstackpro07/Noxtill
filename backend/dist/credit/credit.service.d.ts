import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { RecordPaymentDto } from './dto/record-payment.dto';
export declare class CreditService {
    private readonly tenantPrisma;
    private readonly cls;
    private readonly auditService;
    constructor(tenantPrisma: TenantPrismaService, cls: ClsService, auditService: AuditService);
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
            createdAt: Date;
            businessId: string;
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
