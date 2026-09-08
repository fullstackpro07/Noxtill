import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { AppException } from '../common/filters/app.exception';
import { SocialAccountsService } from './social-accounts.service';
import { SocialConnectorRegistry } from './connectors/social-connector-registry';
import { MediaLibraryService } from './media-library.service';
import { AdCampaignsService } from '../ads/ad-campaigns.service';
import {
  CreateSocialPostDto,
  UpdateSocialPostDto,
  BoostPostDto,
} from './dto/social-post.dto';
import {
  BOOST_PROVIDER_MAP,
  SOCIAL_ERROR_CODES,
  SOCIAL_PUBLISH_QUEUE,
} from './social.constants';
import {
  SocialPlatform,
  SocialPostStatus,
  SocialPostTargetStatus,
} from '@prisma/client';

const RETRY_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
};

/**
 * Content Calendar + Create Post (UPD-BE-046). `executePublish()` is the real per-target fan-out
 * (mirrors `CustomerImportService.executeBatch`'s on-demand-job shape, since no existing job fans
 * one action across multiple external targets recording a per-target outcome — confirmed by
 * research): every platform is tried independently via try/catch, so one platform failing never
 * blocks the others, and the post's final status reflects the real mixed outcome
 * (`partially_failed` is a real, distinct status, not collapsed into a single pass/fail).
 * Already-`published` targets are skipped on every run — required for `retryTarget()`/`publishNow()`
 * to be safely re-runnable without re-posting to a platform that already succeeded.
 */
