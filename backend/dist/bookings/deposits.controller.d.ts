import { DepositsService } from './deposits.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class DepositsController {
    private readonly depositsService;
    constructor(depositsService: DepositsService);
    create(user: AuthenticatedUser, dto: CreateDepositDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        status: import("generated/prisma").$Enums.DepositStatus;
        providerRef: string | null;
        amount: import("generated/prisma/runtime/library").Decimal;
        method: import("generated/prisma").$Enums.PaymentMethod;
        appointmentId: string;
    }>;
    list(appointmentId?: string): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        status: import("generated/prisma").$Enums.DepositStatus;
        providerRef: string | null;
        amount: import("generated/prisma/runtime/library").Decimal;
        method: import("generated/prisma").$Enums.PaymentMethod;
        appointmentId: string;
    }[]>;
    capture(user: AuthenticatedUser, id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        status: import("generated/prisma").$Enums.DepositStatus;
        providerRef: string | null;
        amount: import("generated/prisma/runtime/library").Decimal;
        method: import("generated/prisma").$Enums.PaymentMethod;
        appointmentId: string;
    }>;
    refund(user: AuthenticatedUser, id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        status: import("generated/prisma").$Enums.DepositStatus;
        providerRef: string | null;
        amount: import("generated/prisma/runtime/library").Decimal;
        method: import("generated/prisma").$Enums.PaymentMethod;
        appointmentId: string;
    }>;
}
