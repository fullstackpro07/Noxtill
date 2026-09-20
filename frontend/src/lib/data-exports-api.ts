import { apiFetch } from "@/lib/api-client";

export type DataExportFormat = "csv" | "xlsx";
export type DataExportScope = "everything" | "selected";
export type DataExportState = "queued" | "preparing" | "ready" | "failed" | "expired";

export interface DataExportModule {
  key: string;
  label: string;
  records: number;
  sensitive: boolean;
}

export interface DataExportRow {
  id: string;
  displayId: string;
  requestedBy: string | null;
  createdAt: string;
  scope: DataExportScope;
  scopeLabel: string;
  modules: string[];
  moduleCount: number;
  format: DataExportFormat;
  records: number;
  sizeBytes: number;
  status: DataExportState;
  readyAt: string | null;
  expiresAt: string | null;
  errorMessage: string | null;
  sensitive: boolean;
}

export interface DataExportOverview {
  modules: DataExportModule[];
  totalRecords: number;
  formats: { key: DataExportFormat; label: string }[];
  kpis: {
    lastExport: { at: string; by: string | null; records: number; sizeBytes: number } | null;
    current: { count: number; state: "preparing" | "queued" | null };
    failedLast90Days: number;
  };
  history: DataExportRow[];
}

export interface DataExportDetail extends DataExportRow {
  audit: { action: string; at: string; actorName: string | null }[];
}

export interface DataExportPreview {
  scope: DataExportScope;
  format: DataExportFormat;
  modules: DataExportModule[];
  records: number;
  sensitive: boolean;
}

export interface DataExportRequest {
  scope: DataExportScope;
  modules?: string[];
  format: DataExportFormat;
}

export function fetchDataExportOverview(): Promise<DataExportOverview> {
  return apiFetch<DataExportOverview>("/exports/data/overview");
}

export function fetchDataExportDetail(id: string): Promise<DataExportDetail> {
  return apiFetch<DataExportDetail>(`/exports/data/${id}`);
}

export function previewDataExport(input: DataExportRequest): Promise<DataExportPreview> {
  return apiFetch("/exports/data/preview", { method: "POST", body: JSON.stringify(input) });
}

export function createDataExport(input: DataExportRequest): Promise<DataExportRow> {
  return apiFetch("/exports/data", { method: "POST", body: JSON.stringify(input) });
}

export function downloadDataExport(id: string): Promise<{ url: string }> {
  return apiFetch(`/exports/data/${id}/download`, { method: "POST" });
}

export function regenerateDataExport(id: string): Promise<DataExportRow> {
  return apiFetch(`/exports/data/${id}/regenerate`, { method: "POST" });
}
