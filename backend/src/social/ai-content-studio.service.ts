import { HttpStatus, Injectable } from '@nestjs/common';
import { AiInfraService } from '../ai/ai-infra.service';
import { MediaLibraryService } from './media-library.service';
import { GenerateCaptionDto } from './dto/ai-content.dto';
import { GenerateMediaImageDto } from './dto/media.dto';
import { AppException } from '../common/filters/app.exception';

const CAPTION_MAX_CHARS = 280;

/**
 * AI Content Studio (UPD-BE-048) — a thin orchestration layer over `AiInfraService.complete()`
 * (captions) and `MediaLibraryService.generateImage()` (images, itself wrapping
 * `AiInfraService.generateImage()`). Deliberately does nothing more than generate and return
 * content: nothing here ever creates or touches a `SocialPost` — every generated caption/image
 * lands as a draft the caller must explicitly attach to a post via `POST /social/posts`, matching
 * the ticket's "nothing auto-publishes without explicit approval" requirement literally.
 */
@Injectable()
export class AiContentStudioService {
  constructor(
    private readonly aiInfra: AiInfraService,
    private readonly mediaLibrary: MediaLibraryService,
  ) {}

  async generateCaption(
    businessId: string,
    dto: GenerateCaptionDto,
  ): Promise<{ caption: string }> {
    const prompt = `Write a single social media caption about: "${dto.topic}". Tone: ${dto.tone ?? 'friendly and engaging'}. Keep it under ${CAPTION_MAX_CHARS} characters, no hashtags unless natural, no surrounding quote marks.`;
    let caption: string;
    try {
      caption = await this.aiInfra.complete(businessId, prompt);
    } catch (error) {
      if (error instanceof AppException) throw error; // rate-limit / cost-cap errors already typed
      throw new AppException(
        'AI_UNAVAILABLE',
        'The AI assistant is not available right now — please try again later.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { caption: caption.trim() };
  }

  generateImage(businessId: string, dto: GenerateMediaImageDto) {
    return this.mediaLibrary.generateImage(businessId, dto);
  }
}
