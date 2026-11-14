import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  IntegrationProvider,
  IntegrationStatus,
  SeoContentBriefStatus,
  SeoTechnicalActionStatus,
} from '@prisma/client';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  SeoAnalyticsAttributionService,
  type SeoAnalyticsAttributionSnapshot,
} from './seo-analytics-attribution.service';

const DAY_MS = 24 * 60 * 60 * 1000;
export const REPORT_PERIODS = [7, 30, 90] as const;

function normalizePageUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    if (url.pathname.length > 1)
      url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return null;
  }
}

function pagePath(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = value.startsWith('/')
      ? new URL(value, 'https://seo-path.invalid')
      : new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : '/';
  } catch {
    return null;
  }
}

export interface ReportMetric {
  key: string;
  section:
    'visibility' | 'technical' | 'content' | 'local' | 'authority' | 'actions';
  label: string;
  baseline: number | null;
  current: number | null;
  /** Lower is better (e.g. open issues). */
  lowerIsBetter?: boolean;
  unit?: '%' | 'stars';
  source: string;
  freshness: Date | null;
  caveat: string;
}

export interface RankBuckets {
  top3: number;
  top10: number;
  top20: number;
  beyond20: number;
  notFound: number;
  unchecked: number;
}

/**
 * SEO Reports (SEO Autopilot screen 15). Compares the selected period with the one before it using
 * only records Noxtill holds: rank snapshots, site audits, content/technical/on-page actions,
 * external reviews, merchant-recorded links, Search Console snapshots and saved GA4 aggregates.
 * GA4 channel metrics do not reconcile to Noxtill orders or prove SEO causality. Changes are shown
 * next to the actions taken in the same period, never as proof that one caused the other.
 */
