import { HttpStatus, Injectable } from '@nestjs/common';
import { AiInfraService } from '../ai/ai-infra.service';
import { AppException } from '../common/filters/app.exception';
import { GenerateAdCopyDto } from './dto/generate-ad-copy.dto';

/**
 * Ad Builder's "Generate creative and copy" step. A previous version of this screen faked this
 * entirely client-side — a `setInterval` fake progress bar, then a fixed template string with the
 * product name and price dropped in, presented as if it were AI output. This is the real thing,
 * the same `AiInfraService.complete()` path (and the same rate-limit/cost-cap guardrails) already
 * used for social caption generation.
 */
@Injectable()
export class AdCopyGeneratorService {
  constructor(private readonly aiInfra: AiInfraService) {}

  async generate(businessId: string, dto: GenerateAdCopyDto): Promise<{ headline: string; body: string }> {
    const prompt = `Write ad copy for a paid social/search ad promoting this product or service: "${dto.productName}". Campaign goal: ${dto.goal ?? 'Sales'}. Reply with exactly two lines: the first line is the headline (under 40 characters), the second line is the body text (under 150 characters). No labels, no quote marks, no extra commentary.`;
    let raw: string;
    try {
      raw = await this.aiInfra.complete(businessId, prompt, 0.4, 'campaign_copy');
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw new AppException(
        'AI_UNAVAILABLE',
        'The AI assistant is not available right now — please try again later.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const lines = raw.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return {
      headline: lines[0] || dto.productName,
      body: lines.slice(1).join(' ') || '',
    };
  }
}
