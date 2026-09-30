import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { MasterListingService } from '../listings/master-listing.service';
import {
  SeoSiteAuditCrawler,
  type SeoSiteAuditResult,
} from './seo-site-audit.crawler';
import { SeoSiteAuditService } from './seo-site-audit.service';

describe('SeoSiteAuditService', () => {
  const result: SeoSiteAuditResult = {
    status: 'completed' as const,
    siteUrl: 'https://example.com/',
    finalUrl: 'https://example.com/',
    pagesDiscovered: 1,
    pagesCrawled: 1,
    issuesFound: 1,
    pages: [
      {
        url: 'https://example.com/',
        finalUrl: 'https://example.com/',
        statusCode: 200,
        contentType: 'text/html',
        title: null,
        description: null,
        h1Count: 1,
        imagesMissingAlt: 0,
        canonicalUrl: null,
        noindex: false,
      },
    ],
    issues: [
      {
        type: 'missing_title',
        severity: 'high',
        url: 'https://example.com/',
        evidence: 'The page has no title element.',
        recommendation: 'Add a descriptive page title.',
      },
    ],
    warnings: [],
    error: null,
  };

  function service(
    website: string | null,
    auditResult: SeoSiteAuditResult = result,
  ) {
    type CreateArgs = {
      data: { businessId: string; siteUrl: string; status: string };
    };
    type UpdateArgs = {
      where: { id: string };
      data: {
        status: string;
        finalUrl: string | null;
        pagesDiscovered: number;
        pagesCrawled: number;
        issuesFound: number;
        pages: unknown;
        issues: unknown;
        warnings: unknown;
        error: string | null;
        finishedAt: Date;
      };
    };
    const client = {
      seoAuditRun: {
        create: jest.fn((_args: CreateArgs) =>
          Promise.resolve({ id: 'audit_1' }),
        ),
        update: jest.fn(({ data }: UpdateArgs) =>
          Promise.resolve({
            id: 'audit_1',
            siteUrl: 'https://example.com/',
            ...data,
          }),
        ),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const tenantPrisma = { client } as unknown as TenantPrismaService;
    const listing = {
      find: jest.fn().mockResolvedValue(website ? { website } : null),
    };
    const crawler = { audit: jest.fn().mockResolvedValue(auditResult) };
    const activity = { record: jest.fn().mockResolvedValue(undefined) };
    const auditIssues = {
      hasRecordedIssuesForSite: jest.fn().mockResolvedValue(true),
      syncFromAudit: jest.fn().mockResolvedValue({
        newlyDetectedHighPriorityCount: 0,
      }),
    };
    const instance = new SeoSiteAuditService(
      tenantPrisma,
      listing as unknown as MasterListingService,
      crawler as unknown as SeoSiteAuditCrawler,
      activity as never,
      auditIssues as never,
    );
    return { instance, client, listing, crawler, activity, auditIssues };
  }

  it('uses the canonical Business Listing URL and persists the measured run result', async () => {
    const { instance, client, crawler, activity, auditIssues } = service(
      'https://example.com/?campaign=secret',
    );
    auditIssues.syncFromAudit.mockResolvedValue({
      newlyDetectedHighPriorityCount: 1,
    });

    const saved = await instance.run('business_1');

    expect(client.seoAuditRun.create).toHaveBeenCalledTimes(1);
    expect(client.seoAuditRun.create.mock.calls[0][0].data).toEqual({
      businessId: 'business_1',
      siteUrl: 'https://example.com/',
      status: 'running',
      triggeredBy: 'manual',
    });
    expect(crawler.audit).toHaveBeenCalledWith('https://example.com/');
    expect(client.seoAuditRun.update).toHaveBeenCalledTimes(1);
    const updateArgs = client.seoAuditRun.update.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: 'audit_1' });
    expect(updateArgs.data).toMatchObject({
      status: 'completed',
      pagesCrawled: 1,
      issuesFound: 1,
      pages: result.pages,
      issues: result.issues,
      error: null,
    });
    expect(activity.record).toHaveBeenCalledWith('business_1', {
      type: 'seo_issue_detected',
      description: 'SEO audit found 1 new or resurfaced high-priority issue.',
      entityType: 'SeoAuditRun',
      entityId: 'audit_1',
    });
    expect(auditIssues.syncFromAudit).toHaveBeenCalledWith({
      businessId: 'business_1',
      auditRunId: 'audit_1',
      siteUrl: 'https://example.com/',
      status: 'completed',
      pages: result.pages,
      issues: result.issues,
    });
    expect(saved.status).toBe('completed');
  });

  it('seeds the issue lifecycle from the latest legacy audit before detecting new issues', async () => {
    const { instance, client, activity, auditIssues } = service(
      'https://example.com',
    );
    const finishedAt = new Date('2026-09-28T12:00:00.000Z');
    const previousRun = {
      id: 'audit_previous',
      siteUrl: 'https://www.example.com/',
      status: 'completed',
      pages: result.pages,
      issues: result.issues,
      startedAt: new Date('2026-09-28T11:59:00.000Z'),
      finishedAt,
    };
    auditIssues.hasRecordedIssuesForSite.mockResolvedValue(false);
    auditIssues.syncFromAudit
      .mockResolvedValueOnce({ newlyDetectedHighPriorityCount: 1 })
      .mockResolvedValueOnce({ newlyDetectedHighPriorityCount: 0 });
    client.seoAuditRun.findFirst.mockResolvedValueOnce(previousRun);

    await instance.run('business_1');

    expect(auditIssues.syncFromAudit).toHaveBeenNthCalledWith(1, {
      businessId: 'business_1',
      auditRunId: 'audit_previous',
      siteUrl: 'https://www.example.com/',
      status: 'completed',
      pages: result.pages,
      issues: result.issues,
      observedAt: finishedAt,
    });
    expect(auditIssues.syncFromAudit).toHaveBeenCalledTimes(2);
    expect(activity.record).not.toHaveBeenCalled();
  });

  it('compares findings only on pages crawled in both audits', async () => {
    const { instance, client } = service('https://example.com');
    const current = {
      id: 'audit_2',
      businessId: 'business_1',
      status: 'completed',
      startedAt: new Date('2026-09-28T12:00:00.000Z'),
      pages: [
        { url: 'https://example.com/', finalUrl: 'https://www.example.com/' },
        {
          url: 'https://example.com/about',
          finalUrl: 'https://example.com/about',
        },
      ],
      issues: [
        {
          type: 'missing_title',
          severity: 'high',
          url: 'https://example.com/',
          evidence: 'Current title finding.',
          recommendation: 'Add a title.',
        },
        {
          type: 'missing_description',
          severity: 'medium',
          url: 'https://example.com/about?campaign=1',
          evidence: 'Current description finding.',
          recommendation: 'Add a description.',
        },
      ],
    };
    const previous = {
      id: 'audit_1',
      businessId: 'business_1',
      status: 'partial',
      startedAt: new Date('2026-09-27T12:00:00.000Z'),
      pages: [
        {
          url: 'https://www.example.com/',
          finalUrl: 'https://www.example.com/',
        },
        {
          url: 'https://example.com/about/',
          finalUrl: 'https://example.com/about/',
        },
        { url: 'https://example.com/old', finalUrl: 'https://example.com/old' },
      ],
      issues: [
        {
          type: 'missing_title',
          severity: 'high',
          url: 'https://www.example.com/',
          evidence: 'Previous title finding.',
          recommendation: 'Add a title.',
        },
        {
          type: 'missing_alt_text',
          severity: 'low',
          url: 'https://example.com/about/',
          evidence: 'Previous alt-text finding.',
          recommendation: 'Add alt text.',
        },
        {
          type: 'duplicate_title',
          severity: 'medium',
          url: 'https://example.com/about/',
          evidence: 'This title was also found on another page.',
          recommendation: 'Use a distinct title for each page.',
        },
        {
          type: 'missing_title',
          severity: 'high',
          url: 'https://example.com/old',
          evidence: 'Page no longer crawled.',
          recommendation: 'Check page.',
        },
      ],
    };
    client.seoAuditRun.findFirst
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(previous);

    const changes = await instance.compare('business_1', 'audit_2');

    expect(changes).toMatchObject({
      currentRunId: 'audit_2',
      previousRunId: 'audit_1',
      status: 'compared',
      comparedPageCount: 2,
      skippedCurrentPageCount: 0,
      skippedPreviousPageCount: 1,
      newIssues: [{ type: 'missing_description' }],
      resolvedIssues: [{ type: 'missing_alt_text' }],
    });
    expect(changes.resolvedIssues).not.toContainEqual(
      expect.objectContaining({ url: 'https://example.com/old' }),
    );
    expect(changes.resolvedIssues).not.toContainEqual(
      expect.objectContaining({ type: 'duplicate_title' }),
    );
  });

  it('does not compare failed audit runs', async () => {
    const { instance, client } = service('https://example.com');
    client.seoAuditRun.findFirst.mockResolvedValueOnce({
      id: 'audit_failed',
      status: 'failed',
      pages: [],
      issues: [],
    });

    const changes = await instance.compare('business_1', 'audit_failed');

    expect(changes).toMatchObject({
      currentRunId: 'audit_failed',
      status: 'not_comparable',
      newIssues: [],
      resolvedIssues: [],
    });
    expect(client.seoAuditRun.findFirst).toHaveBeenCalledTimes(1);
  });

  it('does not emit an SEO alert for findings below the high-priority threshold', async () => {
    const { instance, activity } = service('https://example.com', {
      ...result,
      issues: [
        {
          type: 'missing_alt_text',
          severity: 'low',
          url: 'https://example.com/',
          evidence: 'One image is missing alt text.',
          recommendation: 'Add descriptive alt text to the image.',
        },
      ],
    });

    await instance.run('business_1');

    expect(activity.record).not.toHaveBeenCalled();
  });

  it('does not emit duplicate automation events for an already-open finding', async () => {
    const { instance, activity, auditIssues } = service('https://example.com');
    auditIssues.syncFromAudit.mockResolvedValue({
      newlyDetectedHighPriorityCount: 0,
    });

    await instance.run('business_1');

    expect(activity.record).not.toHaveBeenCalled();
  });

  it('requires the canonical listing website before starting an audit', async () => {
    const { instance, client, crawler } = service(null);

    const error = await instance
      .run('business_1')
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppException);
    if (!(error instanceof AppException)) throw error;
    expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(error.getResponse()).toMatchObject({
      code: 'SEO_SITE_NOT_CONFIGURED',
    });
    expect(client.seoAuditRun.create).not.toHaveBeenCalled();
    expect(crawler.audit).not.toHaveBeenCalled();
  });

  it('rejects unsafe listing URLs before writing a run', async () => {
    const { instance, client, crawler } = service('http://127.0.0.1/admin');

    const error = await instance
      .run('business_1')
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppException);
    if (!(error instanceof AppException)) throw error;
    expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(error.getResponse()).toMatchObject({ code: 'SEO_SITE_URL_INVALID' });
    expect(client.seoAuditRun.create).not.toHaveBeenCalled();
    expect(crawler.audit).not.toHaveBeenCalled();
  });
});
