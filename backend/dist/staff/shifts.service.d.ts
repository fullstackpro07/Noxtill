import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CreateShiftDto, RequestShiftSwapDto, UpdateShiftDto } from './dto/create-shift.dto';
import { Prisma } from '../../generated/prisma';
export declare class ShiftsService {
    private readonly tenantPrisma;
    private readonly cls;
    constructor(tenantPrisma: TenantPrismaService, cls: ClsService);
    create(businessId: string, dto: CreateShiftDto): import("generated/prisma/runtime/library").DynamicModelExtensionFluentApi<Prisma.TypeMap<import("generated/prisma/runtime/library").InternalArgs & {
        result: {};
        model: {};
        query: {};
        client: {};
    }, {}>, "StaffShift", "create", never> & import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("../../generated/prisma").$Enums.StaffShiftStatus;
        staffUserId: string;
        note: string | null;
        startsAt: Date;
        endsAt: Date;
        swapStatus: import("../../generated/prisma").$Enums.ShiftSwapStatus | null;
        swapRequestedByUserId: string | null;
        swapCoveringUserId: string | null;
        swapReason: string | null;
        swapReviewedByUserId: string | null;
    }>;
    list(staffUserId?: string, from?: string, to?: string): import("generated/prisma/runtime/library").PrismaPromise<({
        staffUser: {
            user: {
                id: string;
                name: string;
                createdAt: Date;
                updatedAt: Date;
                email: string | null;
                phone: string | null;
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
            role: import("../../generated/prisma").$Enums.Role;
            commissionRule: Prisma.JsonValue;
            customRoleId: string | null;
        };
    } & {
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("../../generated/prisma").$Enums.StaffShiftStatus;
        staffUserId: string;
        note: string | null;
        startsAt: Date;
        endsAt: Date;
        swapStatus: import("../../generated/prisma").$Enums.ShiftSwapStatus | null;
        swapRequestedByUserId: string | null;
        swapCoveringUserId: string | null;
        swapReason: string | null;
        swapReviewedByUserId: string | null;
    })[]>;
    findOne(id: string): Promise<{
        staffUser: {
            user: {
                id: string;
                name: string;
                createdAt: Date;
                updatedAt: Date;
                email: string | null;
                phone: string | null;
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
            role: import("../../generated/prisma").$Enums.Role;
            commissionRule: Prisma.JsonValue;
            customRoleId: string | null;
        };
    } & {
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("../../generated/prisma").$Enums.StaffShiftStatus;
        staffUserId: string;
        note: string | null;
        startsAt: Date;
        endsAt: Date;
        swapStatus: import("../../generated/prisma").$Enums.ShiftSwapStatus | null;
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
        status: import("../../generated/prisma").$Enums.StaffShiftStatus;
        staffUserId: string;
        note: string | null;
        startsAt: Date;
        endsAt: Date;
        swapStatus: import("../../generated/prisma").$Enums.ShiftSwapStatus | null;
        swapRequestedByUserId: string | null;
        swapCoveringUserId: string | null;
        swapReason: string | null;
        swapReviewedByUserId: string | null;
    }>;
    remove(id: string): Promise<void>;
    requestSwap(businessId: string, id: string, dto: RequestShiftSwapDto): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("../../generated/prisma").$Enums.StaffShiftStatus;
        staffUserId: string;
        note: string | null;
        startsAt: Date;
        endsAt: Date;
        swapStatus: import("../../generated/prisma").$Enums.ShiftSwapStatus | null;
        swapRequestedByUserId: string | null;
        swapCoveringUserId: string | null;
        swapReason: string | null;
        swapReviewedByUserId: string | null;
    }>;
    approveSwap(businessId: string, id: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("../../generated/prisma").$Enums.StaffShiftStatus;
        staffUserId: string;
        note: string | null;
        startsAt: Date;
        endsAt: Date;
        swapStatus: import("../../generated/prisma").$Enums.ShiftSwapStatus | null;
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
        status: import("../../generated/prisma").$Enums.StaffShiftStatus;
        staffUserId: string;
        note: string | null;
        startsAt: Date;
        endsAt: Date;
        swapStatus: import("../../generated/prisma").$Enums.ShiftSwapStatus | null;
        swapRequestedByUserId: string | null;
        swapCoveringUserId: string | null;
        swapReason: string | null;
        swapReviewedByUserId: string | null;
    }>;
    private findPendingSwap;
}
