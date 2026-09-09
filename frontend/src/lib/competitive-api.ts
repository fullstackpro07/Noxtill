import { apiFetch } from "@/lib/api-client";

export type CompetitiveOpportunityKind = "keyword" | "review" | "listing" | "social";

export interface CompetitiveOpportunity {
  id: string;
  businessId: string;
  kind: CompetitiveOpportunityKind;
  evidence: string;
  evidenceRef: string | null;
  recommendation: string | null;
  dismissed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompetitiveRecommendation {
  id: string;
  kind: CompetitiveOpportunityKind;
  evidence: string;
  evidenceRef: string | null;
  recommendation: string;
}

export function fetchCompetitiveOpportunities(): Promise<CompetitiveOpportunity[]> {
  return apiFetch<CompetitiveOpportunity[]>("/competitive/opportunities");
}

export function fetchCompetitiveRecommendations(): Promise<CompetitiveRecommendation[]> {
  return apiFetch<CompetitiveRecommendation[]>("/competitive/recommendations");
}

/** Real: replaces every non-dismissed auto-generated opportunity with a fresh gap-analysis pass. Returns the count of gaps found. */
export function refreshCompetitiveOpportunities(): Promise<number> {
  return apiFetch<number>("/competitive/opportunities/refresh", { method: "POST" });
}

export function dismissCompetitiveOpportunity(id: string): Promise<CompetitiveOpportunity> {
  return apiFetch<CompetitiveOpportunity>(`/competitive/opportunities/${id}/dismiss`, { method: "POST" });
}

export interface CompetitiveSettings {
  businessId: string;
  scanFrequencyDays: number;
  keywordRankAlertThreshold: number;
  reviewFreshnessAlertDays: number;
  weeklyReportRecipient: string | null;
}

export function fetchCompetitiveSettings(): Promise<CompetitiveSettings> {
  return apiFetch<CompetitiveSettings>("/competitive/settings");
}

export interface UpdateCompetitiveSettingsInput {
  scanFrequencyDays?: number;
  keywordRankAlertThreshold?: number;
  reviewFreshnessAlertDays?: number;
  weeklyReportRecipient?: string | null;
}

export function updateCompetitiveSettings(input: UpdateCompetitiveSettingsInput): Promise<CompetitiveSettings> {
  return apiFetch<CompetitiveSettings>("/competitive/settings", { method: "PATCH", body: JSON.stringify(input) });
}