@Injectable()
export class SocialPostsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly s3: S3Service,
    private readonly accounts: SocialAccountsService,
    private readonly connectors: SocialConnectorRegistry,
    private readonly mediaLibrary: MediaLibraryService,
    private readonly adCampaigns: AdCampaignsService,
    @InjectQueue(SOCIAL_PUBLISH_QUEUE) private readonly queue: Queue,
  ) {}

  list(businessId: string, status?: SocialPostStatus) {
    return this.tenantPrisma.client.socialPost.findMany({
      where: { businessId, ...(status ? { status } : {}) },
      include: { targets: true },
      orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Scheduled Posts queue (UPD-BE-126) — the real, dedicated queue view: every post still pending
   * delivery (`scheduled` or mid-flight `publishing`), ordered by when it's due. The frontend
   * computes its own countdown from the real `scheduledFor` rather than this exposing any BullMQ
   * internals.
   */
  listQueue(businessId: string) {
    return this.tenantPrisma.client.socialPost.findMany({
      where: {
        businessId,
        status: {
          in: [SocialPostStatus.scheduled, SocialPostStatus.publishing],
        },
      },
      include: { targets: true },
      orderBy: { scheduledFor: 'asc' },
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
        { delay, jobId: `social-publish-${post.id}`, ...RETRY_OPTS },
      );
    }

    return post;
  }

  /**
   * Draft editing fix — the real gap the plan doc flagged: `create()` was the only way to write a
   * post, so a saved draft could never be changed. Deliberately restricted to `draft` status only:
   * once a post is `scheduled` its publish job is already enqueued with a fixed `delay`, and once
   * it's `publishing`/`published`/`failed`/`partially_failed` at least one platform has already
   * been attempted — editing caption/media/platforms after that point would silently invalidate
   * what was already sent or queued, which is worse than just not allowing it.
   */
  async update(businessId: string, id: string, dto: UpdateSocialPostDto) {
    const post = await this.find(businessId, id);
    if (post.status !== SocialPostStatus.draft) {
      throw new AppException(
        SOCIAL_ERROR_CODES.POST_NOT_EDITABLE,
        'Only drafts can be edited — this post has already been scheduled or published',
        HttpStatus.CONFLICT,
      );
    }

    const scheduledFor = dto.scheduledFor
      ? new Date(dto.scheduledFor)
      : undefined;

    if (dto.platforms) {
      await this.tenantPrisma.client.socialPostTarget.deleteMany({
        where: { socialPostId: id },
      });
    }

    const updated = await this.tenantPrisma.client.socialPost.update({
      where: { id },
      data: {
        ...(dto.caption !== undefined ? { caption: dto.caption } : {}),
        ...(dto.mediaKeys !== undefined ? { mediaKeys: dto.mediaKeys } : {}),
        ...(scheduledFor
          ? { scheduledFor, status: SocialPostStatus.scheduled }
          : {}),
        ...(dto.platforms
          ? {
              targets: {
                create: dto.platforms.map((platform) => ({ platform })),
              },
            }
          : {}),
      },
      include: { targets: true },
    });

    if (scheduledFor) {
      const delay = Math.max(0, scheduledFor.getTime() - Date.now());
      await this.queue.add(
        'publish-post',
        { businessId, postId: id },
        { delay, jobId: `social-publish-${id}`, ...RETRY_OPTS },
      );
    }

    return updated;
  }

  /** "Publish now" — either a draft the owner approves on the spot, or a manual retry of every unpublished target. */
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
      { jobId: `social-publish-${id}-${Date.now()}`, ...RETRY_OPTS },
    );
    return { queued: true };
  }

  /**
   * Retry (UPD-BE-126) — the real gap the plan doc flagged: previously only a full `publishNow()`
   * re-attempt existed (retrying every target, not just the failed one). Resets just the named
   * target back to `pending` and re-enqueues the post's publish job; `executePublish()`'s
   * already-published-targets skip means every other platform is left untouched.
   */
  async retryTarget(
    businessId: string,
    postId: string,
    platform: SocialPlatform,
  ): Promise<{ queued: true }> {
    await this.find(businessId, postId);
    const target = await this.tenantPrisma.client.socialPostTarget.findUnique({
      where: { socialPostId_platform: { socialPostId: postId, platform } },
    });
    if (!target) {
      throw new AppException(
        SOCIAL_ERROR_CODES.TARGET_NOT_FOUND,
        `No ${platform} target on this post`,
        HttpStatus.NOT_FOUND,
      );
    }
    if (target.status !== SocialPostTargetStatus.failed) {
      throw new AppException(
        SOCIAL_ERROR_CODES.TARGET_NOT_FAILED,
        `The ${platform} target isn't in a failed state`,
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.tenantPrisma.client.socialPostTarget.update({
      where: { id: target.id },
      data: { status: SocialPostTargetStatus.pending, errorMessage: null },
    });

    await this.queue.add(
      'publish-post',
      { businessId, postId },
      { jobId: `social-publish-${postId}-retry-${Date.now()}`, ...RETRY_OPTS },
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
      if (target.status === SocialPostTargetStatus.published) {
        // Already succeeded on a prior run (publishNow()/retryTarget() re-runs every target in
        // the same job) — re-publishing would create a real duplicate post on this platform.
        anySuccess = true;
        continue;
      }

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

  /** Published Posts, per-post analytics (UPD-BE-127) — real stored metrics for every published target. */
  async getPostAnalytics(businessId: string, postId: string) {
    await this.find(businessId, postId);
    return this.tenantPrisma.client.socialPostAnalytics.findMany({
      where: { businessId, socialPostTarget: { socialPostId: postId } },
      include: { socialPostTarget: true },
    });
  }

  /**
   * Real pull: for every published target whose connector implements `fetchPostInsights`, calls
   * the provider's real per-post insights endpoint and upserts the stored row. A target on a
   * platform without that capability (13 of 15 today) is silently skipped, not reported as
   * failed — it was never claimed to be poll-able.
   */
  async pullPostAnalytics(businessId: string, postId: string) {
    const post = await this.find(businessId, postId);

    for (const target of post.targets) {
      if (
        target.status !== SocialPostTargetStatus.published ||
        !target.externalId
      ) {
        continue;
      }
      const connector = this.connectors.get(target.platform);
      if (!connector.fetchPostInsights) continue;

      const tokens = await this.accounts.getTokens(businessId, target.platform);
      if (!tokens) continue;
      const account = await this.accounts.getAccount(
        businessId,
        target.platform,
      );

      try {
        const insights = await connector.fetchPostInsights(
          tokens,
          target.externalId,
          (account?.meta as Record<string, unknown>) ?? {},
        );
        await this.tenantPrisma.client.socialPostAnalytics.upsert({
          where: { socialPostTargetId: target.id },
          create: {
            businessId,
            socialPostTargetId: target.id,
            ...insights,
            pulledAt: new Date(),
          },
          update: { ...insights, pulledAt: new Date() },
        });
      } catch {
        // Real pull failure for this target — leaves whatever was last stored (or nothing) rather
        // than blocking the other targets' pulls.
      }
    }

    return this.getPostAnalytics(businessId, postId);
  }

  /**
   * "Boost as ad" handoff (UPD-BE-127) — hands the post's real caption/target off to
   * `AdCampaignsService.create()` (the exact same real campaign-creation path
   * `POST /ads/:provider/campaigns` uses), mapped onto the platform's real ad-platform
   * counterpart via `BOOST_PROVIDER_MAP`. Requires the target to have actually published — you
   * can't boost a post that never went out. `AdCampaignsService.create()` itself already
   * degrades gracefully to a local draft campaign when the ad provider isn't connected, so this
   * never fabricates a fake "boosted" result.
   */
  async boostAsAd(
    businessId: string,
    postId: string,
    platform: SocialPlatform,
    dto: BoostPostDto,
  ) {
    const post = await this.find(businessId, postId);
    const target = post.targets.find((t) => t.platform === platform);
    if (!target || target.status !== SocialPostTargetStatus.published) {
      throw new AppException(
        SOCIAL_ERROR_CODES.BOOST_TARGET_NOT_PUBLISHED,
        `The ${platform} target on this post hasn't published yet`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const provider = BOOST_PROVIDER_MAP[platform];
    if (!provider) {
      throw new AppException(
        SOCIAL_ERROR_CODES.BOOST_UNSUPPORTED_PLATFORM,
        `Boosting isn't available for ${platform} yet`,
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.adCampaigns.create(businessId, provider, {
      name: `Boosted: ${post.caption.slice(0, 60)}`,
      goal: dto.goal,
      dailyBudget: dto.dailyBudget,
      meta: { boostedSocialPostId: postId, externalPostId: target.externalId },
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
