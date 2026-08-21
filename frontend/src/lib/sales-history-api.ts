import { apiFetch } from "@/lib/api-client";
import type { OrderStatus } from "@/lib/orders";
import type { LivePaymentMethod } from "@/lib/orders-api";

export interface SalesHistoryFilters {
  from?: string;
  to?: string;
  staffUserId?: string;
  paymentMethod?: LivePaymentMethod;
  orderType?: string;
  minAmount?: number;
  maxAmount?: number;
}

interface RawSalesHistoryRow {
  id: string;
  orderNo: number;
  createdAt: string;
  itemsCount: number;
  staffName: string | null;
  method: LivePaymentMethod | null;
  discount: string | number;
  total: string | number;
  profit: number;
  status: OrderStatus;
}

export interface LiveSalesHistoryRow {
  id: string;
  orderNo: number;
  createdAt: string;
  itemsCount: number;
  staffName: string | null;
  method: LivePaymentMethod | null;
  discount: number;
  total: number;
  profit: number;
  status: OrderStatus;
}

function toLiveRow(raw: RawSalesHistoryRow): LiveSalesHistoryRow {
  return { ...raw, discount: Number(raw.discount), total: Number(raw.total) };
}

function buildQuery(filters: SalesHistoryFilters): string {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.staffUserId) params.set("staffUserId", filters.staffUserId);
  if (filters.paymentMethod) params.set("paymentMethod", filters.paymentMethod);
  if (filters.orderType) params.set("orderType", filters.orderType);
  if (filters.minAmount != null) params.set("minAmount", String(filters.minAmount));
  if (filters.maxAmount != null) params.set("maxAmount", String(filters.maxAmount));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function fetchSalesHistory(filters: SalesHistoryFilters): Promise<LiveSalesHistoryRow[]> {
  return apiFetch<RawSalesHistoryRow[]>(`/sales/history${buildQuery(filters)}`).then((rows) => rows.map(toLiveRow));
}

export function fetchSalesHistorySummary(filters: Pick<SalesHistoryFilters, "from" | "to">): Promise<{ date: string; revenue: number }[]> {
  return apiFetch<{ date: string; revenue: number }[]>(`/sales/history/summary${buildQuery(filters)}`);
}

export interface SalesHistoryOrderItem {
  productId: string | null;
  name: string;
  price: number;
  cost: number;
  qty: number;
}

export interface SalesHistoryOrderDetail {
  id: string;
  orderNo: number;
  status: OrderStatus;
  createdAt: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  cogs: number;
  customer: { id: string; name: string; phone: string } | null;
  staffName: string | null;
  items: SalesHistoryOrderItem[];
  payments: { method: LivePaymentMethod; amount: number }[];
}

export interface AuditTrailEntry {
  id: string;
  action: string;
  actorUserId: string | null;
  createdAt: string;
}

interface RawSalesHistoryDetailResponse {
  order: {
    id: string;
    orderNo: number;
    status: OrderStatus;
    createdAt: string;
    subtotal: string;
    tax: string;
    discount: string;
    total: string;
    cogs: string;
    customer: { id: string; name: string; phone: string } | null;
    staffUser: { user: { name: string } } | null;
    items: { productId: string | null; name: string; price: string; cost: string; qty: number }[];
    payments: { method: LivePaymentMethod; amount: string }[];
  } | null;
  auditTrail: AuditTrailEntry[];
}

export function fetchSalesHistoryDetail(id: string): Promise<{ order: SalesHistoryOrderDetail | null; auditTrail: AuditTrailEntry[] }> {
  return apiFetch<RawSalesHistoryDetailResponse>(`/sales/history/${id}`).then(({ order, auditTrail }) => ({
    order: order
      ? {
          id: order.id,
          orderNo: order.orderNo,
          status: order.status,
          createdAt: order.createdAt,
          subtotal: Number(order.subtotal),
          tax: Number(order.tax),
          discount: Number(order.discount),
          total: Number(order.total),
          cogs: Number(order.cogs),
          customer: order.customer,
          staffName: order.staffUser?.user.name ?? null,
          items: order.items.map((i) => ({ productId: i.productId, name: i.name, price: Number(i.price), cost: Number(i.cost), qty: i.qty })),
          payments: order.payments.map((p) => ({ method: p.method, amount: Number(p.amount) })),
        }
      : null,
    auditTrail,
  }));
}
