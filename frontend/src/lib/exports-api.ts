import { apiFetch } from "@/lib/api-client";

/** GET /exports/:kind (BE-077, owner-only) — generates the xlsx synchronously and returns a 24h signed URL. */
export function generateExport(kind: string): Promise<{ url: string }> {
  return apiFetch<{ url: string }>(`/exports/${kind}`);
}

/** POST /exports/account-zip (owner-only) — the one queued export; the real link arrives via a notification. */
export function requestAccountZip(): Promise<{ queued: true }> {
  return apiFetch<{ queued: true }>("/exports/account-zip", { method: "POST" });
}
