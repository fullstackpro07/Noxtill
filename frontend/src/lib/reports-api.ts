import { apiFetch } from "@/lib/api-client";
import type { ReportKind } from "@/lib/reports";

export type ValidationStatus = "reconciled" | "warning" | "critical";
export type RunStatus = "ready" | "failed";

export interface RunSummary {
  id: string;
  kind: ReportKind;
  period: string;
  version: number;
  status: RunStatus;
  trigger: "manual" | "schedule" | "ai_builder" | string;
  generatedAt: string;
  generatedById: string | null;
  generatedByName: string | null;
  recordsCount: number;
  validationStatus: ValidationStatus | null;
  exclusionsCount: number;
  summary: string | null;
  errorMessage: string | null;
}

export interface LibraryReport {
  kind: ReportKind;
  name: string;
  description: string;
  icon: string;
  allowed: boolean;
  favorite: boolean;
  latest: RunSummary | null;
  runsInPeriod: number;
  schedule: { id: string; active: boolean; frequency: "weekly" | "monthly" } | null;
}

export interface ReportsLibrary {
  period: string;
  periodLabel: string;
  reports: LibraryReport[];
  kpis: {
    available: number;
    ready: number;
    failed: number;
    failedNames: string[];
    generatedThisMonth: number;
    automatedThisMonth: number;
    scheduled: number;
    nextScheduled: { reportName: string; at: string } | null;
    sent: number;
    sentChannels: string[];
    mostUsed: { name: string; count: number } | null;
    mostRecent: { name: string; at: string } | null;
  };
}

export type ReportTone = "pos" | "neg" | "neutral";

export interface ReportRow {
  label: string;
  value: string;
  tone?: ReportTone;
  link?: boolean;
}

export interface ReportKpi {
  label: string;
  display: string;
  delta?: string;
  deltaDir?: "up" | "down" | "flat";
  upIsGood?: boolean;
}

export interface ReportData {
  kind: string;
  title: string;
  period: string;
  periodLabel: string;
  currency: string;
  summary: string;
  kpis: ReportKpi[];
  bars?: { title: string; bars: { label: string; value: number }[] };
  table?: {
    title: string;
    columns: { key: string; label: string; align: "left" | "right" | "center" }[];
    rows: Record<string, string>[];
    emptyText: string;
  };
  metrics: Record<string, number>;
  metricRows: ReportRow[];
  configuration: ReportRow[];
  lineage: ReportRow[];
  footnotes: string[];
  sources: { module: string; records: number }[];
  recordsCount: number;
  validation: {
    status: ValidationStatus;
    checks: ReportRow[];
    exclusions: string[];
    reportTotal?: string;
    sourceTotal?: string;
    difference?: string;
  };
  formats: string[];
}

export interface RunDetail {
  run: RunSummary;
  periodLabel: string;
  catalog: { kind: string; name: string; description: string; icon: string } | null;
  snapshot: ReportData | null;
  versions: RunSummary[];
  kpiChanges: { label: string; current: string; previous: string }[];
  previousExclusions: string[] | null;
  deliveries: {
    at: string;
    channel: string | null;
    recipient: string;
    state: string;
    error: string | null;
    byName: string | null;
  }[];
  schedule: {
    id: string;
    active: boolean;
    frequency: "weekly" | "monthly";
    nextRunAt: string | null;
    recipients: { label?: string; phone?: string; email?: string }[];
    lastResult: string | null;
  } | null;
}

export interface RunAudit {
  trigger: string;
  aiBuilt: boolean;
  regenerations: number;
  events: { at: string; action: string; actorName: string | null; detail: unknown }[];
}

export interface RunExplanation {
  title: string;
  summary: string;
  confidence: ValidationStatus;
  rows: { label: string; value: string }[];
  bullets: string[];
  note: string;
}

export type AiBuilderResult =
  | { supported: false; request: string; reason: string }
  | {
      supported: true;
      request: string;
      kind: ReportKind;
      name: string;
      month: string;
      periodLabel: string;
      allowed: boolean;
      permissionNote: string;
    };

export function fetchReportsLibrary(period?: string): Promise<ReportsLibrary> {
  return apiFetch<ReportsLibrary>(`/reports/library${period ? `?period=${period}` : ""}`);
}

export function toggleReportFavorite(kind: ReportKind): Promise<{ favorite: boolean }> {
  return apiFetch(`/reports/favorites/${kind}`, { method: "PUT" });
}

/** POST /reports/:kind — generates a new versioned run and returns its record plus a signed URL. */
export function generateReport(
  kind: ReportKind,
  month?: string,
  trigger?: "manual" | "ai_builder",
): Promise<{ url: string; run: RunSummary }> {
  return apiFetch(`/reports/${kind}`, { method: "POST", body: JSON.stringify({ month, trigger }) });
}

/** POST /reports/:kind/send — generates, then sends the link to the caller's own contact. */
export function sendReport(kind: ReportKind, month?: string): Promise<unknown> {
  return apiFetch(`/reports/${kind}/send`, { method: "POST", body: JSON.stringify({ month }) });
}

export function fetchRunDetail(id: string): Promise<RunDetail> {
  return apiFetch<RunDetail>(`/reports/runs/${id}`);
}

export function fetchRunExplanation(id: string): Promise<RunExplanation> {
  return apiFetch<RunExplanation>(`/reports/runs/${id}/explain`);
}

export function fetchRunAudit(id: string): Promise<RunAudit> {
  return apiFetch<RunAudit>(`/reports/runs/${id}/audit`);
}

export function downloadRun(id: string): Promise<{ url: string }> {
  return apiFetch(`/reports/runs/${id}/download`, { method: "POST" });
}

export function sendRun(
  id: string,
  recipient?: { email?: string; phone?: string },
): Promise<{ channel: string | null; state: string; recipient: string }> {
  return apiFetch(`/reports/runs/${id}/send`, { method: "POST", body: JSON.stringify(recipient ?? {}) });
}

export function parseReportRequest(request: string): Promise<AiBuilderResult> {
  return apiFetch<AiBuilderResult>("/reports/ai-builder", { method: "POST", body: JSON.stringify({ request }) });
}
