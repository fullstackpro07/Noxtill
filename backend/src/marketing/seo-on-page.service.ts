import { createHash } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  Prisma,
  SeoAuditIssueStatus,
  SeoContentRevisionStatus,
} from '@prisma/client';
import { AiInfraService } from '../ai/ai-infra.service';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import type { SeoAuditPage } from './seo-site-audit.util';
import { assertSeoAiDraftsAllowed, seoAiComplete } from './seo-rules.util';

export const SEO_ON_PAGE_ERROR_CODES = {
  NO_CRAWL: 'SEO_ON_PAGE_NO_CRAWL',
  PAGE_NOT_CRAWLED: 'SEO_ON_PAGE_PAGE_NOT_CRAWLED',
  EMPTY_PROPOSAL: 'SEO_ON_PAGE_EMPTY_PROPOSAL',
  NOT_FOUND: 'SEO_ON_PAGE_REVISION_NOT_FOUND',
  INVALID_TRANSITION: 'SEO_ON_PAGE_INVALID_TRANSITION',
  NOTE_REQUIRED: 'SEO_ON_PAGE_NOTE_REQUIRED',
  VERSION_CONFLICT: 'SEO_ON_PAGE_VERSION_CONFLICT',
  AI_INVALID: 'SEO_ON_PAGE_AI_INVALID',
} as const;

/** Crawler issue types that On-Page SEO owns (indexability/redirect issues belong to Technical SEO). */
export const ON_PAGE_ISSUE_TYPES = [
  'missing_title',
  'missing_meta_description',
  'duplicate_title',
  'missing_h1',
  'multiple_h1',
  'images_missing_alt',
];
const METADATA_ISSUE_TYPES = [
  'missing_title',
  'missing_meta_description',
  'duplicate_title',
];
/** Revisions still waiting on a person; a new revision for the same page supersedes them. */
const OPEN_STATUSES: SeoContentRevisionStatus[] = [
  SeoContentRevisionStatus.draft,
  SeoContentRevisionStatus.approval_required,
  SeoContentRevisionStatus.approved,
];
const TRANSITIONS: Partial<
  Record<SeoContentRevisionStatus, SeoContentRevisionStatus[]>
> = {
  draft: [SeoContentRevisionStatus.approval_required],
  approval_required: [
    SeoContentRevisionStatus.approved,
    SeoContentRevisionStatus.rejected,
  ],
  approved: [SeoContentRevisionStatus.applied],
};

export interface PageSnapshot {
  url: string;
  title: string | null;
  description: string | null;
  h1Count: number | null;
  /** Undefined when the crawl predates H1 text capture. */
  h1: string | null | undefined;
  imagesMissingAlt: number | null;
  auditRunId: string;
  crawledAt: string | null;
}

export interface OnPageRow {
  url: string;
  title: string | null;
  description: string | null;
  h1: string | null;
  h1Count: number | null;
  imagesMissingAlt: number | null;
  primaryKeyword: string | null;
  issues: string[];
  health: 'ok' | 'needs_work';
  lastOptimizedAt: Date | null;
  revision: { version: number; status: SeoContentRevisionStatus } | null;
}

export interface ProposalInput {
  pageUrl: string;
  proposedTitle?: string | null;
  proposedMetaDescription?: string | null;
  proposedH1?: string | null;
  primaryKeyword?: string | null;
  rationale?: string | null;
}

/** Page identity across crawls: host + path + query, no fragment, no trailing slash, lowercase host. */
export function normalizePageUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    const path = url.pathname.replace(/\/+$/, '') || '/';
    return `${url.protocol}//${url.host.toLowerCase()}${path}${url.search}`;
  } catch {
    return value.trim();
  }
}

export function pageKeyOf(value: string): string {
  return createHash('sha256').update(normalizePageUrl(value)).digest('hex');
}

const clean = (value: string | null | undefined): string | null => {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > 0 ? text : null;
};

/**
 * On-Page SEO (SEO Autopilot screen 4). Pages come from the latest completed site crawl; changes are
 * versioned proposals (title / meta description / H1) that go draft → approval → approved → applied
 * by the merchant on their own site → verified only when a later crawl sees the proposed values
 * live. Noxtill does not host or publish the website, so nothing here writes to a live page.
 * Organic clicks/impressions are not available (no Search Console connection).
 */
