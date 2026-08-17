import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { SnoozeActionItemDto } from './dto/snooze-action-item.dto';
import { ActionItemPriority, ActionItemType, Role } from '../../generated/prisma';
export declare class ActionCenterService {
    private readonly tenantPrisma;
    constructor(tenantPrisma: TenantPrismaService);
    list(businessId: string, role: Role, businessUserId: string | null, filters: {
        priority?: ActionItemPriority;
        type?: ActionItemType;
    }): Promise<{
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
    complete(businessId: string, id: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        type: import("../../generated/prisma").$Enums.ActionItemType;
        status: import("../../generated/prisma").$Enums.ActionItemStatus;
        entityId: string;
        snoozedUntil: Date | null;
    }>;
    dismiss(businessId: string, id: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        type: import("../../generated/prisma").$Enums.ActionItemType;
        status: import("../../generated/prisma").$Enums.ActionItemStatus;
        entityId: string;
        snoozedUntil: Date | null;
    }>;
    snooze(businessId: string, id: string, dto: SnoozeActionItemDto): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        type: import("../../generated/prisma").$Enums.ActionItemType;
        status: import("../../generated/prisma").$Enums.ActionItemStatus;
        entityId: string;
        snoozedUntil: Date | null;
    }>;
    private setStatus;
    private gatherRawItems;
    private complaintItems;
    private lowStockItems;
    private overdueCreditItems;
    private unrepliedReviewItems;
}
