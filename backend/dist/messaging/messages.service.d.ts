import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
export declare class MessagesService {
    private readonly tenantPrisma;
    constructor(tenantPrisma: TenantPrismaService);
    listByCustomer(customerId: string): Promise<{
        locale: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        category: import("generated/prisma").$Enums.MessageCategory;
        customerId: string | null;
        status: import("generated/prisma").$Enums.MessageStatus;
        channel: import("generated/prisma").$Enums.MessageChannel;
        templateKey: string;
        payload: import("generated/prisma/runtime/library").JsonValue;
        providerRef: string | null;
        scheduledFor: Date | null;
        campaignId: string | null;
    }[]>;
}
