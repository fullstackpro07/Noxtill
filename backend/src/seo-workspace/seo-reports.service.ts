import { Injectable } from '@nestjs/common';
import {
  SeoContentBriefStatus,
  SeoTechnicalActionStatus,
} from '@prisma/client';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
export const REPORT_PERIODS = [7, 30, 90] as const;

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
 * external reviews and merchant-recorded links. Organic clicks/impressions and conversions are
 * reported as not tracked (no Search Console / analytics source). Changes are shown next to the
 * actions taken in the same period, never as proof that one caused the other.
 */
@Injectable()
export class SeoReportsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

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

  async report(businessId: string, days: number, now = new Date()) {
    const period = REPORT_PERIODS.includes(
      days as (typeof REPORT_PERIODS)[number],
    )
      ? days
      : 30;
    const currentFrom = new Date(now.getTime() - period * DAY_MS);
    const baselineFrom = new Date(currentFrom.getTime() - period * DAY_MS);

    const [keywords, runs, revisions, technical, briefs, reviews, links] =
      await Promise.all([
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
          where: { businessId, verifiedAt: { gte: baselineFrom } },
          select: { verifiedAt: true },
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
          select: { verifiedAt: true, appliedAt: true, status: true },
        }),
        this.db.seoContentBrief.findMany({
          where: {
            businessId,
            status: SeoContentBriefStatus.published,
            publishedAt: { gte: baselineFrom },
          },
          select: { publishedAt: true, liveConfirmedAt: true },
        }),
        this.db.externalReview.findMany({
          where: { businessId, createdAt: { gte: baselineFrom, lte: now } },
          select: { stars: true, createdAt: true },
        }),
        this.db.seoOffPageLink.findMany({
          where: { businessId, createdAt: { gte: baselineFrom, lte: now } },
          select: { createdAt: true },
        }),
      ]);

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

    return {
      period: {
        days: period,
        currentFrom,
        currentTo: now,
        baselineFrom,
        baselineTo: currentFrom,
      },
      metrics,
      rankDistribution: { baseline: baselineBuckets, current: currentBuckets },
      keywords: keywordRows,
      notTracked: [
        {
          label: 'Organic clicks and impressions',
          reason: 'No Google Search Console connection.',
        },
        {
          label: 'Organic conversions and revenue',
          reason: 'No analytics or attribution source links visits to orders.',
        },
        { label: 'Landing-page traffic', reason: 'No analytics connection.' },
      ],
    };
  }
}
