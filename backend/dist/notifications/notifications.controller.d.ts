import { NotificationsService } from './notifications.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class NotificationsController {
    private readonly notifications;
    constructor(notifications: NotificationsService);
    list(user: AuthenticatedUser): Promise<{
        id: string;
        createdAt: Date;
        link: string | null;
        businessId: string;
        userId: string;
        title: string;
        body: string;
        read: boolean;
    }[]>;
    markRead(user: AuthenticatedUser, id: string): Promise<{
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
