import { apiFetch } from "@/lib/api-client";

export type StockTransferStatus = "pending" | "approved" | "shipped" | "received" | "rejected" | "cancelled";

interface RawTransferItem {
  id: string;
  sourceProductId: string;
  qty: number;
  sourceProduct: { id: string; name: string; sku: string | null };
}

interface RawStockTransfer {
  id: string;
  sourceBusinessId: string;
  destBusinessId: string;
  status: StockTransferStatus;
  note: string | null;
  requestedByUserId: string | null;
  approvedByUserId: string | null;
  shippedByUserId: string | null;
  receivedByUserId: string | null;
  items: RawTransferItem[];
  createdAt: string;
  updatedAt: string;
}

export type StockTransfer = RawStockTransfer;

export function fetchStockTransfers(status?: StockTransferStatus): Promise<StockTransfer[]> {
  const query = status ? `?status=${status}` : "";
  return apiFetch<StockTransfer[]>(`/stock-transfers${query}`);
}

export function fetchStockTransfer(id: string): Promise<StockTransfer> {
  return apiFetch<StockTransfer>(`/stock-transfers/${id}`);
}

export interface CreateStockTransferInput {
  destBusinessId: string;
  note?: string;
  items: { productId: string; qty: number }[];
}

export function createStockTransfer(input: CreateStockTransferInput): Promise<StockTransfer> {
  return apiFetch<StockTransfer>("/stock-transfers", { method: "POST", body: JSON.stringify(input) });
}

export function approveStockTransfer(id: string): Promise<StockTransfer> {
  return apiFetch<StockTransfer>(`/stock-transfers/${id}/approve`, { method: "PATCH" });
}

export function shipStockTransfer(id: string): Promise<StockTransfer> {
  return apiFetch<StockTransfer>(`/stock-transfers/${id}/ship`, { method: "PATCH" });
}

export function receiveStockTransfer(id: string): Promise<StockTransfer> {
  return apiFetch<StockTransfer>(`/stock-transfers/${id}/receive`, { method: "PATCH" });
}

export function rejectStockTransfer(id: string, reason?: string): Promise<StockTransfer> {
  return apiFetch<StockTransfer>(`/stock-transfers/${id}/reject`, { method: "PATCH", body: JSON.stringify({ reason }) });
}
