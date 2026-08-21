import { apiFetch } from "@/lib/api-client";

export interface HeldSaleItem {
  productId: string;
  qty: number;
  priceOverride?: number;
}

interface RawHeldSaleCart {
  orderType?: string;
  tableNo?: string;
  customerId?: string;
  customerPhone?: string;
  customerName?: string;
  staffUserId?: string;
  items: HeldSaleItem[];
  discount?: number;
}

interface RawHeldSale {
  id: string;
  cart: RawHeldSaleCart;
  heldByUserId: string | null;
  note: string | null;
  createdAt: string;
  estimatedTotal: number;
}

export interface LiveHeldSale {
  id: string;
  items: HeldSaleItem[];
  itemsCount: number;
  customerName?: string;
  note?: string;
  heldByUserId: string | null;
  createdAt: string;
  estimatedTotal: number;
}

function toLiveHeldSale(raw: RawHeldSale): LiveHeldSale {
  return {
    id: raw.id,
    items: raw.cart.items,
    itemsCount: raw.cart.items.reduce((n, i) => n + i.qty, 0),
    customerName: raw.cart.customerName,
    note: raw.note ?? undefined,
    heldByUserId: raw.heldByUserId,
    createdAt: raw.createdAt,
    estimatedTotal: raw.estimatedTotal,
  };
}

export function fetchHeldSales(): Promise<LiveHeldSale[]> {
  return apiFetch<RawHeldSale[]>("/sales/held").then((rows) => rows.map(toLiveHeldSale));
}

export interface HoldSaleInput {
  items: { productId: string; qty: number }[];
  discount?: number;
  customerId?: string;
  customerPhone?: string;
  staffUserId?: string;
  note?: string;
}

export function holdSale(input: HoldSaleInput): Promise<{ id: string }> {
  return apiFetch<{ id: string }>("/sales/held", { method: "POST", body: JSON.stringify(input) });
}

export function resumeHeldSale(
  id: string,
  method: "cash" | "card" | "online" | "credit",
): Promise<{ orderNo: number; total: string }> {
  return apiFetch<{ orderNo: number; total: string }>(`/sales/held/${id}/resume`, {
    method: "POST",
    body: JSON.stringify({ payment: { method } }),
  });
}

export function discardHeldSale(id: string): Promise<void> {
  return apiFetch<void>(`/sales/held/${id}`, { method: "DELETE" });
}

export function discardOldHeldSales(): Promise<{ count: number }> {
  return apiFetch<{ count: number }>("/sales/held/discard-old", { method: "POST" });
}
