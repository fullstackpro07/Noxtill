import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { Prisma } from '../../generated/prisma';
export interface InboxTask {
    id: string;
    type: 'appointment' | 'complaint' | 'restock';
    title: string;
    detail: string;
    assigneeStaffId: string | null;
    dueAt: string | null;
}
export declare class StaffService {
    private readonly tenantPrisma;
    constructor(tenantPrisma: TenantPrismaService);
    list(): import("generated/prisma/runtime/library").PrismaPromise<({
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
    })[]>;
    inbox(): Promise<InboxTask[]>;
    create(businessId: string, dto: CreateStaffDto): Promise<{
        tempPassword: string | undefined;
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
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        role: import("../../generated/prisma").$Enums.Role;
        commissionRule: Prisma.JsonValue;
        customRoleId: string | null;
    }>;
    update(id: string, dto: UpdateStaffDto): Promise<{
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
    }>;
    remove(id: string): Promise<{
        success: boolean;
    }>;
    private loadNonOwner;
}
