import { HttpStatus, Injectable } from '@nestjs/common';
import { SeoContentService } from './seo-content.service';
import { KeywordsService } from './keywords.service';
import { SeoLinkBuildingService } from './seo-link-building.service';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';

export const SEO_COMPETITOR_KINDS = [
  'keyword',
  'content',
  'backlink',
  'ranking',
  'page',
  'serp_feature',
] as const;
export type SeoCompetitorKind = (typeof SEO_COMPETITOR_KINDS)[number];
export type SeoCompetitorAction = 'keyword' | 'content' | 'link';
export type SeoCompetitorStatus =
  'open' | 'actioned' | 'resolved' | 'dismissed';

export const SEO_COMPETITOR_ERRORS = {
  NOT_FOUND: 'SEO_COMPETITOR_GAP_NOT_FOUND',
  INVALID_INPUT: 'SEO_COMPETITOR_INVALID_INPUT',
  INVALID_URL: 'SEO_COMPETITOR_INVALID_URL',
  FUTURE_EVIDENCE: 'SEO_COMPETITOR_EVIDENCE_IN_FUTURE',
  REASON_REQUIRED: 'SEO_COMPETITOR_REASON_REQUIRED',
  INVALID_TRANSITION: 'SEO_COMPETITOR_INVALID_TRANSITION',
  ACTION_REQUIRED: 'SEO_COMPETITOR_ACTION_REQUIREMENTS_NOT_MET',
  ALREADY_ACTIONED: 'SEO_COMPETITOR_ACTION_ALREADY_CREATED',
  DUPLICATE_EVIDENCE: 'SEO_COMPETITOR_DUPLICATE_EVIDENCE',
} as const;

export interface CreateSeoCompetitorGapInput {
  competitorId: string;
  kind: SeoCompetitorKind;
  title: string;
  keyword?: string;
  intent?: string;
  competitorUrl?: string;
  ownedPageUrl?: string;
  sourceUrl: string;
  sourceLabel?: string;
  evidenceNote: string;
  competitorRank?: number;
  observedAt?: string;
}

const clean = (value?: string | null) => value?.trim() || null;

function requireText(value: string | undefined, label: string, max: number) {
  const result = clean(value);
  if (!result || result.length > max) {
    throw new AppException(
      SEO_COMPETITOR_ERRORS.INVALID_INPUT,
      `${label} is required and must be no longer than ${max} characters.`,
      HttpStatus.BAD_REQUEST,
    );
  }
  return result;
}

function normalizeUrl(value: string | undefined, label: string) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      throw new Error('unsupported URL');
    }
    url.hash = '';
    if (url.pathname.length > 1)
      url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    throw new AppException(
      SEO_COMPETITOR_ERRORS.INVALID_URL,
      `${label} must be a valid HTTP or HTTPS URL.`,
      HttpStatus.BAD_REQUEST,
    );
  }
}

function normalizeRequiredUrl(value: string | undefined, label: string) {
  const normalized = normalizeUrl(value, label);
  if (!normalized) {
    throw new AppException(
      SEO_COMPETITOR_ERRORS.INVALID_URL,
      `${label} is required.`,
      HttpStatus.BAD_REQUEST,
    );
  }
  return normalized;
}

function keywordKey(value: string) {
  return value.trim().toLocaleLowerCase();
}

function snapshotState(value: {
  status: string;
  actionType: string | null;
  actionEntityId: string | null;
}) {
  return {
    status: value.status,
    actionType: value.actionType,
    actionEntityId: value.actionEntityId,
  };
}

/**
 * SEO-specific competitor read model. Evidence is explicitly sourced from either a team-entered
 * observation or the business's own saved rank history; this service does not scrape competitor
 * sites or claim provider-wide keyword, backlink, or content coverage.
 */
