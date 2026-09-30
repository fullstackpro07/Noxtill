import { apiFetch } from "@/lib/api-client";

export type SeoAutopilotDataStatus =
  "no_data" | "stale" | "partial" | "available";

export interface SeoAutopilotOverview {
  checkedAt: string;
  dataStatus: SeoAutopilotDataStatus;
  trackedKeywords: number;
  rankedKeywords: number;
  topTen: number;
  improving: number;
  declining: number;
  needsFreshCheck: number;
  openAuditIssues: number;
  lastCheckedAt: string | null;
  unsupported: { key: string; reason: string }[];
}

export interface SeoAuditPage {
  url: string;
  finalUrl: string;
  statusCode: number;
  contentType: string;
  title: string | null;
  description: string | null;
  h1Count: number | null;
  imagesMissingAlt: number | null;
  canonicalUrl: string | null;
  noindex: boolean;
}

export interface SeoAuditIssue {
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  url: string;
  evidence: string;
  recommendation: string;
}

export interface SeoAuditRun {
  id: string;
  status: "running" | "completed" | "partial" | "failed";
  triggeredBy: "manual" | "schedule";
  siteUrl: string;
  finalUrl: string | null;
  pagesDiscovered: number;
  pagesCrawled: number;
  issuesFound: number;
  pages: SeoAuditPage[];
  issues: SeoAuditIssue[];
  warnings: string[];
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export type SeoAuditIntervalHours = 24 | 168 | 720;

export interface SeoAuditSchedule {
  id: string | null;
  enabled: boolean;
  intervalHours: SeoAuditIntervalHours;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastRunId: string | null;
  lastStatus: "running" | "completed" | "partial" | "failed" | null;
  lastError: string | null;
  configured: boolean;
  updatedAt?: string;
}

export function fetchSeoAuditSchedule(): Promise<SeoAuditSchedule> {
  return apiFetch<SeoAuditSchedule>("/seo-autopilot/audit-schedule");
}

export function saveSeoAuditSchedule(input: {
  enabled: boolean;
  intervalHours: SeoAuditIntervalHours;
}): Promise<SeoAuditSchedule> {
  return apiFetch<SeoAuditSchedule>("/seo-autopilot/audit-schedule", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export interface SeoAuditChanges {
  currentRunId: string;
  previousRunId: string | null;
  status: "compared" | "no_previous_audit" | "not_comparable";
  comparedPageCount: number;
  skippedCurrentPageCount: number;
  skippedPreviousPageCount: number;
  newIssues: SeoAuditIssue[];
  resolvedIssues: SeoAuditIssue[];
  reason: string | null;
}

export type SeoAuditIssueStatus = "open" | "resolved" | "ignored";

export interface SeoAuditIssueHistoryEvent {
  id: string;
  action: string;
  reason: string | null;
  createdAt: string;
}

export interface SeoAuditTrackedIssue {
  id: string;
  type: string;
  severity: SeoAuditIssue["severity"];
  pageUrl: string;
  evidence: string;
  recommendation: string;
  status: SeoAuditIssueStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  ignoredAt: string | null;
  ignoreReason: string | null;
  auditEvents: SeoAuditIssueHistoryEvent[];
}

export function fetchSeoAutopilotOverview(): Promise<SeoAutopilotOverview> {
  return apiFetch<SeoAutopilotOverview>("/seo-autopilot/overview");
}

export function fetchSeoAuditRuns(): Promise<SeoAuditRun[]> {
  return apiFetch<SeoAuditRun[]>("/seo-autopilot/audits");
}

export function fetchSeoAuditChanges(id: string): Promise<SeoAuditChanges> {
  return apiFetch<SeoAuditChanges>(`/seo-autopilot/audits/${id}/changes`);
}

export function fetchSeoAuditIssues(
  status: SeoAuditIssueStatus,
): Promise<SeoAuditTrackedIssue[]> {
  return apiFetch<SeoAuditTrackedIssue[]>(
    `/seo-autopilot/issues?status=${encodeURIComponent(status)}`,
  );
}

export function ignoreSeoAuditIssue(
  id: string,
  reason: string,
): Promise<SeoAuditTrackedIssue> {
  return apiFetch<SeoAuditTrackedIssue>(`/seo-autopilot/issues/${id}/ignore`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function reopenSeoAuditIssue(
  id: string,
  reason: string,
): Promise<SeoAuditTrackedIssue> {
  return apiFetch<SeoAuditTrackedIssue>(`/seo-autopilot/issues/${id}/reopen`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function runSeoSiteAudit(): Promise<SeoAuditRun> {
  return apiFetch<SeoAuditRun>("/seo-autopilot/audits", { method: "POST" });
}
