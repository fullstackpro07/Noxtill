import { HttpStatus, Injectable } from '@nestjs/common';
import { SeoContentBriefStatus, SeoContentFormat } from '@prisma/client';
import { AiInfraService } from '../ai/ai-infra.service';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { normalizePageUrl } from './seo-on-page.service';
import type { SeoAuditPage } from './seo-site-audit.util';
import {
  assertSeoAiDraftsAllowed,
  seoAiComplete,
  seoRules,
} from './seo-rules.util';

export const SEO_CONTENT_ERROR_CODES = {
  NOT_FOUND: 'SEO_CONTENT_BRIEF_NOT_FOUND',
  KEYWORD_NOT_FOUND: 'SEO_CONTENT_KEYWORD_NOT_FOUND',
  DUPLICATE: 'SEO_CONTENT_DUPLICATE_INTENT',
  INVALID_TRANSITION: 'SEO_CONTENT_INVALID_TRANSITION',
  NOTE_REQUIRED: 'SEO_CONTENT_NOTE_REQUIRED',
  DRAFT_REQUIRED: 'SEO_CONTENT_DRAFT_REQUIRED',
  AI_INVALID: 'SEO_CONTENT_AI_INVALID',
} as const;

/** Thresholds come from Settings → SEO Autopilot (`seoRules`); defaults 10 and 5. */

export type OpportunityKind = 'new_page' | 'missing_page' | 'improve';

const ACTIVE: SeoContentBriefStatus[] = [
  SeoContentBriefStatus.brief,
  SeoContentBriefStatus.drafting,
  SeoContentBriefStatus.approval_required,
  SeoContentBriefStatus.approved,
];
const TRANSITIONS: Partial<
  Record<SeoContentBriefStatus, SeoContentBriefStatus[]>
> = {
  brief: [SeoContentBriefStatus.drafting, SeoContentBriefStatus.dismissed],
  drafting: [
    SeoContentBriefStatus.approval_required,
    SeoContentBriefStatus.dismissed,
  ],
  approval_required: [
    SeoContentBriefStatus.approved,
    SeoContentBriefStatus.drafting,
    SeoContentBriefStatus.dismissed,
  ],
  approved: [SeoContentBriefStatus.dismissed],
};

export interface BriefInput {
  keywordId?: string | null;
  topic: string;
  intent?: string | null;
  audience?: string | null;
  format?: SeoContentFormat;
  outline?: string[];
  questions?: string[];
  internalLinks?: string[];
  sourceNotes?: string | null;
  strategyNote?: string | null;
  dueAt?: string | null;
  assigneeUserId?: string | null;
}

const strings = (value: unknown, max = 30): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, max)
    : [];

/**
 * Content SEO (SEO Autopilot screen 6). Opportunities are derived live from tracked keywords, their
 * rank snapshots, the latest site crawl and existing briefs — each with its evidence, never a made-up
 * score or search volume. Briefs and drafts are edited here; the page itself is published by the
 * merchant on their own site and confirmed live by a later crawl. Traffic is not tracked.
 */
