import { apiFetch } from "@/lib/api-client";
import type { MediaAsset } from "@/lib/media-library-api";

/**
 * Neither call ever touches a SocialPost — generated content is a draft the caller must
 * explicitly attach via `createSocialPost({ mediaKeys, caption })`, matching the backend's
 * "nothing auto-publishes" guarantee.
 */
export function generateAiCaption(topic: string, tone?: string): Promise<{ caption: string }> {
  return apiFetch<{ caption: string }>("/ai/content/generate", { method: "POST", body: JSON.stringify({ topic, tone }) });
}

export function generateAiImage(prompt: string, tags?: string[]): Promise<MediaAsset> {
  return apiFetch<MediaAsset>("/ai/content/generate-image", { method: "POST", body: JSON.stringify({ prompt, tags }) });
}

export function generateAiHashtags(caption: string): Promise<{ hashtags: string[] }> {
  return apiFetch<{ hashtags: string[] }>("/ai/content/hashtags", { method: "POST", body: JSON.stringify({ caption }) });
}

export interface CaptionGeneration {
  id: string;
  businessId: string;
  topic: string;
  tone: string | null;
  caption: string;
  createdAt: string;
}

/** Last 20 real generations, most recent first. */
export function fetchCaptionHistory(): Promise<CaptionGeneration[]> {
  return apiFetch<CaptionGeneration[]>("/ai/content/history");
}
