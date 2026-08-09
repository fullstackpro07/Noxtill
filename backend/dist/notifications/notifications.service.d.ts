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
        link: string | null;
        id: string;
        createdAt: Date;
        businessId: string;
        userId: string;
        body: string;
        title: string;
        read: boolean;
    }[]>;
    create(businessId: string, userId: string, input: CreateNotificationInput): Promise<{
        link: string | null;
        id: string;
        createdAt: Date;
        businessId: string;
        userId: string;
        body: string;
        title: string;
        read: boolean;
    }>;
    markRead(userId: string, id: string): Promise<{
        link: string | null;
        id: string;
        createdAt: Date;
        businessId: string;
        userId: string;
        body: string;
        title: string;
        read: boolean;
    }>;
}
