import { apiFetch } from "@/lib/api-client";

export type StoreRuleKey =
  | "missing_photo"
  | "missing_category"
  | "high_return_rate"
  | "out_of_stock_demand"
  | "below_cost_price"
  | "listing_not_synced";
export type StoreOpportunityStatus = "open" | "in_progress" | "done" | "verified" | "dismissed";
export type StoreImpact = "low" | "medium" | "high";

export interface StoreOpportunity {
  id: string;
  ruleKey: StoreRuleKey;
  title: string;
  impact: StoreImpact;
  status: StoreOpportunityStatus;
  evidence: { explanation?: string; topReasons?: Array<{ reason: string; units: number }>; [key: string]: unknown };
  metricValue: number | null;
  baselineValue: number | null;
  resolution: string | null;
  product: { id: string; name: string } | null;
  firstDetectedAt: string;
  lastDetectedAt: string;
  verifiedAt: string | null;
}

export interface StoreSummary {
  openOpportunities: number;
  highImpactOpen: number;
  markedDone: number;
  verifiedFixed: number;
  dismissed: number;
  rules: { lookbackDays: number; recentSalesDays: number; highReturnMinUnits: number; highReturnRatePct: number };
}

const BASE = "/commerce/store-optimizer";

export const fetchStoreSummary = () => apiFetch<StoreSummary>(`${BASE}/summary`);
export const fetchStoreOpportunities = () => apiFetch<StoreOpportunity[]>(`${BASE}/opportunities`);
export const runStoreChecks = () =>
  apiFetch<{ findings: number; created: number; refreshed: number; verified: number }>(`${BASE}/checks/run`, { method: "POST" });
export const setStoreOpportunityStatus = (id: string, status: StoreOpportunityStatus, reason?: string) =>
  apiFetch<{ id: string }>(`${BASE}/opportunities/${id}/status`, { method: "POST", body: JSON.stringify({ status, reason }) });
