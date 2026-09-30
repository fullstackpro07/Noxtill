import { HttpStatus, Injectable } from '@nestjs/common';
import { ActivityEventType, Prisma } from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { MasterListingService } from '../listings/master-listing.service';
import {
  SeoSiteAuditCrawler,
  type SeoSiteAuditResult,
} from './seo-site-audit.crawler';
import {
  normalizeWebsiteUrl,
  type SeoAuditIssue,
  type SeoAuditPage,
} from './seo-site-audit.util';
import { ActivityService } from '../activity/activity.service';
import { SeoAuditIssuesService } from './seo-audit-issues.service';

const SEO_AUDIT_NOT_FOUND = 'SEO_AUDIT_NOT_FOUND';
const SEO_SITE_NOT_CONFIGURED = 'SEO_SITE_NOT_CONFIGURED';
const SEO_SITE_URL_INVALID = 'SEO_SITE_URL_INVALID';

@Injectable()
export class SeoSiteAuditService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly masterListing: MasterListingService,
    private readonly crawler: SeoSiteAuditCrawler,
    private readonly activity: ActivityService,
    private readonly auditIssues: SeoAuditIssuesService,
  ) {}

  async list(businessId: string) {
    return this.tenantPrisma.client.seoAuditRun.findMany({
      where: { businessId },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: 20,
    });
  }

  async get(businessId: string, id: string) {
    const run = await this.tenantPrisma.client.seoAuditRun.findFirst({
      where: { id, businessId },
    });
    if (!run) {
      throw new AppException(
        SEO_AUDIT_NOT_FOUND,
        'SEO audit run not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return run;
  }

  /** Compare only pages successfully observed in both runs; absent pages are never called fixed. */
  async compare(businessId: string, id: string) {
    const current = await this.get(businessId, id);
    if (current.status !== 'completed' && current.status !== 'partial') {
      return {
        currentRunId: current.id,
        previousRunId: null,
        status: 'not_comparable' as const,
        comparedPageCount: 0,
        skippedCurrentPageCount: 0,
        skippedPreviousPageCount: 0,
        newIssues: [],
        resolvedIssues: [],
        reason: 'Only completed or partial audits can be compared.',
      };
    }

    const previous = await this.tenantPrisma.client.seoAuditRun.findFirst({
      where: {
        businessId,
        status: { in: ['completed', 'partial'] },
        OR: [
          { startedAt: { lt: current.startedAt } },
          { startedAt: current.startedAt, id: { lt: current.id } },
        ],
      },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    });

    if (!previous) {
      return {
        currentRunId: current.id,
        previousRunId: null,
        status: 'no_previous_audit' as const,
        comparedPageCount: 0,
        skippedCurrentPageCount: this.readPages(current.pages).length,
        skippedPreviousPageCount: 0,
        newIssues: [],
        resolvedIssues: [],
        reason: 'A previous completed website audit is not available.',
      };
    }

    const currentPages = this.readPages(current.pages);
    const previousPages = this.readPages(previous.pages);
    const currentPageKeys = new Set(
      currentPages
        .map((page) => this.auditPageKey(page.url))
        .filter((key): key is string => key !== null),
    );
    const previousPageKeys = new Set(
      previousPages
        .map((page) => this.auditPageKey(page.url))
        .filter((key): key is string => key !== null),
    );
    const overlappingPages = new Set(
      [...currentPageKeys].filter((pageKey) => previousPageKeys.has(pageKey)),
    );
    const currentIssues = this.issuesOnPages(
      this.readIssues(current.issues),
      overlappingPages,
    );
    const previousIssues = this.issuesOnPages(
      this.readIssues(previous.issues),
      overlappingPages,
    );
    const currentIssueKeys = new Set(currentIssues.map(({ key }) => key));
    const previousIssueKeys = new Set(previousIssues.map(({ key }) => key));

    return {
      currentRunId: current.id,
      previousRunId: previous.id,
      status:
        overlappingPages.size > 0
          ? ('compared' as const)
          : ('not_comparable' as const),
      comparedPageCount: overlappingPages.size,
      skippedCurrentPageCount: currentPageKeys.size - overlappingPages.size,
      skippedPreviousPageCount: previousPageKeys.size - overlappingPages.size,
      newIssues: currentIssues
        .filter(({ key }) => !previousIssueKeys.has(key))
        .map(({ issue }) => issue),
      resolvedIssues: previousIssues
        .filter(
          ({ key, issue }) =>
            // Duplicate titles are site-relative; a bounded audit cannot prove the
            // other matching page was checked this time.
            !currentIssueKeys.has(key) && issue.type !== 'duplicate_title',
        )
        .map(({ issue }) => issue),
      reason:
        overlappingPages.size > 0
          ? null
          : 'The audits have no successfully crawled pages in common; no issue changes are asserted.',
    };
  }

  private readPages(value: unknown): SeoAuditPage[] {
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is SeoAuditPage => {
      if (!this.isRecord(entry)) return false;
      return typeof entry.url === 'string';
    });
  }

  private readIssues(value: unknown): SeoAuditIssue[] {
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is SeoAuditIssue => {
      if (!this.isRecord(entry)) return false;
      return (
        typeof entry.type === 'string' &&
        typeof entry.url === 'string' &&
        typeof entry.severity === 'string' &&
        typeof entry.evidence === 'string' &&
        typeof entry.recommendation === 'string'
      );
    });
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private auditPageKey(input: string): string | null {
    try {
      const url = new URL(input);
      const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
      const pathname = url.pathname.replace(/\/+$/, '') || '/';
      const port = url.port ? `:${url.port}` : '';
      return `${hostname}${port}${pathname}`;
    } catch {
      return null;
    }
  }

  private auditHost(input: string): string | null {
    try {
      return new URL(input).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return null;
    }
  }

  private issuesOnPages(
    issues: SeoAuditIssue[],
    pageKeys: Set<string>,
  ): Array<{ key: string; issue: SeoAuditIssue }> {
    const byKey = new Map<string, SeoAuditIssue>();
    for (const issue of issues) {
      const pageKey = this.auditPageKey(issue.url);
      if (!pageKey || !pageKeys.has(pageKey)) continue;
      const key = `${pageKey}\u0000${issue.type}`;
      if (!byKey.has(key)) byKey.set(key, issue);
    }
    return [...byKey].map(([key, issue]) => ({ key, issue }));
  }

  async run(businessId: string, triggeredBy: 'manual' | 'schedule' = 'manual') {
    const listing = await this.masterListing.find(businessId);
    if (!listing?.website?.trim()) {
      throw new AppException(
        SEO_SITE_NOT_CONFIGURED,
        'Add your website in Business Listings before running a site audit.',
        HttpStatus.BAD_REQUEST,
      );
    }

    let siteUrl: URL;
    try {
      siteUrl = normalizeWebsiteUrl(listing.website);
    } catch {
      throw new AppException(
        SEO_SITE_URL_INVALID,
        'The website URL in Business Listings is invalid or uses an unsupported address.',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (
      !(await this.auditIssues.hasRecordedIssuesForSite(
        businessId,
        siteUrl.href,
      ))
    ) {
      const previousRun = await this.tenantPrisma.client.seoAuditRun.findFirst({
        where: {
          businessId,
          status: { in: ['completed', 'partial'] },
        },
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      });
      if (
        previousRun &&
        this.auditHost(previousRun.siteUrl) === this.auditHost(siteUrl.href)
      ) {
        await this.auditIssues.syncFromAudit({
          businessId,
          auditRunId: previousRun.id,
          siteUrl: previousRun.siteUrl,
          status: previousRun.status as 'completed' | 'partial',
          pages: this.readPages(previousRun.pages),
          issues: this.readIssues(previousRun.issues),
          observedAt: previousRun.finishedAt ?? previousRun.startedAt,
        });
      }
    }

    const created = await this.tenantPrisma.client.seoAuditRun.create({
      data: {
        businessId,
        siteUrl: siteUrl.href,
        status: 'running',
        triggeredBy,
      },
    });

    let auditResult: SeoSiteAuditResult;
    try {
      auditResult = await this.crawler.audit(siteUrl.href);
    } catch {
      auditResult = {
        status: 'failed' as const,
        siteUrl: siteUrl.href,
        finalUrl: null,
        pagesDiscovered: 0,
        pagesCrawled: 0,
        issuesFound: 0,
        pages: [],
        issues: [],
        warnings: [],
        error:
          'The audit could not be completed. Check the website URL and try again.',
      };
    }

    const savedRun = await this.tenantPrisma.client.seoAuditRun.update({
      where: { id: created.id },
      data: {
        status: auditResult.status,
        finalUrl: auditResult.finalUrl,
        pagesDiscovered: auditResult.pagesDiscovered,
        pagesCrawled: auditResult.pagesCrawled,
        issuesFound: auditResult.issuesFound,
        pages: auditResult.pages as unknown as Prisma.InputJsonValue,
        issues: auditResult.issues as unknown as Prisma.InputJsonValue,
        warnings: auditResult.warnings as unknown as Prisma.InputJsonValue,
        error: auditResult.error,
        finishedAt: new Date(),
      },
    });

    const issueChanges = await this.auditIssues.syncFromAudit({
      businessId,
      auditRunId: savedRun.id,
      siteUrl: savedRun.siteUrl,
      status: auditResult.status,
      pages: auditResult.pages,
      issues: auditResult.issues,
    });

    const highPriorityIssueCount = issueChanges.newlyDetectedHighPriorityCount;
    if (highPriorityIssueCount > 0) {
      await this.activity.record(businessId, {
        type: ActivityEventType.seo_issue_detected,
        description: `SEO audit found ${highPriorityIssueCount} new or resurfaced high-priority issue${highPriorityIssueCount === 1 ? '' : 's'}.`,
        entityType: 'SeoAuditRun',
        entityId: savedRun.id,
      });
    }
    return savedRun;
  }
}
