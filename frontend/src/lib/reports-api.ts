import { apiFetch } from "@/lib/api-client";
import type { ReportKind } from "@/lib/reports";

/** POST /reports/:kind (BE-076) — generates the PDF synchronously and returns a 24h signed URL. */
export function generateReport(kind: ReportKind, month?: string): Promise<{ url: string }> {
  return apiFetch<{ url: string }>(`/reports/${kind}`, {
    method: "POST",
    body: JSON.stringify({ month }),
  });
}

/** POST /reports/:kind/send — pushes the same PDF to the caller's own WhatsApp/SMS/email via the send-gate. */
export function sendReport(kind: ReportKind, month?: string): Promise<unknown> {
  return apiFetch(`/reports/${kind}/send`, {
    method: "POST",
    body: JSON.stringify({ month }),
  });
}
