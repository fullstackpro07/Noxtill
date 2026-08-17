import { TimeOffService } from './time-off.service';
import { CreateTimeOffDto } from './dto/create-time-off.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class TimeOffController {
    private readonly timeOff;
    constructor(timeOff: TimeOffService);
    create(user: AuthenticatedUser, dto: CreateTimeOffDto): Promise<{
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
}
