import { apiFetch } from "@/lib/api-client";

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

export const SEO_WORKSPACE_KEY = ["seo-workspace"] as const;
export const fetchSeoWorkspace = () => apiFetch<WorkspaceQueue>("/seo-autopilot/workspace");
export const fetchSeoWorkspaceHistory = () => apiFetch<WorkspaceDecision[]>("/seo-autopilot/workspace/history");
