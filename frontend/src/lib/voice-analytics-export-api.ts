import { apiFetch } from "@/lib/api-client";

export interface VoiceAnalyticsExport {
  filename: string;
  rowCount: number;
  columns: string[];
  csv: string;
}

/** GET /voice/analytics/export — saved call facts for a date range (max 92 days), callers masked. */
export function exportVoiceAnalytics(from: string, to: string): Promise<VoiceAnalyticsExport> {
  const qs = new URLSearchParams({ from, to });
  return apiFetch(`/voice/analytics/export?${qs.toString()}`);
}
