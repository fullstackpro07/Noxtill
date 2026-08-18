import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { AppException } from '../common/filters/app.exception';
import { SocialAccountsService } from './social-accounts.service';
import { SocialConnectorRegistry } from './connectors/social-connector-registry';
import { MediaLibraryService } from './media-library.service';
import { CreateSocialPostDto } from './dto/social-post.dto';
import { SOCIAL_ERROR_CODES, SOCIAL_PUBLISH_QUEUE } from './social.constants';
import { SocialPostStatus, SocialPostTargetStatus } from '@prisma/client';

/**
 * Content Calendar + Create Post (UPD-BE-046). `executePublish()` is the real per-target fan-out
 * (mirrors `CustomerImportService.executeBatch`'s on-demand-job shape, since no existing job fans
 * one action across multiple external targets recording a per-target outcome — confirmed by
 * research): every platform is tried independently via try/catch, so one platform failing never
 * blocks the others, and the post's final status reflects the real mixed outcome
 * (`partially_failed` is a real, distinct status, not collapsed into a single pass/fail).
 */
@Injectable()
export class SocialPostsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly s3: S3Service,
    private readonly accounts: SocialAccountsService,
    private readonly connectors: SocialConnectorRegistry,
    private readonly mediaLibrary: MediaLibraryService,
    @InjectQueue(SOCIAL_PUBLISH_QUEUE) private readonly queue: Queue,
  ) {}

  list(businessId: string, status?: SocialPostStatus) {
    return this.tenantPrisma.client.socialPost.findMany({
      where: { businessId, ...(status ? { status } : {}) },
      include: { targets: true },
      orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(businessId: string, id: string) {
    return this.find(businessId, id);
  }

  async create(
    businessId: string,
    userId: string | undefined,
    dto: CreateSocialPostDto,
  ) {
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
          ? SocialPostStatus.scheduled
          : SocialPostStatus.draft,
        createdByUserId: userId,
        targets: { create: dto.platforms.map((platform) => ({ platform })) },
      },
      include: { targets: true },
    });

    if (scheduledFor) {
      const delay = Math.max(0, scheduledFor.getTime() - Date.now());
      await this.queue.add(
        'publish-post',
        { businessId, postId: post.id },
        { delay, jobId: `social-publish-${post.id}` },
      );
    }

    return post;
  }

  /** "Publish now" — either a draft the owner approves on the spot, or a manual retry. */
  async publishNow(businessId: string, id: string): Promise<{ queued: true }> {
    const post = await this.find(businessId, id);
    if (post.status === SocialPostStatus.published) {
      throw new AppException(
        SOCIAL_ERROR_CODES.POST_ALREADY_PUBLISHED,
        'This post has already been published',
        HttpStatus.CONFLICT,
      );
    }

    await this.queue.add(
      'publish-post',
      { businessId, postId: id },
      { jobId: `social-publish-${id}-${Date.now()}` },
    );
    return { queued: true };
  }

  async remove(businessId: string, id: string): Promise<void> {
    const post = await this.find(businessId, id);
    if (post.status === SocialPostStatus.published) {
      throw new AppException(
        SOCIAL_ERROR_CODES.POST_ALREADY_PUBLISHED,
        'Cannot delete a post that has already been published',
        HttpStatus.CONFLICT,
      );
    }
    await this.tenantPrisma.client.socialPostTarget.deleteMany({
      where: { socialPostId: id },
    });
    await this.tenantPrisma.client.socialPost.delete({ where: { id } });
  }

  /** The real fan-out — called by `SocialPublishProcessor`, never invoked inline from a controller. */
  async executePublish(businessId: string, postId: string): Promise<void> {
    const post = await this.tenantPrisma.client.socialPost.findUnique({
      where: { id: postId },
      include: { targets: true },
    });
    if (!post || post.businessId !== businessId) return;
    if (post.status === SocialPostStatus.published) return;

    await this.tenantPrisma.client.socialPost.update({
      where: { id: postId },
      data: { status: SocialPostStatus.publishing },
    });

    const mediaKeys = post.mediaKeys as string[];
    const mediaUrls = await Promise.all(
      mediaKeys.map((key) => this.s3.getSignedDownloadUrl(key)),
    );

    let anySuccess = false;
    let anyFailure = false;

    for (const target of post.targets) {
      try {
        const tokens = await this.accounts.getTokens(
          businessId,
          target.platform,
        );
        if (!tokens) throw new Error(`${target.platform} is not connected`);

        const account = await this.accounts.getAccount(
          businessId,
          target.platform,
        );
        const connector = this.connectors.get(target.platform);
        const result = await connector.publish(
          tokens,
          { caption: post.caption, mediaUrls },
          (account?.meta as Record<string, unknown>) ?? {},
        );

        await this.tenantPrisma.client.socialPostTarget.update({
          where: { id: target.id },
          data: {
            status: SocialPostTargetStatus.published,
            externalId: result.externalId,
            publishedAt: new Date(),
            errorMessage: null,
          },
        });
        anySuccess = true;
      } catch (error) {
        await this.tenantPrisma.client.socialPostTarget.update({
          where: { id: target.id },
          data: {
            status: SocialPostTargetStatus.failed,
            errorMessage: (error as Error).message,
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

    const finalStatus =
      anySuccess && anyFailure
        ? SocialPostStatus.partially_failed
        : anySuccess
          ? SocialPostStatus.published
          : SocialPostStatus.failed;
    await this.tenantPrisma.client.socialPost.update({
      where: { id: postId },
      data: { status: finalStatus },
    });
  }

  private async find(businessId: string, id: string) {
    const post = await this.tenantPrisma.client.socialPost.findUnique({
      where: { id },
      include: { targets: true },
    });
    if (!post || post.businessId !== businessId) {
      throw new NotFoundException('Social post not found');
    }
    return post;
  }
}
