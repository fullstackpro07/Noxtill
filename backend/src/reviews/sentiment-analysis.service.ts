import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AiInfraService } from '../ai/ai-infra.service';
import {
  ReviewSentimentLabel,
  SENTIMENT_MAX_THEMES,
  SENTIMENT_MIN_REVIEWS,
  SENTIMENT_REVIEW_LOOKBACK,
} from './sentiment-analysis.constants';
import { ReviewSentimentSource } from '@prisma/client';

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

  list(businessId: string, source: ReviewSentimentSource = 'public_review') {
    return this.tenantPrisma.client.reviewSentimentTheme.findMany({
      where: { businessId, source },
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

    return this.clusterAndStore(businessId, 'public_review', reviews);
  }

  /**
   * Private Reviews depth fix (UPD-INT-008) — the same real clustering pipeline, but reading real
   * `PrivateFeedback.message` text instead of public review text, stored under the distinct
   * `private_feedback` source so it can never overwrite or be conflated with public review themes.
   */
  async generateComplaintThemesForBusiness(
    businessId: string,
  ): Promise<number> {
    const feedback = await this.tenantPrisma.client.privateFeedback.findMany({
      where: { businessId, message: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: SENTIMENT_REVIEW_LOOKBACK,
    });
    if (feedback.length < SENTIMENT_MIN_REVIEWS) return 0;

    const asReviews = feedback.map((f) => ({
      text: f.message,
      stars: f.stars,
    }));
    return this.clusterAndStore(businessId, 'private_feedback', asReviews);
  }

  private async clusterAndStore(
    businessId: string,
    source: ReviewSentimentSource,
    reviews: { text: string | null; stars: number }[],
  ): Promise<number> {
    const themes = await this.clusterThemes(businessId, reviews, source);
    if (themes.length === 0) return 0;

    // Trend-arrows depth fix — snapshot the previous run's counts (by normalized theme text)
    // before they're overwritten, so each new row can carry a real previous-vs-current comparison.
    const previousThemes =
      await this.tenantPrisma.client.reviewSentimentTheme.findMany({
        where: { businessId, source },
        select: { theme: true, reviewCount: true },
      });
    const previousCountByTheme = new Map(
      previousThemes.map((t) => [normalize(t.theme), t.reviewCount]),
    );

    await this.tenantPrisma.client.reviewSentimentTheme.deleteMany({
      where: { businessId, source },
    });
    await this.tenantPrisma.client.reviewSentimentTheme.createMany({
      data: themes.map((t) => ({
        businessId,
        source,
        theme: t.theme,
        sentiment: t.sentiment,
        exampleQuote: t.exampleQuote,
        reviewCount: t.reviewCount,
        previousReviewCount:
          previousCountByTheme.get(normalize(t.theme)) ?? null,
      })),
    });
    return themes.length;
  }

  private async clusterThemes(
    businessId: string,
    reviews: { text: string | null; stars: number }[],
    source: ReviewSentimentSource = 'public_review',
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

    // Private Reviews depth fix — a complaint-ticket message is a different corpus from a public
    // review (privately submitted, skews negative, no public-facing tone), so the prompt names it
    // accurately rather than reusing "reviews" language that would bias the AI's read of them.
    const corpusLabel =
      source === 'private_feedback'
        ? 'real private customer feedback messages (submitted privately, not posted publicly)'
        : 'real public customer reviews';

    const prompt = [
      `Below are ${corpusLabel} for a business, each numbered.`,
      numbered,
      `Identify up to ${SENTIMENT_MAX_THEMES} recurring themes across these (e.g. "slow service", "friendly staff", "great prices").`,
      'For each theme, give: a short theme name, its sentiment ("positive", "negative", or "mixed"),',
      'the numeric indices of every entry that mentions it, and one exact quote COPIED WORD-FOR-WORD',
      'from one of those entries (never paraphrase or invent a quote).',
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
