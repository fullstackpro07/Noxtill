import { HttpStatus, Injectable } from '@nestjs/common';
import {
  Prisma,
  SeoAuditIssueStatus,
  SeoTechnicalActionStatus,
  SeoTechnicalActionType,
} from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { normalizePageUrl } from './seo-on-page.service';
import type { SeoAuditPage } from './seo-site-audit.util';

export const SEO_TECHNICAL_ERROR_CODES = {
  NOT_FOUND: 'SEO_TECHNICAL_ACTION_NOT_FOUND',
  INVALID: 'SEO_TECHNICAL_ACTION_INVALID',
  VALIDATION_FAILED: 'SEO_TECHNICAL_VALIDATION_FAILED',
  INVALID_TRANSITION: 'SEO_TECHNICAL_INVALID_TRANSITION',
  NOTE_REQUIRED: 'SEO_TECHNICAL_NOTE_REQUIRED',
} as const;

/** Crawler issue types that belong to Technical SEO, grouped like the spec's tabs. */
export const TECHNICAL_ISSUE_GROUPS: Record<string, string[]> = {
  indexability: ['noindex_directive', 'non_html_page'],
  broken_links: ['http_error', 'page_fetch_failed', 'broken_internal_link'],
  canonicals: ['missing_canonical'],
  sitemaps: ['missing_sitemap'],
  security: ['insecure_http', 'mixed_content'],
  performance: ['response_too_large'],
};
export const TECHNICAL_ISSUE_TYPES = Object.values(
  TECHNICAL_ISSUE_GROUPS,
).flat();

/** Spec §3.3: robots / noindex are high risk; redirects / canonicals medium; the rest low. */
export const TECHNICAL_RISK: Record<
  SeoTechnicalActionType,
  'low' | 'medium' | 'high'
> = {
  robots: 'high',
  indexability: 'high',
  redirect: 'medium',
  canonical: 'medium',
  sitemap: 'low',
  other: 'low',
};

const OPEN: SeoTechnicalActionStatus[] = [
  SeoTechnicalActionStatus.draft,
  SeoTechnicalActionStatus.approval_required,
  SeoTechnicalActionStatus.approved,
];
const TRANSITIONS: Partial<
  Record<SeoTechnicalActionStatus, SeoTechnicalActionStatus[]>
> = {
  draft: [
    SeoTechnicalActionStatus.approval_required,
    SeoTechnicalActionStatus.cancelled,
  ],
  approval_required: [
    SeoTechnicalActionStatus.approved,
    SeoTechnicalActionStatus.rejected,
    SeoTechnicalActionStatus.cancelled,
  ],
  approved: [
    SeoTechnicalActionStatus.applied,
    SeoTechnicalActionStatus.cancelled,
  ],
};

export interface TechnicalActionInput {
  type: SeoTechnicalActionType;
  sourceUrl: string;
  targetValue?: string | null;
  description?: string | null;
  issueId?: string | null;
}

export interface Validation {
  ok: boolean;
  problems: string[];
  warnings: string[];
}

const sameUrl = (a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a && b) && normalizePageUrl(a!) === normalizePageUrl(b!);

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Technical SEO (SEO Autopilot screen 5). Reads technical findings and page state from the latest
 * site crawl, and manages proposed technical changes. Noxtill doesn't control the merchant's server
 * or DNS, so nothing is executed here: an approved change is applied by the merchant, and a later
 * crawl verifies it. Structured data, Core Web Vitals and hreflang are not collected by the crawler.
 */