@Injectable()
export class SeoOnPageService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly ai: AiInfraService,
  ) {}

  private get db() {
    return this.tenantPrisma.client;
  }

  private async latestRun(businessId: string) {
    return this.db.seoAuditRun.findFirst({
      where: { businessId, status: { in: ['completed', 'partial'] } },
      orderBy: { startedAt: 'desc' },
      select: { id: true, siteUrl: true, finishedAt: true, pages: true },
    });
  }

  private static htmlPages(pages: unknown): SeoAuditPage[] {
    if (!Array.isArray(pages)) return [];
    return (pages as SeoAuditPage[]).filter(
      (page) =>
        page &&
        typeof page.url === 'string' &&
        page.statusCode < 400 &&
        (page.contentType === 'text/html' ||
          page.contentType === 'application/xhtml+xml'),
    );
  }

  private static snapshotOf(
    page: SeoAuditPage,
    run: { id: string; finishedAt: Date | null },
  ): PageSnapshot {
    return {
      url: page.url,
      title: page.title,
      description: page.description,
      h1Count: page.h1Count,
      h1: page.h1,
      imagesMissingAlt: page.imagesMissingAlt,
      auditRunId: run.id,
      crawledAt: run.finishedAt?.toISOString() ?? null,
    };
  }

  async pages(businessId: string) {
    const run = await this.latestRun(businessId);
    if (!run) {
      return { crawl: null, pages: [] as OnPageRow[] };
    }
    const crawled = SeoOnPageService.htmlPages(run.pages);
    const [issues, keywords, revisions] = await Promise.all([
      this.db.seoAuditIssue.findMany({
        where: {
          businessId,
          status: SeoAuditIssueStatus.open,
          type: { in: ON_PAGE_ISSUE_TYPES },
        },
        select: { pageUrl: true, type: true },
      }),
      this.db.trackedKeyword.findMany({
        where: { businessId, targetPageUrl: { not: null } },
        select: { keyword: true, targetPageUrl: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.db.seoContentRevision.findMany({
        where: { businessId },
        select: {
          pageKey: true,
          version: true,
          status: true,
          appliedAt: true,
        },
        orderBy: { version: 'desc' },
      }),
    ]);
    const issuesByPage = new Map<string, string[]>();
    for (const issue of issues) {
      const key = pageKeyOf(issue.pageUrl);
      issuesByPage.set(key, [...(issuesByPage.get(key) ?? []), issue.type]);
    }
    const keywordByPage = new Map<string, string>();
    for (const row of keywords) {
      const key = pageKeyOf(row.targetPageUrl!);
      if (!keywordByPage.has(key)) keywordByPage.set(key, row.keyword);
    }
    const latestRevision = new Map<string, (typeof revisions)[number]>();
    const lastApplied = new Map<string, Date>();
    for (const revision of revisions) {
      if (!latestRevision.has(revision.pageKey))
        latestRevision.set(revision.pageKey, revision);
      if (
        revision.appliedAt &&
        (!lastApplied.has(revision.pageKey) ||
          revision.appliedAt > lastApplied.get(revision.pageKey)!)
      ) {
        lastApplied.set(revision.pageKey, revision.appliedAt);
      }
    }
    return {
      crawl: {
        auditRunId: run.id,
        siteUrl: run.siteUrl,
        finishedAt: run.finishedAt,
      },
      pages: crawled.map((page): OnPageRow => {
        const key = pageKeyOf(page.url);
        const pageIssues = issuesByPage.get(key) ?? [];
        const revision = latestRevision.get(key) ?? null;
        return {
          url: page.url,
          title: page.title,
          description: page.description,
          h1: page.h1 ?? null,
          h1Count: page.h1Count,
          imagesMissingAlt: page.imagesMissingAlt,
          primaryKeyword: keywordByPage.get(key) ?? null,
          issues: pageIssues,
          health: pageIssues.length === 0 ? 'ok' : 'needs_work',
          lastOptimizedAt: lastApplied.get(key) ?? null,
          revision: revision
            ? { version: revision.version, status: revision.status }
            : null,
        };
      }),
    };
  }

  async summary(businessId: string) {
    const [pageData, metadataIssues, unmappedKeywords, approved, applied] =
      await Promise.all([
        this.pages(businessId),
        this.db.seoAuditIssue.count({
          where: {
            businessId,
            status: SeoAuditIssueStatus.open,
            type: { in: METADATA_ISSUE_TYPES },
          },
        }),
        this.db.trackedKeyword.count({
          where: { businessId, targetPageUrl: null },
        }),
        this.db.seoContentRevision.count({
          where: { businessId, status: SeoContentRevisionStatus.approved },
        }),
        this.db.seoContentRevision.count({
          where: { businessId, status: SeoContentRevisionStatus.applied },
        }),
      ]);
    return {
      crawl: pageData.crawl,
      pagesCrawled: pageData.pages.length,
      pagesNeedingWork: pageData.pages.filter(
        (page) => page.health === 'needs_work',
      ).length,
      metadataIssues,
      /** Tracked keywords with no target page — coverage gaps you already know about. */
      contentGaps: unmappedKeywords,
      approvedRevisions: approved,
      awaitingVerification: applied,
    };
  }

  async revisions(businessId: string, pageUrl?: string) {
    const rows = await this.db.seoContentRevision.findMany({
      where: {
        businessId,
        ...(pageUrl ? { pageKey: pageKeyOf(pageUrl) } : {}),
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: pageUrl ? 100 : 200,
    });
    return rows;
  }

  private async findOrThrow(businessId: string, id: string) {
    const revision = await this.db.seoContentRevision.findFirst({
      where: { id, businessId },
    });
    if (!revision) {
      throw new AppException(
        SEO_ON_PAGE_ERROR_CODES.NOT_FOUND,
        'Revision was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return revision;
  }

  private async audit(
    businessId: string,
    revisionId: string,
    action: string,
    actorUserId: string | null,
    note?: string | null,
  ) {
    await this.db.seoContentRevisionAudit.create({
      data: {
        businessId,
        revisionId,
        action,
        actorUserId,
        note: note ?? null,
      },
    });
  }

  async create(
    businessId: string,
    actorUserId: string,
    input: ProposalInput,
    source: 'manual' | 'ai' | 'restore' = 'manual',
  ) {
    const proposedTitle = clean(input.proposedTitle);
    const proposedMetaDescription = clean(input.proposedMetaDescription);
    const proposedH1 = clean(input.proposedH1);
    if (!proposedTitle && !proposedMetaDescription && !proposedH1) {
      throw new AppException(
        SEO_ON_PAGE_ERROR_CODES.EMPTY_PROPOSAL,
        'Propose at least one of title, meta description or H1.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const run = await this.latestRun(businessId);
    if (!run) {
      throw new AppException(
        SEO_ON_PAGE_ERROR_CODES.NO_CRAWL,
        'Run a website audit first — revisions are based on the crawled page.',
        HttpStatus.CONFLICT,
      );
    }
    const key = pageKeyOf(input.pageUrl);
    const page = SeoOnPageService.htmlPages(run.pages).find(
      (row) => pageKeyOf(row.url) === key,
    );
    if (!page) {
      throw new AppException(
        SEO_ON_PAGE_ERROR_CODES.PAGE_NOT_CRAWLED,
        'That page was not in the latest website audit.',
        HttpStatus.NOT_FOUND,
      );
    }

    try {
      const revision = await this.db.$transaction(async (tx) => {
        const last = await tx.seoContentRevision.findFirst({
          where: { businessId, pageKey: key },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        await tx.seoContentRevision.updateMany({
          where: { businessId, pageKey: key, status: { in: OPEN_STATUSES } },
          data: { status: SeoContentRevisionStatus.superseded },
        });
        return tx.seoContentRevision.create({
          data: {
            businessId,
            pageUrl: page.url,
            pageKey: key,
            version: (last?.version ?? 0) + 1,
            beforeSnapshot: SeoOnPageService.snapshotOf(
              page,
              run,
            ) as unknown as Prisma.InputJsonValue,
            proposedTitle,
            proposedMetaDescription,
            proposedH1,
            primaryKeyword: clean(input.primaryKeyword),
            rationale: clean(input.rationale),
            source,
            createdByUserId: actorUserId,
          },
        });
      });
      await this.audit(
        businessId,
        revision.id,
        `created_${source}`,
        actorUserId,
      );
      return revision;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppException(
          SEO_ON_PAGE_ERROR_CODES.VERSION_CONFLICT,
          'Someone else just created a revision for this page. Reload and try again.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  /**
   * AI draft (autonomy L1: draft only, never applied). Uses only the crawled page and the merchant's
   * own keyword; it is told not to invent facts, and the result is an editable draft revision.
   */
  async suggest(businessId: string, actorUserId: string, pageUrl: string) {
    await assertSeoAiDraftsAllowed(this.tenantPrisma, businessId);
    const data = await this.pages(businessId);
    const page = data.pages.find(
      (row) => pageKeyOf(row.url) === pageKeyOf(pageUrl),
    );
    if (!page) {
      throw new AppException(
        SEO_ON_PAGE_ERROR_CODES.PAGE_NOT_CRAWLED,
        'That page was not in the latest website audit.',
        HttpStatus.NOT_FOUND,
      );
    }
    const business = await this.db.business.findUnique({
      where: { id: businessId },
      select: { name: true },
    });
    const prompt = [
      'You are improving one web page’s on-page SEO metadata.',
      'Use ONLY the facts below. Do not invent products, prices, locations, awards, guarantees, reviews or any claim not stated here.',
      'If a fact is missing, write neutral wording rather than guessing.',
      'Title: at most 60 characters. Meta description: at most 155 characters. H1: at most 70 characters.',
      'Return only JSON: {"title":"...","metaDescription":"...","h1":"...","rationale":"one or two sentences"}',
      `Business name: ${business?.name ?? 'not supplied'}`,
      `Page URL: ${page.url}`,
      `Current title: ${page.title ?? '(none)'}`,
      `Current meta description: ${page.description ?? '(none)'}`,
      `Current H1: ${page.h1 ?? (page.h1Count ? '(present, text not recorded)' : '(none)')}`,
      `Primary keyword chosen by the merchant: ${page.primaryKeyword ?? 'not set'}`,
      `Open issues found by the crawler: ${page.issues.join(', ') || 'none'}`,
    ].join('\n');
    const raw = await seoAiComplete(this.ai, businessId, prompt, 0.2);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(
        raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim(),
      ) as Record<string, unknown>;
    } catch {
      throw new AppException(
        SEO_ON_PAGE_ERROR_CODES.AI_INVALID,
        'The AI provider returned a response that could not be read. Please try again.',
        HttpStatus.BAD_GATEWAY,
      );
    }
    const text = (key: string, max: number) =>
      typeof parsed[key] === 'string' ? parsed[key].slice(0, max) : null;
    return this.create(
      businessId,
      actorUserId,
      {
        pageUrl: page.url,
        proposedTitle: text('title', 300),
        proposedMetaDescription: text('metaDescription', 500),
        proposedH1: text('h1', 300),
        primaryKeyword: page.primaryKeyword,
        rationale: text('rationale', 2000),
      },
      'ai',
    );
  }

  /** Edits a draft in place (only drafts are editable; later states are kept as history). */
  async editDraft(
    businessId: string,
    actorUserId: string,
    id: string,
    input: Omit<ProposalInput, 'pageUrl'>,
  ) {
    const revision = await this.findOrThrow(businessId, id);
    if (revision.status !== SeoContentRevisionStatus.draft) {
      throw new AppException(
        SEO_ON_PAGE_ERROR_CODES.INVALID_TRANSITION,
        'Only a draft can be edited. Create a new revision instead.',
        HttpStatus.CONFLICT,
      );
    }
    const next = {
      proposedTitle:
        input.proposedTitle === undefined
          ? revision.proposedTitle
          : clean(input.proposedTitle),
      proposedMetaDescription:
        input.proposedMetaDescription === undefined
          ? revision.proposedMetaDescription
          : clean(input.proposedMetaDescription),
      proposedH1:
        input.proposedH1 === undefined
          ? revision.proposedH1
          : clean(input.proposedH1),
    };
    if (
      !next.proposedTitle &&
      !next.proposedMetaDescription &&
      !next.proposedH1
    ) {
      throw new AppException(
        SEO_ON_PAGE_ERROR_CODES.EMPTY_PROPOSAL,
        'Propose at least one of title, meta description or H1.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const updated = await this.db.seoContentRevision.update({
      where: { id, businessId },
      data: {
        ...next,
        ...(input.primaryKeyword !== undefined
          ? { primaryKeyword: clean(input.primaryKeyword) }
          : {}),
        ...(input.rationale !== undefined
          ? { rationale: clean(input.rationale) }
          : {}),
      },
    });
    await this.audit(businessId, id, 'edited', actorUserId);
    return updated;
  }

  async transition(
    businessId: string,
    actorUserId: string,
    id: string,
    to: SeoContentRevisionStatus,
    note?: string,
  ) {
    const revision = await this.findOrThrow(businessId, id);
    if (!(TRANSITIONS[revision.status] ?? []).includes(to)) {
      throw new AppException(
        SEO_ON_PAGE_ERROR_CODES.INVALID_TRANSITION,
        to === SeoContentRevisionStatus.verified
          ? 'Only a site crawl can verify a revision.'
          : `A ${revision.status.replace('_', ' ')} revision can't move to ${to.replace('_', ' ')}.`,
        HttpStatus.CONFLICT,
      );
    }
    const trimmed = clean(note);
    if (to === SeoContentRevisionStatus.rejected && !trimmed) {
      throw new AppException(
        SEO_ON_PAGE_ERROR_CODES.NOTE_REQUIRED,
        'Say why the revision is rejected.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const now = new Date();
    const updated = await this.db.seoContentRevision.update({
      where: { id, businessId },
      data: {
        status: to,
        ...(to === SeoContentRevisionStatus.approval_required
          ? { submittedAt: now }
          : {}),
        ...(to === SeoContentRevisionStatus.approved ||
        to === SeoContentRevisionStatus.rejected
          ? {
              decidedAt: now,
              decidedByUserId: actorUserId,
              decisionNote: trimmed,
            }
          : {}),
        ...(to === SeoContentRevisionStatus.applied
          ? { appliedAt: now, appliedByUserId: actorUserId }
          : {}),
      },
    });
    await this.audit(businessId, id, `status_${to}`, actorUserId, trimmed);
    return updated;
  }

  /** "Restore revision": a new draft carrying an earlier revision's proposed values. */
  async restore(businessId: string, actorUserId: string, id: string) {
    const revision = await this.findOrThrow(businessId, id);
    return this.create(
      businessId,
      actorUserId,
      {
        pageUrl: revision.pageUrl,
        proposedTitle: revision.proposedTitle,
        proposedMetaDescription: revision.proposedMetaDescription,
        proposedH1: revision.proposedH1,
        primaryKeyword: revision.primaryKeyword,
        rationale: `Restored from version ${revision.version}.`,
      },
      'restore',
    );
  }

  /**
   * Checks every applied revision against the newest crawl that finished after it was applied.
   * Verified only when every proposed field is observed live; an H1 proposal can only be checked on
   * crawls that recorded H1 text. Called after each site audit and on demand.
   */
  async verifyApplied(businessId: string) {
    const applied = await this.db.seoContentRevision.findMany({
      where: { businessId, status: SeoContentRevisionStatus.applied },
    });
    if (applied.length === 0) return { checked: 0, verified: 0 };
    const run = await this.latestRun(businessId);
    if (!run?.finishedAt) return { checked: 0, verified: 0 };
    const pages = new Map(
      SeoOnPageService.htmlPages(run.pages).map((page) => [
        pageKeyOf(page.url),
        page,
      ]),
    );
    let checked = 0;
    let verified = 0;
    for (const revision of applied) {
      if (!revision.appliedAt || run.finishedAt <= revision.appliedAt) continue;
      const page = pages.get(revision.pageKey);
      checked += 1;
      const fields: Record<string, 'match' | 'mismatch' | 'not_checked'> = {};
      const compare = (
        name: string,
        proposed: string | null,
        live: string | null | undefined,
      ) => {
        if (!proposed) return;
        if (live === undefined) fields[name] = 'not_checked';
        else fields[name] = clean(live) === proposed ? 'match' : 'mismatch';
      };
      if (page) {
        compare('title', revision.proposedTitle, page.title);
        compare(
          'metaDescription',
          revision.proposedMetaDescription,
          page.description,
        );
        compare('h1', revision.proposedH1, page.h1);
      }
      const ok =
        Boolean(page) &&
        Object.values(fields).length > 0 &&
        Object.values(fields).every((value) => value === 'match');
      await this.db.seoContentRevision.update({
        where: { id: revision.id, businessId },
        data: {
          verification: {
            auditRunId: run.id,
            checkedAt: new Date().toISOString(),
            pageFound: Boolean(page),
            fields,
          } as Prisma.InputJsonValue,
          ...(ok
            ? {
                status: SeoContentRevisionStatus.verified,
                verifiedAt: new Date(),
              }
            : {}),
        },
      });
      if (ok) {
        verified += 1;
        await this.audit(
          businessId,
          revision.id,
          'verified_by_crawl',
          null,
          run.id,
        );
      }
    }
    return { checked, verified };
  }
}