@Injectable()
export class SeoContentService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly ai: AiInfraService,
  ) {}

  private get db() {
    return this.tenantPrisma.client;
  }

  private async crawledPages(businessId: string) {
    const run = await this.db.seoAuditRun.findFirst({
      where: { businessId, status: { in: ['completed', 'partial'] } },
      orderBy: { startedAt: 'desc' },
      select: { id: true, finishedAt: true, pages: true },
    });
    const pages = Array.isArray(run?.pages)
      ? (run.pages as unknown as SeoAuditPage[]).filter(
          (page) => page && typeof page.url === 'string',
        )
      : [];
    return { run, pages };
  }

  private async keywordsWithRanks(businessId: string) {
    return this.db.trackedKeyword.findMany({
      where: { businessId },
      orderBy: { createdAt: 'asc' },
      include: {
        snapshots: {
          orderBy: { capturedAt: 'desc' },
          take: 1,
          select: { rank: true, searchInterest: true, capturedAt: true },
        },
      },
    });
  }

  async opportunities(businessId: string) {
    const rules = await seoRules(this.tenantPrisma, businessId);
    const [keywords, { run, pages }, briefs, dismissals] = await Promise.all([
      this.keywordsWithRanks(businessId),
      this.crawledPages(businessId),
      this.db.seoContentBrief.findMany({
        where: { businessId, status: { not: SeoContentBriefStatus.dismissed } },
        select: { id: true, keywordId: true, status: true },
      }),
      this.db.seoContentDismissal.findMany({
        where: { businessId },
        select: { keywordId: true, kind: true, reason: true },
      }),
    ]);
    const pageByKey = new Map(
      pages.map((page) => [normalizePageUrl(page.url), page]),
    );
    const rows = keywords.map((keyword) => {
      const latest = keyword.snapshots[0] ?? null;
      const target = keyword.targetPageUrl
        ? pageByKey.get(normalizePageUrl(keyword.targetPageUrl))
        : undefined;
      let kind: OpportunityKind | null = null;
      let evidence = '';
      if (!keyword.targetPageUrl) {
        kind = 'new_page';
        evidence = 'No page on your site is mapped to this keyword.';
      } else if (run && (!target || target.statusCode >= 400)) {
        kind = 'missing_page';
        evidence = target
          ? `The mapped page returned HTTP ${target.statusCode} in the latest site audit.`
          : 'The mapped page was not found in the latest site audit.';
      } else if (
        latest &&
        (latest.rank === null || latest.rank > rules.improveBelowRank)
      ) {
        kind = 'improve';
        evidence =
          latest.rank === null
            ? 'Not found in the checked search results on the last rank check.'
            : `Ranked #${latest.rank} on the last rank check.`;
      }
      const brief = briefs.find((row) => row.keywordId === keyword.id) ?? null;
      const dismissal =
        kind &&
        dismissals.find(
          (row) => row.keywordId === keyword.id && row.kind === kind,
        );
      return {
        keywordId: keyword.id,
        keyword: keyword.keyword,
        intent: keyword.intent,
        targetPageUrl: keyword.targetPageUrl,
        kind,
        evidence,
        coverage: brief
          ? ('brief' as const)
          : keyword.targetPageUrl && target && target.statusCode < 400
            ? ('page' as const)
            : ('none' as const),
        latestRank: latest?.rank ?? null,
        rankCheckedAt: latest?.capturedAt ?? null,
        /** Google Trends relative interest (0–100), not a search volume. */
        searchInterest: latest?.searchInterest ?? null,
        /** Rough effort by kind — a new page is more work than improving one. */
        effort:
          kind === 'new_page'
            ? 'high'
            : kind === 'improve'
              ? 'medium'
              : kind
                ? 'medium'
                : null,
        suggestedFormat:
          keyword.intent === 'local'
            ? SeoContentFormat.location_page
            : keyword.intent === 'transactional' ||
                keyword.intent === 'commercial'
              ? SeoContentFormat.landing_page
              : SeoContentFormat.blog_post,
        briefId: brief?.id ?? null,
        briefStatus: brief?.status ?? null,
        dismissed: dismissal ? { reason: dismissal.reason } : null,
      };
    });
    return {
      crawlFinishedAt: run?.finishedAt ?? null,
      opportunities: rows.filter((row) => row.kind !== null),
    };
  }

  async refreshQueue(businessId: string) {
    const rules = await seoRules(this.tenantPrisma, businessId);
    const published = await this.db.seoContentBrief.findMany({
      where: {
        businessId,
        status: SeoContentBriefStatus.published,
        keywordId: { not: null },
      },
      include: {
        keyword: {
          select: {
            keyword: true,
            snapshots: {
              orderBy: { capturedAt: 'desc' },
              take: 1,
              select: { rank: true, capturedAt: true },
            },
          },
        },
      },
      orderBy: { publishedAt: 'desc' },
    });
    return published.map((brief) => {
      const latest = brief.keyword?.snapshots[0] ?? null;
      const current = latest?.rank ?? null;
      let refreshReason: string | null = null;
      if (brief.baselineRank !== null && latest) {
        if (current === null) {
          refreshReason = `Was #${brief.baselineRank} when published; not found in the latest rank check.`;
        } else if (current - brief.baselineRank >= rules.refreshDropPositions) {
          refreshReason = `Dropped from #${brief.baselineRank} to #${current} since publishing.`;
        }
      }
      return {
        briefId: brief.id,
        topic: brief.topic,
        keyword: brief.keyword?.keyword ?? brief.keywordText,
        publishedUrl: brief.publishedUrl,
        publishedAt: brief.publishedAt,
        liveConfirmedAt: brief.liveConfirmedAt,
        baselineRank: brief.baselineRank,
        currentRank: current,
        rankCheckedAt: latest?.capturedAt ?? null,
        refreshReason,
      };
    });
  }

  async summary(businessId: string) {
    const [opps, counts, refresh, rules] = await Promise.all([
      this.opportunities(businessId),
      this.db.seoContentBrief.groupBy({
        by: ['status'],
        where: { businessId },
        _count: { _all: true },
      }),
      this.refreshQueue(businessId),
      seoRules(this.tenantPrisma, businessId),
    ]);
    const count = (status: SeoContentBriefStatus) =>
      counts.find((row) => row.status === status)?._count._all ?? 0;
    const open = opps.opportunities.filter(
      (row) => !row.dismissed && !row.briefId,
    );
    return {
      openOpportunities: open.length,
      briefsReady: count(SeoContentBriefStatus.brief),
      drafts:
        count(SeoContentBriefStatus.drafting) +
        count(SeoContentBriefStatus.approval_required) +
        count(SeoContentBriefStatus.approved),
      refreshDue: refresh.filter((row) => row.refreshReason).length,
      publishedMonitoring: count(SeoContentBriefStatus.published),
      contentGaps: open.filter((row) => row.kind === 'new_page').length,
      rules: {
        improveBelowRank: rules.improveBelowRank,
        refreshDropPositions: rules.refreshDropPositions,
      },
    };
  }

  async listBriefs(businessId: string) {
    return this.db.seoContentBrief.findMany({
      where: { businessId },
      orderBy: [{ updatedAt: 'desc' }],
      take: 300,
    });
  }

  private async findOrThrow(businessId: string, id: string) {
    const brief = await this.db.seoContentBrief.findFirst({
      where: { id, businessId },
    });
    if (!brief) {
      throw new AppException(
        SEO_CONTENT_ERROR_CODES.NOT_FOUND,
        'Content brief was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return brief;
  }

  private async audit(
    businessId: string,
    briefId: string,
    action: string,
    actorUserId: string | null,
    note?: string | null,
  ) {
    await this.db.seoContentBriefAudit.create({
      data: { businessId, briefId, action, actorUserId, note: note ?? null },
    });
  }

  async createBrief(
    businessId: string,
    actorUserId: string,
    input: BriefInput,
    source: 'manual' | 'ai' = 'manual',
  ) {
    let keywordText: string | null = null;
    if (input.keywordId) {
      const keyword = await this.db.trackedKeyword.findFirst({
        where: { id: input.keywordId, businessId },
        select: { keyword: true },
      });
      if (!keyword) {
        throw new AppException(
          SEO_CONTENT_ERROR_CODES.KEYWORD_NOT_FOUND,
          'Keyword was not found.',
          HttpStatus.NOT_FOUND,
        );
      }
      keywordText = keyword.keyword;
      const existing = await this.db.seoContentBrief.findFirst({
        where: {
          businessId,
          keywordId: input.keywordId,
          status: { in: [...ACTIVE, SeoContentBriefStatus.published] },
        },
        select: { topic: true },
      });
      if (existing && !input.strategyNote?.trim()) {
        throw new AppException(
          SEO_CONTENT_ERROR_CODES.DUPLICATE,
          `"${existing.topic}" already targets this keyword. Add a strategy note to explain why a second piece is needed.`,
          HttpStatus.CONFLICT,
        );
      }
    }
    // Internal links must be pages the site audit actually found.
    const { pages } = await this.crawledPages(businessId);
    const known = new Set(pages.map((page) => normalizePageUrl(page.url)));
    const internalLinks = strings(input.internalLinks, 20).filter((url) =>
      known.has(normalizePageUrl(url)),
    );
    const brief = await this.db.seoContentBrief.create({
      data: {
        businessId,
        keywordId: input.keywordId ?? null,
        keywordText,
        topic: input.topic.trim().slice(0, 300),
        intent: input.intent?.trim() || null,
        audience: input.audience?.trim() || null,
        format: input.format ?? SeoContentFormat.blog_post,
        outline: strings(input.outline),
        questions: strings(input.questions),
        internalLinks,
        sourceNotes: input.sourceNotes?.trim() || null,
        strategyNote: input.strategyNote?.trim() || null,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        assigneeUserId: input.assigneeUserId ?? null,
        briefSource: source,
        createdByUserId: actorUserId,
      },
    });
    await this.audit(businessId, brief.id, `created_${source}`, actorUserId);
    return brief;
  }

  private parseJson(raw: string): Record<string, unknown> {
    try {
      return JSON.parse(
        raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim(),
      ) as Record<string, unknown>;
    } catch {
      throw new AppException(
        SEO_CONTENT_ERROR_CODES.AI_INVALID,
        'The AI provider returned a response that could not be read. Please try again.',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /** "Generate Brief": AI structure for a keyword, linking only to pages the site audit found. */
  async generateBrief(
    businessId: string,
    actorUserId: string,
    keywordId: string,
    strategyNote?: string,
  ) {
    await assertSeoAiDraftsAllowed(this.tenantPrisma, businessId);
    const [keyword, { pages }, business] = await Promise.all([
      this.db.trackedKeyword.findFirst({
        where: { id: keywordId, businessId },
      }),
      this.crawledPages(businessId),
      this.db.business.findUnique({
        where: { id: businessId },
        select: { name: true },
      }),
    ]);
    if (!keyword) {
      throw new AppException(
        SEO_CONTENT_ERROR_CODES.KEYWORD_NOT_FOUND,
        'Keyword was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    const sitePages = pages
      .filter((page) => page.statusCode < 400 && !page.noindex)
      .slice(0, 60)
      .map((page) => ({ url: page.url, title: page.title }));
    const prompt = [
      'Create an SEO content brief (structure only, not the article).',
      'Do not state facts about the business, prices, reviews, certifications or statistics — the brief describes what to cover, not claims.',
      'internalLinks must be chosen only from the supplied site pages (exact URLs). Use an empty list if none fit.',
      'Return only JSON: {"topic":"...","audience":"...","format":"blog_post|guide|landing_page|faq|location_page|product_page|other","outline":["..."],"questions":["..."],"internalLinks":["..."]}',
      `Business: ${business?.name ?? 'not supplied'}`,
      `Keyword: ${keyword.keyword}`,
      `Search intent (merchant-set): ${keyword.intent ?? 'not set'}`,
      `Site pages: ${JSON.stringify(sitePages)}`,
    ].join('\n');
    const parsed = this.parseJson(
      await seoAiComplete(this.ai, businessId, prompt, 0.3),
    );
    const format = Object.values(SeoContentFormat).includes(
      parsed.format as SeoContentFormat,
    )
      ? (parsed.format as SeoContentFormat)
      : SeoContentFormat.blog_post;
    return this.createBrief(
      businessId,
      actorUserId,
      {
        keywordId,
        topic:
          typeof parsed.topic === 'string' && parsed.topic.trim()
            ? parsed.topic
            : keyword.keyword,
        intent: keyword.intent,
        audience: typeof parsed.audience === 'string' ? parsed.audience : null,
        format,
        outline: strings(parsed.outline),
        questions: strings(parsed.questions),
        internalLinks: strings(parsed.internalLinks, 20),
        strategyNote,
      },
      'ai',
    );
  }

  async updateBrief(
    businessId: string,
    actorUserId: string,
    id: string,
    input: Partial<BriefInput> & { draftTitle?: string; draftBody?: string },
  ) {
    const brief = await this.findOrThrow(businessId, id);
    if (
      brief.status !== SeoContentBriefStatus.brief &&
      brief.status !== SeoContentBriefStatus.drafting
    ) {
      throw new AppException(
        SEO_CONTENT_ERROR_CODES.INVALID_TRANSITION,
        'Only a brief or a draft in progress can be edited.',
        HttpStatus.CONFLICT,
      );
    }
    let internalLinks: string[] | undefined;
    if (input.internalLinks) {
      const { pages } = await this.crawledPages(businessId);
      const known = new Set(pages.map((page) => normalizePageUrl(page.url)));
      internalLinks = strings(input.internalLinks, 20).filter((url) =>
        known.has(normalizePageUrl(url)),
      );
    }
    const draftEdited =
      input.draftTitle !== undefined || input.draftBody !== undefined;
    const updated = await this.db.seoContentBrief.update({
      where: { id, businessId },
      data: {
        ...(input.topic !== undefined
          ? { topic: input.topic.trim().slice(0, 300) }
          : {}),
        ...(input.audience !== undefined
          ? { audience: input.audience?.trim() || null }
          : {}),
        ...(input.format !== undefined ? { format: input.format } : {}),
        ...(input.outline !== undefined
          ? { outline: strings(input.outline) }
          : {}),
        ...(input.questions !== undefined
          ? { questions: strings(input.questions) }
          : {}),
        ...(internalLinks !== undefined ? { internalLinks } : {}),
        ...(input.sourceNotes !== undefined
          ? { sourceNotes: input.sourceNotes?.trim() || null }
          : {}),
        ...(input.dueAt !== undefined
          ? { dueAt: input.dueAt ? new Date(input.dueAt) : null }
          : {}),
        ...(input.assigneeUserId !== undefined
          ? { assigneeUserId: input.assigneeUserId || null }
          : {}),
        ...(input.draftTitle !== undefined
          ? { draftTitle: input.draftTitle.trim() || null }
          : {}),
        ...(input.draftBody !== undefined
          ? { draftBody: input.draftBody || null }
          : {}),
        ...(draftEdited
          ? {
              draftSource: brief.draftSource === 'ai' ? 'ai_edited' : 'manual',
              status: SeoContentBriefStatus.drafting,
            }
          : {}),
      },
    });
    await this.audit(
      businessId,
      id,
      draftEdited ? 'draft_edited' : 'brief_edited',
      actorUserId,
    );
    return updated;
  }

  /**
   * "Create Draft" with AI: writes from the brief and the merchant's source notes only. Without source
   * notes the draft is told to stay general and make no claims about the business.
   */
  async generateDraft(businessId: string, actorUserId: string, id: string) {
    await assertSeoAiDraftsAllowed(this.tenantPrisma, businessId);
    const brief = await this.findOrThrow(businessId, id);
    if (
      brief.status !== SeoContentBriefStatus.brief &&
      brief.status !== SeoContentBriefStatus.drafting
    ) {
      throw new AppException(
        SEO_CONTENT_ERROR_CODES.INVALID_TRANSITION,
        'A draft can only be generated before submission.',
        HttpStatus.CONFLICT,
      );
    }
    const business = await this.db.business.findUnique({
      where: { id: businessId },
      select: { name: true },
    });
    const prompt = [
      'Write a web page draft in Markdown from this brief.',
      'Use ONLY the merchant source notes for any fact about the business (products, prices, locations, policies, experience, awards).',
      'Never invent reviews, testimonials, statistics, certifications, prices or guarantees. If the notes do not support a claim, leave it out.',
      'Link internally only to the listed URLs.',
      'Return only JSON: {"title":"...","body":"markdown"}',
      `Business: ${business?.name ?? 'not supplied'}`,
      `Topic: ${brief.topic}`,
      `Keyword: ${brief.keywordText ?? 'none'}`,
      `Audience: ${brief.audience ?? 'not set'}`,
      `Format: ${brief.format}`,
      `Outline: ${JSON.stringify(brief.outline)}`,
      `Questions to answer: ${JSON.stringify(brief.questions)}`,
      `Internal links: ${JSON.stringify(brief.internalLinks)}`,
      `Merchant source notes: ${brief.sourceNotes ?? '(none — make no claims about the business)'}`,
    ].join('\n');
    const parsed = this.parseJson(
      await seoAiComplete(this.ai, businessId, prompt, 0.4),
    );
    if (typeof parsed.body !== 'string' || !parsed.body.trim()) {
      throw new AppException(
        SEO_CONTENT_ERROR_CODES.AI_INVALID,
        'The AI provider returned an empty draft. Please try again.',
        HttpStatus.BAD_GATEWAY,
      );
    }
    const updated = await this.db.seoContentBrief.update({
      where: { id, businessId },
      data: {
        draftTitle:
          typeof parsed.title === 'string'
            ? parsed.title.slice(0, 300)
            : brief.topic,
        draftBody: parsed.body,
        draftSource: 'ai',
        status: SeoContentBriefStatus.drafting,
      },
    });
    await this.audit(businessId, id, 'draft_generated_ai', actorUserId);
    return updated;
  }

  async transition(
    businessId: string,
    actorUserId: string,
    id: string,
    to: SeoContentBriefStatus,
    note?: string,
  ) {
    const brief = await this.findOrThrow(businessId, id);
    if (!(TRANSITIONS[brief.status] ?? []).includes(to)) {
      throw new AppException(
        SEO_CONTENT_ERROR_CODES.INVALID_TRANSITION,
        to === SeoContentBriefStatus.published
          ? 'Record the published URL to mark it published.'
          : `A ${brief.status.replace('_', ' ')} item can't move to ${to.replace('_', ' ')}.`,
        HttpStatus.CONFLICT,
      );
    }
    const trimmed = note?.trim() || null;
    if (
      (to === SeoContentBriefStatus.dismissed ||
        (brief.status === SeoContentBriefStatus.approval_required &&
          to === SeoContentBriefStatus.drafting)) &&
      !trimmed
    ) {
      throw new AppException(
        SEO_CONTENT_ERROR_CODES.NOTE_REQUIRED,
        to === SeoContentBriefStatus.dismissed
          ? 'Say why this is dismissed.'
          : 'Say what needs to change before approval.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      to === SeoContentBriefStatus.approval_required &&
      !brief.draftBody?.trim()
    ) {
      throw new AppException(
        SEO_CONTENT_ERROR_CODES.DRAFT_REQUIRED,
        'Write or generate a draft before submitting it for approval.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const updated = await this.db.seoContentBrief.update({
      where: { id, businessId },
      data: {
        status: to,
        ...(to === SeoContentBriefStatus.approved ||
        brief.status === SeoContentBriefStatus.approval_required
          ? { decidedByUserId: actorUserId, decisionNote: trimmed }
          : {}),
      },
    });
    await this.audit(businessId, id, `status_${to}`, actorUserId, trimmed);
    return updated;
  }

  /**
   * "Send to Website" is not available (Noxtill doesn't host the site): the merchant publishes the
   * approved draft and records the URL. The keyword's latest rank becomes the refresh baseline.
   */
  async recordPublished(
    businessId: string,
    actorUserId: string,
    id: string,
    publishedUrl: string,
  ) {
    const brief = await this.findOrThrow(businessId, id);
    if (brief.status !== SeoContentBriefStatus.approved) {
      throw new AppException(
        SEO_CONTENT_ERROR_CODES.INVALID_TRANSITION,
        'Only an approved draft can be marked published.',
        HttpStatus.CONFLICT,
      );
    }
    const latest = brief.keywordId
      ? await this.db.keywordRankSnapshot.findFirst({
          where: { keywordId: brief.keywordId },
          orderBy: { capturedAt: 'desc' },
          select: { rank: true },
        })
      : null;
    const updated = await this.db.seoContentBrief.update({
      where: { id, businessId },
      data: {
        status: SeoContentBriefStatus.published,
        publishedUrl: publishedUrl.trim(),
        publishedAt: new Date(),
        baselineRank: latest?.rank ?? null,
      },
    });
    await this.audit(
      businessId,
      id,
      'published_recorded',
      actorUserId,
      publishedUrl,
    );
    return updated;
  }

  async dismissOpportunity(
    businessId: string,
    actorUserId: string,
    keywordId: string,
    kind: OpportunityKind,
    reason: string,
  ) {
    if (!reason.trim()) {
      throw new AppException(
        SEO_CONTENT_ERROR_CODES.NOTE_REQUIRED,
        'Say why this opportunity is dismissed.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const keyword = await this.db.trackedKeyword.findFirst({
      where: { id: keywordId, businessId },
      select: { id: true },
    });
    if (!keyword) {
      throw new AppException(
        SEO_CONTENT_ERROR_CODES.KEYWORD_NOT_FOUND,
        'Keyword was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return this.db.seoContentDismissal.upsert({
      where: {
        businessId_keywordId_kind: { businessId, keywordId, kind },
      },
      create: {
        businessId,
        keywordId,
        kind,
        reason: reason.trim(),
        actorUserId,
      },
      update: { reason: reason.trim(), actorUserId },
    });
  }

  async reopenOpportunity(
    businessId: string,
    keywordId: string,
    kind: OpportunityKind,
  ) {
    await this.db.seoContentDismissal.deleteMany({
      where: { businessId, keywordId, kind },
    });
    return { keywordId, kind };
  }

  /** Marks published content live once a site crawl finishes after publishing and finds the URL. */
  async confirmPublished(businessId: string) {
    const pending = await this.db.seoContentBrief.findMany({
      where: {
        businessId,
        status: SeoContentBriefStatus.published,
        liveConfirmedAt: null,
        publishedUrl: { not: null },
      },
    });
    if (pending.length === 0) return { checked: 0, confirmed: 0 };
    const { run, pages } = await this.crawledPages(businessId);
    if (!run?.finishedAt) return { checked: 0, confirmed: 0 };
    let checked = 0;
    let confirmed = 0;
    for (const brief of pending) {
      if (!brief.publishedAt || run.finishedAt <= brief.publishedAt) continue;
      checked += 1;
      const page = pages.find(
        (row) =>
          normalizePageUrl(row.url) === normalizePageUrl(brief.publishedUrl!),
      );
      if (page && page.statusCode < 400) {
        confirmed += 1;
        await this.db.seoContentBrief.update({
          where: { id: brief.id, businessId },
          data: { liveConfirmedAt: new Date() },
        });
        await this.audit(
          businessId,
          brief.id,
          'live_confirmed_by_crawl',
          null,
          run.id,
        );
      }
    }
    return { checked, confirmed };
  }
}
