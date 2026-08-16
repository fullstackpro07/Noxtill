import { CashRegisterService } from './cash-register.service';
import { OpenShiftDto } from './dto/open-shift.dto';
import { RecordCashMovementDto } from './dto/record-cash-movement.dto';
import { ReconcileShiftDto } from './dto/reconcile-shift.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class CashRegisterController {
    private readonly cashRegisterService;
    constructor(cashRegisterService: CashRegisterService);
    getCurrentShift(user: AuthenticatedUser): Promise<({
        movements: {
            id: string;
            businessId: string;
            createdAt: Date;
            type: import("generated/prisma").$Enums.CashMovementType;
            amount: import("generated/prisma/runtime/library").Decimal;
            note: string | null;
            shiftId: string;
            recordedByUserId: string | null;
        }[];
    } & {
        id: string;
        businessId: string;
        status: import("generated/prisma").$Enums.CashShiftStatus;
        openedByUserId: string | null;
        openingFloat: import("generated/prisma/runtime/library").Decimal;
        countedCash: import("generated/prisma/runtime/library").Decimal | null;
        variance: import("generated/prisma/runtime/library").Decimal | null;
        varianceNote: string | null;
        openedAt: Date;
        closedAt: Date | null;
    }) | null>;
    openShift(user: AuthenticatedUser, dto: OpenShiftDto): Promise<{
        movements: {
            id: string;
            businessId: string;
            createdAt: Date;
            type: import("generated/prisma").$Enums.CashMovementType;
            amount: import("generated/prisma/runtime/library").Decimal;
            note: string | null;
            shiftId: string;
            recordedByUserId: string | null;
        }[];
    } & {
        id: string;
        businessId: string;
        status: import("generated/prisma").$Enums.CashShiftStatus;
        openedByUserId: string | null;
        openingFloat: import("generated/prisma/runtime/library").Decimal;
        countedCash: import("generated/prisma/runtime/library").Decimal | null;
        variance: import("generated/prisma/runtime/library").Decimal | null;
        varianceNote: string | null;
        openedAt: Date;
        closedAt: Date | null;
    }>;
    closeShift(user: AuthenticatedUser): Promise<{
        id: string;
        businessId: string;
        status: import("generated/prisma").$Enums.CashShiftStatus;
        openedByUserId: string | null;
        openingFloat: import("generated/prisma/runtime/library").Decimal;
        countedCash: import("generated/prisma/runtime/library").Decimal | null;
        variance: import("generated/prisma/runtime/library").Decimal | null;
        varianceNote: string | null;
        openedAt: Date;
        closedAt: Date | null;
    }>;
    recordMovement(user: AuthenticatedUser, dto: RecordCashMovementDto): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        type: import("generated/prisma").$Enums.CashMovementType;
        amount: import("generated/prisma/runtime/library").Decimal;
        note: string | null;
        shiftId: string;
        recordedByUserId: string | null;
    }>;
    reconcile(user: AuthenticatedUser, dto: ReconcileShiftDto): Promise<{
        id: string;
        businessId: string;
        status: import("generated/prisma").$Enums.CashShiftStatus;
        openedByUserId: string | null;
        openingFloat: import("generated/prisma/runtime/library").Decimal;
        countedCash: import("generated/prisma/runtime/library").Decimal | null;
        variance: import("generated/prisma/runtime/library").Decimal | null;
        varianceNote: string | null;
        openedAt: Date;
        closedAt: Date | null;
    }>;
}
