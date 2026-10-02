import { apiFetch } from "@/lib/api-client";

export type ContentFormat = "blog_post" | "guide" | "landing_page" | "faq" | "location_page" | "product_page" | "other";
export type BriefStatus = "brief" | "drafting" | "approval_required" | "approved" | "published" | "dismissed";
export type OpportunityKind = "new_page" | "missing_page" | "improve";

export interface ContentOpportunity {
  keywordId: string;
  keyword: string;
  intent: string | null;
  targetPageUrl: string | null;
  kind: OpportunityKind;
  evidence: string;
  coverage: "none" | "page" | "brief";
  latestRank: number | null;
  rankCheckedAt: string | null;
  searchInterest: number | null;
  effort: "high" | "medium" | null;
  suggestedFormat: ContentFormat;
  briefId: string | null;
  briefStatus: BriefStatus | null;
  dismissed: { reason: string } | null;
}

export interface ContentBrief {
  id: string;
  keywordId: string | null;
  keywordText: string | null;
  topic: string;
  intent: string | null;
  audience: string | null;
  format: ContentFormat;
  outline: string[];
  questions: string[];
  internalLinks: string[];
  sourceNotes: string | null;
  strategyNote: string | null;
  status: BriefStatus;
  briefSource: string;
  draftTitle: string | null;
  draftBody: string | null;
  draftSource: string | null;
  dueAt: string | null;
  decisionNote: string | null;
  publishedUrl: string | null;
  publishedAt: string | null;
  liveConfirmedAt: string | null;
  baselineRank: number | null;
  updatedAt: string;
}

export interface RefreshRow {
  briefId: string;
  topic: string;
  keyword: string | null;
  publishedUrl: string | null;
  publishedAt: string | null;
  liveConfirmedAt: string | null;
  baselineRank: number | null;
  currentRank: number | null;
  rankCheckedAt: string | null;
  refreshReason: string | null;
}

export interface ContentSummary {
  openOpportunities: number;
  briefsReady: number;
  drafts: number;
  refreshDue: number;
  publishedMonitoring: number;
  contentGaps: number;
  rules: { improveBelowRank: number; refreshDropPositions: number };
}

export type BriefUpdate = Partial<Pick<ContentBrief, "topic" | "audience" | "format" | "outline" | "questions" | "sourceNotes" | "draftTitle" | "draftBody">> & { dueAt?: string };

const BASE = "/seo-autopilot/content";

export const fetchContentSummary = () => apiFetch<ContentSummary>(`${BASE}/summary`);
export const fetchContentOpportunities = () => apiFetch<{ crawlFinishedAt: string | null; opportunities: ContentOpportunity[] }>(`${BASE}/opportunities`);
export const fetchRefreshQueue = () => apiFetch<RefreshRow[]>(`${BASE}/refresh-queue`);
export const fetchContentBriefs = () => apiFetch<ContentBrief[]>(`${BASE}/briefs`);
export const createContentBrief = (input: { topic: string; keywordId?: string; intent?: string; format?: ContentFormat; strategyNote?: string }) =>
  apiFetch<ContentBrief>(`${BASE}/briefs`, { method: "POST", body: JSON.stringify(input) });
export const generateContentBrief = (keywordId: string, strategyNote?: string) =>
  apiFetch<ContentBrief>(`${BASE}/briefs/generate`, { method: "POST", body: JSON.stringify({ keywordId, strategyNote }) });
export const updateContentBrief = (id: string, input: BriefUpdate) =>
  apiFetch<ContentBrief>(`${BASE}/briefs/${id}`, { method: "PATCH", body: JSON.stringify(input) });
export const generateContentDraft = (id: string) => apiFetch<ContentBrief>(`${BASE}/briefs/${id}/draft`, { method: "POST" });
export const transitionContentBrief = (id: string, status: "drafting" | "approval_required" | "approved" | "dismissed", note?: string) =>
  apiFetch<ContentBrief>(`${BASE}/briefs/${id}/status`, { method: "POST", body: JSON.stringify({ status, note }) });
export const recordContentPublished = (id: string, publishedUrl: string) =>
  apiFetch<ContentBrief>(`${BASE}/briefs/${id}/published`, { method: "POST", body: JSON.stringify({ publishedUrl }) });
export const dismissContentOpportunity = (keywordId: string, kind: OpportunityKind, reason: string) =>
  apiFetch(`${BASE}/opportunities/dismiss`, { method: "POST", body: JSON.stringify({ keywordId, kind, reason }) });
export const reopenContentOpportunity = (keywordId: string, kind: OpportunityKind) =>
  apiFetch(`${BASE}/opportunities/${keywordId}/${kind}`, { method: "DELETE" });
