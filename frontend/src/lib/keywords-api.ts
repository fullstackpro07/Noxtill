import { apiFetch } from "@/lib/api-client";

export const MAX_TRACKED_KEYWORDS = 10;

export interface TrackedKeywordRow {
  id: string;
  keyword: string;
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
