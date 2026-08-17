import { NotificationsService } from './notifications.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class NotificationsController {
    private readonly notifications;
    constructor(notifications: NotificationsService);
    list(user: AuthenticatedUser): Promise<{
        id: string;
        createdAt: Date;
        businessId: string;
        userId: string;
        link: string | null;
        read: boolean;
        body: string;
        title: string;
    }[]>;
    markRead(user: AuthenticatedUser, id: string): Promise<{
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
