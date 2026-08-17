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
import {
  SocialPlatform,
  SocialPostStatus,
  SocialPostTargetStatus,
} from '../../generated/prisma';

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

      queue as any,
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
    await prisma.socialPostTarget.deleteMany({
      where: { socialPost: { businessId } },
    });
    await prisma.socialPost.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
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
});
