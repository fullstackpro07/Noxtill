import { apiFetch } from "@/lib/api-client";
import type { SocialPlatform } from "@/lib/social-accounts-api";

export interface SocialAnalyticsSummary {
  totalFollowers: number;
  totalReach: number;
  totalEngagement: number;
  totalImpressions: number;
  byPlatform: Record<string, { followers: number; reach: number; engagement: number; impressions: number }>;
}

export interface SocialAnalyticsSnapshot {
  id: string;
  businessId: string;
  platform: SocialPlatform;
  date: string;
  followers: number;
  reach: number;
  engagement: number;
  impressions: number;
  createdAt: string;
}

export function fetchSocialAnalyticsSummary(): Promise<SocialAnalyticsSummary> {
  return apiFetch<SocialAnalyticsSummary>("/social/analytics");
}

/** Last 90 snapshots for one platform — populated only once the scheduler has pulled it at least once. */
export function fetchSocialAnalyticsForPlatform(platform: SocialPlatform): Promise<SocialAnalyticsSnapshot[]> {
  return apiFetch<SocialAnalyticsSnapshot[]>(`/social/analytics/${platform}`);
}

export interface SocialDailyHistoryPoint {
  date: string;
  reach: number;
  engagement: number;
  followers: number;
}

/** Real per-day totals across every connected platform, for a trend chart. */
export function fetchSocialDailyHistory(): Promise<SocialDailyHistoryPoint[]> {
  return apiFetch<SocialDailyHistoryPoint[]>("/social/analytics/history");
}
