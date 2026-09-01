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
}

export function fetchScheduledExports(): Promise<LiveScheduledExport[]> {
  return apiFetch<LiveScheduledExport[]>("/exports/schedules");
}

export interface CreateScheduleInput {
  kind?: string;
  reportKind?: ReportKind;
  format?: ExportFormat;
  frequency: ScheduleFrequency;
  recipients?: ScheduleRecipient[];
}

export function createScheduledExport(input: CreateScheduleInput): Promise<LiveScheduledExport> {
  return apiFetch<LiveScheduledExport>("/exports/schedules", { method: "POST", body: JSON.stringify(input) });
}

export interface UpdateScheduleInput {
  active?: boolean;
  frequency?: ScheduleFrequency;
  format?: ExportFormat;
  recipients?: ScheduleRecipient[];
}

export function updateScheduledExport(id: string, input: UpdateScheduleInput): Promise<LiveScheduledExport> {
  return apiFetch<LiveScheduledExport>(`/exports/schedules/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteScheduledExport(id: string): Promise<void> {
  return apiFetch<void>(`/exports/schedules/${id}`, { method: "DELETE" });
}
