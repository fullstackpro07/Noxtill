import { apiFetch } from "@/lib/api-client";

export type SeoRevisionStatus = "draft" | "approval_required" | "approved" | "rejected" | "applied" | "verified" | "superseded";

export interface SeoCrawlRef {
  auditRunId: string;
  siteUrl: string;
  finishedAt: string | null;
}

export interface OnPageRow {
  url: string;
  title: string | null;
  description: string | null;
  h1: string | null;
  h1Count: number | null;
  imagesMissingAlt: number | null;
  primaryKeyword: string | null;
  issues: string[];
  health: "ok" | "needs_work";
  lastOptimizedAt: string | null;
  revision: { version: number; status: SeoRevisionStatus } | null;
}

export interface OnPageSummary {
  crawl: SeoCrawlRef | null;
  pagesCrawled: number;
  pagesNeedingWork: number;
  metadataIssues: number;
  contentGaps: number;
  approvedRevisions: number;
  awaitingVerification: number;
}

export interface SeoRevision {
  id: string;
  pageUrl: string;
  version: number;
  status: SeoRevisionStatus;
  beforeSnapshot: { title: string | null; description: string | null; h1: string | null | undefined; h1Count: number | null; crawledAt: string | null };
  proposedTitle: string | null;
  proposedMetaDescription: string | null;
  proposedH1: string | null;
  primaryKeyword: string | null;
  rationale: string | null;
  source: "manual" | "ai" | "restore";
  decisionNote: string | null;
  appliedAt: string | null;
  verifiedAt: string | null;
  verification: { checkedAt: string; pageFound: boolean; fields: Record<string, "match" | "mismatch" | "not_checked"> } | null;
  createdAt: string;
  updatedAt: string;
}

export interface SeoProposal {
  proposedTitle?: string;
  proposedMetaDescription?: string;
  proposedH1?: string;
  primaryKeyword?: string;
  rationale?: string;
}

const BASE = "/seo-autopilot/on-page";

export const fetchOnPageSummary = () => apiFetch<OnPageSummary>(`${BASE}/summary`);
export const fetchOnPagePages = () => apiFetch<{ crawl: SeoCrawlRef | null; pages: OnPageRow[] }>(`${BASE}/pages`);
export const fetchSeoRevisions = (pageUrl?: string) =>
  apiFetch<SeoRevision[]>(`${BASE}/revisions${pageUrl ? `?pageUrl=${encodeURIComponent(pageUrl)}` : ""}`);
export const createSeoRevision = (pageUrl: string, proposal: SeoProposal) =>
  apiFetch<SeoRevision>(`${BASE}/revisions`, { method: "POST", body: JSON.stringify({ pageUrl, ...proposal }) });
export const suggestSeoRevision = (pageUrl: string) =>
  apiFetch<SeoRevision>(`${BASE}/suggest`, { method: "POST", body: JSON.stringify({ pageUrl }) });
export const editSeoRevision = (id: string, proposal: SeoProposal) =>
  apiFetch<SeoRevision>(`${BASE}/revisions/${id}`, { method: "PATCH", body: JSON.stringify(proposal) });
export const transitionSeoRevision = (id: string, status: "approval_required" | "approved" | "rejected" | "applied", note?: string) =>
  apiFetch<SeoRevision>(`${BASE}/revisions/${id}/status`, { method: "POST", body: JSON.stringify({ status, note }) });
export const restoreSeoRevision = (id: string) => apiFetch<SeoRevision>(`${BASE}/revisions/${id}/restore`, { method: "POST" });
export const verifySeoRevisions = () => apiFetch<{ checked: number; verified: number }>(`${BASE}/verify`, { method: "POST" });
