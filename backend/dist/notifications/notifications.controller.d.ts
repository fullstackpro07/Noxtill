import { NotificationsService } from './notifications.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class NotificationsController {
    private readonly notifications;
    constructor(notifications: NotificationsService);
    list(user: AuthenticatedUser): Promise<{
        link: string | null;
        id: string;
        createdAt: Date;
        businessId: string;
        userId: string;
        body: string;
        title: string;
        read: boolean;
    }[]>;
    markRead(user: AuthenticatedUser, id: string): Promise<{
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
