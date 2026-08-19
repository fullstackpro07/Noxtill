import { apiFetch } from "@/lib/api-client";

export interface HealthScoreWeights {
  ratingTrend: number;
  repeatCustomerRate: number;
  margin: number;
  creditRecovery: number;
}

export interface HealthScoreComponents {
  ratingTrend: number;
  repeatCustomerRate: number;
  margin: number;
  creditRecovery: number;
}

export interface HealthScoreHistoryPoint {
  capturedAt: string;
  totalScore: number;
  ratingTrend: number;
  repeatCustomerRate: number;
  margin: number;
  creditRecovery: number;
}

export interface LiveHealthScore {
  score: number;
  components: HealthScoreComponents;
  weights: HealthScoreWeights;
  history: HealthScoreHistoryPoint[];
}

/** GET /health-score?range= — `range` is weeks of trailing snapshot history (backend defaults to 12). */
export function fetchHealthScore(rangeWeeks?: number): Promise<LiveHealthScore> {
  const query = rangeWeeks ? `?range=${rangeWeeks}` : "";
  return apiFetch<LiveHealthScore>(`/health-score${query}`);
}

/** PATCH /health-score/weights — the four weights must sum to exactly 100; the backend rejects anything else. */
export function updateHealthScoreWeights(weights: HealthScoreWeights): Promise<HealthScoreWeights> {
  return apiFetch<HealthScoreWeights>("/health-score/weights", {
    method: "PATCH",
    body: JSON.stringify(weights),
  });
}

export const HEALTH_SCORE_COMPONENT_LABEL: Record<keyof HealthScoreComponents, string> = {
  ratingTrend: "Rating trend",
  repeatCustomerRate: "Repeat customers",
  margin: "Margin",
  creditRecovery: "Credit recovery",
};
