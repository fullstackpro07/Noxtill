import { apiFetch } from "@/lib/api-client";

export interface VisibilityScoreComponents {
  listingScore: number;
  reviewScore: number;
  seoScore: number;
  socialScore: number;
}

export interface VisibilityScoreHistoryPoint extends VisibilityScoreComponents {
  capturedAt: string;
  totalScore: number;
}

export interface VisibilityScoreResult {
  score: number;
  components: VisibilityScoreComponents;
  history: VisibilityScoreHistoryPoint[];
}

/** range = weeks of history to return (default 12). */
export function fetchVisibilityScore(range?: number): Promise<VisibilityScoreResult> {
  const qs = range ? `?range=${range}` : "";
  return apiFetch<VisibilityScoreResult>(`/visibility-score${qs}`);
}
