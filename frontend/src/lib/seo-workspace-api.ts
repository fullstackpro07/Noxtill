import { apiFetch } from "@/lib/api-client";
import type { ContentBrief } from "@/lib/seo-content-api";
import type { SpecialistAgentAiUsageCall } from "@/lib/specialist-agent-usage";
import { postSpecialistAgentRun } from "@/lib/specialist-agent-run-idempotency";

export type WorkspaceStage = "new" | "draft_ready" | "waiting_approval" | "ready_to_apply" | "verification_required" | "not_matched" | "completed";
export type WorkspaceKind = "audit_finding" | "page_revision" | "technical_change" | "content";

export interface WorkspaceItem {
  key: string;
  kind: WorkspaceKind;
  id: string;
  action: string;
  entity: string;
  reason: string | null;
  risk: "low" | "medium" | "high";
  origin: string;
  stage: WorkspaceStage;
  status: string;
  verificationNote: string | null;
  ownerUserId: string | null;
  updatedAt: string;
  href: string;
  canPrepareOnPageRevision?: boolean;
  canPrepareTechnicalReview?: boolean;
}

export interface WorkspaceQueue {
  rules: { newFindingDays: number; completedDays: number };
  kpis: Record<"newFindings" | "draftReady" | "waitingApproval" | "readyToApply" | "verificationRequired" | "notMatched" | "completed", number>;
  items: WorkspaceItem[];
}

export interface WorkspaceDecision {
  kind: WorkspaceKind;
  entityId: string;
  action: string;
  note: string | null;
  actor: string;
  createdAt: string;
}

export interface SeoAgentRun {
  id: string;
  agentVersion: string;
  status: string;
  createdAt: string;
  finishedAt: string | null;
  output: {
    summary?: string;
    snapshot?: {
      queueCounts: WorkspaceQueue["kpis"];
      newFindingWindowDays: number;
      completedWindowDays: number;
      rankHistory?: {
        source: "tracked_keyword_rank_snapshots";
        trackedKeywordCount: number;
        keywordsWithSnapshots: number;
        staleKeywordCount: number;
        improving: number;
        declining: number;
        unchanged: number;
        notComparable: number;
        latestCapturedAt: string | null;
        observations: Array<{
          keyword: string;
          intent: string | null;
          targetPageUrl: string | null;
          latestRank: number | null;
          latestStatus: "ranked" | "not_in_results" | "not_checked";
          previousRank: number | null;
          movement: "improving" | "declining" | "unchanged" | "not_comparable";
          searchInterestIndex: number | null;
          capturedAt: string | null;
          freshness: "fresh" | "stale" | "missing";
        }>;
        truncated: boolean;
      };
      offPageRecords?: {
        source: "merchant_entered_records";
        trackedLinks: number;
        activeLinks: number;
        lostLinks: number;
        unverifiedLinks: number;
        openTrackedOpportunities: number;
        openOpportunitiesByPipelineStage: Array<{ pipeline: string; stage: string; count: number }>;
        guestPublications: number;
        guestPublicationStatuses: Record<string, number>;
        guestPitches: number;
        guestPitchStages: Record<string, number>;
      };
      currentReview: {
        kind: WorkspaceKind;
        stage: WorkspaceStage;
        risk: string;
        action: string;
      } | null;
    };
    aiSummary?: {
      mode: "review" | "question";
      status: string;
      text: string | null;
      message: string | null;
    };
  } | null;
  recommendations: Array<{ id: string; title: string; summary: string; assumptions: string[]; missingData: string[] }>;
  aiCallLogs?: SpecialistAgentAiUsageCall[];
}

export const SEO_WORKSPACE_KEY = ["seo-workspace"] as const;
export const fetchSeoWorkspace = () => apiFetch<WorkspaceQueue>("/seo-autopilot/workspace");
export const fetchSeoWorkspaceHistory = () => apiFetch<WorkspaceDecision[]>("/seo-autopilot/workspace/history");
export const fetchSeoAgentRuns = () => apiFetch<SeoAgentRun[]>("/seo-autopilot/workspace/agent-runs");
export const runSeoAgentReview = (question?: string) =>
  postSpecialistAgentRun('seo', { question: question?.trim() || null }, (idempotencyKey) =>
    apiFetch<SeoAgentRun>("/seo-autopilot/workspace/agent-runs", {
      method: "POST",
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      body: question?.trim() ? JSON.stringify({ question: question.trim() }) : undefined,
    }),
  );
export const generateSeoOpportunityBrief = (keywordId: string) =>
  apiFetch<ContentBrief>(`/seo-autopilot/workspace/content-opportunities/${encodeURIComponent(keywordId)}/brief`, { method: "POST", body: JSON.stringify({}) });
export const generateSeoOnPageRevision = (issueId: string) =>
  apiFetch(`/seo-autopilot/workspace/audit-findings/${encodeURIComponent(issueId)}/on-page-revision`, { method: "POST" });
export const prepareSeoTechnicalReview = (issueId: string) =>
  apiFetch(`/seo-autopilot/workspace/audit-findings/${encodeURIComponent(issueId)}/technical-review`, { method: "POST" });
