import { apiFetch } from "@/lib/api-client";

export type InvoiceStatus = "paid" | "unpaid" | "overdue";

export interface InvoiceFilters {
  from?: string;
  to?: string;
  status?: InvoiceStatus;
  staffUserId?: string;
}

interface RawInvoiceRow {
  id: string;
  orderNo: number;
  createdAt: string;
  customerId: string | null;
  customerName: string | null;
  staffName: string | null;
  total: number;
  amountPaid: number;
  amountDue: number;
  status: InvoiceStatus;
}

export type LiveInvoiceRow = RawInvoiceRow;

function buildQuery(params: Record<string, string | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) usp.set(key, value);
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

export function fetchInvoices(filters: InvoiceFilters): Promise<LiveInvoiceRow[]> {
  return apiFetch<RawInvoiceRow[]>(`/orders/invoices${buildQuery(filters as Record<string, string | undefined>)}`);
}

export interface InvoiceSummary {
  counts: Record<InvoiceStatus, number>;
  totals: Record<InvoiceStatus, number>;
  trend: { date: string; paidAmount: number; unpaidAmount: number }[];
}

export function fetchInvoiceSummary(filters: Pick<InvoiceFilters, "from" | "to">): Promise<InvoiceSummary> {
  return apiFetch<InvoiceSummary>(`/orders/invoices/summary${buildQuery(filters)}`);
}

export function recordInvoicePayment(
  id: string,
  input: { amount: number; method: "cash" | "card" | "online"; note?: string },
): Promise<unknown> {
  return apiFetch(`/orders/invoices/${id}/payments`, { method: "POST", body: JSON.stringify(input) });
}

export function remindAllInvoices(): Promise<{ sent: number; skipped: number }> {
  return apiFetch<{ sent: number; skipped: number }>("/orders/invoices/remind-all", { method: "POST" });
}
