import { AiContentStudioService } from './ai-content-studio.service';
import { AppException } from '../common/filters/app.exception';
import type { AiInfraService } from '../ai/ai-infra.service';
import type { MediaLibraryService } from './media-library.service';
import type { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import type { SocialCaptionGeneration } from '@prisma/client';

describe('AiContentStudioService (UPD-BE-048)', () => {
  const aiInfra = { complete: jest.fn() };
  const mediaLibrary = { generateImage: jest.fn() };
  const socialCaptionGeneration = {
    create: jest.fn<
      Promise<SocialCaptionGeneration>,
      [{ data: Record<string, unknown> }]
    >(),
    findMany: jest.fn<Promise<SocialCaptionGeneration[]>, [unknown]>(),
  };
  const tenantPrisma = {
    client: { socialCaptionGeneration },
  } as unknown as TenantPrismaService;
  const service = new AiContentStudioService(
    tenantPrisma,
    aiInfra as unknown as AiInfraService,
    mediaLibrary as unknown as MediaLibraryService,
  );

  afterEach(() => jest.clearAllMocks());

  it('generateCaption() builds a real prompt from the topic/tone, trims the result, and persists it to real history', async () => {
    aiInfra.complete.mockResolvedValue('  Come try our new menu today!  ');
    socialCaptionGeneration.create.mockResolvedValue(
      {} as SocialCaptionGeneration,
    );

    const result = await service.generateCaption('biz-1', {
      topic: 'new menu launch',
    });
    expect(result.caption).toBe('Come try our new menu today!');
    expect(aiInfra.complete).toHaveBeenCalledWith(
      'biz-1',
      expect.stringContaining('new menu launch'),
      0,
      'campaign_copy',
    );
    const [{ data }] = socialCaptionGeneration.create.mock.calls[0];
    expect(data.businessId).toBe('biz-1');
    expect(data.topic).toBe('new menu launch');
    expect(data.caption).toBe('Come try our new menu today!');
  });

  it('generateCaption() passes a custom tone through into the real prompt', async () => {
    aiInfra.complete.mockResolvedValue('caption');
    socialCaptionGeneration.create.mockResolvedValue(
      {} as SocialCaptionGeneration,
    );
    await service.generateCaption('biz-1', { topic: 'sale', tone: 'urgent' });
    expect(aiInfra.complete).toHaveBeenCalledWith(
      'biz-1',
      expect.stringContaining('urgent'),
      0,
      'campaign_copy',
    );
  });

  it('generateCaption() surfaces a clean, disclosed AI_UNAVAILABLE error rather than a raw 500 when the AI provider fails', async () => {
    aiInfra.complete.mockRejectedValue(
      new Error('ANTHROPIC_API_KEY is not configured'),
    );
    await expect(
      service.generateCaption('biz-1', { topic: 'anything' }),
    ).rejects.toBeInstanceOf(AppException);
    expect(socialCaptionGeneration.create).not.toHaveBeenCalled();
  });

  it('generateCaption() re-throws a real rate-limit/cost-cap AppException as-is, not masked as AI_UNAVAILABLE', async () => {
    const rateLimitError = new AppException(
      'AI_RATE_LIMITED',
      'Too many requests',
      429,
    );
    aiInfra.complete.mockRejectedValue(rateLimitError);
    await expect(
      service.generateCaption('biz-1', { topic: 'anything' }),
    ).rejects.toBe(rateLimitError);
  });

  it('generateHashtags() parses a real newline-separated AI response into a deduped hashtag list', async () => {
    aiInfra.complete.mockResolvedValue(
      '#NewMenu\n#FoodieFinds\n#newmenu\n#Delicious!\n\n#Today',
    );
    const result = await service.generateHashtags('biz-1', {
      caption: 'Come try our new menu today!',
    });
    expect(result.hashtags).toEqual([
      '#NewMenu',
      '#FoodieFinds',
      '#Delicious',
      '#Today',
    ]);
    expect(aiInfra.complete).toHaveBeenCalledWith(
      'biz-1',
      expect.stringContaining('Come try our new menu today!'),
      0.3,
      'campaign_copy',
    );
  });

  it('generateHashtags() surfaces AI_UNAVAILABLE on provider failure rather than an empty fabricated list', async () => {
    aiInfra.complete.mockRejectedValue(new Error('provider down'));
    await expect(
      service.generateHashtags('biz-1', { caption: 'anything' }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('getCaptionHistory() returns the real stored generations for this business, most recent first', async () => {
    const rows = [{ id: 'gen-1' } as SocialCaptionGeneration];
    socialCaptionGeneration.findMany.mockResolvedValue(rows);
    const result = await service.getCaptionHistory('biz-1');
    expect(result).toBe(rows);
    const [args] = socialCaptionGeneration.findMany.mock.calls[0] as [
      { where: { businessId: string }; orderBy: { createdAt: string } },
    ];
    expect(args.where.businessId).toBe('biz-1');
    expect(args.orderBy.createdAt).toBe('desc');
  });

  it('generateImage() delegates straight to MediaLibraryService — never touches SocialPost', async () => {
    mediaLibrary.generateImage.mockResolvedValue({
      id: 'asset-1',
      source: 'ai_generated',
    });
    const result = await service.generateImage('biz-1', {
      prompt: 'a red bicycle',
    });
    expect(result).toEqual({ id: 'asset-1', source: 'ai_generated' });
    expect(mediaLibrary.generateImage).toHaveBeenCalledWith('biz-1', {
      prompt: 'a red bicycle',
    });
  });
});
