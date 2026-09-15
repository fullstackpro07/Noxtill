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

export type LivePaymentStatus = "paid" | "unpaid" | "partial" | "refunded";

export interface RawOrder {
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
  /** Real cost-of-goods figure the backend already returns on every order — not previously
   * surfaced in `LiveOrder`, needed for a genuine (not fabricated) "today's profit" KPI. */
  cogs?: string;
  staffUser?: { user: { name: string } } | null;
  /** Only present when the backend derived it (list/detail endpoints) — see `derivePaymentStatus`. */
  paymentStatus?: LivePaymentStatus;
  cancelReason?: string | null;
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
  cogs: number;
  paymentMethod: LivePaymentMethod;
  paymentStatus: LivePaymentStatus;
  paidAmount: number;
  balance: number;
  staffName: string | null;
  cancelReason: string | null;
  createdAt: string;
}

export function toLiveOrder(raw: RawOrder): LiveOrder {
  const paid = raw.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const total = Number(raw.total);
  const fallbackPaymentStatus: LivePaymentStatus = paid <= 0 ? "unpaid" : paid + 0.01 >= total ? "paid" : "partial";
  return {
    id: raw.id,
    orderNo: raw.orderNo,
    customerName: raw.customer?.name || "Walk-in",
    orderType: raw.orderType,
    tableNo: raw.tableNo ?? undefined,
    status: raw.status,
    items: raw.items.map((i) => ({ productId: i.productId, name: i.name, price: Number(i.price), qty: i.qty })),
    subtotal: Number(raw.subtotal),
    tax: Number(raw.tax),
    discount: Number(raw.discount),
    total,
    cogs: Number(raw.cogs ?? 0),
    paymentMethod: raw.payments[0]?.method ?? (raw.creditEntries.some((e) => e.kind === "credit") ? "credit" : "cash"),
    paymentStatus: raw.paymentStatus ?? fallbackPaymentStatus,
    paidAmount: paid,
    balance: Math.max(0, Math.round((total - paid) * 100) / 100),
    staffName: raw.staffUser?.user.name ?? null,
    cancelReason: raw.cancelReason ?? null,
    createdAt: raw.createdAt,
  };
}

export interface OrdersFilters {
  status?: OrderStatus;
  orderType?: string;
  paymentMethod?: LivePaymentMethod;
  paymentStatus?: LivePaymentStatus;
  staffUserId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

function buildOrdersQuery(filters: OrdersFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.orderType) params.set("orderType", filters.orderType);
  if (filters.paymentMethod) params.set("paymentMethod", filters.paymentMethod);
  if (filters.paymentStatus) params.set("paymentStatus", filters.paymentStatus);
  if (filters.staffUserId) params.set("staffUserId", filters.staffUserId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function fetchOrders(filters: OrderStatus | OrdersFilters = {}): Promise<LiveOrder[]> {
  const query = typeof filters === "string" ? buildOrdersQuery({ status: filters }) : buildOrdersQuery(filters);
  return apiFetch<RawOrder[]>(`/orders${query}`).then((rows) => rows.map(toLiveOrder));
}

export function fetchOrder(id: string): Promise<LiveOrder> {
  return apiFetch<RawOrder>(`/orders/${id}`).then(toLiveOrder);
}

export interface OrdersSummary {
  today: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    cancelled: number;
    revenuePaid: number;
  };
  last7Days: { date: string; count: number }[];
  typeSplit: { type: string; count: number }[];
}

export function fetchOrdersSummary(): Promise<OrdersSummary> {
  return apiFetch<OrdersSummary>("/orders/summary");
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
  staffUserId?: string;
  items: SaleLineInput[];
  discount?: number;
  couponCode?: string;
  voucherCode?: string;
  voucherAmount?: number;
  payment: { method: "cash" | "card" | "online" | "credit"; amount?: number; note?: string };
}

export function createSale(input: CreateSaleInput): Promise<LiveOrder> {
  return apiFetch<RawOrder>("/sales", { method: "POST", body: JSON.stringify(input) }).then(toLiveOrder);
}

export interface CreateOrderInput {
  orderType?: "counter" | "online" | "dine_in" | "takeaway" | "delivery";
  tableNo?: string;
  customerId?: string;
  customerPhone?: string;
  customerName?: string;
  staffUserId?: string;
  items: SaleLineInput[];
  discount?: number;
  paymentMethod?: "unpaid" | "cash" | "card" | "online" | "credit";
  notes?: string;
}

/** "New Order" — a real, committed order at a chosen status/payment state, distinct from Fast
 * Sale's always-completed-and-paid `createSale`. */
export function createOrder(input: CreateOrderInput): Promise<LiveOrder> {
  return apiFetch<RawOrder>("/orders", { method: "POST", body: JSON.stringify(input) }).then(toLiveOrder);
}

export function updateOrderStatus(id: string, status: OrderStatus, reason?: string): Promise<LiveOrder> {
  return apiFetch<RawOrder>(`/orders/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, reason }),
  }).then(toLiveOrder);
}

/** No bulk-status endpoint exists — this applies the same real per-order status update to every
 * id, one request at a time, and reports how many actually succeeded (a transition can be invalid
 * for some of the selection, e.g. mixing Pending and Completed orders in one bulk action). */
export async function bulkUpdateOrderStatus(ids: string[], status: OrderStatus): Promise<{ succeeded: number; failed: number }> {
  const results = await Promise.allSettled(ids.map((id) => updateOrderStatus(id, status)));
  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  return { succeeded, failed: results.length - succeeded };
}

/** send=false just renders+uploads the PDF and hands back a signed URL — no message is sent either way. */
export function generateInvoice(orderId: string, send = false): Promise<{ url: string }> {
  return apiFetch<{ url: string }>(`/orders/${orderId}/invoice`, {
    method: "POST",
    body: JSON.stringify({ send }),
  });
}
