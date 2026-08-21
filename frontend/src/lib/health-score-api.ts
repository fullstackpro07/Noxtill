import { apiFetch } from "@/lib/api-client";

export interface HealthScoreWeights {
  ratingTrend: number;
  repeatCustomerRate: number;
  margin: number;
  creditRecovery: number;
}

export type HealthScoreComponents = HealthScoreWeights;

export interface HealthScoreHistoryPoint {
  capturedAt: string;
  totalScore: number;
  ratingTrend: number;
  repeatCustomerRate: number;
  margin: number;
  creditRecovery: number;
}

export interface HealthScoreChangeLogEntry {
  date: string;
  oldScore: number;
  newScore: number;
  oldWeights: HealthScoreWeights;
  newWeights: HealthScoreWeights;
}

export interface HealthScoreBuilding {
  building: true;
  message: string;
  daysUntilReady: number;
  score: null;
  components: null;
  weights: HealthScoreWeights;
  history: [];
  changeLog: [];
}

export interface HealthScoreReady {
  building: false;
  score: number;
  components: HealthScoreComponents;
  weights: HealthScoreWeights;
  periodMonths: 3 | 6 | 12;
  history: HealthScoreHistoryPoint[];
  changeLog: HealthScoreChangeLogEntry[];
}

export type LiveHealthScore = HealthScoreBuilding | HealthScoreReady;

export const HEALTH_SCORE_PERIOD_MONTHS = [3, 6, 12] as const;
export type HealthScorePeriodMonths = (typeof HEALTH_SCORE_PERIOD_MONTHS)[number];

/** GET /health-score?range= — `range` is the period in months (3/6/12); the backend defaults to 3. */
export function fetchHealthScore(periodMonths?: HealthScorePeriodMonths): Promise<LiveHealthScore> {
  const query = periodMonths ? `?range=${periodMonths}` : "";
  return apiFetch<LiveHealthScore>(`/health-score${query}`);
}

/** PATCH /health-score/weights — the four weights must sum to exactly 100; the backend rejects anything else. Owner-only. */
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
