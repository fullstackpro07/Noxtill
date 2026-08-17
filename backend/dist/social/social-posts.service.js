"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocialPostsService = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const s3_service_1 = require("../common/storage/s3.service");
const app_exception_1 = require("../common/filters/app.exception");
const social_accounts_service_1 = require("./social-accounts.service");
const social_connector_registry_1 = require("./connectors/social-connector-registry");
const media_library_service_1 = require("./media-library.service");
const social_constants_1 = require("./social.constants");
const prisma_1 = require("../../generated/prisma");
let SocialPostsService = class SocialPostsService {
    tenantPrisma;
    s3;
    accounts;
    connectors;
    mediaLibrary;
    queue;
    constructor(tenantPrisma, s3, accounts, connectors, mediaLibrary, queue) {
        this.tenantPrisma = tenantPrisma;
        this.s3 = s3;
        this.accounts = accounts;
        this.connectors = connectors;
        this.mediaLibrary = mediaLibrary;
        this.queue = queue;
    }
    list(businessId, status) {
        return this.tenantPrisma.client.socialPost.findMany({
            where: { businessId, ...(status ? { status } : {}) },
            include: { targets: true },
            orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'desc' }],
        });
    }
    async findOne(businessId, id) {
        return this.find(businessId, id);
    }
    async create(businessId, userId, dto) {
        const scheduledFor = dto.scheduledFor
            ? new Date(dto.scheduledFor)
            : undefined;
        const post = await this.tenantPrisma.client.socialPost.create({
            data: {
                businessId,
                caption: dto.caption,
                mediaKeys: dto.mediaKeys ?? [],
                scheduledFor,
                status: scheduledFor
                    ? prisma_1.SocialPostStatus.scheduled
                    : prisma_1.SocialPostStatus.draft,
                createdByUserId: userId,
                targets: { create: dto.platforms.map((platform) => ({ platform })) },
            },
            include: { targets: true },
        });
        if (scheduledFor) {
            const delay = Math.max(0, scheduledFor.getTime() - Date.now());
            await this.queue.add('publish-post', { businessId, postId: post.id }, { delay, jobId: `social-publish-${post.id}` });
        }
        return post;
    }
    async publishNow(businessId, id) {
        const post = await this.find(businessId, id);
        if (post.status === prisma_1.SocialPostStatus.published) {
            throw new app_exception_1.AppException(social_constants_1.SOCIAL_ERROR_CODES.POST_ALREADY_PUBLISHED, 'This post has already been published', common_1.HttpStatus.CONFLICT);
        }
        await this.queue.add('publish-post', { businessId, postId: id }, { jobId: `social-publish-${id}-${Date.now()}` });
        return { queued: true };
    }
    async remove(businessId, id) {
        const post = await this.find(businessId, id);
        if (post.status === prisma_1.SocialPostStatus.published) {
            throw new app_exception_1.AppException(social_constants_1.SOCIAL_ERROR_CODES.POST_ALREADY_PUBLISHED, 'Cannot delete a post that has already been published', common_1.HttpStatus.CONFLICT);
        }
        await this.tenantPrisma.client.socialPostTarget.deleteMany({
            where: { socialPostId: id },
        });
        await this.tenantPrisma.client.socialPost.delete({ where: { id } });
    }
    async executePublish(businessId, postId) {
        const post = await this.tenantPrisma.client.socialPost.findUnique({
            where: { id: postId },
            include: { targets: true },
        });
        if (!post || post.businessId !== businessId)
            return;
        if (post.status === prisma_1.SocialPostStatus.published)
            return;
        await this.tenantPrisma.client.socialPost.update({
            where: { id: postId },
            data: { status: prisma_1.SocialPostStatus.publishing },
        });
        const mediaKeys = post.mediaKeys;
        const mediaUrls = await Promise.all(mediaKeys.map((key) => this.s3.getSignedDownloadUrl(key)));
        let anySuccess = false;
        let anyFailure = false;
        for (const target of post.targets) {
            try {
                const tokens = await this.accounts.getTokens(businessId, target.platform);
                if (!tokens)
                    throw new Error(`${target.platform} is not connected`);
                const account = await this.accounts.getAccount(businessId, target.platform);
                const connector = this.connectors.get(target.platform);
                const result = await connector.publish(tokens, { caption: post.caption, mediaUrls }, account?.meta ?? {});
                await this.tenantPrisma.client.socialPostTarget.update({
                    where: { id: target.id },
                    data: {
                        status: prisma_1.SocialPostTargetStatus.published,
                        externalId: result.externalId,
                        publishedAt: new Date(),
                        errorMessage: null,
                    },
                });
                anySuccess = true;
            }
            catch (error) {
                await this.tenantPrisma.client.socialPostTarget.update({
                    where: { id: target.id },
                    data: {
                        status: prisma_1.SocialPostTargetStatus.failed,
                        errorMessage: error.message,
                    },
                });
                anyFailure = true;
            }
        }
        for (const key of mediaKeys) {
            await this.mediaLibrary
                .incrementUsage(businessId, key)
                .catch(() => undefined);
        }
        const finalStatus = anySuccess && anyFailure
            ? prisma_1.SocialPostStatus.partially_failed
            : anySuccess
                ? prisma_1.SocialPostStatus.published
                : prisma_1.SocialPostStatus.failed;
        await this.tenantPrisma.client.socialPost.update({
            where: { id: postId },
            data: { status: finalStatus },
        });
    }
    async find(businessId, id) {
        const post = await this.tenantPrisma.client.socialPost.findUnique({
            where: { id },
            include: { targets: true },
        });
        if (!post || post.businessId !== businessId) {
            throw new common_1.NotFoundException('Social post not found');
        }
        return post;
    }
};
exports.SocialPostsService = SocialPostsService;
exports.SocialPostsService = SocialPostsService = __decorate([
    (0, common_1.Injectable)(),
    __param(5, (0, bullmq_1.InjectQueue)(social_constants_1.SOCIAL_PUBLISH_QUEUE)),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        s3_service_1.S3Service,
        social_accounts_service_1.SocialAccountsService,
        social_connector_registry_1.SocialConnectorRegistry,
        media_library_service_1.MediaLibraryService,
        bullmq_2.Queue])
], SocialPostsService);
//# sourceMappingURL=social-posts.service.js.map