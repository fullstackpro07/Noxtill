import { AiContentStudioService } from './ai-content-studio.service';
import { AppException } from '../common/filters/app.exception';
import type { AiInfraService } from '../ai/ai-infra.service';
import type { MediaLibraryService } from './media-library.service';

describe('AiContentStudioService (UPD-BE-048)', () => {
  const aiInfra = { complete: jest.fn() };
  const mediaLibrary = { generateImage: jest.fn() };
  const service = new AiContentStudioService(
    aiInfra as unknown as AiInfraService,
    mediaLibrary as unknown as MediaLibraryService,
  );

  afterEach(() => jest.clearAllMocks());

  it('generateCaption() builds a real prompt from the topic/tone and trims the result', async () => {
    aiInfra.complete.mockResolvedValue('  Come try our new menu today!  ');

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
  });

  it('generateCaption() passes a custom tone through into the real prompt', async () => {
    aiInfra.complete.mockResolvedValue('caption');
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
