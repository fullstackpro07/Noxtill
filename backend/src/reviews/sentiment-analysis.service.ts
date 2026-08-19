import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AiInfraService } from '../ai/ai-infra.service';
import {
  ReviewSentimentLabel,
  SENTIMENT_MAX_THEMES,
  SENTIMENT_MIN_REVIEWS,
  SENTIMENT_REVIEW_LOOKBACK,
} from './sentiment-analysis.constants';

interface RawThemeResponse {
  theme: string;
  sentiment: string;
  reviewIndices: number[];
  exampleQuote: string;
}

const VALID_SENTIMENTS: ReviewSentimentLabel[] = [
  'positive',
  'negative',
  'mixed',
];

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Sentiment Analysis (UPD-BE-076): Claude clusters real review text into recurring themes, but
 * every theme's `exampleQuote` is verified — before being stored — to be an actual, verbatim
 * substring of one of the real reviews it claims to summarize. An AI-invented or paraphrased
 * quote never reaches the database; the real review's own text is used instead when verification
 * fails. This mirrors `AiInsightsService`'s "the AI phrases, it never invents the figure"
 * discipline, adapted for quoted text instead of a number.
 */
@Injectable()
export class SentimentAnalysisService {
  private readonly logger = new Logger(SentimentAnalysisService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly aiInfra: AiInfraService,
  ) {}

  list(businessId: string) {
    return this.tenantPrisma.client.reviewSentimentTheme.findMany({
      where: { businessId },
      orderBy: { reviewCount: 'desc' },
    });
  }

  /** Shared by the daily scheduled job and a possible "refresh now" trigger. Returns the number of themes stored. */
  async generateForBusiness(businessId: string): Promise<number> {
    const reviews = await this.tenantPrisma.client.externalReview.findMany({
      where: { businessId, text: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: SENTIMENT_REVIEW_LOOKBACK,
    });
    if (reviews.length < SENTIMENT_MIN_REVIEWS) return 0;

    const themes = await this.clusterThemes(businessId, reviews);
    if (themes.length === 0) return 0;

    await this.tenantPrisma.client.reviewSentimentTheme.deleteMany({
      where: { businessId },
    });
    await this.tenantPrisma.client.reviewSentimentTheme.createMany({
      data: themes.map((t) => ({
        businessId,
        theme: t.theme,
        sentiment: t.sentiment,
        exampleQuote: t.exampleQuote,
        reviewCount: t.reviewCount,
      })),
    });
    return themes.length;
  }

  private async clusterThemes(
    businessId: string,
    reviews: { text: string | null; stars: number }[],
  ): Promise<
    Array<{
      theme: string;
      sentiment: ReviewSentimentLabel;
      exampleQuote: string;
      reviewCount: number;
    }>
  > {
    const numbered = reviews
      .map((r, i) => `[${i}] (${r.stars}★) "${r.text}"`)
      .join('\n');

    const prompt = [
      'Below are real customer reviews for a business, each numbered.',
      numbered,
      `Identify up to ${SENTIMENT_MAX_THEMES} recurring themes across these reviews (e.g. "slow service", "friendly staff", "great prices").`,
      'For each theme, give: a short theme name, its sentiment ("positive", "negative", or "mixed"),',
      'the numeric indices of every review that mentions it, and one exact quote COPIED WORD-FOR-WORD',
      "from one of those reviews' text (never paraphrase or invent a quote).",
      'Reply with ONLY a JSON array, no other text. Example shape:',
      '[{"theme":"Slow service","sentiment":"negative","reviewIndices":[2,5],"exampleQuote":"we waited 40 minutes"}]',
    ].join('\n');

    let raw: string;
    try {
      raw = await this.aiInfra.complete(businessId, prompt);
    } catch (error) {
      this.logger.warn(
        `Sentiment theme clustering failed for business ${businessId}: ${(error as Error).message}`,
      );
      return [];
    }

    const parsed = this.parseThemes(raw, reviews.length);
    if (!parsed) return [];

    return parsed.map((raw) => this.groundTheme(raw, reviews));
  }

  /** Verifies `exampleQuote` is real, verbatim text from a referenced review; falls back to that review's own text otherwise. */
  private groundTheme(
    raw: RawThemeResponse,
    reviews: { text: string | null; stars: number }[],
  ): {
    theme: string;
    sentiment: ReviewSentimentLabel;
    exampleQuote: string;
    reviewCount: number;
  } {
    const referencedTexts = raw.reviewIndices
      .map((i) => reviews[i]?.text)
      .filter((t): t is string => !!t);

    const claimedQuote = normalize(raw.exampleQuote);
    const verified = referencedTexts.find((text) =>
      normalize(text).includes(claimedQuote),
    );

    const exampleQuote =
      verified !== undefined
        ? raw.exampleQuote
        : (referencedTexts[0] ?? raw.exampleQuote).slice(0, 200);

    return {
      theme: raw.theme,
      sentiment: (VALID_SENTIMENTS as string[]).includes(raw.sentiment)
        ? (raw.sentiment as ReviewSentimentLabel)
        : 'mixed',
      exampleQuote,
      reviewCount: referencedTexts.length,
    };
  }

  private parseThemes(
    raw: string,
    reviewCount: number,
  ): RawThemeResponse[] | null {
    const jsonStart = raw.indexOf('[');
    const jsonEnd = raw.lastIndexOf(']');
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) return null;

    try {
      const parsed: unknown = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
      if (!Array.isArray(parsed)) return null;

      const themes: RawThemeResponse[] = [];
      for (const item of parsed) {
        if (
          typeof item !== 'object' ||
          item === null ||
          typeof (item as Record<string, unknown>).theme !== 'string' ||
          typeof (item as Record<string, unknown>).sentiment !== 'string' ||
          typeof (item as Record<string, unknown>).exampleQuote !== 'string' ||
          !Array.isArray((item as Record<string, unknown>).reviewIndices)
        ) {
          continue;
        }
        const candidate = item as RawThemeResponse;
        const validIndices = candidate.reviewIndices.filter(
          (i) => typeof i === 'number' && i >= 0 && i < reviewCount,
        );
        if (validIndices.length === 0) continue;
        themes.push({ ...candidate, reviewIndices: validIndices });
      }
      return themes;
    } catch {
      return null;
    }
  }
}
