import { apiFetch } from "@/lib/api-client";

export interface ReconRun {
  id: string;
  provider: string;
  status: "completed" | "failed" | "skipped";
  listingsChecked: number;
  discrepancies: number;
  detail: string | null;
  startedAt: string;
}

export interface ReconItem {
  id: string;
  runId: string;
  channelListingId: string;
  provider: string;
  kind: "missing_on_provider" | "stock_mismatch" | "no_sku";
  local: { name: string; sku: string | null; stockQty: number; externalProductId: string | null };
  remote: { sku: string; quantity: number } | null;
  status: "open" | "resolved" | "dismissed";
  resolutionNote: string | null;
  createdAt: string;
}

export interface ReconOverview {
  runs: ReconRun[];
  items: ReconItem[];
  openItems: number;
  checks: { presence: string; stock: string; notChecked: string };
}

export const fetchReconciliation = () => apiFetch<ReconOverview>("/commerce/reconciliation");
export const runReconciliation = () => apiFetch<{ runs: ReconRun[] }>("/commerce/reconciliation/run", { method: "POST" });
export const decideReconItem = (id: string, status: "resolved" | "dismissed", note: string) =>
  apiFetch(`/commerce/reconciliation/items/${id}/decision`, { method: "POST", body: JSON.stringify({ status, note }) });
