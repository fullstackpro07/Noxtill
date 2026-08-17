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
    })[]>;
    inbox(): Promise<import("./staff.service").InboxTask[]>;
    create(user: AuthenticatedUser, dto: CreateStaffDto): Promise<{
        tempPassword: string | undefined;
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
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        role: import("generated/prisma").$Enums.Role;
        commissionRule: import("generated/prisma/runtime/library").JsonValue;
        customRoleId: string | null;
    }>;
    update(id: string, dto: UpdateStaffDto): Promise<{
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
    }>;
    remove(id: string): Promise<{
        success: boolean;
    }>;
    commissions(query: QueryCommissionsDto): Promise<{
        businessUserId: string;
        name: string;
        role: import("generated/prisma").$Enums.Role;
        totalSales: number;
        commission: number;
    }[]>;
    toggleAttendance(user: AuthenticatedUser): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        staffUserId: string;
        checkIn: Date;
        checkOut: Date | null;
    }>;
}
