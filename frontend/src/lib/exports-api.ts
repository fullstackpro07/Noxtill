import { apiFetch } from "@/lib/api-client";

export type ExportFormat = "xlsx" | "csv" | "pdf";

/** GET /exports/:kind (BE-077, owner-only) — generates the file synchronously and returns a 24h signed URL. Defaults to xlsx. */
export function generateExport(kind: string, format: ExportFormat = "xlsx"): Promise<{ url: string }> {
  return apiFetch<{ url: string }>(`/exports/${kind}?format=${format}`);
}

/** POST /exports/account-zip (owner-only) — the one queued export; the real link arrives via a notification. */
export function requestAccountZip(): Promise<{ queued: true }> {
  return apiFetch<{ queued: true }>("/exports/account-zip", { method: "POST" });
}
