import { apiFetch } from "@/lib/api-client";

export interface BulkPriceInput {
  productIds?: string[];
  category?: string;
  mode: "percent" | "amount";
  value: number;
  dryRun?: boolean;
}

export interface BulkPriceChange {
  productId: string;
  name: string;
  oldPrice: number;
  newPrice: number;
}

export interface BulkPriceResult {
  dryRun: boolean;
  changes: BulkPriceChange[];
}

export function bulkPrice(input: BulkPriceInput): Promise<BulkPriceResult> {
  return apiFetch<BulkPriceResult>("/products/bulk-price", { method: "PATCH", body: JSON.stringify(input) });
}

interface RawPriceHistoryEntry {
  id: string;
  productId: string;
  oldPrice: string;
  newPrice: string;
  changedByUserId: string | null;
  note: string | null;
  createdAt: string;
}

export interface LivePriceHistoryEntry {
  id: string;
  oldPrice: number;
  newPrice: number;
  note: string | null;
  createdAt: string;
}

export function fetchPriceHistory(productId: string): Promise<LivePriceHistoryEntry[]> {
  return apiFetch<RawPriceHistoryEntry[]>(`/products/${productId}/price-history`).then((rows) =>
    rows.map((r) => ({ id: r.id, oldPrice: Number(r.oldPrice), newPrice: Number(r.newPrice), note: r.note, createdAt: r.createdAt })),
  );
}

export interface PriceSuggestion {
  productId: string;
  costPrice: number;
  currentPrice: number;
  currentMarginPercent: number;
  suggestedPrice: number;
  rationale: string;
}

/** AI-phrased rationale over a deterministic, real formula — the price/margin figures are never AI-invented (see backend doc comment). */
export function fetchPriceSuggestion(productId: string): Promise<PriceSuggestion> {
  return apiFetch<PriceSuggestion>(`/products/${productId}/price-suggestion`);
}
