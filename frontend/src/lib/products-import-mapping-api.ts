import { apiFetch } from "@/lib/api-client";
import type { ImportSummary } from "@/lib/products-api";

export const IMPORT_CANONICAL_FIELDS = ["name", "kind", "category", "sku", "costPrice", "sellingPrice", "stockQty"] as const;
export type ImportCanonicalField = (typeof IMPORT_CANONICAL_FIELDS)[number];

export interface ImportPreviewRow {
  rowNumber: number;
  raw: Record<string, string>;
  mapped: Record<string, string | number | undefined>;
  confidence: number;
  valid: boolean;
  error?: string;
}

export interface ImportPreview {
  headers: string[];
  suggestedMapping: Record<string, string>;
  rows: ImportPreviewRow[];
}

/** Parses the file server-side (real headers + a real per-row confidence preview against a real
 * auto-suggested mapping) — writes nothing. */
export function previewProductsImport(file: File): Promise<ImportPreview> {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch<ImportPreview>("/products/import/preview", { method: "POST", body: formData });
}

export interface ImportRowCorrection {
  rowNumber: number;
  data: Record<string, string>;
}

/** Re-sends the same file plus the caller's final mapping/corrections/skip-list — the backend
 * re-validates everything for real rather than trusting anything from the preview step. */
export function commitProductsImport(
  file: File,
  mapping: Record<string, string>,
  skippedRows: number[],
  corrections: ImportRowCorrection[],
): Promise<ImportSummary> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("mapping", JSON.stringify(mapping));
  formData.append("skippedRows", JSON.stringify(skippedRows));
  formData.append("corrections", JSON.stringify(corrections));
  return apiFetch<ImportSummary>("/products/import/commit", { method: "POST", body: formData });
}
