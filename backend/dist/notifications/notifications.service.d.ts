import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
export interface CreateNotificationInput {
    title: string;
    body: string;
    link?: string;
}
export declare class NotificationsService {
    private readonly tenantPrisma;
    constructor(tenantPrisma: TenantPrismaService);
    list(userId: string): Promise<{
        id: string;
        createdAt: Date;
        link: string | null;
        businessId: string;
        userId: string;
        title: string;
        body: string;
        read: boolean;
    }[]>;
    create(businessId: string, userId: string, input: CreateNotificationInput): Promise<{
        id: string;
        createdAt: Date;
        link: string | null;
        businessId: string;
        userId: string;
        title: string;
        body: string;
        read: boolean;
    }>;
    markRead(userId: string, id: string): Promise<{
        id: string;
        createdAt: Date;
        link: string | null;
        businessId: string;
        userId: string;
        title: string;
        body: string;
        read: boolean;
    }>;
}
