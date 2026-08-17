import { ShiftsService } from './shifts.service';
import { CreateShiftDto, RequestShiftSwapDto, UpdateShiftDto } from './dto/create-shift.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class ShiftsController {
    private readonly shifts;
    constructor(shifts: ShiftsService);
    create(user: AuthenticatedUser, dto: CreateShiftDto): import("generated/prisma/runtime/library").DynamicModelExtensionFluentApi<import("generated/prisma").Prisma.TypeMap<import("generated/prisma/runtime/library").InternalArgs & {
        result: {};
        model: {};
        query: {};
        client: {};
    }, {}>, "StaffShift", "create", never> & import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("generated/prisma").$Enums.StaffShiftStatus;
        staffUserId: string;
        note: string | null;
        startsAt: Date;
        endsAt: Date;
        swapStatus: import("generated/prisma").$Enums.ShiftSwapStatus | null;
        swapRequestedByUserId: string | null;
        swapCoveringUserId: string | null;
        swapReason: string | null;
        swapReviewedByUserId: string | null;
    }>;
    list(staffUserId?: string, from?: string, to?: string): import("generated/prisma/runtime/library").PrismaPromise<({
        staffUser: {
            user: {
                name: string;
                email: string | null;
                phone: string | null;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                passwordHash: string;
                failedLoginAttempts: number;
                lockedUntil: Date | null;
                twoFactorEnabled: boolean;
            };
        } & {
            id: string;
            businessId: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            role: import("generated/prisma").$Enums.Role;
            commissionRule: import("generated/prisma/runtime/library").JsonValue;
            customRoleId: string | null;
        };
    } & {
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("generated/prisma").$Enums.StaffShiftStatus;
        staffUserId: string;
        note: string | null;
        startsAt: Date;
        endsAt: Date;
        swapStatus: import("generated/prisma").$Enums.ShiftSwapStatus | null;
        swapRequestedByUserId: string | null;
        swapCoveringUserId: string | null;
        swapReason: string | null;
        swapReviewedByUserId: string | null;
    })[]>;
    findOne(id: string): Promise<{
        staffUser: {
            user: {
                name: string;
                email: string | null;
                phone: string | null;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                passwordHash: string;
                failedLoginAttempts: number;
                lockedUntil: Date | null;
                twoFactorEnabled: boolean;
            };
        } & {
            id: string;
            businessId: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            role: import("generated/prisma").$Enums.Role;
            commissionRule: import("generated/prisma/runtime/library").JsonValue;
            customRoleId: string | null;
        };
    } & {
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("generated/prisma").$Enums.StaffShiftStatus;
        staffUserId: string;
        note: string | null;
        startsAt: Date;
        endsAt: Date;
        swapStatus: import("generated/prisma").$Enums.ShiftSwapStatus | null;
        swapRequestedByUserId: string | null;
        swapCoveringUserId: string | null;
        swapReason: string | null;
        swapReviewedByUserId: string | null;
    }>;
    update(id: string, dto: UpdateShiftDto): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("generated/prisma").$Enums.StaffShiftStatus;
        staffUserId: string;
        note: string | null;
        startsAt: Date;
        endsAt: Date;
        swapStatus: import("generated/prisma").$Enums.ShiftSwapStatus | null;
        swapRequestedByUserId: string | null;
        swapCoveringUserId: string | null;
        swapReason: string | null;
        swapReviewedByUserId: string | null;
    }>;
    remove(id: string): Promise<void>;
    requestSwap(user: AuthenticatedUser, id: string, dto: RequestShiftSwapDto): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("generated/prisma").$Enums.StaffShiftStatus;
        staffUserId: string;
        note: string | null;
        startsAt: Date;
        endsAt: Date;
        swapStatus: import("generated/prisma").$Enums.ShiftSwapStatus | null;
        swapRequestedByUserId: string | null;
        swapCoveringUserId: string | null;
        swapReason: string | null;
        swapReviewedByUserId: string | null;
    }>;
    approveSwap(user: AuthenticatedUser, id: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("generated/prisma").$Enums.StaffShiftStatus;
        staffUserId: string;
        note: string | null;
        startsAt: Date;
        endsAt: Date;
        swapStatus: import("generated/prisma").$Enums.ShiftSwapStatus | null;
        swapRequestedByUserId: string | null;
        swapCoveringUserId: string | null;
        swapReason: string | null;
        swapReviewedByUserId: string | null;
    }>;
    rejectSwap(id: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("generated/prisma").$Enums.StaffShiftStatus;
        staffUserId: string;
        note: string | null;
        startsAt: Date;
        endsAt: Date;
        swapStatus: import("generated/prisma").$Enums.ShiftSwapStatus | null;
        swapRequestedByUserId: string | null;
        swapCoveringUserId: string | null;
        swapReason: string | null;
        swapReviewedByUserId: string | null;
    }>;
}
