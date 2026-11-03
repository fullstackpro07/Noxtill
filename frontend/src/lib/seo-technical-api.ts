import { apiFetch } from "@/lib/api-client";

export type TechnicalActionType = "redirect" | "canonical" | "indexability" | "sitemap" | "robots" | "other";
export type TechnicalActionStatus = "draft" | "approval_required" | "approved" | "rejected" | "applied" | "verified" | "cancelled";

export interface TechnicalIssue {
  id: string;
  type: string;
  severity: string;
  pageUrl: string;
  evidence: string;
  recommendation: string;
  firstSeenAt: string;
  lastSeenAt: string;
  group: string;
}

export interface TechnicalOverview {
  crawl: { auditRunId: string; siteUrl: string; finishedAt: string | null } | null;
  kpis: {
    criticalIssues: number;
    indexablePages: number | null;
    pagesCrawled: number;
    sitemapCoverage: { inSitemap: number; of: number } | null;
    brokenLinks: number;
    canonicalConflicts: number;
    redirectedPages: number;
  };
  issues: TechnicalIssue[];
  redirects: { url: string; finalUrl: string; statusCode: number }[];
  canonicals: { url: string; canonicalUrl: string }[];
  nonIndexable: { url: string }[];
}

export interface TechnicalValidation {
  ok: boolean;
  problems: string[];
  warnings: string[];
}

export interface TechnicalAction {
  id: string;
  type: TechnicalActionType;
  status: TechnicalActionStatus;
  risk: "low" | "medium" | "high";
  sourceUrl: string;
  targetValue: string | null;
  description: string | null;
  currentState: { crawled: boolean; statusCode?: number; finalUrl?: string; canonicalUrl?: string | null; noindex?: boolean; inSitemap?: boolean | null };
  validation: TechnicalValidation | null;
  decisionNote: string | null;
  appliedAt: string | null;
  verifiedAt: string | null;
  verification: { checkedAt: string; result: "match" | "mismatch" | "not_verifiable" | "page_not_crawled"; observed: unknown } | null;
  createdAt: string;
}

export interface TechnicalActionInput {
  type: TechnicalActionType;
  sourceUrl: string;
  targetValue?: string;
  description?: string;
  issueId?: string;
}

const BASE = "/seo-autopilot/technical";

export const fetchTechnicalOverview = () => apiFetch<TechnicalOverview>(`${BASE}/overview`);
export const fetchTechnicalActions = () => apiFetch<TechnicalAction[]>(`${BASE}/actions`);
export const validateTechnicalAction = (input: TechnicalActionInput) =>
  apiFetch<TechnicalValidation>(`${BASE}/actions/validate`, { method: "POST", body: JSON.stringify(input) });
export const createTechnicalAction = (input: TechnicalActionInput) =>
  apiFetch<TechnicalAction>(`${BASE}/actions`, { method: "POST", body: JSON.stringify(input) });
export const transitionTechnicalAction = (id: string, status: "approval_required" | "approved" | "rejected" | "applied" | "cancelled", note?: string) =>
  apiFetch<TechnicalAction>(`${BASE}/actions/${id}/status`, { method: "POST", body: JSON.stringify({ status, note }) });
export const verifyTechnicalActions = () => apiFetch<{ checked: number; verified: number }>(`${BASE}/verify`, { method: "POST" });
