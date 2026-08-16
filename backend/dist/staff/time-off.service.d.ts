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
        startsAt: Date;
        endsAt: Date;
        reason: string | null;
        approved: boolean;
        reviewedByUserId: string | null;
    }>;
    list(staffUserId?: string): import("generated/prisma/runtime/library").PrismaPromise<({
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
                refreshTokenHash: string | null;
            };
        } & {
            id: string;
            businessId: string;
            createdAt: Date;
            updatedAt: Date;
            role: import("generated/prisma").$Enums.Role;
            commissionRule: import("generated/prisma/runtime/library").JsonValue;
            userId: string;
            customRoleId: string | null;
        };
    } & {
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        staffUserId: string;
        startsAt: Date;
        endsAt: Date;
        reason: string | null;
        approved: boolean;
        reviewedByUserId: string | null;
    })[]>;
    approve(id: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        staffUserId: string;
        startsAt: Date;
        endsAt: Date;
        reason: string | null;
        approved: boolean;
        reviewedByUserId: string | null;
    }>;
    reject(id: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        staffUserId: string;
        startsAt: Date;
        endsAt: Date;
        reason: string | null;
        approved: boolean;
        reviewedByUserId: string | null;
    }>;
    findOne(id: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        staffUserId: string;
        startsAt: Date;
        endsAt: Date;
        reason: string | null;
        approved: boolean;
        reviewedByUserId: string | null;
    }>;
}
