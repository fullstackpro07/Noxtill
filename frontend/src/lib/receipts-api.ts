import { apiFetch } from "@/lib/api-client";

export interface ReceiptFilters {
  q?: string;
  staffUserId?: string;
}

export type ReceiptChannel = "digital" | "print";

interface RawReceiptRow {
  id: string;
  orderNo: number;
  createdAt: string;
  total: number;
  customerName: string | null;
  customerPhone: string | null;
  lastSentAt: string | null;
  lastChannel: ReceiptChannel | null;
}

export type LiveReceiptRow = RawReceiptRow;

function buildQuery(params: Record<string, string | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) usp.set(key, value);
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

export function fetchReceipts(filters: ReceiptFilters): Promise<LiveReceiptRow[]> {
  return apiFetch<RawReceiptRow[]>(`/receipts${buildQuery(filters as Record<string, string | undefined>)}`);
}

export interface ReceiptStats {
  digitalCount: number;
  printedCount: number;
  digitalPercent: number;
}

export function fetchReceiptStats(): Promise<ReceiptStats> {
  return apiFetch<ReceiptStats>("/receipts/stats");
}

export function resendReceipt(id: string, channel: ReceiptChannel): Promise<{ url: string }> {
  return apiFetch<{ url: string }>(`/receipts/${id}/resend`, { method: "POST", body: JSON.stringify({ channel }) });
}