@Injectable()
export class SeoCompetitorService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly keywords: KeywordsService,
    private readonly content: SeoContentService,
    private readonly linkBuilding: SeoLinkBuildingService,
  ) {}

  private get db() {
    return this.tenantPrisma.client;
  }

  async overview(businessId: string) {
    const [competitors, gaps, trackedKeywords] = await Promise.all([
      this.db.competitor.findMany({
        where: { businessId },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        select: { id: true, name: true, priority: true },
      }),
      this.db.seoCompetitorGap.findMany({
        where: { businessId },
        include: {
          competitor: { select: { id: true, name: true } },
          audits: {
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
            take: 8,
            select: {
              id: true,
              action: true,
              reason: true,
              beforeState: true,
              afterState: true,
              actorUserId: true,
              createdAt: true,
            },
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        take: 500,
      }),
      this.db.trackedKeyword.findMany({
        where: { businessId },
        orderBy: [{ keyword: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          keyword: true,
          snapshots: {
            orderBy: [{ capturedAt: 'desc' }, { id: 'asc' }],
            take: 1,
            select: { rank: true, capturedAt: true },
          },
        },
      }),
    ]);

    const latestByKeyword = new Map(
      trackedKeywords.map((keyword) => [keywordKey(keyword.keyword), keyword]),
    );
    const records = gaps.map((gap) => {
      const tracked = gap.keyword
        ? latestByKeyword.get(keywordKey(gap.keyword))
        : undefined;
      const rank = tracked?.snapshots[0] ?? null;
      return {
        id: gap.id,
        competitorId: gap.competitorId,
        competitorName: gap.competitor.name,
        kind: gap.kind as SeoCompetitorKind,
        title: gap.title,
        keyword: gap.keyword,
        intent: gap.intent,
        competitorUrl: gap.competitorUrl,
        ownedPageUrl: gap.ownedPageUrl,
        sourceUrl: gap.sourceUrl,
        sourceLabel: gap.sourceLabel,
        evidenceNote: gap.evidenceNote,
        competitorRank: gap.competitorRank,
        ownedRank: rank?.rank ?? null,
        ownedRankCheckedAt: rank?.capturedAt.toISOString() ?? null,
        positionComparison:
          gap.competitorRank == null || rank?.rank == null
            ? 'not_comparable'
            : gap.competitorRank < rank.rank
              ? 'competitor_ahead'
              : gap.competitorRank > rank.rank
                ? 'business_ahead'
                : 'same_position',
        observedAt: gap.observedAt.toISOString(),
        status: gap.status as SeoCompetitorStatus,
        actionType: gap.actionType as SeoCompetitorAction | null,
        actionEntityId: gap.actionEntityId,
        createdAt: gap.createdAt.toISOString(),
        updatedAt: gap.updatedAt.toISOString(),
        audits: gap.audits.map((audit) => ({
          id: audit.id,
          action: audit.action,
          reason: audit.reason,
          beforeState: audit.beforeState,
          afterState: audit.afterState,
          actorUserId: audit.actorUserId,
          createdAt: audit.createdAt.toISOString(),
        })),
      };
    });
    const open = records.filter((record) => record.status === 'open');

    return {
      checkedAt: new Date().toISOString(),
      competitors,
      trackedCompetitors: competitors.length,
      counts: {
        keywordGaps: open.filter((record) => record.kind === 'keyword').length,
        contentGaps: open.filter((record) => record.kind === 'content').length,
        backlinkGaps: open.filter((record) => record.kind === 'backlink')
          .length,
        serpGaps: open.filter((record) => record.kind === 'serp_feature')
          .length,
        recordedEvidence: records.length,
      },
      gaps: records,
      disclosures: {
        evidence:
          'Competitor SEO evidence is entered by your team and attributed to its source. Your position, when shown, comes from the latest saved rank check for that tracked keyword.',
        keywordData:
          'Competitor keyword coverage and positions are not discovered automatically. Record a dated source observation to compare it with your tracked rank history.',
        contentData:
          'Competitor pages are not crawled or compared automatically. Page URLs and notes shown here are the evidence your team recorded.',
        backlinkData:
          'No competitor backlink provider is connected. Backlink gaps are manual observations; authority and referring-domain totals are not tracked.',
        serpFeatures:
          'SERP-feature changes are not stored automatically. This tab contains only manually recorded, source-linked observations.',
      },
    };
  }

  async createGap(
    businessId: string,
    actorUserId: string,
    input: CreateSeoCompetitorGapInput,
  ) {
    const competitor = await this.db.competitor.findFirst({
      where: { id: input.competitorId, businessId },
      select: { id: true },
    });
    if (!competitor) {
      throw new AppException(
        SEO_COMPETITOR_ERRORS.NOT_FOUND,
        'Choose a competitor already tracked in Competitive Insights.',
        HttpStatus.NOT_FOUND,
      );
    }
    const kind = input.kind;
    if (!SEO_COMPETITOR_KINDS.includes(kind)) {
      throw new AppException(
        SEO_COMPETITOR_ERRORS.INVALID_INPUT,
        'Choose a supported competitor SEO evidence type.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const keyword = clean(input.keyword);
    if (['keyword', 'ranking'].includes(kind) && !keyword) {
      throw new AppException(
        SEO_COMPETITOR_ERRORS.INVALID_INPUT,
        'A keyword is required for keyword and ranking evidence.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      input.competitorRank != null &&
      (!Number.isInteger(input.competitorRank) ||
        input.competitorRank < 1 ||
        input.competitorRank > 1000)
    ) {
      throw new AppException(
        SEO_COMPETITOR_ERRORS.INVALID_INPUT,
        'A recorded competitor position must be a whole number from 1 to 1000.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const sourceUrl = normalizeRequiredUrl(
      input.sourceUrl,
      'Evidence source URL',
    );
    const competitorUrl = normalizeUrl(
      input.competitorUrl,
      'Competitor page URL',
    );
    const ownedPageUrl = normalizeUrl(input.ownedPageUrl, 'Your page URL');
    const title = requireText(input.title, 'Opportunity', 191);
    const evidenceNote = requireText(
      input.evidenceNote,
      'Evidence note',
      10000,
    );
    const sourceLabel = clean(input.sourceLabel) ?? 'Team observation';
    if (sourceLabel.length > 191) {
      throw new AppException(
        SEO_COMPETITOR_ERRORS.INVALID_INPUT,
        'Source label must be no longer than 191 characters.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const observedAt = input.observedAt
      ? new Date(input.observedAt)
      : new Date();
    if (
      !Number.isFinite(observedAt.getTime()) ||
      observedAt.getTime() > Date.now() + 60_000
    ) {
      throw new AppException(
        SEO_COMPETITOR_ERRORS.FUTURE_EVIDENCE,
        'Evidence cannot be dated in the future.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (ownedPageUrl) await this.requireOwnedSiteUrl(businessId, ownedPageUrl);

    const duplicate = await this.db.seoCompetitorGap.findFirst({
      where: {
        businessId,
        competitorId: competitor.id,
        kind,
        title,
        sourceUrl,
        status: 'open',
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new AppException(
        SEO_COMPETITOR_ERRORS.DUPLICATE_EVIDENCE,
        'This source and opportunity are already recorded as an open gap.',
        HttpStatus.CONFLICT,
      );
    }

    return this.db.$transaction(async (tx) => {
      const gap = await tx.seoCompetitorGap.create({
        data: {
          businessId,
          competitorId: competitor.id,
          kind,
          title,
          keyword: keyword?.slice(0, 191) ?? null,
          intent: clean(input.intent)?.slice(0, 24) ?? null,
          competitorUrl,
          ownedPageUrl,
          sourceUrl,
          sourceLabel,
          evidenceNote,
          competitorRank: input.competitorRank ?? null,
          observedAt,
          createdByUserId: actorUserId,
        },
      });
      await tx.seoCompetitorGapAudit.create({
        data: {
          businessId,
          gapId: gap.id,
          action: 'evidence_recorded',
          actorUserId,
          afterState: {
            kind,
            competitorId: competitor.id,
            sourceUrl,
            observedAt: observedAt.toISOString(),
          },
        },
      });
      return gap;
    });
  }

  async createAction(
    businessId: string,
    actorUserId: string,
    id: string,
    action: SeoCompetitorAction,
  ) {
    const gap = await this.db.seoCompetitorGap.findFirst({
      where: { id, businessId },
      include: { competitor: { select: { name: true } } },
    });
    if (!gap) this.notFound();
    if (gap.actionEntityId || gap.status === 'actioned') {
      throw new AppException(
        SEO_COMPETITOR_ERRORS.ALREADY_ACTIONED,
        'An SEO action has already been created for this evidence.',
        HttpStatus.CONFLICT,
      );
    }
    if (gap.status !== 'open') {
      throw new AppException(
        SEO_COMPETITOR_ERRORS.INVALID_TRANSITION,
        'Only open competitor evidence can create an SEO action.',
        HttpStatus.CONFLICT,
      );
    }

    let actionEntityId: string;
    let actionUrl: string;
    if (action === 'keyword') {
      if (!gap.keyword)
        this.actionRequired(
          'A keyword is needed to add this to Keyword Intelligence.',
        );
      const tracked = await this.getOrCreateTrackedKeyword(
        businessId,
        gap.keyword,
      );
      actionEntityId = tracked.id;
      actionUrl = '/marketing/seo-autopilot/keywords';
    } else if (action === 'content') {
      const tracked = gap.keyword
        ? await this.getOrCreateTrackedKeyword(businessId, gap.keyword)
        : null;
      const brief = await this.content.createBrief(businessId, actorUserId, {
        topic: gap.title,
        keywordId: tracked?.id,
        intent: gap.intent,
        strategyNote: `Competitor evidence from ${gap.sourceLabel}, observed ${gap.observedAt.toISOString()}.`,
        sourceNotes: `${gap.evidenceNote}\nSource: ${gap.sourceUrl}`,
      });
      actionEntityId = brief.id;
      actionUrl = '/marketing/seo-autopilot/content';
    } else if (action === 'link') {
      if (gap.kind !== 'backlink' || !gap.ownedPageUrl) {
        this.actionRequired(
          'A backlink gap and your own target page are required to create a link opportunity.',
        );
      }
      const opportunity = await this.linkBuilding.createOpportunity(
        businessId,
        actorUserId,
        {
          kind: 'competitor',
          title: gap.title,
          prospectUrl: gap.sourceUrl,
          targetUrl: gap.ownedPageUrl,
          evidenceNote: `${gap.evidenceNote}\nCompetitor: ${gap.competitor.name}. Source: ${gap.sourceUrl}`,
          relevanceNote: `Manually recorded competitor backlink gap for ${gap.competitor.name}. Validate the source and target before outreach.`,
        },
      );
      actionEntityId = opportunity.id;
      actionUrl = '/marketing/seo-autopilot/link-building';
    } else {
      this.actionRequired('Choose a keyword, content, or link action.');
    }

    await this.db.$transaction(async (tx) => {
      const before = await tx.seoCompetitorGap.findFirst({
        where: { id, businessId },
      });
      if (!before) this.notFound();
      if (before.actionEntityId || before.status !== 'open') {
        throw new AppException(
          SEO_COMPETITOR_ERRORS.ALREADY_ACTIONED,
          'This evidence has already changed; refresh the page before retrying.',
          HttpStatus.CONFLICT,
        );
      }
      const after = await tx.seoCompetitorGap.update({
        where: { id: before.id },
        data: { actionType: action, actionEntityId, status: 'actioned' },
      });
      await tx.seoCompetitorGapAudit.create({
        data: {
          businessId,
          gapId: id,
          action: `action_created_${action}`,
          actorUserId,
          beforeState: snapshotState(before),
          afterState: snapshotState(after),
        },
      });
    });
    return {
      id,
      actionType: action,
      actionEntityId,
      actionUrl,
      status: 'actioned' as const,
    };
  }

  async transition(
    businessId: string,
    actorUserId: string,
    id: string,
    status: 'open' | 'resolved' | 'dismissed',
    reasonInput: string,
  ) {
    const reason = requireText(reasonInput, 'Decision reason', 2000);
    return this.db.$transaction(async (tx) => {
      const before = await tx.seoCompetitorGap.findFirst({
        where: { id, businessId },
      });
      if (!before) this.notFound();
      const allowed =
        (status === 'open' &&
          ['resolved', 'dismissed'].includes(before.status)) ||
        (['resolved', 'dismissed'].includes(status) &&
          ['open', 'actioned'].includes(before.status));
      if (!allowed) {
        throw new AppException(
          SEO_COMPETITOR_ERRORS.INVALID_TRANSITION,
          `Cannot change competitor evidence from ${before.status} to ${status}.`,
          HttpStatus.CONFLICT,
        );
      }
      const after = await tx.seoCompetitorGap.update({
        where: { id: before.id },
        data: { status },
      });
      await tx.seoCompetitorGapAudit.create({
        data: {
          businessId,
          gapId: before.id,
          action: status === 'open' ? 'reopened' : status,
          reason,
          actorUserId,
          beforeState: snapshotState(before),
          afterState: snapshotState(after),
        },
      });
      return after;
    });
  }

  private async getOrCreateTrackedKeyword(businessId: string, value: string) {
    const keyword = value.trim();
    const existing = await this.db.trackedKeyword.findFirst({
      where: { businessId, keyword },
      select: { id: true, keyword: true },
    });
    if (existing) return existing;
    try {
      return await this.keywords.create(businessId, { keyword });
    } catch (error) {
      const raced = await this.db.trackedKeyword.findFirst({
        where: { businessId, keyword },
        select: { id: true, keyword: true },
      });
      if (raced) return raced;
      throw error;
    }
  }

  private async requireOwnedSiteUrl(businessId: string, targetUrl: string) {
    const listing = await this.db.masterListing.findUnique({
      where: { businessId },
      select: { website: true },
    });
    if (!listing?.website) return;
    const targetHost = new URL(targetUrl).hostname
      .toLowerCase()
      .replace(/^www\./, '');
    let siteHost = '';
    try {
      const site = new URL(
        /^[a-z][a-z\d+.-]*:/i.test(listing.website)
          ? listing.website
          : `https://${listing.website}`,
      );
      siteHost = site.hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return;
    }
    if (targetHost !== siteHost && !targetHost.endsWith(`.${siteHost}`)) {
      throw new AppException(
        SEO_COMPETITOR_ERRORS.INVALID_URL,
        'Your page URL must use the website configured in Business Listings.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private actionRequired(message: string): never {
    throw new AppException(
      SEO_COMPETITOR_ERRORS.ACTION_REQUIRED,
      message,
      HttpStatus.BAD_REQUEST,
    );
  }

  private notFound(): never {
    throw new AppException(
      SEO_COMPETITOR_ERRORS.NOT_FOUND,
      'Competitor SEO evidence was not found.',
      HttpStatus.NOT_FOUND,
    );
  }
}
