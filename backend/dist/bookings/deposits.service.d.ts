import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { Prisma } from '../../generated/prisma';
export declare class DepositsService {
    private readonly tenantPrisma;
    constructor(tenantPrisma: TenantPrismaService);
    create(businessId: string, dto: CreateDepositDto): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("../../generated/prisma").$Enums.DepositStatus;
        amount: Prisma.Decimal;
        method: import("../../generated/prisma").$Enums.PaymentMethod;
        providerRef: string | null;
        appointmentId: string;
    }>;
    list(appointmentId?: string): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("../../generated/prisma").$Enums.DepositStatus;
        amount: Prisma.Decimal;
        method: import("../../generated/prisma").$Enums.PaymentMethod;
        providerRef: string | null;
        appointmentId: string;
    }[]>;
    capture(businessId: string, id: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("../../generated/prisma").$Enums.DepositStatus;
        amount: Prisma.Decimal;
        method: import("../../generated/prisma").$Enums.PaymentMethod;
        providerRef: string | null;
        appointmentId: string;
    }>;
    refund(businessId: string, id: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("../../generated/prisma").$Enums.DepositStatus;
        amount: Prisma.Decimal;
        method: import("../../generated/prisma").$Enums.PaymentMethod;
        providerRef: string | null;
        appointmentId: string;
    }>;
    forfeitForAppointment(appointmentId: string): Promise<void>;
    private findWithStatus;
}
