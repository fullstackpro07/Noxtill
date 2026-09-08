import { apiFetch } from "@/lib/api-client";
import type { SocialPlatform } from "@/lib/social-accounts-api";

export type SocialPostStatus = "draft" | "scheduled" | "publishing" | "published" | "partially_failed" | "failed";
export type SocialPostTargetStatus = "pending" | "published" | "failed";

export interface SocialPostTarget {
  id: string;
  socialPostId: string;
  platform: SocialPlatform;
  status: SocialPostTargetStatus;
  externalId: string | null;
  errorMessage: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SocialPost {
  id: string;
  businessId: string;
  caption: string;
  mediaKeys: string[];
  scheduledFor: string | null;
  status: SocialPostStatus;
  createdByUserId: string | null;
  targets: SocialPostTarget[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateSocialPostInput {
  caption: string;
  mediaKeys?: string[];
  platforms: SocialPlatform[];
  scheduledFor?: string;
}

/** GET /social/posts?status= — also the Content Calendar's data source. */
export function fetchSocialPosts(status?: SocialPostStatus): Promise<SocialPost[]> {
  const qs = status ? `?status=${status}` : "";
  return apiFetch<SocialPost[]>(`/social/posts${qs}`);
}

/** GET /social/posts/queue */
export function fetchSocialPostsQueue(): Promise<SocialPost[]> {
  return apiFetch<SocialPost[]>("/social/posts/queue");
}

export function fetchSocialPost(id: string): Promise<SocialPost> {
  return apiFetch<SocialPost>(`/social/posts/${id}`);
}

export function createSocialPost(input: CreateSocialPostInput): Promise<SocialPost> {
  return apiFetch<SocialPost>("/social/posts", { method: "POST", body: JSON.stringify(input) });
}

export interface UpdateSocialPostInput {
  caption?: string;
  mediaKeys?: string[];
  platforms?: SocialPlatform[];
  scheduledFor?: string;
}

/** Only accepted while the post is still a draft — the backend 409s otherwise. */
export function updateSocialPost(id: string, input: UpdateSocialPostInput): Promise<SocialPost> {
  return apiFetch<SocialPost>(`/social/posts/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function publishSocialPostNow(id: string): Promise<{ queued: true }> {
  return apiFetch<{ queued: true }>(`/social/posts/${id}/publish`, { method: "POST" });
}

export function retrySocialPostTarget(id: string, platform: SocialPlatform): Promise<{ queued: true }> {
  return apiFetch<{ queued: true }>(`/social/posts/${id}/targets/${platform}/retry`, { method: "POST" });
}

export function deleteSocialPost(id: string): Promise<void> {
  return apiFetch<void>(`/social/posts/${id}`, { method: "DELETE" });
}

export interface SocialPostAnalyticsRow {
  id: string;
  businessId: string;
  socialPostTargetId: string;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  pulledAt: string;
  socialPostTarget: SocialPostTarget;
}

export function fetchSocialPostAnalytics(id: string): Promise<SocialPostAnalyticsRow[]> {
  return apiFetch<SocialPostAnalyticsRow[]>(`/social/posts/${id}/analytics`);
}

/** Only platforms whose connector implements `fetchPostInsights` (Facebook + Instagram today) return real rows; others are silently skipped. */
export function pullSocialPostAnalytics(id: string): Promise<SocialPostAnalyticsRow[]> {
  return apiFetch<SocialPostAnalyticsRow[]>(`/social/posts/${id}/analytics/pull`, { method: "POST" });
}

export interface BoostPostInput {
  goal: string;
  dailyBudget: number;
}

/** Only mapped platforms (facebook/instagram/tiktok/linkedin/pinterest/snapchat/reddit) can boost — others 400. */
export function boostSocialPost(id: string, platform: SocialPlatform, input: BoostPostInput): Promise<{ id: string; status: string }> {
  return apiFetch<{ id: string; status: string }>(`/social/posts/${id}/targets/${platform}/boost`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
