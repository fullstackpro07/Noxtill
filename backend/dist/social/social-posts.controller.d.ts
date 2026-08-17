import { SocialPostsService } from './social-posts.service';
import { CreateSocialPostDto } from './dto/social-post.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { SocialPostStatus } from '../../generated/prisma';
export declare class SocialPostsController {
    private readonly posts;
    constructor(posts: SocialPostsService);
    list(user: AuthenticatedUser, status?: SocialPostStatus): import("generated/prisma/runtime/library").PrismaPromise<({
        targets: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: import("../../generated/prisma").$Enums.SocialPostTargetStatus;
            platform: import("../../generated/prisma").$Enums.SocialPlatform;
            externalId: string | null;
            socialPostId: string;
            errorMessage: string | null;
            publishedAt: Date | null;
        }[];
    } & {
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("../../generated/prisma").$Enums.SocialPostStatus;
        scheduledFor: Date | null;
        caption: string;
        createdByUserId: string | null;
        mediaKeys: import("generated/prisma/runtime/library").JsonValue;
    })[]>;
    findOne(user: AuthenticatedUser, id: string): Promise<{
        targets: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: import("../../generated/prisma").$Enums.SocialPostTargetStatus;
            platform: import("../../generated/prisma").$Enums.SocialPlatform;
            externalId: string | null;
            socialPostId: string;
            errorMessage: string | null;
            publishedAt: Date | null;
        }[];
    } & {
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("../../generated/prisma").$Enums.SocialPostStatus;
        scheduledFor: Date | null;
        caption: string;
        createdByUserId: string | null;
        mediaKeys: import("generated/prisma/runtime/library").JsonValue;
    }>;
    create(user: AuthenticatedUser, dto: CreateSocialPostDto): Promise<{
        targets: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: import("../../generated/prisma").$Enums.SocialPostTargetStatus;
            platform: import("../../generated/prisma").$Enums.SocialPlatform;
            externalId: string | null;
            socialPostId: string;
            errorMessage: string | null;
            publishedAt: Date | null;
        }[];
    } & {
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("../../generated/prisma").$Enums.SocialPostStatus;
        scheduledFor: Date | null;
        caption: string;
        createdByUserId: string | null;
        mediaKeys: import("generated/prisma/runtime/library").JsonValue;
    }>;
    publishNow(user: AuthenticatedUser, id: string): Promise<{
        queued: true;
    }>;
    remove(user: AuthenticatedUser, id: string): Promise<void>;
}
