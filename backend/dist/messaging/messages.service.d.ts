import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
export declare class MessagesService {
    private readonly tenantPrisma;
    constructor(tenantPrisma: TenantPrismaService);
    listByCustomer(customerId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        locale: string;
        businessId: string;
        customerId: string | null;
        channel: import("generated/prisma").$Enums.MessageChannel;
        category: import("generated/prisma").$Enums.MessageCategory;
        templateKey: string;
        payload: import("generated/prisma/runtime/library").JsonValue;
        status: import("generated/prisma").$Enums.MessageStatus;
        providerRef: string | null;
        scheduledFor: Date | null;
        campaignId: string | null;
    }[]>;
}
