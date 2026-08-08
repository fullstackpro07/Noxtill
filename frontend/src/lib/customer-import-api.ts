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
