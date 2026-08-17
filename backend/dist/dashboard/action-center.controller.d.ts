import { ActionCenterService } from './action-center.service';
import { SnoozeActionItemDto } from './dto/snooze-action-item.dto';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { ActionItemPriority, ActionItemType } from '../../generated/prisma';
export declare class ActionCenterController {
    private readonly actionCenterService;
    private readonly tenantPrisma;
    constructor(actionCenterService: ActionCenterService, tenantPrisma: TenantPrismaService);
    list(user: AuthenticatedUser, priority?: ActionItemPriority, type?: ActionItemType): Promise<{
        items: {
            id: string;
            type: import("../../generated/prisma").$Enums.ActionItemType;
            priority: import("../../generated/prisma").$Enums.ActionItemPriority;
            title: string;
            reason: string;
            ageMs: number;
            occurredAt: Date;
            deepLink: string;
        }[];
        counts: {
            urgent: number;
            open: number;
            completedThisWeek: number;
        };
    }>;
    complete(user: AuthenticatedUser, id: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("../../generated/prisma").$Enums.ActionItemStatus;
        entityId: string;
        type: import("../../generated/prisma").$Enums.ActionItemType;
        snoozedUntil: Date | null;
    }>;
    dismiss(user: AuthenticatedUser, id: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("../../generated/prisma").$Enums.ActionItemStatus;
        entityId: string;
        type: import("../../generated/prisma").$Enums.ActionItemType;
        snoozedUntil: Date | null;
    }>;
    snooze(user: AuthenticatedUser, id: string, dto: SnoozeActionItemDto): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("../../generated/prisma").$Enums.ActionItemStatus;
        entityId: string;
        type: import("../../generated/prisma").$Enums.ActionItemType;
        snoozedUntil: Date | null;
    }>;
    private resolveBusinessUserId;
}
