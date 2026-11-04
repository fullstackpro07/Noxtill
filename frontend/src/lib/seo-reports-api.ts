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
