import { apiFetch } from "@/lib/api-client";

export interface TrackedKeywordRow {
  id: string;
  keyword: string;
  latestRank: number | null;
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

export function removeKeyword(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/keywords/${id}`, { method: "DELETE" });
}

/** "Check now" — real SerpApi-shaped lookup; needs SERPAPI_KEY configured server-side to return a real rank. */
export function triggerKeywordCheck(id: string): Promise<{ rank: number | null; capturedAt: string }[]> {
  return apiFetch(`/keywords/${id}/check`, { method: "POST" });
}
