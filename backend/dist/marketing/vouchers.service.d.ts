import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { SendGateService } from '../messaging/send-gate.service';
import { IssueVoucherDto } from './dto/issue-voucher.dto';
import { Prisma, VoucherStatus } from '../../generated/prisma';
interface VoucherRow {
    id: string;
    balance: Prisma.Decimal;
    status: VoucherStatus;
    expiresAt: Date | null;
}
export interface VoucherTxClient {
    voucher: {
        findUnique(args: {
            where: {
                businessId_code: {
                    businessId: string;
                    code: string;
                };
            };
        }): Promise<VoucherRow | null>;
        update(args: {
            where: {
                id: string;
            };
            data: Record<string, unknown>;
        }): Promise<unknown>;
    };
}
export declare class VouchersService {
    private readonly tenantPrisma;
    private readonly sendGate;
    constructor(tenantPrisma: TenantPrismaService, sendGate: SendGateService);
    issue(businessId: string, dto: IssueVoucherDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        customerId: string | null;
        status: import("../../generated/prisma").$Enums.VoucherStatus;
        expiresAt: Date | null;
        code: string;
        initialValue: Prisma.Decimal;
        balance: Prisma.Decimal;
    }>;
    list(): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        customerId: string | null;
        status: import("../../generated/prisma").$Enums.VoucherStatus;
        expiresAt: Date | null;
        code: string;
        initialValue: Prisma.Decimal;
        balance: Prisma.Decimal;
    }[]>;
    findOne(id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        customerId: string | null;
        status: import("../../generated/prisma").$Enums.VoucherStatus;
        expiresAt: Date | null;
        code: string;
        initialValue: Prisma.Decimal;
        balance: Prisma.Decimal;
    }>;
    cancel(id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        customerId: string | null;
        status: import("../../generated/prisma").$Enums.VoucherStatus;
        expiresAt: Date | null;
        code: string;
        initialValue: Prisma.Decimal;
        balance: Prisma.Decimal;
    }>;
    validateAndApply(businessId: string, code: string, requestedAmount: number, orderTotal: number, tx: VoucherTxClient): Promise<{
        voucherId: string;
        amountApplied: number;
    }>;
}
export {};