@Injectable()
export class SeoTechnicalService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

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

  private static pagesOf(pages: unknown): SeoAuditPage[] {
    return Array.isArray(pages)
      ? (pages as SeoAuditPage[]).filter(
          (page) => page && typeof page.url === 'string',
        )
      : [];
  }

  private static isIndexable(page: SeoAuditPage) {
    return (
      page.statusCode < 400 &&
      !page.noindex &&
      (page.contentType === 'text/html' ||
        page.contentType === 'application/xhtml+xml')
    );
  }

  async overview(businessId: string) {
    const run = await this.latestRun(businessId);
    const pages = SeoTechnicalService.pagesOf(run?.pages);
    const issues = await this.db.seoAuditIssue.findMany({
      where: {
        businessId,
        status: SeoAuditIssueStatus.open,
        type: { in: TECHNICAL_ISSUE_TYPES },
      },
      orderBy: [{ severity: 'asc' }, { lastSeenAt: 'desc' }],
      take: 500,
      select: {
        id: true,
        type: true,
        severity: true,
        pageUrl: true,
        evidence: true,
        recommendation: true,
        firstSeenAt: true,
        lastSeenAt: true,
      },
    });
    const indexable = pages.filter((page) =>
      SeoTechnicalService.isIndexable(page),
    );
    const sitemapKnown = indexable.filter(
      (page) => typeof page.inSitemap === 'boolean',
    );
    const redirects = pages
      .filter((page) => page.finalUrl && !sameUrl(page.url, page.finalUrl))
      .map((page) => ({
        url: page.url,
        finalUrl: page.finalUrl,
        statusCode: page.statusCode,
      }));
    const canonicals = pages
      .filter(
        (page) => page.canonicalUrl && !sameUrl(page.url, page.canonicalUrl),
      )
      .map((page) => ({ url: page.url, canonicalUrl: page.canonicalUrl }));
    const brokenTypes = TECHNICAL_ISSUE_GROUPS.broken_links;
    return {
      crawl: run
        ? {
            auditRunId: run.id,
            siteUrl: run.siteUrl,
            finishedAt: run.finishedAt,
          }
        : null,
      kpis: {
        criticalIssues: issues.filter((issue) => issue.severity === 'high')
          .length,
        indexablePages: run ? indexable.length : null,
        pagesCrawled: pages.length,
        /** null = unknown: no readable sitemap, or a crawl from before sitemap tracking. */
        sitemapCoverage:
          sitemapKnown.length > 0
            ? {
                inSitemap: sitemapKnown.filter((page) => page.inSitemap).length,
                of: sitemapKnown.length,
              }
            : null,
        brokenLinks: issues.filter((issue) => brokenTypes.includes(issue.type))
          .length,
        canonicalConflicts: canonicals.length,
        redirectedPages: redirects.length,
      },
      issues: issues.map((issue) => ({
        ...issue,
        group:
          Object.entries(TECHNICAL_ISSUE_GROUPS).find(([, types]) =>
            types.includes(issue.type),
          )?.[0] ?? 'other',
      })),
      redirects,
      canonicals,
      nonIndexable: pages
        .filter((page) => page.noindex)
        .map((page) => ({ url: page.url })),
    };
  }

  async validate(
    businessId: string,
    input: TechnicalActionInput,
    excludeId?: string,
  ): Promise<Validation> {
    const problems: string[] = [];
    const warnings: string[] = [];
    const run = await this.latestRun(businessId);
    const pages = SeoTechnicalService.pagesOf(run?.pages);
    const find = (url: string) => pages.find((page) => sameUrl(page.url, url));
    const target = input.targetValue?.trim() ?? '';
    const source = find(input.sourceUrl);
    if (!source) {
      warnings.push(
        'The source URL was not in the latest site audit, so its current state is unknown.',
      );
    }

    if (
      input.type === SeoTechnicalActionType.redirect ||
      input.type === SeoTechnicalActionType.canonical
    ) {
      if (!isHttpUrl(target)) {
        problems.push('Enter the full destination URL (https://…).');
      } else {
        if (sameUrl(target, input.sourceUrl)) {
          problems.push(
            input.type === SeoTechnicalActionType.redirect
              ? 'A URL cannot redirect to itself (redirect loop).'
              : 'The page already is its own canonical; nothing to change.',
          );
        }
        const targetPage = find(target);
        if (targetPage && targetPage.statusCode >= 400) {
          problems.push(
            `The destination returned HTTP ${targetPage.statusCode} in the latest audit.`,
          );
        }
        if (targetPage?.noindex) {
          problems.push('The destination is marked noindex.');
        }
        if (
          targetPage &&
          targetPage.finalUrl &&
          !sameUrl(targetPage.url, targetPage.finalUrl)
        ) {
          warnings.push(
            `The destination already redirects to ${targetPage.finalUrl} — point straight there to avoid a redirect chain.`,
          );
        }
        if (!targetPage) {
          warnings.push(
            'The destination was not in the latest site audit; check it loads before applying.',
          );
        }
        try {
          if (
            new URL(target).host.toLowerCase() !==
            new URL(input.sourceUrl).host.toLowerCase()
          ) {
            warnings.push('The destination is on a different domain.');
          }
        } catch {
          // invalid source URL is rejected by the DTO
        }
        if (input.type === SeoTechnicalActionType.redirect) {
          const pending = await this.db.seoTechnicalAction.findMany({
            where: {
              businessId,
              type: SeoTechnicalActionType.redirect,
              status: {
                in: [...OPEN, SeoTechnicalActionStatus.applied],
              },
              ...(excludeId ? { id: { not: excludeId } } : {}),
            },
            select: { sourceUrl: true, targetValue: true },
          });
          for (const other of pending) {
            if (
              sameUrl(other.sourceUrl, target) &&
              sameUrl(other.targetValue, input.sourceUrl)
            ) {
              problems.push(
                `Another proposed redirect sends ${other.sourceUrl} back to this URL (redirect loop).`,
              );
            } else if (sameUrl(other.sourceUrl, target)) {
              warnings.push(
                `Another proposed redirect moves the destination on to ${other.targetValue} (redirect chain).`,
              );
            } else if (sameUrl(other.sourceUrl, input.sourceUrl)) {
              warnings.push(
                'Another open redirect already exists for this URL.',
              );
            }
          }
        }
      }
    } else if (input.type === SeoTechnicalActionType.indexability) {
      if (target !== 'index' && target !== 'noindex') {
        problems.push('Choose index or noindex.');
      } else if (
        target === 'noindex' &&
        run &&
        sameUrl(input.sourceUrl, run.siteUrl)
      ) {
        warnings.push(
          'This removes your homepage from search results — very high blast radius.',
        );
      }
    } else if (input.type === SeoTechnicalActionType.sitemap) {
      if (target !== 'include' && target !== 'exclude') {
        problems.push('Choose include or exclude.');
      }
    } else if (!input.description?.trim()) {
      problems.push(
        'Describe the exact change (for example the robots.txt rule).',
      );
    }
    return { ok: problems.length === 0, problems, warnings };
  }

  async list(businessId: string) {
    return this.db.seoTechnicalAction.findMany({
      where: { businessId },
      orderBy: [{ updatedAt: 'desc' }],
      take: 300,
    });
  }

  private async findOrThrow(businessId: string, id: string) {
    const action = await this.db.seoTechnicalAction.findFirst({
      where: { id, businessId },
    });
    if (!action) {
      throw new AppException(
        SEO_TECHNICAL_ERROR_CODES.NOT_FOUND,
        'Technical change was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return action;
  }

  private async audit(
    businessId: string,
    actionId: string,
    action: string,
    actorUserId: string | null,
    note?: string | null,
  ) {
    await this.db.seoTechnicalActionAudit.create({
      data: { businessId, actionId, action, actorUserId, note: note ?? null },
    });
  }

  async create(
    businessId: string,
    actorUserId: string,
    input: TechnicalActionInput,
  ) {
    if (!isHttpUrl(input.sourceUrl)) {
      throw new AppException(
        SEO_TECHNICAL_ERROR_CODES.INVALID,
        'Enter the full URL of the affected page.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const [validation, run] = await Promise.all([
      this.validate(businessId, input),
      this.latestRun(businessId),
    ]);
    const page = SeoTechnicalService.pagesOf(run?.pages).find((row) =>
      sameUrl(row.url, input.sourceUrl),
    );
    const action = await this.db.seoTechnicalAction.create({
      data: {
        businessId,
        type: input.type,
        risk: TECHNICAL_RISK[input.type],
        sourceUrl: input.sourceUrl.trim(),
        targetValue: input.targetValue?.trim() || null,
        description: input.description?.trim() || null,
        issueId: input.issueId ?? null,
        currentState: (page
          ? {
              crawled: true,
              auditRunId: run!.id,
              statusCode: page.statusCode,
              finalUrl: page.finalUrl,
              canonicalUrl: page.canonicalUrl,
              noindex: page.noindex,
              inSitemap: page.inSitemap ?? null,
            }
          : { crawled: false }) as Prisma.InputJsonValue,
        validation: validation as unknown as Prisma.InputJsonValue,
        createdByUserId: actorUserId,
      },
    });
    await this.audit(businessId, action.id, 'created', actorUserId);
    return action;
  }

  async transition(
    businessId: string,
    actorUserId: string,
    id: string,
    to: SeoTechnicalActionStatus,
    note?: string,
  ) {
    const action = await this.findOrThrow(businessId, id);
    if (!(TRANSITIONS[action.status] ?? []).includes(to)) {
      throw new AppException(
        SEO_TECHNICAL_ERROR_CODES.INVALID_TRANSITION,
        to === SeoTechnicalActionStatus.verified
          ? 'Only a site crawl can verify a technical change.'
          : `A ${action.status.replace('_', ' ')} change can't move to ${to.replace('_', ' ')}.`,
        HttpStatus.CONFLICT,
      );
    }
    const trimmed = note?.trim() || null;
    if (to === SeoTechnicalActionStatus.rejected && !trimmed) {
      throw new AppException(
        SEO_TECHNICAL_ERROR_CODES.NOTE_REQUIRED,
        'Say why the change is rejected.',
        HttpStatus.BAD_REQUEST,
      );
    }
    let validation: Validation | null = null;
    if (
      to === SeoTechnicalActionStatus.approval_required ||
      to === SeoTechnicalActionStatus.approved
    ) {
      // Re-validate against the latest crawl and other proposals at every gate.
      validation = await this.validate(businessId, action, action.id);
      if (!validation.ok) {
        await this.db.seoTechnicalAction.update({
          where: { id, businessId },
          data: { validation: validation as unknown as Prisma.InputJsonValue },
        });
        throw new AppException(
          SEO_TECHNICAL_ERROR_CODES.VALIDATION_FAILED,
          validation.problems.join(' '),
          HttpStatus.CONFLICT,
        );
      }
    }
    const updated = await this.db.seoTechnicalAction.update({
      where: { id, businessId },
      data: {
        status: to,
        ...(validation
          ? { validation: validation as unknown as Prisma.InputJsonValue }
          : {}),
        ...(to === SeoTechnicalActionStatus.approved ||
        to === SeoTechnicalActionStatus.rejected
          ? { decidedByUserId: actorUserId, decisionNote: trimmed }
          : {}),
        ...(to === SeoTechnicalActionStatus.applied
          ? { appliedAt: new Date() }
          : {}),
      },
    });
    await this.audit(businessId, id, `status_${to}`, actorUserId, trimmed);
    return updated;
  }

  /**
   * Checks applied changes against the newest crawl finished after they were applied. robots and
   * "other" changes are recorded as not verifiable by the crawler and stay applied.
   */
  async verifyApplied(businessId: string) {
    const applied = await this.db.seoTechnicalAction.findMany({
      where: { businessId, status: SeoTechnicalActionStatus.applied },
    });
    if (applied.length === 0) return { checked: 0, verified: 0 };
    const run = await this.latestRun(businessId);
    if (!run?.finishedAt) return { checked: 0, verified: 0 };
    const pages = SeoTechnicalService.pagesOf(run.pages);
    let checked = 0;
    let verified = 0;
    for (const action of applied) {
      if (!action.appliedAt || run.finishedAt <= action.appliedAt) continue;
      checked += 1;
      const page = pages.find((row) => sameUrl(row.url, action.sourceUrl));
      let result: 'match' | 'mismatch' | 'not_verifiable' | 'page_not_crawled';
      let observed: unknown = null;
      if (
        action.type === SeoTechnicalActionType.robots ||
        action.type === SeoTechnicalActionType.other
      ) {
        result = 'not_verifiable';
      } else if (!page) {
        result = 'page_not_crawled';
      } else if (action.type === SeoTechnicalActionType.redirect) {
        observed = page.finalUrl;
        result = sameUrl(page.finalUrl, action.targetValue)
          ? 'match'
          : 'mismatch';
      } else if (action.type === SeoTechnicalActionType.canonical) {
        observed = page.canonicalUrl;
        result = sameUrl(page.canonicalUrl, action.targetValue)
          ? 'match'
          : 'mismatch';
      } else if (action.type === SeoTechnicalActionType.indexability) {
        observed = page.noindex ? 'noindex' : 'index';
        result = observed === action.targetValue ? 'match' : 'mismatch';
      } else {
        observed = page.inSitemap ?? null;
        result =
          typeof page.inSitemap !== 'boolean'
            ? 'not_verifiable'
            : page.inSitemap === (action.targetValue === 'include')
              ? 'match'
              : 'mismatch';
      }
      const ok = result === 'match';
      await this.db.seoTechnicalAction.update({
        where: { id: action.id, businessId },
        data: {
          verification: {
            auditRunId: run.id,
            checkedAt: new Date().toISOString(),
            result,
            observed,
          } as Prisma.InputJsonValue,
          ...(ok
            ? {
                status: SeoTechnicalActionStatus.verified,
                verifiedAt: new Date(),
              }
            : {}),
        },
      });
      if (ok) {
        verified += 1;
        await this.audit(
          businessId,
          action.id,
          'verified_by_crawl',
          null,
          run.id,
        );
      }
    }
    return { checked, verified };
  }
}
