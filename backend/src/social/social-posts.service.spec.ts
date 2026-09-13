import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { SocialPostsService } from './social-posts.service';
import { AppException } from '../common/filters/app.exception';
import type { S3Service } from '../common/storage/s3.service';
import type { SocialAccountsService } from './social-accounts.service';
import type { SocialConnectorRegistry } from './connectors/social-connector-registry';
import type { MediaLibraryService } from './media-library.service';
import type { AdCampaignsService } from '../ads/ad-campaigns.service';
import type { Queue } from 'bullmq';
import {
  SocialPlatform,
  SocialPostStatus,
  SocialPostTargetStatus,
} from '@prisma/client';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('SocialPostsService (UPD-BE-046)', () => {
  let prisma: PrismaService;
  let service: SocialPostsService;
  let businessId: string;

  const s3 = {
    getSignedDownloadUrl: jest
      .fn()
      .mockResolvedValue('https://signed.example.com/img'),
  };
  const publishFacebook = jest.fn();
  const publishInstagram = jest.fn();
  const accounts = {
    getTokens: jest.fn(),
    getAccount: jest.fn().mockResolvedValue({ meta: {} }),
  };
  const connectors = {
    get: jest.fn((platform: SocialPlatform) =>
      platform === SocialPlatform.facebook
        ? { publish: publishFacebook }
        : { publish: publishInstagram },
    ),
  };
  const mediaLibrary = {
    incrementUsage: jest.fn().mockResolvedValue(undefined),
  };
  const adCampaigns = {
    create: jest
      .fn<
        Promise<{ id: string; status: string }>,
        [string, string, Record<string, unknown>]
      >()
      .mockResolvedValue({ id: 'campaign-1', status: 'draft' }),
  };
  const queue = { add: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new SocialPostsService(
      tenantPrisma,
      s3 as unknown as S3Service,
      accounts as unknown as SocialAccountsService,
      connectors as unknown as SocialConnectorRegistry,
      mediaLibrary as unknown as MediaLibraryService,
      adCampaigns as unknown as AdCampaignsService,
      queue as unknown as Queue,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Social Posts Test Biz',
        slug: `social-posts-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterEach(() => jest.clearAllMocks());

  afterAll(async () => {
    await prisma.socialPostAnalytics.deleteMany({ where: { businessId } });
    await prisma.socialPostTarget.deleteMany({
      where: { socialPost: { businessId } },
    });
    await prisma.socialPost.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('create() without scheduledFor lands as a real draft, no job enqueued', async () => {
    const post = await service.create(businessId, 'owner-1', {
      caption: 'Hello',
      platforms: [SocialPlatform.facebook],
    });
    expect(post.status).toBe(SocialPostStatus.draft);
    expect(post.targets).toHaveLength(1);

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('create() with scheduledFor lands as scheduled and enqueues a real delayed job', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const post = await service.create(businessId, 'owner-1', {
      caption: 'Scheduled post',
      platforms: [SocialPlatform.facebook, SocialPlatform.instagram],
      scheduledFor: future,
    });
    expect(post.status).toBe(SocialPostStatus.scheduled);

    expect(queue.add).toHaveBeenCalledWith(
      'publish-post',
      { businessId, postId: post.id },
      expect.objectContaining({ jobId: `social-publish-${post.id}` }),
    );
  });

  it('executePublish() fans out per-target: one real success, one real failure -> partially_failed', async () => {
    const post = await service.create(businessId, 'owner-1', {
      caption: 'Mixed outcome post',
      mediaKeys: ['media/x/pic.png'],
      platforms: [SocialPlatform.facebook, SocialPlatform.instagram],
    });

    accounts.getTokens.mockResolvedValue({ accessToken: 'tok' });
    publishFacebook.mockResolvedValue({ externalId: 'fb-post-1' });
    publishInstagram.mockRejectedValue(new Error('Instagram rate limited'));

    await service.executePublish(businessId, post.id);

    const reloaded = await prisma.socialPost.findUniqueOrThrow({
      where: { id: post.id },
      include: { targets: true },
    });
    expect(reloaded.status).toBe(SocialPostStatus.partially_failed);
    const fbTarget = reloaded.targets.find(
      (t) => t.platform === SocialPlatform.facebook,
    )!;
    expect(fbTarget.status).toBe(SocialPostTargetStatus.published);
    expect(fbTarget.externalId).toBe('fb-post-1');
    const igTarget = reloaded.targets.find(
      (t) => t.platform === SocialPlatform.instagram,
    )!;
    expect(igTarget.status).toBe(SocialPostTargetStatus.failed);
    expect(igTarget.errorMessage).toBe('Instagram rate limited');

    expect(mediaLibrary.incrementUsage).toHaveBeenCalledWith(
      businessId,
      'media/x/pic.png',
    );
  });

  it('executePublish() resolves signed media URLs (not raw keys) before calling the connector', async () => {
    const post = await service.create(businessId, 'owner-1', {
      caption: 'Media post',
      mediaKeys: ['media/x/pic.png'],
      platforms: [SocialPlatform.facebook],
    });
    accounts.getTokens.mockResolvedValue({ accessToken: 'tok' });
    publishFacebook.mockResolvedValue({ externalId: 'fb-2' });

    await service.executePublish(businessId, post.id);

    expect(publishFacebook).toHaveBeenCalledWith(
      { accessToken: 'tok' },
      expect.objectContaining({
        mediaUrls: ['https://signed.example.com/img'],
      }),
      {},
    );
  });

  it('executePublish() marks failed (not published) when the platform is not connected', async () => {
    const post = await service.create(businessId, 'owner-1', {
      caption: 'Unconnected platform',
      platforms: [SocialPlatform.facebook],
    });
    accounts.getTokens.mockResolvedValue(null);

    await service.executePublish(businessId, post.id);

    const reloaded = await prisma.socialPost.findUniqueOrThrow({
      where: { id: post.id },
    });
    expect(reloaded.status).toBe(SocialPostStatus.failed);
  });

  it('publishNow() rejects an already-published post; remove() rejects deleting one', async () => {
    const post = await service.create(businessId, 'owner-1', {
      caption: 'Will publish',
      platforms: [SocialPlatform.facebook],
    });
    accounts.getTokens.mockResolvedValue({ accessToken: 'tok' });
    publishFacebook.mockResolvedValue({ externalId: 'fb-3' });
    await service.executePublish(businessId, post.id);

    await expect(
      service.publishNow(businessId, post.id),
    ).rejects.toBeInstanceOf(AppException);
    await expect(service.remove(businessId, post.id)).rejects.toBeInstanceOf(
      AppException,
    );
  });

  it('remove() deletes a real draft and its targets', async () => {
    const post = await service.create(businessId, 'owner-1', {
      caption: 'Draft to delete',
      platforms: [SocialPlatform.facebook],
    });
    await service.remove(businessId, post.id);
    await expect(service.findOne(businessId, post.id)).rejects.toThrow();
  });

  describe('Draft editing fix', () => {
    it('update() changes caption/mediaKeys on a real draft without touching its targets', async () => {
      const post = await service.create(businessId, 'owner-1', {
        caption: 'Original caption',
        platforms: [SocialPlatform.facebook],
      });
      const updated = await service.update(businessId, post.id, {
        caption: 'Edited caption',
        mediaKeys: ['media/x/new.png'],
      });
      expect(updated.caption).toBe('Edited caption');
      expect(updated.mediaKeys).toEqual(['media/x/new.png']);
      expect(updated.targets).toHaveLength(1);
      expect(updated.targets[0].platform).toBe(SocialPlatform.facebook);
      expect(updated.status).toBe(SocialPostStatus.draft);
    });

    it('update() replaces the target set when platforms change', async () => {
      const post = await service.create(businessId, 'owner-1', {
        caption: 'Platform swap',
        platforms: [SocialPlatform.facebook],
      });
      const updated = await service.update(businessId, post.id, {
        platforms: [SocialPlatform.instagram, SocialPlatform.tiktok],
      });
      expect(updated.targets.map((t) => t.platform).sort()).toEqual(
        [SocialPlatform.instagram, SocialPlatform.tiktok].sort(),
      );
    });

    it('update() with scheduledFor promotes the draft to scheduled and enqueues a real delayed job', async () => {
      const post = await service.create(businessId, 'owner-1', {
        caption: 'Now schedule me',
        platforms: [SocialPlatform.facebook],
      });
      const future = new Date(Date.now() + 60_000).toISOString();
      const updated = await service.update(businessId, post.id, {
        scheduledFor: future,
      });
      expect(updated.status).toBe(SocialPostStatus.scheduled);
      expect(queue.add).toHaveBeenCalledWith(
        'publish-post',
        { businessId, postId: post.id },
        expect.objectContaining({ jobId: `social-publish-${post.id}` }),
      );
    });

    it('update() rejects editing a post that is no longer a draft', async () => {
      const post = await service.create(businessId, 'owner-1', {
        caption: 'Will publish then try to edit',
        platforms: [SocialPlatform.facebook],
      });
      accounts.getTokens.mockResolvedValue({ accessToken: 'tok' });
      publishFacebook.mockResolvedValue({ externalId: 'fb-edit-1' });
      await service.executePublish(businessId, post.id);

      await expect(
        service.update(businessId, post.id, { caption: 'Too late' }),
      ).rejects.toBeInstanceOf(AppException);
    });
  });

  describe('Scheduled Posts queue + retry (UPD-BE-126)', () => {
    it('listQueue() returns only scheduled/publishing posts, ordered by scheduledFor', async () => {
      const soon = new Date(Date.now() + 60_000).toISOString();
      const later = new Date(Date.now() + 120_000).toISOString();
      const later_ = await service.create(businessId, 'owner-1', {
        caption: 'Later',
        platforms: [SocialPlatform.facebook],
        scheduledFor: later,
      });
      const sooner = await service.create(businessId, 'owner-1', {
        caption: 'Sooner',
        platforms: [SocialPlatform.facebook],
        scheduledFor: soon,
      });
      const draft = await service.create(businessId, 'owner-1', {
        caption: 'Draft, not queued',
        platforms: [SocialPlatform.facebook],
      });

      const queued = await service.listQueue(businessId);
      const ids = queued.map((p) => p.id);
      expect(ids).toContain(sooner.id);
      expect(ids).toContain(later_.id);
      expect(ids).not.toContain(draft.id);
      expect(ids.indexOf(sooner.id)).toBeLessThan(ids.indexOf(later_.id));

      await service.remove(businessId, draft.id);
    });

    it('executePublish() is safely re-runnable: an already-published target is never re-published', async () => {
      const post = await service.create(businessId, 'owner-1', {
        caption: 'Idempotency check',
        platforms: [SocialPlatform.facebook],
      });
      accounts.getTokens.mockResolvedValue({ accessToken: 'tok' });
      publishFacebook.mockResolvedValue({ externalId: 'fb-idem-1' });

      await service.executePublish(businessId, post.id);
      publishFacebook.mockClear();
      await service.executePublish(businessId, post.id);

      expect(publishFacebook).not.toHaveBeenCalled();
    });

    it('retryTarget() rejects a platform with no target on the post', async () => {
      const post = await service.create(businessId, 'owner-1', {
        caption: 'No IG target',
        platforms: [SocialPlatform.facebook],
      });
      await expect(
        service.retryTarget(businessId, post.id, SocialPlatform.instagram),
      ).rejects.toBeInstanceOf(AppException);
    });

    it('retryTarget() rejects a target that is not currently failed', async () => {
      const post = await service.create(businessId, 'owner-1', {
        caption: 'Still pending',
        platforms: [SocialPlatform.facebook],
      });
      await expect(
        service.retryTarget(businessId, post.id, SocialPlatform.facebook),
      ).rejects.toBeInstanceOf(AppException);
    });

    it('retryTarget() really resets just the failed target and re-enqueues, leaving a successful sibling target untouched', async () => {
      const post = await service.create(businessId, 'owner-1', {
        caption: 'Partial retry',
        platforms: [SocialPlatform.facebook, SocialPlatform.instagram],
      });
      accounts.getTokens.mockResolvedValue({ accessToken: 'tok' });
      publishFacebook.mockResolvedValue({ externalId: 'fb-retry-1' });
      publishInstagram.mockRejectedValue(new Error('IG down'));
      await service.executePublish(businessId, post.id);

      queue.add.mockClear();
      const result = await service.retryTarget(
        businessId,
        post.id,
        SocialPlatform.instagram,
      );
      expect(result).toEqual({ queued: true });
      expect(queue.add).toHaveBeenCalledWith(
        'publish-post',
        { businessId, postId: post.id },
        expect.objectContaining({ attempts: 3 }),
      );

      const afterReset = await prisma.socialPostTarget.findFirst({
        where: { socialPostId: post.id, platform: SocialPlatform.instagram },
      });
      expect(afterReset!.status).toBe(SocialPostTargetStatus.pending);
      expect(afterReset!.errorMessage).toBeNull();

      publishInstagram.mockResolvedValue({ externalId: 'ig-retry-1' });
      await service.executePublish(businessId, post.id);

      const reloaded = await prisma.socialPost.findUniqueOrThrow({
        where: { id: post.id },
        include: { targets: true },
      });
      expect(reloaded.status).toBe(SocialPostStatus.published);
      const fbTarget = reloaded.targets.find(
        (t) => t.platform === SocialPlatform.facebook,
      )!;
      expect(fbTarget.externalId).toBe('fb-retry-1'); // untouched by the retry
    });
  });

  describe('Published Posts, per-post analytics + boost (UPD-BE-127)', () => {
    it('pullPostAnalytics() calls fetchPostInsights only for a published target whose connector supports it, and stores the real result', async () => {
      const fetchPostInsights = jest.fn().mockResolvedValue({
        reach: 100,
        likes: 10,
        comments: 2,
        shares: 1,
        saves: 3,
        clicks: 0,
      });
      connectors.get.mockImplementation((platform: SocialPlatform) =>
        platform === SocialPlatform.facebook
          ? { publish: publishFacebook, fetchPostInsights }
          : { publish: publishInstagram },
      );
      const post = await service.create(businessId, 'owner-1', {
        caption: 'Analytics post',
        platforms: [SocialPlatform.facebook, SocialPlatform.instagram],
      });
      accounts.getTokens.mockResolvedValue({ accessToken: 'tok' });
      publishFacebook.mockResolvedValue({ externalId: 'fb-analytics-1' });
      publishInstagram.mockResolvedValue({ externalId: 'ig-analytics-1' });
      await service.executePublish(businessId, post.id);

      const analytics = await service.pullPostAnalytics(businessId, post.id);
      expect(fetchPostInsights).toHaveBeenCalledWith(
        { accessToken: 'tok' },
        'fb-analytics-1',
        {},
      );
      expect(analytics).toHaveLength(1); // instagram's connector has no fetchPostInsights here
      expect(analytics[0].reach).toBe(100);
      expect(analytics[0].likes).toBe(10);

      const stored = await service.getPostAnalytics(businessId, post.id);
      expect(stored).toHaveLength(1);
      expect(stored[0].socialPostTarget.platform).toBe(SocialPlatform.facebook);
    });

    it('boostAsAd() rejects a platform target that has not published yet', async () => {
      const post = await service.create(businessId, 'owner-1', {
        caption: 'Not published',
        platforms: [SocialPlatform.facebook],
      });
      await expect(
        service.boostAsAd(businessId, post.id, SocialPlatform.facebook, {
          goal: 'traffic',
          dailyBudget: 10,
        }),
      ).rejects.toBeInstanceOf(AppException);
    });

    it('boostAsAd() rejects a platform with no real ad-provider mapping', async () => {
      const post = await service.create(businessId, 'owner-1', {
        caption: 'Youtube post',
        platforms: [SocialPlatform.youtube],
      });
      connectors.get.mockImplementation(() => ({
        publish: jest.fn().mockResolvedValue({ externalId: 'yt-1' }),
      }));
      accounts.getTokens.mockResolvedValue({ accessToken: 'tok' });
      await service.executePublish(businessId, post.id);

      await expect(
        service.boostAsAd(businessId, post.id, SocialPlatform.youtube, {
          goal: 'traffic',
          dailyBudget: 10,
        }),
      ).rejects.toBeInstanceOf(AppException);
    });

    it('boostAsAd() really hands off to AdCampaignsService.create() with the mapped provider and real post context', async () => {
      connectors.get.mockImplementation((platform: SocialPlatform) =>
        platform === SocialPlatform.facebook
          ? { publish: publishFacebook }
          : { publish: publishInstagram },
      );
      const post = await service.create(businessId, 'owner-1', {
        caption: 'Boost me please this is a long caption to be truncated',
        platforms: [SocialPlatform.facebook],
      });
      accounts.getTokens.mockResolvedValue({ accessToken: 'tok' });
      publishFacebook.mockResolvedValue({ externalId: 'fb-boost-1' });
      await service.executePublish(businessId, post.id);

      const result = await service.boostAsAd(
        businessId,
        post.id,
        SocialPlatform.facebook,
        { goal: 'traffic', dailyBudget: 25 },
      );
      expect(result).toEqual({ id: 'campaign-1', status: 'draft' });
      expect(adCampaigns.create).toHaveBeenCalledTimes(1);
      const [calledBusinessId, calledProvider, calledDto] =
        adCampaigns.create.mock.calls[0];
      expect(calledBusinessId).toBe(businessId);
      expect(calledProvider).toBe('meta_ads');
      expect(calledDto.goal).toBe('traffic');
      expect(calledDto.dailyBudget).toBe(25);
      expect(calledDto.meta).toEqual({
        boostedSocialPostId: post.id,
        externalPostId: 'fb-boost-1',
      });
    });
  });
});
