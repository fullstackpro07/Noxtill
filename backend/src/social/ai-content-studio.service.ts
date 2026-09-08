import { HttpStatus, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { MediaLibraryService } from './media-library.service';
import { GenerateCaptionDto, GenerateHashtagsDto } from './dto/ai-content.dto';
import { GenerateMediaImageDto } from './dto/media.dto';
import { AppException } from '../common/filters/app.exception';

const CAPTION_MAX_CHARS = 280;
const CAPTION_HISTORY_LIMIT = 20;

/**
 * AI Content Studio (UPD-BE-048) — a thin orchestration layer over `AiInfraService.complete()`
 * (captions, hashtags) and `MediaLibraryService.generateImage()` (images, itself wrapping
 * `AiInfraService.generateImage()`). Deliberately does nothing more than generate and return
 * content: nothing here ever creates or touches a `SocialPost` — every generated caption/image
 * lands as a draft the caller must explicitly attach to a post via `POST /social/posts`, matching
 * the ticket's "nothing auto-publishes without explicit approval" requirement literally.
 */
@Injectable()
export class AiContentStudioService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly aiInfra: AiInfraService,
    private readonly mediaLibrary: MediaLibraryService,
  ) {}

  /**
   * Generation-history fix — every real caption generated is persisted to
   * `SocialCaptionGeneration` (image generations already have a real history via `MediaAsset`,
   * see `MediaLibraryService.generateImage()`), so the Studio screen can show what was actually
   * generated rather than losing it the moment the response leaves this method.
   */
  async generateCaption(
    businessId: string,
    dto: GenerateCaptionDto,
  ): Promise<{ caption: string }> {
    const prompt = `Write a single social media caption about: "${dto.topic}". Tone: ${dto.tone ?? 'friendly and engaging'}. Keep it under ${CAPTION_MAX_CHARS} characters, no hashtags unless natural, no surrounding quote marks.`;
    let caption: string;
    try {
      caption = await this.aiInfra.complete(
        businessId,
        prompt,
        0,
        'campaign_copy',
      );
    } catch (error) {
      if (error instanceof AppException) throw error; // rate-limit / cost-cap errors already typed
      throw new AppException(
        'AI_UNAVAILABLE',
        'The AI assistant is not available right now — please try again later.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    caption = caption.trim();

    await this.tenantPrisma.client.socialCaptionGeneration.create({
      data: { businessId, topic: dto.topic, tone: dto.tone, caption },
    });

    return { caption };
  }

  /**
   * Hashtag suggester fix — a real AI call (same `AiInfraService.complete()` path, same
   * rate-limit/cost-cap guardrails as caption generation), asked to return a plain newline list so
   * parsing doesn't depend on the model picking a particular delimiter. Never fabricates hashtags
   * client-side; if the AI call fails, the caller sees the same typed `AI_UNAVAILABLE` as caption
   * generation rather than a silently-empty list.
   */
  async generateHashtags(
    businessId: string,
    dto: GenerateHashtagsDto,
  ): Promise<{ hashtags: string[] }> {
    const prompt = `Suggest 6-8 relevant, non-spammy social media hashtags for this caption: "${dto.caption}". Reply with ONLY the hashtags, one per line, each starting with #. No numbering, no commentary.`;
    let raw: string;
    try {
      raw = await this.aiInfra.complete(
        businessId,
        prompt,
        0.3,
        'campaign_copy',
      );
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw new AppException(
        'AI_UNAVAILABLE',
        'The AI assistant is not available right now — please try again later.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const candidates = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => (line.startsWith('#') ? line : `#${line}`))
      .map((line) => line.replace(/[^\w#]/g, ''))
      .filter((tag) => tag.length > 1);

    // Hashtags are case-insensitive on every platform — dedupe on lowercase, keep first-seen casing.
    const seen = new Set<string>();
    const hashtags: string[] = [];
    for (const tag of candidates) {
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      hashtags.push(tag);
    }

    return { hashtags };
  }

  /** Generation-history fix — the real, stored captions behind that history, most recent first. */
  async getCaptionHistory(businessId: string) {
    return this.tenantPrisma.client.socialCaptionGeneration.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: CAPTION_HISTORY_LIMIT,
    });
  }

  generateImage(businessId: string, dto: GenerateMediaImageDto) {
    return this.mediaLibrary.generateImage(businessId, dto);
  }
}
