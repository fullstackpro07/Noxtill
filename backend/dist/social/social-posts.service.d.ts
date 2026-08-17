import { Queue } from 'bullmq';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { SocialAccountsService } from './social-accounts.service';
import { SocialConnectorRegistry } from './connectors/social-connector-registry';
import { MediaLibraryService } from './media-library.service';
import { CreateSocialPostDto } from './dto/social-post.dto';
import { SocialPostStatus } from '../../generated/prisma';
export declare class SocialPostsService {
    private readonly tenantPrisma;
    private readonly s3;
    private readonly accounts;
    private readonly connectors;
    private readonly mediaLibrary;
    private readonly queue;
    constructor(tenantPrisma: TenantPrismaService, s3: S3Service, accounts: SocialAccountsService, connectors: SocialConnectorRegistry, mediaLibrary: MediaLibraryService, queue: Queue);
    list(businessId: string, status?: SocialPostStatus): import("generated/prisma/runtime/library").PrismaPromise<({
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
    findOne(businessId: string, id: string): Promise<{
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
    create(businessId: string, userId: string | undefined, dto: CreateSocialPostDto): Promise<{
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
    publishNow(businessId: string, id: string): Promise<{
        queued: true;
    }>;
    remove(businessId: string, id: string): Promise<void>;
    executePublish(businessId: string, postId: string): Promise<void>;
    private find;
}
