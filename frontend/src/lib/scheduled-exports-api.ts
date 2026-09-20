import { apiFetch } from "@/lib/api-client";
import type { ExportFormat } from "@/lib/exports-api";
import type { ReportKind } from "@/lib/reports";

export type ScheduleFrequency = "weekly" | "monthly";

export interface ScheduleRecipient {
  label?: string;
  phone?: string;
  email?: string;
}

export interface LiveScheduledExport {
  id: string;
  kind: string | null;
  reportKind: ReportKind | null;
  format: ExportFormat;
  frequency: ScheduleFrequency;
  active: boolean;
  recipients: ScheduleRecipient[];
  lastRunAt: string | null;
  createdAt: string;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  lastResult: "sent" | "failed" | null;
  lastError: string | null;
  lastReportRunId: string | null;
  /** The real hour the daily job runs (server time). */
  runHour: number;
  nextRunAt: string | null;
  /** The period a report schedule covers when it next runs; null for a data-export schedule. */
  period: string | null;
  periodLabel: string | null;
}

export function fetchScheduledExports(): Promise<LiveScheduledExport[]> {
  return apiFetch<LiveScheduledExport[]>("/exports/schedules");
}

export interface CreateScheduleInput {
  kind?: string;
  reportKind?: ReportKind;
  format?: ExportFormat;
  frequency: ScheduleFrequency;
  dayOfWeek?: number;
  dayOfMonth?: number;
  recipients?: ScheduleRecipient[];
}

export function createScheduledExport(input: CreateScheduleInput): Promise<LiveScheduledExport> {
  return apiFetch<LiveScheduledExport>("/exports/schedules", { method: "POST", body: JSON.stringify(input) });
}

export interface UpdateScheduleInput {
  active?: boolean;
  frequency?: ScheduleFrequency;
  dayOfWeek?: number;
  dayOfMonth?: number;
  format?: ExportFormat;
  recipients?: ScheduleRecipient[];
}

export function updateScheduledExport(id: string, input: UpdateScheduleInput): Promise<LiveScheduledExport> {
  return apiFetch<LiveScheduledExport>(`/exports/schedules/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteScheduledExport(id: string): Promise<void> {
  return apiFetch<void>(`/exports/schedules/${id}`, { method: "DELETE" });
}

export interface RunNowResult {
  ok: boolean;
  lastResult: "sent" | "failed" | null;
  lastError: string | null;
  lastReportRunId: string | null;
}

export function runScheduleNow(id: string): Promise<RunNowResult> {
  return apiFetch<RunNowResult>(`/exports/schedules/${id}/run`, { method: "POST" });
}
