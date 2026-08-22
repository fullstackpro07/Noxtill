import { apiFetch } from "@/lib/api-client";

export type LiveTableStatus = "free" | "occupied" | "reserved" | "needs_cleaning";

interface RawTable {
  id: string;
  number: string;
  floor: string | null;
  seats: number | null;
  status: LiveTableStatus;
  seatedAt: string | null;
  activeOrderId: string | null;
  runningTotal: number;
  openedAt: string | null;
}

export interface LiveTable {
  id: string;
  number: string;
  floor: string | null;
  seats: number | null;
  status: LiveTableStatus;
  seatedAt: string | null;
  activeOrderId: string | null;
  runningTotal: number;
  openedAt: string | null;
}

function toLiveTable(raw: RawTable): LiveTable {
  return { ...raw, runningTotal: Number(raw.runningTotal) };
}

export function fetchTables(): Promise<LiveTable[]> {
  return apiFetch<RawTable[]>("/tables").then((rows) => rows.map(toLiveTable));
}

export interface TableDraft {
  number: string;
  floor?: string;
  seats?: number;
}

export function createTable(draft: TableDraft): Promise<LiveTable> {
  return apiFetch<RawTable>("/tables", { method: "POST", body: JSON.stringify(draft) }).then(toLiveTable);
}

export function openTable(id: string): Promise<LiveTable> {
  return apiFetch<RawTable>(`/tables/${id}/open`, { method: "POST" }).then(toLiveTable);
}

export function moveTable(id: string, toTableNumber: string): Promise<LiveTable> {
  return apiFetch<RawTable>(`/tables/${id}/move`, { method: "POST", body: JSON.stringify({ toTableNumber }) }).then(toLiveTable);
}

export function mergeTables(id: string, intoTableNumber: string): Promise<LiveTable> {
  return apiFetch<RawTable>(`/tables/${id}/merge`, { method: "POST", body: JSON.stringify({ intoTableNumber }) }).then(toLiveTable);
}

export interface SplitBillResult {
  orderId: string;
  total: number;
  parts: number;
  shares: number[];
}

/** A pure preview — never mutates the order (see backend `OrdersService.splitBill()`). */
export function splitBill(orderId: string, parts: number): Promise<SplitBillResult> {
  return apiFetch<SplitBillResult>(`/orders/${orderId}/split-bill`, {
    method: "POST",
    body: JSON.stringify({ parts }),
  });
}
