import { DepositsService } from './deposits.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class DepositsController {
    private readonly depositsService;
    constructor(depositsService: DepositsService);
    create(user: AuthenticatedUser, dto: CreateDepositDto): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("generated/prisma").$Enums.DepositStatus;
        amount: import("generated/prisma/runtime/library").Decimal;
        method: import("generated/prisma").$Enums.PaymentMethod;
        providerRef: string | null;
        appointmentId: string;
    }>;
    list(appointmentId?: string): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("generated/prisma").$Enums.DepositStatus;
        amount: import("generated/prisma/runtime/library").Decimal;
        method: import("generated/prisma").$Enums.PaymentMethod;
        providerRef: string | null;
        appointmentId: string;
    }[]>;
    capture(user: AuthenticatedUser, id: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("generated/prisma").$Enums.DepositStatus;
        amount: import("generated/prisma/runtime/library").Decimal;
        method: import("generated/prisma").$Enums.PaymentMethod;
        providerRef: string | null;
        appointmentId: string;
    }>;
    refund(user: AuthenticatedUser, id: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("generated/prisma").$Enums.DepositStatus;
        amount: import("generated/prisma/runtime/library").Decimal;
        method: import("generated/prisma").$Enums.PaymentMethod;
        providerRef: string | null;
        appointmentId: string;
    }>;
}
