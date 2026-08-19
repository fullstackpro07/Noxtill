import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { AiInfraService } from '../ai/ai-infra.service';
import { ListingSyncService } from '../listings/listing-sync.service';
import { CompetitiveSettingsService } from './competitive-settings.service';
import { CompetitiveOpportunityKind } from '@prisma/client';

interface GapFact {
  kind: CompetitiveOpportunityKind;
  evidence: string;
  evidenceRef?: string;
}

/**
 * Opportunities + AI Recommendations (UPD-BE-054): every gap in `gatherGaps()` is computed
 * deterministically from real data BEFORE any AI call — mirrors `AiInsightsService`'s
 * "never fabricate" discipline exactly. `recommendation` is the AI-phrased action built ONLY from
 * that evidence; unlike `AiInsight` (which degrades its observation to the raw source figure if AI
 * fails), a failed phrasing here leaves `recommendation` null rather than duplicating the evidence
 * text — `/competitive/opportunities` already exposes the evidence on its own, so
 * `/competitive/recommendations` stays a clean "real AI action available" subset.
 */
@Injectable()
export class CompetitiveOpportunitiesService {
  private readonly logger = new Logger(CompetitiveOpportunitiesService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly aiInfra: AiInfraService,
    private readonly settings: CompetitiveSettingsService,
    private readonly listingSync: ListingSyncService,
  ) {}

