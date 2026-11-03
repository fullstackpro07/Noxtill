import { apiFetch } from "@/lib/api-client";

export const MAX_TRACKED_KEYWORDS = 10;
export const KEYWORD_INTENTS = [
  "informational",
  "navigational",
  "commercial",
  "transactional",
  "local",
] as const;
export type KeywordIntent = (typeof KEYWORD_INTENTS)[number];

export interface TrackedKeywordRow {
  id: string;
  keyword: string;
  intent: KeywordIntent | null;
  targetPageUrl: string | null;
  mappedKeywordCount: number;
  /** Multiple tracked terms are assigned to this same URL; this is not a verified GSC conflict. */
  mappingOverlap: boolean;
  /** Distinct pages from the business domain returned in the same latest organic-results snapshot. */
  businessResultUrls: string[];
  /** Null means there is no saved SERP URL evidence yet; false only means a check found <=1 page. */
  cannibalizationFlag: boolean | null;
  latestRank: number | null;
  previousRank: number | null;
  /** The #1 organic result's title at last check — real, not a fabricated "top competitor" guess. */
  topResultTitle: string | null;
  /** Google Trends relative interest (0-100), not an exact monthly search-volume count — no accessible API provides that. */
  searchInterest: number | null;
  lastCheckedAt: string | null;
}

export function fetchKeywords(): Promise<TrackedKeywordRow[]> {
  return apiFetch<TrackedKeywordRow[]>("/keywords");
}

export function addKeyword(keyword: string): Promise<TrackedKeywordRow> {
  return apiFetch<TrackedKeywordRow>("/keywords", {
    method: "POST",
    body: JSON.stringify({ keyword }),
  });
}

export function updateTrackedKeyword(
  id: string,
  patch: { intent?: KeywordIntent | null; targetPageUrl?: string | null },
): Promise<TrackedKeywordRow> {
  return apiFetch<TrackedKeywordRow>(`/keywords/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export interface BulkAddKeywordsResult {
  created: string[];
  skipped: { keyword: string; reason: "already_tracked" | "limit_reached" }[];
}

/** Real partial-success semantics — some may be skipped as already-tracked or past the cap. */
export function bulkAddKeywords(keywords: string[]): Promise<BulkAddKeywordsResult> {
  return apiFetch<BulkAddKeywordsResult>("/keywords/bulk", {
    method: "POST",
    body: JSON.stringify({ keywords }),
  });
}

/** Real AI call, grounded in the business's own name/categories. */
export function suggestKeywords(seedTopic?: string): Promise<{ suggestions: string[] }> {
  return apiFetch<{ suggestions: string[] }>("/keywords/suggestions", {
    method: "POST",
    body: JSON.stringify({ seedTopic }),
  });
}

export function removeKeyword(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/keywords/${id}`, { method: "DELETE" });
}

export interface KeywordHistoryPoint {
  rank: number | null;
  capturedAt: string;
}

export function fetchKeywordHistory(id: string): Promise<KeywordHistoryPoint[]> {
  return apiFetch<KeywordHistoryPoint[]>(`/keywords/${id}/history`);
}

/** "Check now" — real SerpApi-shaped lookup; needs SERPAPI_KEY configured server-side to return a real rank. */
export function triggerKeywordCheck(id: string): Promise<KeywordHistoryPoint[]> {
  return apiFetch(`/keywords/${id}/check`, { method: "POST" });
}
