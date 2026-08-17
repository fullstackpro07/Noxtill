import { SocialInboxService } from './social-inbox.service';
import { ReplyInboxItemDto } from './dto/social-inbox.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { SocialInboxStatus } from '../../generated/prisma';
export declare class SocialInboxController {
    private readonly inbox;
    constructor(inbox: SocialInboxService);
    list(user: AuthenticatedUser, status?: SocialInboxStatus): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        kind: import("../../generated/prisma").$Enums.SocialInboxKind;
        status: import("../../generated/prisma").$Enums.SocialInboxStatus;
        platform: import("../../generated/prisma").$Enums.SocialPlatform;
        externalId: string;
        text: string;
        repliedAt: Date | null;
        authorName: string | null;
        postExternalId: string | null;
        repliedText: string | null;
        receivedAt: Date;
    }[]>;
    reply(user: AuthenticatedUser, id: string, dto: ReplyInboxItemDto): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        kind: import("../../generated/prisma").$Enums.SocialInboxKind;
        status: import("../../generated/prisma").$Enums.SocialInboxStatus;
        platform: import("../../generated/prisma").$Enums.SocialPlatform;
        externalId: string;
        text: string;
        repliedAt: Date | null;
        authorName: string | null;
        postExternalId: string | null;
        repliedText: string | null;
        receivedAt: Date;
    }>;
    markRead(user: AuthenticatedUser, id: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        kind: import("../../generated/prisma").$Enums.SocialInboxKind;
        status: import("../../generated/prisma").$Enums.SocialInboxStatus;
        platform: import("../../generated/prisma").$Enums.SocialPlatform;
        externalId: string;
        text: string;
        repliedAt: Date | null;
        authorName: string | null;
        postExternalId: string | null;
        repliedText: string | null;
        receivedAt: Date;
    }>;
}
