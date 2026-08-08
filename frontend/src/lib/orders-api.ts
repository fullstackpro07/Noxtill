import { apiFetch } from "@/lib/api-client";
import type { OrderStatus } from "@/lib/orders";

interface RawOrderItem {
  productId: string | null;
  name: string;
  price: string;
  qty: number;
}

interface RawPayment {
  method: "cash" | "card" | "online" | "credit";
  amount: string;
}

interface RawCreditEntry {
  kind: "credit" | "payment";
}

interface RawCustomer {
  id: string;
  name: string;
  phone: string;
}

interface RawOrder {
  id: string;
  orderNo: number;
  customer: RawCustomer | null;
  orderType: string;
  tableNo: string | null;
  status: OrderStatus;
  subtotal: string;
  tax: string;
  discount: string;
  total: string;
  isQuotation: boolean;
  items: RawOrderItem[];
  payments: RawPayment[];
  creditEntries: RawCreditEntry[];
  createdAt: string;
}

export type LivePaymentMethod = "cash" | "card" | "online" | "credit";

export interface LiveOrder {
  id: string;
  orderNo: number;
  customerName: string;
  orderType: string;
  tableNo?: string;
  status: OrderStatus;
  items: { productId: string | null; name: string; price: number; qty: number }[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paymentMethod: LivePaymentMethod;
  createdAt: string;
}

function toLiveOrder(raw: RawOrder): LiveOrder {
  return {
    id: raw.id,
    orderNo: raw.orderNo,
    customerName: raw.customer?.name ?? "Walk-in",
    orderType: raw.orderType,
    tableNo: raw.tableNo ?? undefined,
    status: raw.status,
    items: raw.items.map((i) => ({ productId: i.productId, name: i.name, price: Number(i.price), qty: i.qty })),
    subtotal: Number(raw.subtotal),
    tax: Number(raw.tax),
    discount: Number(raw.discount),
    total: Number(raw.total),
    paymentMethod: raw.payments[0]?.method ?? (raw.creditEntries.some((e) => e.kind === "credit") ? "credit" : "cash"),
    createdAt: raw.createdAt,
  };
}

export function fetchOrders(status?: OrderStatus): Promise<LiveOrder[]> {
  const query = status ? `?status=${status}` : "";
  return apiFetch<RawOrder[]>(`/orders${query}`).then((rows) => rows.map(toLiveOrder));
}

export interface SaleLineInput {
  productId: string;
  qty: number;
}

export interface CreateSaleInput {
  orderType?: "counter" | "online" | "dine_in" | "takeaway" | "delivery";
  tableNo?: string;
  customerId?: string;
  customerPhone?: string;
  customerName?: string;
  items: SaleLineInput[];
  discount?: number;
  payment: { method: "cash" | "card" | "online" | "credit"; amount?: number; note?: string };
}

export function createSale(input: CreateSaleInput): Promise<LiveOrder> {
  return apiFetch<RawOrder>("/sales", { method: "POST", body: JSON.stringify(input) }).then(toLiveOrder);
}

export function updateOrderStatus(id: string, status: OrderStatus): Promise<LiveOrder> {
  return apiFetch<RawOrder>(`/orders/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  }).then(toLiveOrder);
}

/** send=false just renders+uploads the PDF and hands back a signed URL — no message is sent either way. */
export function generateInvoice(orderId: string, send = false): Promise<{ url: string }> {
  return apiFetch<{ url: string }>(`/orders/${orderId}/invoice`, {
    method: "POST",
    body: JSON.stringify({ send }),
  });
}

export interface LiveQuotation {
  id: string;
  quoteNo: number;
  customerName: string;
  items: { productId: string | null; name: string; price: number; qty: number }[];
  total: number;
  createdAt: string;
}

function toLiveQuotation(raw: RawOrder): LiveQuotation {
  return {
    id: raw.id,
    quoteNo: raw.orderNo,
    customerName: raw.customer?.name ?? "Walk-in",
    items: raw.items.map((i) => ({ productId: i.productId, name: i.name, price: Number(i.price), qty: i.qty })),
    total: Number(raw.total),
    createdAt: raw.createdAt,
  };
}

export function fetchQuotations(): Promise<LiveQuotation[]> {
  return apiFetch<RawOrder[]>("/quotations").then((rows) => rows.map(toLiveQuotation));
}

/** Converts a quotation into a real pending order — the quotation row itself has no "converted" flag today, so this stays safe to call more than once. */
export function convertQuotation(id: string): Promise<LiveOrder> {
  return apiFetch<RawOrder>(`/quotations/${id}/convert`, { method: "POST" }).then(toLiveOrder);
}