  list(businessId: string) {
    return this.tenantPrisma.client.competitiveOpportunity.findMany({
      where: { businessId, dismissed: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listRecommendations(businessId: string) {
    const opportunities =
      await this.tenantPrisma.client.competitiveOpportunity.findMany({
        where: { businessId, dismissed: false, recommendation: { not: null } },
        orderBy: { createdAt: 'desc' },
      });
    return opportunities.map((opportunity) => ({
      id: opportunity.id,
      kind: opportunity.kind,
      evidence: opportunity.evidence,
      evidenceRef: opportunity.evidenceRef,
      recommendation: opportunity.recommendation,
    }));
  }

  async dismiss(businessId: string, id: string) {
    const existing =
      await this.tenantPrisma.client.competitiveOpportunity.findUnique({
        where: { id },
      });
    if (!existing || existing.businessId !== businessId) {
      throw new NotFoundException('Opportunity not found');
    }
    return this.tenantPrisma.client.competitiveOpportunity.update({
      where: { id },
      data: { dismissed: true },
    });
  }

  /**
   * Shared by the weekly job and the manual "refresh now" endpoint. Replaces every currently
   * non-dismissed auto-generated opportunity with a fresh gap-analysis pass — a gap that's since
   * been fixed simply doesn't reappear. Previously-dismissed rows are left untouched, so
   * acknowledging a gap keeps it hidden even if the underlying fact is still technically true.
   */
  async generateForBusiness(businessId: string): Promise<number> {
    const facts = await this.gatherGaps(businessId);

    await this.tenantPrisma.client.competitiveOpportunity.deleteMany({
      where: { businessId, dismissed: false },
    });
    if (facts.length === 0) return 0;

    let recommendations: (string | null)[];
    try {
      recommendations = await this.phraseRecommendations(businessId, facts);
    } catch (error) {
      this.logger.warn(
        `Competitive recommendation phrasing failed for business ${businessId}: ${(error as Error).message}`,
      );
      recommendations = facts.map(() => null);
    }

    await this.tenantPrisma.client.competitiveOpportunity.createMany({
      data: facts.map((fact, i) => ({
        businessId,
        kind: fact.kind,
        evidence: fact.evidence,
        evidenceRef: fact.evidenceRef,
        recommendation: recommendations[i],
      })),
    });

    return facts.length;
  }

  private async phraseRecommendations(
    businessId: string,
    facts: GapFact[],
  ): Promise<string[]> {
    const factLines = facts
      .map((f, i) => `${i + 1}. [${f.kind}] ${f.evidence}`)
      .join('\n');

    const prompt = [
      'You write one short, actionable recommendation per numbered visibility gap a system has already detected.',
      'Here are the numbered gaps:',
      factLines,
      'For each numbered gap, write exactly one short, plain-language sentence (max ~25 words) recommending a concrete next action.',
      'Use ONLY the facts already given — never introduce a new number, date, or figure of your own.',
      'Reply with ONLY a JSON array of strings, one per gap, in the same order. No other text.',
      'Example shape: ["Recommendation for gap 1.", "Recommendation for gap 2."]',
    ].join('\n');

    const raw = await this.aiInfra.complete(businessId, prompt);
    const parsed = this.parseArray(raw, facts.length);
    if (!parsed) {
      throw new AppException(
        'COMPETITIVE_RECOMMENDATION_PARSE_FAILED',
        'The AI response could not be parsed as recommendation text.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return parsed;
  }

  private parseArray(raw: string, expectedLength: number): string[] | null {
    const jsonStart = raw.indexOf('[');
    const jsonEnd = raw.lastIndexOf(']');
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) return null;

    try {
      const parsed: unknown = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
      if (
        !Array.isArray(parsed) ||
        parsed.length !== expectedLength ||
        !parsed.every(
          (item) => typeof item === 'string' && item.trim().length > 0,
        )
      ) {
        return null;
      }
      return parsed as string[];
    } catch {
      return null;
    }
  }

  /** Each category can contribute zero or more gaps — never a fabricated one. */
  async gatherGaps(businessId: string): Promise<GapFact[]> {
    const settings = await this.settings.get(businessId);
    const [keywordGaps, reviewGaps, listingGaps, socialGaps] =
      await Promise.all([
        this.keywordGaps(businessId, settings.keywordRankAlertThreshold),
        this.reviewGaps(businessId, settings.reviewFreshnessAlertDays),
        this.listingGaps(businessId),
        this.socialGaps(businessId),
      ]);
    return [...keywordGaps, ...reviewGaps, ...listingGaps, ...socialGaps];
  }

  private async keywordGaps(
    businessId: string,
    threshold: number,
  ): Promise<GapFact[]> {
    const keywords = await this.tenantPrisma.client.trackedKeyword.findMany({
      where: { businessId },
      include: { snapshots: { orderBy: { capturedAt: 'desc' }, take: 1 } },
    });
    return keywords
      .filter((keyword) => {
        const rank = keyword.snapshots[0]?.rank;
        return rank == null || rank > threshold;
      })
      .map((keyword) => {
        const rank = keyword.snapshots[0]?.rank;
        return {
          kind: 'keyword',
          evidence:
            rank == null
              ? `"${keyword.keyword}" isn't ranking in the checked results at all`
              : `"${keyword.keyword}" ranks #${rank}, outside your target top ${threshold}`,
          evidenceRef: keyword.keyword,
        };
      });
  }

  private async reviewGaps(
    businessId: string,
    freshnessDays: number,
  ): Promise<GapFact[]> {
    const gaps: GapFact[] = [];

    const unreplied = await this.tenantPrisma.client.externalReview.count({
      where: { businessId, repliedAt: null },
    });
    if (unreplied > 0) {
      gaps.push({
        kind: 'review',
        evidence: `${unreplied} review(s) still awaiting a reply`,
      });
    }

    const latest = await this.tenantPrisma.client.externalReview.findFirst({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
    const daysSince = latest
      ? (Date.now() - latest.createdAt.getTime()) / (24 * 60 * 60 * 1000)
      : null;
    if (daysSince === null || daysSince > freshnessDays) {
      gaps.push({
        kind: 'review',
        evidence:
          daysSince === null
            ? 'No reviews recorded yet'
            : `No new review in ${Math.floor(daysSince)} days`,
      });
    }
    return gaps;
  }

  private async listingGaps(businessId: string): Promise<GapFact[]> {
    const [health, citations] = await Promise.all([
      this.listingSync.health(businessId),
      this.listingSync.citationAudit(businessId),
    ]);
    const gaps: GapFact[] = [];

    if (
      health.totalProviders > 0 &&
      health.connectedProviders.length < health.totalProviders
    ) {
      gaps.push({
        kind: 'listing',
        evidence: `Connected to ${health.connectedProviders.length} of ${health.totalProviders} listing directories`,
      });
    }

    for (const citation of citations) {
      if (!citation.matches) {
        gaps.push({
          kind: 'listing',
          evidence: `${citation.provider} listing is out of sync on: ${citation.mismatchedFields.join(', ')}`,
          evidenceRef: citation.provider,
        });
      }
    }
    return gaps;
  }

  private async socialGaps(businessId: string): Promise<GapFact[]> {
    const accounts = await this.tenantPrisma.client.socialAccount.findMany({
      where: { businessId, status: 'connected' },
    });
    if (accounts.length === 0) return [];

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const activeSnapshots =
      await this.tenantPrisma.client.socialAnalyticsSnapshot.findMany({
        where: { businessId, date: { gte: since } },
        distinct: ['platform'],
        select: { platform: true },
      });
    const activePlatforms = new Set(
      activeSnapshots.map((snapshot) => snapshot.platform),
    );

    return accounts
      .filter((account) => !activePlatforms.has(account.platform))
      .map((account) => ({
        kind: 'social',
        evidence: `${account.platform} is connected but has no activity in the last 30 days`,
        evidenceRef: account.platform,
      }));
  }
}
