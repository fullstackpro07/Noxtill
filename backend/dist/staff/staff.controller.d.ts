import { StaffService } from './staff.service';
import { AttendanceService } from './attendance.service';
import { CommissionsService } from './commissions.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { QueryCommissionsDto } from './dto/query-commissions.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class StaffController {
    private readonly staffService;
    private readonly attendanceService;
    private readonly commissionsService;
    constructor(staffService: StaffService, attendanceService: AttendanceService, commissionsService: CommissionsService);
    list(): import("generated/prisma/runtime/library").PrismaPromise<({
        user: {
            id: string;
            email: string | null;
            phone: string | null;
            passwordHash: string;
            name: string;
            failedLoginAttempts: number;
            lockedUntil: Date | null;
            refreshTokenHash: string | null;
            createdAt: Date;
            updatedAt: Date;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        role: import("../../generated/prisma").$Enums.Role;
        commissionRule: import("generated/prisma/runtime/library").JsonValue;
        businessId: string;
        userId: string;
    })[]>;
    inbox(): Promise<import("./staff.service").InboxTask[]>;
    create(user: AuthenticatedUser, dto: CreateStaffDto): Promise<{
        tempPassword: string | undefined;
        user: {
            id: string;
            email: string | null;
            phone: string | null;
            passwordHash: string;
            name: string;
            failedLoginAttempts: number;
            lockedUntil: Date | null;
            refreshTokenHash: string | null;
            createdAt: Date;
            updatedAt: Date;
        };
        id: string;
        createdAt: Date;
        updatedAt: Date;
        role: import("../../generated/prisma").$Enums.Role;
        commissionRule: import("generated/prisma/runtime/library").JsonValue;
        businessId: string;
        userId: string;
    }>;
    update(id: string, dto: UpdateStaffDto): Promise<{
        user: {
            id: string;
            email: string | null;
            phone: string | null;
            passwordHash: string;
            name: string;
            failedLoginAttempts: number;
            lockedUntil: Date | null;
            refreshTokenHash: string | null;
            createdAt: Date;
            updatedAt: Date;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        role: import("../../generated/prisma").$Enums.Role;
        commissionRule: import("generated/prisma/runtime/library").JsonValue;
        businessId: string;
        userId: string;
    }>;
    remove(id: string): Promise<{
        success: boolean;
    }>;
    commissions(query: QueryCommissionsDto): Promise<{
        businessUserId: string;
        name: string;
        role: import("../../generated/prisma").$Enums.Role;
        totalSales: number;
        commission: number;
    }[]>;
    toggleAttendance(user: AuthenticatedUser): Promise<{
        id: string;
        createdAt: Date;
        businessId: string;
        staffUserId: string;
        checkIn: Date;
        checkOut: Date | null;
    }>;
}
