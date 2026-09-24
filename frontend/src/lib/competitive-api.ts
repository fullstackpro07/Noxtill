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

export type CompetitorObservationKind = "price" | "service" | "offer";

/** Something the owner saw on a competitor's public pages and recorded by hand. Append-only — a price change is a new row. */
export interface CompetitorObservation {
  id: string;
  competitorId: string;
  kind: CompetitorObservationKind;
  label: string;
  /** Null when the competitor lists the item without publishing a price. */
  amount: number | null;
  endsAt: string | null;
  source: string | null;
  observedAt: string;
  createdAt: string;
}

export interface CreateCompetitorObservationInput {
  competitorId: string;
  kind: CompetitorObservationKind;
  label: string;
  amount?: number;
  endsAt?: string;
  source?: string;
  observedAt?: string;
}

export function fetchCompetitorObservations(competitorId?: string): Promise<CompetitorObservation[]> {
  const query = competitorId ? `?competitorId=${encodeURIComponent(competitorId)}` : "";
  return apiFetch<CompetitorObservation[]>(`/competitor-observations${query}`);
}

export function createCompetitorObservation(input: CreateCompetitorObservationInput): Promise<CompetitorObservation> {
  return apiFetch<CompetitorObservation>("/competitor-observations", { method: "POST", body: JSON.stringify(input) });
}

export function removeCompetitorObservation(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/competitor-observations/${id}`, { method: "DELETE" });
}

/** A competitor's public Instagram posting, read via Instagram Business Discovery. A non-"ok" status is an explicit reason it could not be read — never a zero. */
export type CompetitorSocial =
  | {
      status: "ok";
      handle: string;
      followers: number | null;
      mediaCount: number | null;
      postsLast30: number;
      postsPrev30: number;
      /** The sample was full, so the real count may be higher. */
      capped: boolean;
      formats: { image: number; video: number; carousel: number };
      topics: string[];
      latestAt: string | null;
    }
  | { status: "no_handle" | "not_connected" | "unavailable"; message: string };

export function fetchCompetitorSocial(competitorId: string): Promise<CompetitorSocial> {
  return apiFetch<CompetitorSocial>(`/competitive/competitors/${competitorId}/social`);
}

/** Your own listing scored on the same seven public checks as a competitor's Google listing — null until a Master Record exists. */
export function fetchOwnListingCompleteness(): Promise<{ percent: number; checks: { key: string; label: string; present: boolean }[] } | null> {
  return apiFetch<{ percent: number; checks: { key: string; label: string; present: boolean }[] } | null>("/competitive/listing-completeness");
}

export type WeeklyReportResult = { sent: true; recipient: string } | { sent: false; reason: "no_recipient" | "send_failed"; message: string };

/** Sends the weekly report to the saved recipient right now, so the setup can be checked. */
export function sendCompetitiveWeeklyReportNow(): Promise<WeeklyReportResult> {
  return apiFetch<WeeklyReportResult>("/competitive/weekly-report/send-now", { method: "POST" });
}
