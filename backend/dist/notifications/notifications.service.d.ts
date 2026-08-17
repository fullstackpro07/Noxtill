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
        businessId: string;
        userId: string;
        link: string | null;
        read: boolean;
        body: string;
        title: string;
    }[]>;
    create(businessId: string, userId: string, input: CreateNotificationInput): Promise<{
        id: string;
        createdAt: Date;
        businessId: string;
        userId: string;
        link: string | null;
        read: boolean;
        body: string;
        title: string;
    }>;
    markRead(userId: string, id: string): Promise<{
        id: string;
        createdAt: Date;
        businessId: string;
        userId: string;
        link: string | null;
        read: boolean;
        body: string;
        title: string;
    }>;
}
