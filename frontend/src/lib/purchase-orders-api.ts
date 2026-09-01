import { apiFetch } from "@/lib/api-client";

export type PurchaseOrderStatus = "draft" | "sent" | "confirmed" | "partially_received" | "received" | "cancelled";

interface RawPurchaseOrderItem {
  id: string;
  productId: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitCost: string;
  product: { id: string; name: string; sku: string | null };
}

export interface PurchaseOrderItem {
  id: string;
  productId: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitCost: number;
  product: { id: string; name: string; sku: string | null };
}

interface RawPurchaseOrder {
  id: string;
  supplierId: string;
  status: PurchaseOrderStatus;
  note: string | null;
  createdByUserId: string | null;
  sentAt: string | null;
  confirmedAt: string | null;
  receivedAt: string | null;
  items: RawPurchaseOrderItem[];
  supplier: { id: string; name: string; phone: string | null };
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrder extends Omit<RawPurchaseOrder, "items"> {
  items: PurchaseOrderItem[];
}

function toPurchaseOrder(raw: RawPurchaseOrder): PurchaseOrder {
  return {
    ...raw,
    items: raw.items.map((i) => ({ ...i, unitCost: Number(i.unitCost) })),
  };
}

export async function fetchPurchaseOrders(status?: PurchaseOrderStatus): Promise<PurchaseOrder[]> {
  const query = status ? `?status=${status}` : "";
  const raw = await apiFetch<RawPurchaseOrder[]>(`/purchase-orders${query}`);
  return raw.map(toPurchaseOrder);
}

export async function fetchPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const raw = await apiFetch<RawPurchaseOrder>(`/purchase-orders/${id}`);
  return toPurchaseOrder(raw);
}

export interface CreatePurchaseOrderInput {
  supplierId: string;
  note?: string;
  items: { productId: string; qty: number; unitCost: number }[];
}

export async function createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<PurchaseOrder> {
  const raw = await apiFetch<RawPurchaseOrder>("/purchase-orders", { method: "POST", body: JSON.stringify(input) });
  return toPurchaseOrder(raw);
}

export async function sendPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const raw = await apiFetch<RawPurchaseOrder>(`/purchase-orders/${id}/send`, { method: "POST" });
  return toPurchaseOrder(raw);
}

export async function confirmPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const raw = await apiFetch<RawPurchaseOrder>(`/purchase-orders/${id}/confirm`, { method: "POST" });
  return toPurchaseOrder(raw);
}

export async function receivePurchaseOrder(id: string, items: { itemId: string; qtyReceived: number }[]): Promise<PurchaseOrder> {
  const raw = await apiFetch<RawPurchaseOrder>(`/purchase-orders/${id}/receive`, {
    method: "POST",
    body: JSON.stringify({ items }),
  });
  return toPurchaseOrder(raw);
}

export async function cancelPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const raw = await apiFetch<RawPurchaseOrder>(`/purchase-orders/${id}/cancel`, { method: "POST" });
  return toPurchaseOrder(raw);
}
