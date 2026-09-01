import { apiFetch } from "@/lib/api-client";

export type StockCountStatus = "draft" | "applied";

export interface StockCountLine {
  id: string;
  productId: string;
  expectedQty: number;
  countedQty: number;
  variance: number;
  product: { id: string; name: string; sku: string | null };
}

export interface StockCount {
  id: string;
  status: StockCountStatus;
  note: string | null;
  createdByUserId: string | null;
  appliedByUserId: string | null;
  appliedAt: string | null;
  lines: StockCountLine[];
  createdAt: string;
}

export function fetchStockCounts(status?: StockCountStatus): Promise<StockCount[]> {
  const query = status ? `?status=${status}` : "";
  return apiFetch<StockCount[]>(`/stock/counts${query}`);
}

export function fetchStockCount(id: string): Promise<StockCount> {
  return apiFetch<StockCount>(`/stock/counts/${id}`);
}

export interface CreateStockCountInput {
  note?: string;
  lines: { productId: string; countedQty: number }[];
}

export function createStockCount(input: CreateStockCountInput): Promise<StockCount> {
  return apiFetch<StockCount>("/stock/counts", { method: "POST", body: JSON.stringify(input) });
}

export function applyStockCount(id: string): Promise<StockCount> {
  return apiFetch<StockCount>(`/stock/counts/${id}/apply`, { method: "POST" });
}
