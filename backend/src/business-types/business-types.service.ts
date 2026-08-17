import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { AppException } from '../common/filters/app.exception';
import { AiMapBusinessTypeDto } from './dto/ai-map-business-type.dto';

const OTHER_CATEGORY_KEY = 'other';

function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Business type search + AI mapping (BE-069). `aiMap` first asks Claude to
 * match the free-text description against an EXISTING type (cheap, no new
 * row); only when nothing fits does it synthesize a new BusinessType,
 * always flagged `aiGenerated: true` so these are distinguishable from the
 * curated seed set in reporting/moderation later.
 */
@Injectable()
export class BusinessTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiInfra: AiInfraService,
  ) {}

  async search(query?: string) {
    if (!query) {
      return this.prisma.businessType.findMany({ orderBy: { label: 'asc' } });
    }
    return this.prisma.businessType.findMany({
      where: { label: { contains: query } },
      orderBy: { label: 'asc' },
    });
  }

  async aiMap(dto: AiMapBusinessTypeDto) {
    const existing = await this.prisma.businessType.findMany({
      select: { key: true, label: true },
    });

    const prompt = [
      `A new business signed up describing itself as: "${dto.description}".`,
      `Existing business types: ${existing.map((t) => `${t.key} (${t.label})`).join(', ')}.`,
      "If one of these existing types is a good fit, reply with EXACTLY that type's key and nothing else.",
      'If none fit, reply with EXACTLY: NEW: <a short 2-4 word label for this business type>.',
    ].join('\n\n');

    // No businessId: this runs pre-signup, before a business exists to rate-limit/cost-cap against.
    let response: string;
    try {
      response = (await this.aiInfra.complete(undefined, prompt)).trim();
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }
      throw new AppException(
        'AI_UNAVAILABLE',
        'The AI assistant is not available right now — please try again later.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const existingMatch = existing.find((t) => t.key === response);
    if (existingMatch) {
      return this.prisma.businessType.findUniqueOrThrow({
        where: { key: existingMatch.key },
      });
    }

    const newLabel = response.startsWith('NEW:')
      ? response.slice(4).trim()
      : response;
    const key = slugify(newLabel) || `ai_type_${Date.now()}`;

    const otherCategory = await this.prisma.businessCategory.upsert({
      where: { key: OTHER_CATEGORY_KEY },
      create: { key: OTHER_CATEGORY_KEY, name: 'Other' },
      update: {},
    });

    return this.prisma.businessType.upsert({
      where: { key },
      create: {
        key,
        label: newLabel,
        aiGenerated: true,
        categoryId: otherCategory.id,
      },
      update: {},
    });
  }
}
