import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { AiInfraService } from '../ai/ai-infra.service';
import { MasterListingService } from '../listings/master-listing.service';
import { CreateTrackedKeywordDto } from './dto/create-tracked-keyword.dto';
import { BulkAddKeywordsDto } from './dto/bulk-add-keywords.dto';
import { SuggestKeywordsDto } from './dto/suggest-keywords.dto';
import {
  MARKETING_ERROR_CODES,
  MAX_TRACKED_KEYWORDS,
} from './marketing.constants';
import { KeywordRankProcessor } from './jobs/keyword-rank.processor';

const HISTORY_CHECKS = 12;
const SUGGESTION_COUNT = 10;

/** Keyword rank tracking (new, BE-063 extension) — real CRUD + a pluggable SERP-rank provider. */
@Injectable()
export class KeywordsService {
  private readonly logger = new Logger(KeywordsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly rankProcessor: KeywordRankProcessor,
    private readonly aiInfra: AiInfraService,
    private readonly masterListing: MasterListingService,
  ) {}

  async list() {
    const keywords = await this.tenantPrisma.client.trackedKeyword.findMany({
      orderBy: { createdAt: 'asc' },
      include: { snapshots: { orderBy: { capturedAt: 'desc' }, take: 2 } },
    });

    return keywords.map((k) => ({
      id: k.id,
      keyword: k.keyword,
      latestRank: k.snapshots[0]?.rank ?? null,
      previousRank: k.snapshots[1]?.rank ?? null,
      topResultTitle: k.snapshots[0]?.topResultTitle ?? null,
      searchInterest: k.snapshots[0]?.searchInterest ?? null,
      lastCheckedAt: k.snapshots[0]?.capturedAt.toISOString() ?? null,
    }));
  }

  async create(businessId: string, dto: CreateTrackedKeywordDto) {
    const count = await this.tenantPrisma.client.trackedKeyword.count();
    if (count >= MAX_TRACKED_KEYWORDS) {
      throw new AppException(
        MARKETING_ERROR_CODES.KEYWORD_LIMIT_REACHED,
        `You can track at most ${MAX_TRACKED_KEYWORDS} keywords`,
        HttpStatus.FORBIDDEN,
      );
    }

    const existing = await this.tenantPrisma.client.trackedKeyword.findFirst({
      where: { keyword: dto.keyword },
    });
    if (existing) {
      throw new AppException(
        MARKETING_ERROR_CODES.KEYWORD_ALREADY_TRACKED,
        'This keyword is already being tracked',
        HttpStatus.CONFLICT,
      );
    }

    return this.tenantPrisma.client.trackedKeyword.create({
      data: { businessId, keyword: dto.keyword },
    });
  }

  /**
   * Bulk import (UPD-BE-128) — real partial-success semantics: adds as many as fit under
   * `MAX_TRACKED_KEYWORDS`, skips ones already tracked or duplicated within the same request, and
   * reports exactly what happened rather than an all-or-nothing failure.
   */
  async bulkCreate(businessId: string, dto: BulkAddKeywordsDto) {
    const existingCount = await this.tenantPrisma.client.trackedKeyword.count();
    const existingKeywords = new Set(
      (
        await this.tenantPrisma.client.trackedKeyword.findMany({
          select: { keyword: true },
        })
      ).map((k) => k.keyword),
    );

    const created: { keyword: string }[] = [];
    const skipped: { keyword: string; reason: string }[] = [];
    const seenThisRequest = new Set<string>();

    for (const keyword of dto.keywords) {
      const trimmed = keyword.trim();
      if (existingKeywords.has(trimmed) || seenThisRequest.has(trimmed)) {
        skipped.push({ keyword: trimmed, reason: 'already_tracked' });
        continue;
      }
      if (existingCount + created.length >= MAX_TRACKED_KEYWORDS) {
        skipped.push({ keyword: trimmed, reason: 'limit_reached' });
        continue;
      }
      seenThisRequest.add(trimmed);
      created.push({ keyword: trimmed });
    }

    if (created.length > 0) {
      await this.tenantPrisma.client.trackedKeyword.createMany({
        data: created.map((c) => ({ businessId, keyword: c.keyword })),
      });
    }

    return { created: created.map((c) => c.keyword), skipped };
  }

  /**
   * AI keyword suggestions (UPD-BE-128) — grounded in the business's own real name and listed
   * categories (`MasterListingService`, same cross-module reuse pattern as Visibility Score), plus
   * an optional seed topic. Never fabricates search-volume/difficulty figures — this app has no real
   * data source for those, so the response is deliberately just candidate keyword strings.
   */
  async suggest(
    businessId: string,
    dto: SuggestKeywordsDto,
  ): Promise<{ suggestions: string[] }> {
    const listing = await this.masterListing.find(businessId);
    const categories = (listing?.categories as string[] | undefined) ?? [];
    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
    });

    const context = [
      `Business name: ${business.name}`,
      categories.length > 0 ? `Categories: ${categories.join(', ')}` : null,
      dto.seedTopic ? `Focus topic: ${dto.seedTopic}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const prompt = [
      `Suggest ${SUGGESTION_COUNT} local-search keyword phrases this business should track its Google ranking for.`,
      context,
      'Prefer realistic, specific local-search phrases a customer would actually type (e.g. "best pizza near me"), not generic single words.',
      'Reply with ONLY a JSON array of strings, no other text.',
    ].join('\n\n');

    let raw: string;
    try {
      raw = await this.aiInfra.complete(
        businessId,
        prompt,
        0.4,
        'keyword_suggestions',
      );
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw new AppException(
        'AI_UNAVAILABLE',
        'The AI assistant is not available right now — please try again later.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const suggestions = this.parseArray(raw);
    if (!suggestions) {
      this.logger.warn(
        `Keyword suggestion response could not be parsed for business ${businessId}`,
      );
      return { suggestions: [] };
    }
    return { suggestions };
  }

  private parseArray(raw: string): string[] | null {
    const jsonStart = raw.indexOf('[');
    const jsonEnd = raw.lastIndexOf(']');
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) return null;
    try {
      const parsed: unknown = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
      if (
        !Array.isArray(parsed) ||
        !parsed.every((item) => typeof item === 'string')
      ) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  async remove(id: string) {
    const existing = await this.tenantPrisma.client.trackedKeyword.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Tracked keyword not found');
    }
    await this.tenantPrisma.client.trackedKeyword.delete({ where: { id } });
    return { success: true };
  }

  /** Last 12 checks, oldest first. */
  async history(id: string) {
    const keyword = await this.tenantPrisma.client.trackedKeyword.findUnique({
      where: { id },
    });
    if (!keyword) {
      throw new NotFoundException('Tracked keyword not found');
    }

    const snapshots =
      await this.tenantPrisma.client.keywordRankSnapshot.findMany({
        where: { keywordId: id },
        orderBy: { capturedAt: 'desc' },
        take: HISTORY_CHECKS,
      });

    return snapshots
      .reverse()
      .map((s) => ({ rank: s.rank, capturedAt: s.capturedAt.toISOString() }));
  }

  /** "Check now" — the weekly job does the same thing, this runs it synchronously for one keyword on demand. */
  async triggerCheck(businessId: string, id: string) {
    const keyword = await this.tenantPrisma.client.trackedKeyword.findUnique({
      where: { id },
    });
    if (!keyword) {
      throw new NotFoundException('Tracked keyword not found');
    }

    await this.rankProcessor.checkOne(businessId, keyword.id, keyword.keyword);
    return this.history(id);
  }
}
