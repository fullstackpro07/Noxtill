import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { OpenShiftDto } from './dto/open-shift.dto';
import { RecordCashMovementDto } from './dto/record-cash-movement.dto';
import { ReconcileShiftDto } from './dto/reconcile-shift.dto';
export declare class CashRegisterService {
    private readonly tenantPrisma;
    private readonly cls;
    constructor(tenantPrisma: TenantPrismaService, cls: ClsService);
    getCurrentShift(businessId: string): Promise<({
        movements: {
            id: string;
            businessId: string;
            createdAt: Date;
            type: import("../../generated/prisma").$Enums.CashMovementType;
            amount: import("generated/prisma/runtime/library").Decimal;
            note: string | null;
            shiftId: string;
            recordedByUserId: string | null;
        }[];
    } & {
        id: string;
        businessId: string;
        status: import("../../generated/prisma").$Enums.CashShiftStatus;
        openedByUserId: string | null;
        openingFloat: import("generated/prisma/runtime/library").Decimal;
        countedCash: import("generated/prisma/runtime/library").Decimal | null;
        variance: import("generated/prisma/runtime/library").Decimal | null;
        varianceNote: string | null;
        openedAt: Date;
        closedAt: Date | null;
    }) | null>;
    openShift(businessId: string, dto: OpenShiftDto): Promise<{
        movements: {
            id: string;
            businessId: string;
            createdAt: Date;
            type: import("../../generated/prisma").$Enums.CashMovementType;
            amount: import("generated/prisma/runtime/library").Decimal;
            note: string | null;
            shiftId: string;
            recordedByUserId: string | null;
        }[];
    } & {
        id: string;
        businessId: string;
        status: import("../../generated/prisma").$Enums.CashShiftStatus;
        openedByUserId: string | null;
        openingFloat: import("generated/prisma/runtime/library").Decimal;
        countedCash: import("generated/prisma/runtime/library").Decimal | null;
        variance: import("generated/prisma/runtime/library").Decimal | null;
        varianceNote: string | null;
        openedAt: Date;
        closedAt: Date | null;
    }>;
    closeShift(businessId: string): Promise<{
        id: string;
        businessId: string;
        status: import("../../generated/prisma").$Enums.CashShiftStatus;
        openedByUserId: string | null;
        openingFloat: import("generated/prisma/runtime/library").Decimal;
        countedCash: import("generated/prisma/runtime/library").Decimal | null;
        variance: import("generated/prisma/runtime/library").Decimal | null;
        varianceNote: string | null;
        openedAt: Date;
        closedAt: Date | null;
    }>;
    recordMovement(businessId: string, dto: RecordCashMovementDto): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        type: import("../../generated/prisma").$Enums.CashMovementType;
        amount: import("generated/prisma/runtime/library").Decimal;
        note: string | null;
        shiftId: string;
        recordedByUserId: string | null;
    }>;
    recordSaleMovement(businessId: string, amount: number, orderId: string): Promise<void>;
    recordRefundMovement(businessId: string, amount: number, note: string): Promise<void>;
    reconcile(businessId: string, dto: ReconcileShiftDto): Promise<{
        id: string;
        businessId: string;
        status: import("../../generated/prisma").$Enums.CashShiftStatus;
        openedByUserId: string | null;
        openingFloat: import("generated/prisma/runtime/library").Decimal;
        countedCash: import("generated/prisma/runtime/library").Decimal | null;
        variance: import("generated/prisma/runtime/library").Decimal | null;
        varianceNote: string | null;
        openedAt: Date;
        closedAt: Date | null;
    }>;
    expectedCash(businessId: string, shiftId: string): Promise<number>;
    private requireOpenShift;
}
