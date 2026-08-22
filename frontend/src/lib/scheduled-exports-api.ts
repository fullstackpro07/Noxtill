import { apiFetch } from "@/lib/api-client";
import type { ExportFormat } from "@/lib/exports-api";

export type ScheduleFrequency = "weekly" | "monthly";

export interface LiveScheduledExport {
  id: string;
  kind: string;
  format: ExportFormat;
  frequency: ScheduleFrequency;
  active: boolean;
  lastRunAt: string | null;
  createdAt: string;
}

export function fetchScheduledExports(): Promise<LiveScheduledExport[]> {
  return apiFetch<LiveScheduledExport[]>("/exports/schedules");
}

export function createScheduledExport(input: { kind: string; format: ExportFormat; frequency: ScheduleFrequency }): Promise<LiveScheduledExport> {
  return apiFetch<LiveScheduledExport>("/exports/schedules", { method: "POST", body: JSON.stringify(input) });
}

export function updateScheduledExport(id: string, input: { active?: boolean; frequency?: ScheduleFrequency; format?: ExportFormat }): Promise<LiveScheduledExport> {
  return apiFetch<LiveScheduledExport>(`/exports/schedules/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteScheduledExport(id: string): Promise<void> {
  return apiFetch<void>(`/exports/schedules/${id}`, { method: "DELETE" });
}
