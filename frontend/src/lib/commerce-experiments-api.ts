import { apiFetch } from "@/lib/api-client";

export type ExperimentType = "price" | "bundle" | "listing_copy" | "photo" | "shipping_offer" | "other";
export type ExperimentMetric = "units" | "revenue" | "gross_margin" | "return_rate";
export type ExperimentStatus = "draft" | "running" | "stopped" | "adopted" | "reverted" | "inconclusive";
export type ExperimentDecision = "adopted" | "reverted" | "inconclusive";

export interface WindowMetrics {
  from: string;
  to: string;
  orders: number;
  units: number;
  revenue: number;
  cost: number;
  grossMarginPct: number | null;
  returnedUnits: number;
  returnRatePct: number | null;
}

export interface ExperimentResults {
  computedAt: string;
  windowDays: number;
  baseline: WindowMetrics;
  test: WindowMetrics;
  primary: {
    metric: ExperimentMetric;
    baselineValue: number | null;
    testValue: number | null;
    change: number | null;
    changeUnit: "pct" | "pts";
  };
  sufficient: boolean;
  insufficientReasons: string[];
  guardrail: { minMarginPct: number; testMarginPct: number | null; breached: boolean } | null;
}

export interface Experiment {
  id: string;
  name: string;
  type: ExperimentType;
  hypothesis: string;
  changeDescription: string;
  primaryMetric: ExperimentMetric;
  minMarginPct: number | null;
  plannedDays: number;
  status: ExperimentStatus;
  decisionNote: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  product: { id: string; name: string };
  results: ExperimentResults | null;
  priceAtStart: number | null;
  priceAtStop: number | null;
  priceUnchanged: boolean | null;
}

export interface ExperimentSummary {
  drafts: number;
  running: number;
  awaitingDecision: number;
  adopted: number;
  reverted: number;
  inconclusive: number;
  rules: { minDays: number; minUnitsPerWindow: number };
}

export interface ExperimentDraft {
  productId: string;
  name: string;
  type: ExperimentType;
  hypothesis: string;
  changeDescription: string;
  primaryMetric: ExperimentMetric;
  minMarginPct?: number;
  plannedDays?: number;
}

const BASE = "/commerce/experiments";

export const fetchExperimentSummary = () => apiFetch<ExperimentSummary>(`${BASE}/summary`);
export const fetchExperiments = () => apiFetch<Experiment[]>(BASE);
export const createExperiment = (draft: ExperimentDraft) => apiFetch<{ id: string }>(BASE, { method: "POST", body: JSON.stringify(draft) });
export const startExperiment = (id: string) => apiFetch<{ id: string }>(`${BASE}/${id}/start`, { method: "POST" });
export const stopExperiment = (id: string) => apiFetch<{ id: string }>(`${BASE}/${id}/stop`, { method: "POST" });
export const decideExperiment = (id: string, decision: ExperimentDecision, note: string) =>
  apiFetch<{ id: string }>(`${BASE}/${id}/decision`, { method: "POST", body: JSON.stringify({ decision, note }) });
export const deleteExperimentDraft = (id: string) => apiFetch<{ id: string }>(`${BASE}/${id}`, { method: "DELETE" });
