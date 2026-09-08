import { apiFetch } from "@/lib/api-client";
import type { SocialPlatform } from "@/lib/social-accounts-api";

export interface SocialAnalyticsSummary {
  totalFollowers: number;
  totalReach: number;
  totalEngagement: number;
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
