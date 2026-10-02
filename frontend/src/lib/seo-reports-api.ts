import { apiFetch } from "@/lib/api-client";

export type ReportSection = "visibility" | "technical" | "content" | "local" | "authority" | "actions";

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
  period: { days: number; currentFrom: string; currentTo: string; baselineFrom: string; baselineTo: string };
  metrics: ReportMetric[];
  rankDistribution: { baseline: RankBuckets; current: RankBuckets };
  keywords: { keyword: string; baseline: number | null; current: number | null; baselineChecked: boolean; currentChecked: boolean; checkedAt: string | null }[];
  notTracked: { label: string; reason: string }[];
}

export const fetchSeoReport = (days: number) => apiFetch<SeoReport>(`/seo-autopilot/reports?days=${days}`);