@Injectable()
export class SeoReportsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly analyticsAttribution: SeoAnalyticsAttributionService,
  ) {}

  private get db() {
    return this.tenantPrisma.client;
  }

  private static bucket(ranks: (number | null | undefined)[]): RankBuckets {
    const out: RankBuckets = {
      top3: 0,
      top10: 0,
      top20: 0,
      beyond20: 0,
      notFound: 0,
      unchecked: 0,
    };
    for (const rank of ranks) {
      if (rank === undefined) out.unchecked += 1;
      else if (rank === null) out.notFound += 1;
      else if (rank <= 3) out.top3 += 1;
      else if (rank <= 10) out.top10 += 1;
      else if (rank <= 20) out.top20 += 1;
      else out.beyond20 += 1;
    }
    return out;
  }

  async report(
    businessId: string,
    days: number,
    now = new Date(),
    options: { includeIntegrationData?: boolean } = {},
  ) {
    const includeIntegrationData = options.includeIntegrationData ?? true;
    const period = REPORT_PERIODS.includes(
      days as (typeof REPORT_PERIODS)[number],
    )
      ? days
      : 30;
    const currentFrom = new Date(now.getTime() - period * DAY_MS);
    const baselineFrom = new Date(currentFrom.getTime() - period * DAY_MS);

    const [
      keywords,
      runs,
      revisions,
      technical,
      briefs,
      contentOutcomeBriefs,
      actionRankKeywords,
      reviews,
      links,
      searchConsoleConnection,
      googleAnalyticsData,
    ] = await Promise.all([
      this.db.trackedKeyword.findMany({
        where: { businessId },
        select: {
          keyword: true,
          snapshots: {
            where: { capturedAt: { lte: now } },
            orderBy: { capturedAt: 'desc' },
            select: { rank: true, capturedAt: true },
            take: 60,
          },
        },
      }),
      this.db.seoAuditRun.findMany({
        where: {
          businessId,
          status: { in: ['completed', 'partial'] },
          finishedAt: { gte: baselineFrom, lte: now },
        },
        orderBy: { finishedAt: 'desc' },
        select: {
          finishedAt: true,
          issuesFound: true,
          pagesCrawled: true,
          issues: true,
        },
      }),
      this.db.seoContentRevision.findMany({
        where: {
          businessId,
          OR: [
            { verifiedAt: { gte: baselineFrom } },
            { appliedAt: { gte: baselineFrom } },
          ],
        },
        select: {
          id: true,
          pageUrl: true,
          primaryKeyword: true,
          appliedAt: true,
          verifiedAt: true,
        },
      }),
      this.db.seoTechnicalAction.findMany({
        where: {
          businessId,
          OR: [
            { verifiedAt: { gte: baselineFrom } },
            {
              status: SeoTechnicalActionStatus.applied,
              appliedAt: { gte: baselineFrom },
            },
          ],
        },
        select: {
          id: true,
          type: true,
          sourceUrl: true,
          targetValue: true,
          verifiedAt: true,
          appliedAt: true,
          status: true,
        },
      }),
      this.db.seoContentBrief.findMany({
        where: {
          businessId,
          status: SeoContentBriefStatus.published,
          publishedAt: { gte: baselineFrom },
        },
        select: { publishedAt: true, liveConfirmedAt: true },
      }),
      this.db.seoContentBrief.findMany({
        where: {
          businessId,
          status: SeoContentBriefStatus.published,
          publishedAt: { gte: baselineFrom },
        },
        orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
        take: 100,
        select: {
          id: true,
          topic: true,
          publishedUrl: true,
          publishedAt: true,
          liveConfirmedAt: true,
          baselineRank: true,
          keyword: {
            select: {
              keyword: true,
              snapshots: {
                where: { capturedAt: { lte: now } },
                orderBy: [{ capturedAt: 'desc' }, { id: 'desc' }],
                take: 60,
                select: {
                  rank: true,
                  capturedAt: true,
                },
              },
            },
          },
        },
      }),
      this.db.trackedKeyword.findMany({
        where: { businessId },
        orderBy: [{ keyword: 'asc' }, { id: 'asc' }],
        select: {
          keyword: true,
          targetPageUrl: true,
          snapshots: {
            where: { capturedAt: { lte: now } },
            orderBy: [{ capturedAt: 'desc' }, { id: 'desc' }],
            take: 60,
            select: { rank: true, capturedAt: true },
          },
        },
      }),
      this.db.externalReview.findMany({
        where: { businessId, createdAt: { gte: baselineFrom, lte: now } },
        select: { stars: true, createdAt: true },
      }),
      this.db.seoOffPageLink.findMany({
        where: { businessId, createdAt: { gte: baselineFrom, lte: now } },
        select: { createdAt: true },
      }),
      includeIntegrationData
        ? this.db.integration.findUnique({
            where: {
              businessId_provider: {
                businessId,
                provider: IntegrationProvider.google_search_console,
              },
            },
            select: { status: true, meta: true },
          })
        : Promise.resolve(null),
      includeIntegrationData
        ? this.analyticsAttribution.summary(businessId)
        : Promise.resolve(null),
    ]);
    const googleAnalytics = googleAnalyticsData ?? {
      status: 'not_evaluated' as const,
      selectedProperty: null,
      snapshot: null,
      windowDays: 28,
      disclosure:
        'Google Analytics evidence was not read because Integrations is disabled for this business.',
    };

    const integrationMeta =
      searchConsoleConnection?.meta &&
      typeof searchConsoleConnection.meta === 'object' &&
      !Array.isArray(searchConsoleConnection.meta)
        ? (searchConsoleConnection.meta as Record<string, unknown>)
        : {};
    const selectedProperty =
      typeof integrationMeta.searchConsoleSelectedProperty === 'string'
        ? integrationMeta.searchConsoleSelectedProperty
        : null;
    const searchConsoleSnapshots =
      includeIntegrationData &&
      searchConsoleConnection?.status === IntegrationStatus.connected &&
      selectedProperty
        ? await this.db.seoSearchConsoleSnapshot.findMany({
            where: { businessId, propertyUrl: selectedProperty },
            orderBy: [{ endDate: 'desc' }, { fetchedAt: 'desc' }],
            take: 2,
          })
        : [];
    const hasSearchConsoleCounts = searchConsoleSnapshots.some(
      (snapshot) => snapshot.clicks !== null || snapshot.impressions !== null,
    );

    const inCurrent = (date: Date | null | undefined) =>
      Boolean(date && date >= currentFrom && date <= now);
    const inBaseline = (date: Date | null | undefined) =>
      Boolean(date && date >= baselineFrom && date < currentFrom);

    // Rank at the end of each period = latest snapshot captured on or before that moment.
    const rankAt = (
      snapshots: { rank: number | null; capturedAt: Date }[],
      at: Date,
    ) => {
      const hit = snapshots.find((row) => row.capturedAt <= at);
      return hit ? hit.rank : undefined;
    };
    const keywordRows = keywords.map((keyword) => {
      const current = rankAt(keyword.snapshots, now);
      const baseline = rankAt(keyword.snapshots, currentFrom);
      return {
        keyword: keyword.keyword,
        baseline: baseline ?? null,
        current: current ?? null,
        baselineChecked: baseline !== undefined,
        currentChecked: current !== undefined,
        checkedAt: keyword.snapshots[0]?.capturedAt ?? null,
      };
    });
    const currentBuckets = SeoReportsService.bucket(
      keywords.map((keyword) => rankAt(keyword.snapshots, now)),
    );
    const baselineBuckets = SeoReportsService.bucket(
      keywords.map((keyword) => rankAt(keyword.snapshots, currentFrom)),
    );
    const latestSnapshot =
      keywords
        .map((keyword) => keyword.snapshots[0]?.capturedAt)
        .filter((date): date is Date => Boolean(date))
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    const currentRun = runs.find((run) => inCurrent(run.finishedAt)) ?? null;
    const baselineRun = runs.find((run) => inBaseline(run.finishedAt)) ?? null;
    const highIssues = (run: (typeof runs)[number] | null) =>
      run && Array.isArray(run.issues)
        ? (run.issues as { severity?: string }[]).filter(
            (issue) => issue.severity === 'high',
          ).length
        : null;

    const reviewStats = (filter: (date: Date) => boolean) => {
      const rows = reviews.filter((row) => filter(row.createdAt));
      return {
        count: rows.length,
        average: rows.length
          ? Math.round(
              (rows.reduce((sum, row) => sum + row.stars, 0) / rows.length) *
                10,
            ) / 10
          : null,
      };
    };
    const currentReviews = reviewStats((date) => inCurrent(date));
    const baselineReviews = reviewStats((date) => inBaseline(date));
    const latestReview =
      reviews
        .map((row) => row.createdAt)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    const completed = (filter: (date: Date | null | undefined) => boolean) =>
      revisions.filter((row) => filter(row.verifiedAt)).length +
      technical.filter((row) => filter(row.verifiedAt)).length +
      briefs.filter((row) => filter(row.liveConfirmedAt)).length;

    const contentRankOutcomes = contentOutcomeBriefs.map((brief) => {
      const publishedAt = brief.publishedAt;
      const afterPublish = publishedAt
        ? (brief.keyword?.snapshots.find(
            (snapshot) => snapshot.capturedAt > publishedAt,
          ) ?? null)
        : null;
      const measuredRank = afterPublish?.rank ?? null;
      const change =
        brief.baselineRank !== null && measuredRank !== null
          ? brief.baselineRank - measuredRank
          : null;
      const state = !brief.keyword
        ? 'keyword_not_linked'
        : brief.baselineRank === null
          ? 'baseline_not_available'
          : !afterPublish
            ? 'awaiting_post_publish_check'
            : measuredRank === null
              ? 'not_in_results'
              : 'observed';
      return {
        briefId: brief.id,
        topic: brief.topic,
        keyword: brief.keyword?.keyword ?? null,
        publishedUrl: brief.publishedUrl,
        publishedAt,
        liveConfirmedAt: brief.liveConfirmedAt,
        baselineRank: brief.baselineRank,
        measuredRank,
        measuredAt: afterPublish?.capturedAt ?? null,
        rankChange: change,
        state,
        source: 'SerpApi tracked-keyword rank history',
        caveat:
          'The baseline is the tracked keyword rank recorded at publication and the follow-up is the latest saved check after publication. This is site-level keyword movement, not the published page’s verified position, and does not show that publication caused the movement.',
      };
    });

    const rankOutcomeForAction = (action: {
      id: string;
      kind: 'on_page' | 'technical';
      label: string;
      targetUrl: string;
      appliedAt: Date;
      verifiedAt: Date | null;
      keywordMatch: (keyword: string) => boolean;
      urlMatch: (keywordUrl: string | null) => boolean;
    }) => {
      const keyword =
        actionRankKeywords.find((row) => action.keywordMatch(row.keyword)) ??
        actionRankKeywords.find((row) => action.urlMatch(row.targetPageUrl));
      const before =
        keyword?.snapshots.find(
          (snapshot) => snapshot.capturedAt <= action.appliedAt,
        ) ?? null;
      const after =
        keyword?.snapshots.find(
          (snapshot) => snapshot.capturedAt > action.appliedAt,
        ) ?? null;
      const rankChange =
        before?.rank != null && after?.rank != null
          ? before.rank - after.rank
          : null;
      const state = !keyword
        ? 'keyword_not_linked'
        : !before
          ? 'baseline_not_available'
          : !after
            ? 'awaiting_post_action_check'
            : after.rank === null
              ? 'not_in_results'
              : 'observed';
      return {
        actionId: action.id,
        kind: action.kind,
        label: action.label,
        targetUrl: action.targetUrl,
        appliedAt: action.appliedAt,
        verifiedAt: action.verifiedAt,
        keyword: keyword?.keyword ?? null,
        baselineRank: before?.rank ?? null,
        baselineCheckedAt: before?.capturedAt ?? null,
        measuredRank: after?.rank ?? null,
        measuredAt: after?.capturedAt ?? null,
        rankChange,
        state,
        source: 'SerpApi tracked-keyword rank history',
        caveat:
          'Ranks are the tracked site-level keyword observation before and after the recorded application date. They do not identify the exact target URL position or show that this change caused movement.',
      };
    };
    const actionRankOutcomes = [
      ...revisions
        .filter((revision) => revision.appliedAt !== null)
        .map((revision) => {
          const targetUrl = revision.pageUrl;
          const primaryKeyword = revision.primaryKeyword?.trim().toLowerCase();
          const normalizedUrl = normalizePageUrl(targetUrl);
          return rankOutcomeForAction({
            id: revision.id,
            kind: 'on_page',
            label: 'On-Page revision',
            targetUrl,
            appliedAt: revision.appliedAt!,
            verifiedAt: revision.verifiedAt,
            keywordMatch: (keyword) =>
              Boolean(primaryKeyword) &&
              keyword.trim().toLowerCase() === primaryKeyword,
            urlMatch: (keywordUrl) =>
              Boolean(normalizedUrl) &&
              normalizePageUrl(keywordUrl) === normalizedUrl,
          });
        }),
      ...technical
        .filter((action) => action.appliedAt !== null)
        .map((action) => {
          const normalizedUrl = normalizePageUrl(action.sourceUrl);
          return rankOutcomeForAction({
            id: action.id,
            kind: 'technical',
            label: `Technical ${action.type} change`,
            targetUrl: action.sourceUrl,
            appliedAt: action.appliedAt!,
            verifiedAt: action.verifiedAt,
            keywordMatch: () => false,
            urlMatch: (keywordUrl) =>
              Boolean(normalizedUrl) &&
              normalizePageUrl(keywordUrl) === normalizedUrl,
          });
        }),
    ]
      .sort(
        (left, right) => right.appliedAt.getTime() - left.appliedAt.getTime(),
      )
      .slice(0, 100);

    const landingPageSnapshot = googleAnalytics.snapshot;
    const landingPageOutcomeForAction = (action: {
      id: string;
      kind: 'on_page' | 'technical';
      label: string;
      targetUrl: string;
      appliedAt: Date;
    }) => {
      const targetPath = pagePath(action.targetUrl);
      const selectMatchingPaths = (
        window: SeoAnalyticsAttributionSnapshot['current'],
      ) => {
        const landingPages = window.landingPages;
        if (!landingPages || landingPages.dataState === 'not_available') {
          return {
            dataState: 'not_available' as const,
            rows: [],
            reason:
              landingPages?.reason ??
              'Google Analytics landing-page data is not available in the saved snapshot.',
          };
        }
        if (!targetPath) {
          return {
            dataState: 'path_not_matchable' as const,
            rows: [],
            reason: 'The recorded action URL does not contain a valid HTTP page path.',
          };
        }
        const rows = landingPages.rows.filter(
          (row) => pagePath(row.landingPage) === targetPath,
        );
        return {
          dataState: rows.length ? ('matched' as const) : ('no_exact_path' as const),
          rows: rows.map((row) => ({
            landingPage: targetPath,
            sessions: row.sessions,
            keyEvents: row.keyEvents,
            totalRevenue: row.totalRevenue,
          })),
          reason: rows.length
            ? null
            : 'No exact landing-page path was returned for this action URL in this saved period.',
        };
      };
      const comparison = landingPageSnapshot
        ? selectMatchingPaths(landingPageSnapshot.comparison)
        : {
            dataState: 'not_available' as const,
            rows: [],
            reason: 'Sync Google Analytics Organic Search data in SEO Settings first.',
          };
      const current = landingPageSnapshot
        ? selectMatchingPaths(landingPageSnapshot.current)
        : {
            dataState: 'not_available' as const,
            rows: [],
            reason: 'Sync Google Analytics Organic Search data in SEO Settings first.',
          };
      return {
        actionId: action.id,
        kind: action.kind,
        label: action.label,
        targetUrl: action.targetUrl,
        targetPath,
        appliedAt: action.appliedAt,
        property: landingPageSnapshot?.property ?? null,
        propertyName: landingPageSnapshot?.propertyName ?? null,
        currencyCode: landingPageSnapshot?.currencyCode ?? null,
        comparisonPeriod: landingPageSnapshot
          ? {
              startDate: landingPageSnapshot.comparison.startDate,
              endDate: landingPageSnapshot.comparison.endDate,
            }
          : null,
        currentPeriod: landingPageSnapshot
          ? {
              startDate: landingPageSnapshot.current.startDate,
              endDate: landingPageSnapshot.current.endDate,
            }
          : null,
        comparison,
        current,
        fetchedAt: landingPageSnapshot?.fetchedAt ?? null,
        disclosure:
          'Rows are Google Analytics Organic Search landing-page observations matched by exact URL path (query strings are ignored). They are the selected property’s saved comparison and current periods, not action-timed measurements, Noxtill order reconciliation, or evidence that the SEO action caused a change.',
      };
    };
    const actionLandingPageOutcomes = actionRankOutcomes.map((action) =>
      landingPageOutcomeForAction(action),
    );

    const top10 = (buckets: RankBuckets) => buckets.top3 + buckets.top10;
    const metrics: ReportMetric[] = [
      {
        key: 'keywords_top10',
        section: 'visibility',
        label: 'Tracked keywords in the top 10',
        baseline: keywords.length ? top10(baselineBuckets) : null,
        current: keywords.length ? top10(currentBuckets) : null,
        source: 'Rank checks (SerpApi)',
        freshness: latestSnapshot,
        caveat:
          'Only your tracked keywords, at their latest check before each period end.',
      },
      {
        key: 'keywords_top3',
        section: 'visibility',
        label: 'Tracked keywords in the top 3',
        baseline: keywords.length ? baselineBuckets.top3 : null,
        current: keywords.length ? currentBuckets.top3 : null,
        source: 'Rank checks (SerpApi)',
        freshness: latestSnapshot,
        caveat:
          "Checks don't set a location or device (SerpApi's defaults), so local positions can differ.",
      },
      {
        key: 'audit_issues',
        section: 'technical',
        label: 'Issues found by the site audit',
        baseline: baselineRun?.issuesFound ?? null,
        current: currentRun?.issuesFound ?? null,
        lowerIsBetter: true,
        source: 'Site audit',
        freshness: currentRun?.finishedAt ?? null,
        caveat:
          'Latest audit in each period; pages crawled can differ between audits.',
      },
      {
        key: 'audit_high_issues',
        section: 'technical',
        label: 'High-severity audit issues',
        baseline: highIssues(baselineRun),
        current: highIssues(currentRun),
        lowerIsBetter: true,
        source: 'Site audit',
        freshness: currentRun?.finishedAt ?? null,
        caveat: 'Latest audit in each period.',
      },
      {
        key: 'content_published',
        section: 'content',
        label: 'Content published',
        baseline: briefs.filter((row) => inBaseline(row.publishedAt)).length,
        current: briefs.filter((row) => inCurrent(row.publishedAt)).length,
        source: 'Content SEO (URLs you recorded)',
        freshness: null,
        caveat:
          'Counted when the published URL was recorded; live confirmation is separate.',
      },
      {
        key: 'reviews_count',
        section: 'local',
        label: 'New external reviews',
        baseline: baselineReviews.count,
        current: currentReviews.count,
        source: 'Reviews (connected platforms)',
        freshness: latestReview,
        caveat: 'Only reviews imported from connected review platforms.',
      },
      {
        key: 'reviews_average',
        section: 'local',
        label: 'Average rating of new reviews',
        baseline: baselineReviews.average,
        current: currentReviews.average,
        unit: 'stars',
        source: 'Reviews (connected platforms)',
        freshness: latestReview,
        caveat:
          'Average of reviews received in the period, not your overall rating.',
      },
      {
        key: 'links_recorded',
        section: 'authority',
        label: 'Backlinks recorded',
        baseline: links.filter((row) => inBaseline(row.createdAt)).length,
        current: links.filter((row) => inCurrent(row.createdAt)).length,
        source: 'Off-Page SEO (entered by your team)',
        freshness: null,
        caveat:
          'Only links your team recorded — Noxtill has no backlink index.',
      },
      {
        key: 'actions_completed',
        section: 'actions',
        label: 'SEO changes confirmed live',
        baseline: completed(inBaseline),
        current: completed(inCurrent),
        source: 'On-Page, Technical and Content verification by site audit',
        freshness: currentRun?.finishedAt ?? null,
        caveat: 'Shown alongside the other metrics, not as their cause.',
      },
      {
        key: 'technical_awaiting',
        section: 'actions',
        label: 'Technical changes applied, not yet confirmed',
        baseline: null,
        current: technical.filter(
          (row) => row.status === SeoTechnicalActionStatus.applied,
        ).length,
        lowerIsBetter: true,
        source: 'Technical SEO',
        freshness: null,
        caveat: 'Current count only.',
      },
    ];

    const savedOutcomeSnapshots = await this.db.seoOutcomeSnapshot.findMany({
      where: { businessId },
      orderBy: [{ measuredAt: 'desc' }, { id: 'asc' }],
      take: 100,
      select: {
        id: true,
        actionType: true,
        actionId: true,
        actionLabel: true,
        keyword: true,
        targetUrl: true,
        appliedAt: true,
        baselineRank: true,
        baselineCapturedAt: true,
        measuredRank: true,
        measuredAt: true,
        rankChange: true,
        outcomeState: true,
        rankSource: true,
        crawlVerifiedAt: true,
        caveat: true,
        createdAt: true,
      },
    });

    return {
      period: {
        days: period,
        currentFrom,
        currentTo: now,
        baselineFrom,
        baselineTo: currentFrom,
      },
      metrics,
      contentRankOutcomes,
      actionRankOutcomes,
      actionLandingPageOutcomes,
      savedOutcomeSnapshots,
      searchConsole: {
        status: includeIntegrationData
          ? (searchConsoleConnection?.status ?? IntegrationStatus.not_connected)
          : 'not_evaluated',
        selectedProperty,
        snapshots: searchConsoleSnapshots.map((snapshot) => ({
          id: snapshot.id,
          propertyUrl: snapshot.propertyUrl,
          startDate: snapshot.startDate,
          endDate: snapshot.endDate,
          clicks: snapshot.clicks?.toString() ?? null,
          impressions: snapshot.impressions?.toString() ?? null,
          clickThroughRate: snapshot.clickThroughRate?.toNumber() ?? null,
          averagePosition: snapshot.averagePosition?.toNumber() ?? null,
          dataState: snapshot.dataState,
          fetchedAt: snapshot.fetchedAt,
        })),
        windowDays: 28,
      },
      googleAnalytics: {
        status: googleAnalytics.status,
        selectedProperty: googleAnalytics.selectedProperty,
        snapshot: googleAnalytics.snapshot,
        windowDays: googleAnalytics.windowDays,
        disclosure: googleAnalytics.disclosure,
      },
      rankDistribution: { baseline: baselineBuckets, current: currentBuckets },
      keywords: keywordRows,
      notTracked: [
        ...(!includeIntegrationData
          ? [
              {
                label: 'Organic clicks and impressions',
                reason:
                  'Not evaluated because the Integrations module is disabled.',
              },
            ]
          : !searchConsoleConnection ||
        searchConsoleConnection.status !== IntegrationStatus.connected ||
        !hasSearchConsoleCounts
          ? [
              {
                label: 'Organic clicks and impressions',
                reason:
                  searchConsoleConnection?.status ===
                  IntegrationStatus.connected
                    ? searchConsoleSnapshots.length > 0
                      ? 'Google Search Console returned no clicks or impressions for the selected windows.'
                      : 'Google Search Console is connected, but no performance snapshot is available yet. Select a property and sync it in SEO Settings.'
                    : 'Connect Google Search Console, select a property and sync its performance in SEO Settings.',
              },
            ]
          : []),
        ...(!includeIntegrationData
          ? [
              {
                label: 'GA4 Organic Search sessions, key events and revenue',
                reason:
                  'Not evaluated because the Integrations module is disabled.',
              },
            ]
          : !googleAnalytics.snapshot
          ? [
              {
                label: 'GA4 Organic Search sessions, key events and revenue',
                reason:
                  googleAnalytics.status !== IntegrationStatus.connected
                    ? 'Connect Google Analytics 4, select a property and sync the read-only Organic Search report in SEO Settings.'
                    : !googleAnalytics.selectedProperty
                      ? 'Select a Google Analytics 4 property and sync it in SEO Settings.'
                      : 'Google Analytics 4 is connected, but no saved Organic Search snapshot is available yet. Sync it in SEO Settings.',
              },
            ]
          : []),
        ...(includeIntegrationData &&
          (!googleAnalytics.snapshot?.current.landingPages ||
          googleAnalytics.snapshot.current.landingPages.dataState ===
            'not_available'
            ? [
                {
                  label: 'Landing-page traffic',
                  reason:
                    googleAnalytics.snapshot?.current.landingPages?.reason ??
                    'Sync Google Analytics in SEO Settings to request Organic Search metrics by landing page.',
                },
              ]
            : [])),
        {
          label: 'SEO-attributed Noxtill orders',
          reason:
            'GA4 key events and total revenue are not reconciled to Noxtill orders and do not establish that SEO caused a sale.',
        },
      ],
    };
  }

  /** Capture the currently saved, post-action rank observations as immutable report evidence. */
  async saveOutcomeSnapshots(
    businessId: string,
    actorUserId: string,
    days: number,
    now = new Date(),
  ) {
    const report = await this.report(businessId, days, now);
    const observations = [
      ...report.contentRankOutcomes
        .filter((row) => row.measuredAt !== null)
        .map((row) => ({
          actionType: 'content_published',
          actionId: row.briefId,
          actionLabel: row.topic,
          keyword: row.keyword,
          targetUrl: row.publishedUrl,
          appliedAt: row.publishedAt!,
          baselineRank: row.baselineRank,
          baselineCapturedAt: row.publishedAt,
          measuredRank: row.measuredRank,
          measuredAt: row.measuredAt!,
          rankChange: row.rankChange,
          outcomeState: row.state,
          rankSource: row.source,
          crawlVerifiedAt: row.liveConfirmedAt,
          caveat: row.caveat,
        })),
      ...report.actionRankOutcomes
        .filter((row) => row.measuredAt !== null)
        .map((row) => ({
          actionType: row.kind,
          actionId: row.actionId,
          actionLabel: row.label,
          keyword: row.keyword,
          targetUrl: row.targetUrl,
          appliedAt: row.appliedAt,
          baselineRank: row.baselineRank,
          baselineCapturedAt: row.baselineCheckedAt,
          measuredRank: row.measuredRank,
          measuredAt: row.measuredAt!,
          rankChange: row.rankChange,
          outcomeState: row.state,
          rankSource: row.source,
          crawlVerifiedAt: row.verifiedAt,
          caveat: row.caveat,
        })),
    ];

    const createRows = observations.map((row) => {
      const observationKey = createHash('sha256')
        .update(
          JSON.stringify([
            row.actionType,
            row.actionId,
            row.appliedAt.toISOString(),
            row.baselineCapturedAt?.toISOString() ?? null,
            row.baselineRank,
            row.measuredAt.toISOString(),
            row.measuredRank,
          ]),
        )
        .digest('hex');
      return {
        businessId,
        ...row,
        observationKey,
        createdByUserId: actorUserId,
      };
    });

    const createdCount = await this.tenantPrisma.client.$transaction(
      async (tx) => {
        const result = createRows.length
          ? await tx.seoOutcomeSnapshot.createMany({
              data: createRows,
              skipDuplicates: true,
            })
          : { count: 0 };
        await tx.auditLog.create({
          data: {
            businessId,
            actorUserId,
            action: 'seo_outcome_snapshots.capture',
            entity: 'SeoOutcomeSnapshot',
            entityId: `capture:${now.toISOString()}`,
            after: {
              requestedPeriodDays: report.period.days,
              observedCandidates: createRows.length,
              createdCount: result.count,
              duplicateCount: createRows.length - result.count,
              source: 'saved tracked-keyword rank history',
            },
          },
        });
        return result.count;
      },
    );

    return {
      observedCandidates: createRows.length,
      createdCount,
      duplicateCount: createRows.length - createdCount,
      capturedAt: now,
      disclosure:
        'Snapshots preserve saved site-level keyword observations. They do not prove that an SEO action caused rank movement or that a keyword rank is the exact target page position.',
    };
  }
}
