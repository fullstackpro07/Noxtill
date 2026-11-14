import { apiFetch } from "@/lib/api-client";
import type { SeoAnalyticsSnapshot } from "@/lib/seo-analytics-attribution-api";

export type ReportSection =
  "visibility" | "technical" | "content" | "local" | "authority" | "actions";

export interface ReportMetric {
  key: string;
  section: ReportSection;
  label: string;
  baseline: number | null;
  current: number | null;
  lowerIsBetter?: boolean;
  unit?: "%" | "stars";
  source: string;
  freshness: string | null;
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

export interface SeoReport {
  period: {
    days: number;
    currentFrom: string;
    currentTo: string;
    baselineFrom: string;
    baselineTo: string;
  };
  metrics: ReportMetric[];
  contentRankOutcomes: {
    briefId: string;
    topic: string;
    keyword: string | null;
    publishedUrl: string | null;
    publishedAt: string | null;
    liveConfirmedAt: string | null;
    baselineRank: number | null;
    measuredRank: number | null;
    measuredAt: string | null;
    rankChange: number | null;
    state:
      | "keyword_not_linked"
      | "baseline_not_available"
      | "awaiting_post_publish_check"
      | "not_in_results"
      | "observed";
    source: string;
    caveat: string;
  }[];
  actionRankOutcomes: {
    actionId: string;
    kind: "on_page" | "technical";
    label: string;
    targetUrl: string;
    appliedAt: string;
    verifiedAt: string | null;
    keyword: string | null;
    baselineRank: number | null;
    baselineCheckedAt: string | null;
    measuredRank: number | null;
    measuredAt: string | null;
    rankChange: number | null;
    state:
      | "keyword_not_linked"
      | "baseline_not_available"
      | "awaiting_post_action_check"
      | "not_in_results"
      | "observed";
    source: string;
    caveat: string;
  }[];
  actionLandingPageOutcomes: {
    actionId: string;
    kind: "on_page" | "technical";
    label: string;
    targetUrl: string;
    targetPath: string | null;
    appliedAt: string;
    property: string | null;
    propertyName: string | null;
    currencyCode: string | null;
    comparisonPeriod: { startDate: string; endDate: string } | null;
    currentPeriod: { startDate: string; endDate: string } | null;
    comparison: {
      dataState: "not_available" | "path_not_matchable" | "no_exact_path" | "matched";
      rows: {
        landingPage: string;
        sessions: string | null;
        keyEvents: string | null;
        totalRevenue: string | null;
      }[];
      reason: string | null;
    };
    current: {
      dataState: "not_available" | "path_not_matchable" | "no_exact_path" | "matched";
      rows: {
        landingPage: string;
        sessions: string | null;
        keyEvents: string | null;
        totalRevenue: string | null;
      }[];
      reason: string | null;
    };
    fetchedAt: string | null;
    disclosure: string;
  }[];
  savedOutcomeSnapshots: {
    id: string;
    actionType: string;
    actionId: string;
    actionLabel: string;
    keyword: string | null;
    targetUrl: string | null;
    appliedAt: string;
    baselineRank: number | null;
    baselineCapturedAt: string | null;
    measuredRank: number | null;
    measuredAt: string;
    rankChange: number | null;
    outcomeState: string;
    rankSource: string;
    crawlVerifiedAt: string | null;
    caveat: string;
    createdAt: string;
  }[];
  searchConsole: {
    status: "not_connected" | "connected" | "needs_attention";
    selectedProperty: string | null;
    snapshots: {
      id: string;
      propertyUrl: string;
      startDate: string;
      endDate: string;
      clicks: string | null;
      impressions: string | null;
      clickThroughRate: number | null;
      averagePosition: number | null;
      dataState: string;
      fetchedAt: string;
    }[];
    windowDays: number;
  };
  googleAnalytics: {
    status: "not_connected" | "connected" | "needs_attention";
    selectedProperty: string | null;
    snapshot: SeoAnalyticsSnapshot | null;
    windowDays: number;
    disclosure: string;
  };
  rankDistribution: { baseline: RankBuckets; current: RankBuckets };
  keywords: {
    keyword: string;
    baseline: number | null;
    current: number | null;
    baselineChecked: boolean;
    currentChecked: boolean;
    checkedAt: string | null;
  }[];
  notTracked: { label: string; reason: string }[];
}

export const fetchSeoReport = (days: number) =>
  apiFetch<SeoReport>(`/seo-autopilot/reports?days=${days}`);

export const saveSeoOutcomeSnapshots = (days: number) =>
  apiFetch<{
    observedCandidates: number;
    createdCount: number;
    duplicateCount: number;
    capturedAt: string;
    disclosure: string;
  }>(`/seo-autopilot/reports/outcome-snapshots?days=${days}`, {
    method: "POST",
  });
