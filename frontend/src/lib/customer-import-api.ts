import { apiFetch } from "@/lib/api-client";

export type ImportRowAction = "create" | "update" | "skip";

export interface StagedImportRow {
  rowNumber: number;
  name: string;
  rawPhone: string;
  normalizedPhone?: string;
  balance?: number;
  action: ImportRowAction;
  reason?: string;
  existingCustomerId?: string;
}

export interface ImportPreview {
  batchId: string;
  status: "pending" | "processing" | "completed";
  counts: { create: number; update: number; skip: number; totalCredit: number };
  preview: StagedImportRow[];
  invalid: StagedImportRow[];
  /** Column-mapping (UPD-BE-099) — true for csv/xlsx uploads, where columns/remap below are available. */
  hasColumnMapping: boolean;
}

/** POST /customers/import — parses csv/xlsx/txt/docx and stages a batch for review; re-uploading the same file returns the existing batch. */
export function stageImport(file: File): Promise<ImportPreview> {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch<ImportPreview>("/customers/import", {
    method: "POST",
    body: formData,
  });
}

export function getImportBatch(batchId: string): Promise<ImportPreview> {
  return apiFetch<ImportPreview>(`/customers/import/${batchId}`);
}

/** POST /customers/import/:batch/confirm — queues the actual create/update/credit work; returns immediately with status "processing". */
export function confirmImport(batchId: string): Promise<{ batchId: string; status: string }> {
  return apiFetch<{ batchId: string; status: string }>(`/customers/import/${batchId}/confirm`, {
    method: "POST",
  });
}

/** GET /customers/import/:batch/columns — the real file headers plus a suggested mapping (UPD-BE-099, csv/xlsx only). */
export function getImportColumns(batchId: string): Promise<{ headers: string[]; mapping: Record<string, string> }> {
  return apiFetch(`/customers/import/${batchId}/columns`);
}

/** PATCH /customers/import/:batch/remap — re-stages the batch under a corrected mapping, without re-uploading (UPD-BE-099). */
export function remapImport(batchId: string, mapping: Record<string, string>): Promise<ImportPreview> {
  return apiFetch<ImportPreview>(`/customers/import/${batchId}/remap`, {
    method: "PATCH",
    body: JSON.stringify({ mapping }),
  });
}
