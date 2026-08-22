import { apiFetch } from "@/lib/api-client";

export interface CreateReturnInput {
  orderId: string;
  reason: string;
  refundMethod: "cash" | "card" | "online" | "credit" | "store_credit";
  restock?: boolean;
  items: { productId: string; qty: number }[];
}

/** Creates a pending return request — actually refunding still requires a separate Returns-capability approval, unchanged by this call. */
export function createReturn(input: CreateReturnInput): Promise<{ id: string; status: string }> {
  return apiFetch<{ id: string; status: string }>("/returns", { method: "POST", body: JSON.stringify(input) });
}

export type ReturnStatus = "pending" | "approved" | "rejected";

interface RawReturnItem {
  id: string;
  productId: string;
  qty: number;
  amount: string;
}

interface RawReturn {
  id: string;
  orderId: string;
  customerId: string | null;
  reason: string;
  refundMethod: CreateReturnInput["refundMethod"];
  refundAmount: string;
  status: ReturnStatus;
  restock: boolean;
  createdAt: string;
  items: RawReturnItem[];
  order: { orderNo: number };
  customer: { name: string; phone: string } | null;
}

export interface LiveReturn {
  id: string;
  orderId: string;
  orderNo: number;
  customerName: string | null;
  reason: string;
  refundMethod: CreateReturnInput["refundMethod"];
  refundAmount: number;
  status: ReturnStatus;
  restock: boolean;
  createdAt: string;
  itemsCount: number;
}

function toLiveReturn(raw: RawReturn): LiveReturn {
  return {
    id: raw.id,
    orderId: raw.orderId,
    orderNo: raw.order.orderNo,
    customerName: raw.customer?.name ?? null,
    reason: raw.reason,
    refundMethod: raw.refundMethod,
    refundAmount: Number(raw.refundAmount),
    status: raw.status,
    restock: raw.restock,
    createdAt: raw.createdAt,
    itemsCount: raw.items.reduce((sum, i) => sum + i.qty, 0),
  };
}

export function fetchReturns(status?: ReturnStatus): Promise<LiveReturn[]> {
  const query = status ? `?status=${status}` : "";
  return apiFetch<RawReturn[]>(`/returns${query}`).then((rows) => rows.map(toLiveReturn));
}

export function approveReturn(id: string): Promise<unknown> {
  return apiFetch(`/returns/${id}/approve`, { method: "POST" });
}

export function rejectReturn(id: string, reason?: string): Promise<unknown> {
  return apiFetch(`/returns/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
}
