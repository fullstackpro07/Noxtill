import { ClsService } from 'nestjs-cls';
import { createHash } from 'node:crypto';
import {
  IntegrationProvider,
  IntegrationStatus,
  SeoContentBriefStatus,
  SeoContentRevisionStatus,
} from '@prisma/client';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { ConnectorRegistry } from '../integrations/connector-registry';
import { IntegrationsService } from '../integrations/integrations.service';
import { PrismaService } from '../prisma/prisma.service';
import { SeoAnalyticsAttributionService } from './seo-analytics-attribution.service';
import { SeoReportsService } from './seo-reports.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY_MS);

describe('SeoReportsService (MySQL)', () => {
  let prisma: PrismaService;
  let service: SeoReportsService;
  let tenant: TenantPrismaService;
  let businessId: string;
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    tenant = new TenantPrismaService(prisma, cls as unknown as ClsService);
    const analyticsAttribution = new SeoAnalyticsAttributionService(
      tenant,
      {} as IntegrationsService,
      { get: jest.fn() } as unknown as ConnectorRegistry,
    );
    service = new SeoReportsService(tenant, analyticsAttribution);
    businessId = (
      await prisma.business.create({
        data: { name: 'Reports Co', slug: `seo-reports-${stamp}` },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const rising = await prisma.trackedKeyword.create({
      data: { businessId, keyword: 'rising' },
    });
    const falling = await prisma.trackedKeyword.create({
      data: { businessId, keyword: 'falling' },
    });
    await prisma.trackedKeyword.create({
      data: { businessId, keyword: 'never checked' },
    });
    await prisma.keywordRankSnapshot.createMany({
      data: [
        { keywordId: rising.id, rank: 14, capturedAt: ago(40) },
        { keywordId: rising.id, rank: 2, capturedAt: ago(5) },
        { keywordId: falling.id, rank: 8, capturedAt: ago(35) },
        { keywordId: falling.id, rank: null, capturedAt: ago(3) },
      ],
    });
    const run = (finishedAt: Date, issues: { severity: string }[]) => ({
      businessId,
      status: 'completed',
      siteUrl: 'https://reports.test/',
      issuesFound: issues.length,
      issues,
      startedAt: finishedAt,
      finishedAt,
    });
    await prisma.seoAuditRun.createMany({
      data: [
        run(ago(45), [
          { severity: 'high' },
          { severity: 'high' },
          { severity: 'low' },
        ]),
        run(ago(2), [{ severity: 'low' }]),
      ],
    });
    await prisma.seoContentRevision.create({
      data: {
        businessId,
        pageUrl: 'https://reports.test/',
        pageKey: 'a'.repeat(64),
        version: 1,
        status: SeoContentRevisionStatus.verified,
        beforeSnapshot: {},
        proposedTitle: 'x',
        verifiedAt: ago(1),
      },
    });
    await prisma.seoContentBrief.create({
      data: {
        businessId,
        topic: 'Published',
        outline: [],
        questions: [],
        internalLinks: [],
        status: SeoContentBriefStatus.published,
        publishedAt: ago(10),
        liveConfirmedAt: ago(9),
      },
    });
    await prisma.externalReview.createMany({
      data: [
        {
          businessId,
          platform: 'google',
          externalId: `a${stamp}`,
          stars: 5,
          createdAt: ago(3),
        },
        {
          businessId,
          platform: 'google',
          externalId: `b${stamp}`,
          stars: 4,
          createdAt: ago(4),
        },
        {
          businessId,
          platform: 'google',
          externalId: `c${stamp}`,
          stars: 2,
          createdAt: ago(50),
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.seoSearchConsoleSnapshot.deleteMany({ where: { businessId } });
    await prisma.integration.deleteMany({ where: { businessId } });
    await prisma.externalReview.deleteMany({ where: { businessId } });
    await prisma.seoContentBrief.deleteMany({ where: { businessId } });
    await prisma.seoContentRevision.deleteMany({ where: { businessId } });
    await prisma.seoAuditRun.deleteMany({ where: { businessId } });
    await prisma.trackedKeyword.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('compares the period with the previous one using only recorded data', async () => {
    const report = await service.report(businessId, 30);
    const metric = (key: string) =>
      report.metrics.find((row) => row.key === key)!;
    expect(metric('keywords_top10')).toMatchObject({ baseline: 1, current: 1 });
    expect(metric('keywords_top3')).toMatchObject({ baseline: 0, current: 1 });
    expect(metric('audit_issues')).toMatchObject({ baseline: 3, current: 1 });
    expect(metric('audit_high_issues')).toMatchObject({
      baseline: 2,
      current: 0,
    });
    expect(metric('content_published')).toMatchObject({
      baseline: 0,
      current: 1,
    });
    expect(metric('reviews_count')).toMatchObject({ baseline: 1, current: 2 });
    expect(metric('reviews_average')).toMatchObject({
      baseline: 2,
      current: 4.5,
    });
    expect(metric('actions_completed')).toMatchObject({
      baseline: 0,
      current: 2,
    });
    expect(metric('links_recorded')).toMatchObject({ baseline: 0, current: 0 });
    expect(report.rankDistribution.current).toEqual({
      top3: 1,
      top10: 0,
      top20: 0,
      beyond20: 0,
      notFound: 1,
      unchecked: 1,
    });
    expect(
      report.keywords.find((row) => row.keyword === 'falling'),
    ).toMatchObject({
      baseline: 8,
      current: null,
      currentChecked: true,
    });
    expect(report.notTracked.map((row) => row.label)).toContain(
      'Organic clicks and impressions',
    );
    expect(report.notTracked.map((row) => row.label)).toContain(
      'Landing-page traffic',
    );
  });

  it('falls back to 30 days for an unsupported period', async () => {
    expect((await service.report(businessId, 12)).period.days).toBe(30);
  });

  it('shows saved Search Console data and stops claiming it is untracked', async () => {
    const propertyUrl = 'https://reports.test/';
    await prisma.integration.create({
      data: {
        businessId,
        provider: IntegrationProvider.google_search_console,
        status: IntegrationStatus.connected,
        meta: { searchConsoleSelectedProperty: propertyUrl },
      },
    });
    await prisma.seoSearchConsoleSnapshot.create({
      data: {
        businessId,
        propertyUrl,
        propertyHash: createHash('sha256').update(propertyUrl).digest('hex'),
        startDate: '2026-09-01',
        endDate: '2026-09-28',
        clicks: 321n,
        impressions: 1234n,
        clickThroughRate: '0.2601',
        averagePosition: '4.2',
      },
    });

    const report = await service.report(businessId, 30);
    expect(report.searchConsole).toMatchObject({
      status: IntegrationStatus.connected,
      selectedProperty: propertyUrl,
      snapshots: [
        {
          clicks: '321',
          impressions: '1234',
          clickThroughRate: 0.2601,
          averagePosition: 4.2,
        },
      ],
    });
    expect(report.notTracked.map((row) => row.label)).not.toContain(
      'Organic clicks and impressions',
    );

    const snapshot = await prisma.seoSearchConsoleSnapshot.findFirstOrThrow({
      where: { businessId },
    });
    await prisma.seoSearchConsoleSnapshot.update({
      where: { id: snapshot.id },
      data: {
        clicks: null,
        impressions: null,
        clickThroughRate: null,
        averagePosition: null,
        dataState: 'no_data_returned',
      },
    });
    const noDataReport = await service.report(businessId, 30);
    expect(noDataReport.notTracked).toContainEqual({
      label: 'Organic clicks and impressions',
      reason:
        'Google Search Console returned no clicks or impressions for the selected windows.',
    });
  });

  it('shows saved GA4 Organic Search metrics while disclosing what they do not prove', async () => {
    const property = 'properties/987654';
    const disclosure =
      'GA4-reported Organic Search aggregates; these values do not prove that SEO caused an outcome.';
    await prisma.integration.create({
      data: {
        businessId,
        provider: IntegrationProvider.google_analytics,
        status: IntegrationStatus.connected,
        meta: {
          analyticsSelectedProperty: property,
          analyticsOrganicSearchSnapshot: {
            property,
            propertyName: 'Reports GA4 QA',
            currencyCode: 'USD',
            timeZone: 'UTC',
            windowDays: 28,
            current: {
              startDate: '2026-10-01',
              endDate: '2026-10-28',
              dataState: 'returned',
              sessions: '140',
              keyEvents: '7',
              totalRevenue: '245.50',
              landingPages: {
                dataState: 'returned',
                rows: [
                  {
                    landingPage: '/products/widget',
                    sessions: '42',
                    keyEvents: '3',
                    totalRevenue: '90.00',
                  },
                ],
                totalRows: 1,
                truncated: false,
                reason: null,
              },
            },
            comparison: {
              startDate: '2026-09-03',
              endDate: '2026-09-30',
              dataState: 'returned',
              sessions: '100',
              keyEvents: '4',
              totalRevenue: '190.00',
            },
            fetchedAt: new Date().toISOString(),
            disclosure,
          },
        },
      },
    });

    const report = await service.report(businessId, 30);
    expect(report.googleAnalytics).toMatchObject({
      status: IntegrationStatus.connected,
      selectedProperty: property,
      snapshot: {
        propertyName: 'Reports GA4 QA',
        current: {
          sessions: '140',
          keyEvents: '7',
          totalRevenue: '245.50',
          landingPages: {
            dataState: 'returned',
            rows: [{ landingPage: '/products/widget', sessions: '42' }],
          },
        },
        comparison: { sessions: '100', keyEvents: '4', totalRevenue: '190.00' },
      },
    });
    expect(report.notTracked.map((row) => row.label)).not.toContain(
      'GA4 Organic Search sessions, key events and revenue',
    );
    expect(report.notTracked.map((row) => row.label)).not.toContain(
      'Landing-page traffic',
    );
    expect(report.notTracked).toContainEqual({
      label: 'SEO-attributed Noxtill orders',
      reason:
        'GA4 key events and total revenue are not reconciled to Noxtill orders and do not establish that SEO caused a sale.',
    });
  });
});
