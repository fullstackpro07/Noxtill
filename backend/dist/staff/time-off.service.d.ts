import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CreateTimeOffDto } from './dto/create-time-off.dto';
export declare class TimeOffService {
    private readonly tenantPrisma;
    private readonly cls;
    constructor(tenantPrisma: TenantPrismaService, cls: ClsService);
    create(businessId: string, dto: CreateTimeOffDto): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        staffUserId: string;
        reason: string | null;
        startsAt: Date;
        endsAt: Date;
        approved: boolean;
        reviewedByUserId: string | null;
    }>;
    list(staffUserId?: string): import("generated/prisma/runtime/library").PrismaPromise<({
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
            role: import("generated/prisma").$Enums.Role;
            commissionRule: import("generated/prisma/runtime/library").JsonValue;
            customRoleId: string | null;
        };
    } & {
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        staffUserId: string;
        reason: string | null;
        startsAt: Date;
        endsAt: Date;
        approved: boolean;
        reviewedByUserId: string | null;
    })[]>;
    approve(id: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        staffUserId: string;
        reason: string | null;
        startsAt: Date;
        endsAt: Date;
        approved: boolean;
        reviewedByUserId: string | null;
    }>;
    reject(id: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        staffUserId: string;
        reason: string | null;
        startsAt: Date;
        endsAt: Date;
        approved: boolean;
        reviewedByUserId: string | null;
    }>;
    findOne(id: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        staffUserId: string;
        reason: string | null;
        startsAt: Date;
        endsAt: Date;
        approved: boolean;
        reviewedByUserId: string | null;
    }>;
}
