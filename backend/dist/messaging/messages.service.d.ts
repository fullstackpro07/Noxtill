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
        category: import("generated/prisma").$Enums.MessageCategory;
        customerId: string | null;
        status: import("generated/prisma").$Enums.MessageStatus;
        providerRef: string | null;
        channel: import("generated/prisma").$Enums.MessageChannel;
        templateKey: string;
        payload: import("generated/prisma/runtime/library").JsonValue;
        scheduledFor: Date | null;
        campaignId: string | null;
    }[]>;
}
