import { VouchersService } from './vouchers.service';
import { IssueVoucherDto } from './dto/issue-voucher.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class VouchersController {
    private readonly vouchers;
    constructor(vouchers: VouchersService);
    issue(user: AuthenticatedUser, dto: IssueVoucherDto): Promise<{
        code: string;
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        customerId: string | null;
        status: import("generated/prisma").$Enums.VoucherStatus;
        expiresAt: Date | null;
        initialValue: import("generated/prisma/runtime/library").Decimal;
        balance: import("generated/prisma/runtime/library").Decimal;
    }>;
    list(): import("generated/prisma/runtime/library").PrismaPromise<{
        code: string;
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        customerId: string | null;
        status: import("generated/prisma").$Enums.VoucherStatus;
        expiresAt: Date | null;
        initialValue: import("generated/prisma/runtime/library").Decimal;
        balance: import("generated/prisma/runtime/library").Decimal;
    }[]>;
    findOne(id: string): Promise<{
        code: string;
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        customerId: string | null;
        status: import("generated/prisma").$Enums.VoucherStatus;
        expiresAt: Date | null;
        initialValue: import("generated/prisma/runtime/library").Decimal;
        balance: import("generated/prisma/runtime/library").Decimal;
    }>;
    cancel(id: string): Promise<{
        code: string;
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        customerId: string | null;
        status: import("generated/prisma").$Enums.VoucherStatus;
        expiresAt: Date | null;
        initialValue: import("generated/prisma/runtime/library").Decimal;
        balance: import("generated/prisma/runtime/library").Decimal;
    }>;
}
