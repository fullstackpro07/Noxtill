import { PrismaService } from '../prisma/prisma.service';
export declare class SessionsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(userId: string, businessId: string, userAgent?: string, ipAddress?: string): import("generated/prisma").Prisma.Prisma__SessionClient<{
        id: string;
        businessId: string;
        createdAt: Date;
        refreshTokenHash: string;
        userAgent: string | null;
        ipAddress: string | null;
        lastUsedAt: Date;
        revokedAt: Date | null;
        userId: string;
    }, never, import("generated/prisma/runtime/library").DefaultArgs, import("generated/prisma").Prisma.PrismaClientOptions>;
    setRefreshTokenHash(sessionId: string, refreshToken: string): Promise<void>;
    findActive(sessionId: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        refreshTokenHash: string;
        userAgent: string | null;
        ipAddress: string | null;
        lastUsedAt: Date;
        revokedAt: Date | null;
        userId: string;
    } | null>;
    verifyRefreshToken(sessionId: string, refreshToken: string): Promise<boolean>;
    revoke(sessionId: string): Promise<void>;
    list(userId: string): import("generated/prisma").Prisma.PrismaPromise<{
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
    revokeOwn(userId: string, sessionId: string): Promise<void>;
}
