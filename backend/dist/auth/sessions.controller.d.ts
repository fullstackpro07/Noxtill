import { SessionsService } from './sessions.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class SessionsController {
    private readonly sessions;
    constructor(sessions: SessionsService);
    list(user: AuthenticatedUser): import("generated/prisma").Prisma.PrismaPromise<{
        id: string;
        businessId: string;
        createdAt: Date;
        refreshTokenHash: string;
        userAgent: string | null;
        ipAddress: string | null;
        lastUsedAt: Date;
        revokedAt: Date | null;
        userId: string;
    }[]>;
    revoke(user: AuthenticatedUser, id: string): Promise<void>;
}
