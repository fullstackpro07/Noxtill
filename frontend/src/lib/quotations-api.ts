import { apiFetch } from "@/lib/api-client";
import { toLiveOrder, type LiveOrder, type RawOrder } from "@/lib/orders-api";

export type QuotationStatus = "draft" | "sent" | "accepted" | "declined" | "expired";

export interface LiveQuotation {
  id: string;
  quoteNo: number;
  customerName: string;
  items: { productId: string | null; name: string; price: number; qty: number }[];
  subtotal: number;
  discount: number;
  total: number;
  status: QuotationStatus;
  validUntil: string | null;
  sentAt: string | null;
  declineReason: string | null;
  createdAt: string;
}

interface RawQuotation extends RawOrder {
  effectiveStatus: QuotationStatus;
  quotationValidUntil: string | null;
  quotationSentAt: string | null;
  declineReason: string | null;
}

function toLiveQuotation(raw: RawQuotation): LiveQuotation {
  return {
    id: raw.id,
    quoteNo: raw.orderNo,
    customerName: raw.customer?.name || "Walk-in",
    items: raw.items.map((i) => ({ productId: i.productId, name: i.name, price: Number(i.price), qty: i.qty })),
    subtotal: Number(raw.subtotal),
    discount: Number(raw.discount),
    total: Number(raw.total),
    status: raw.effectiveStatus,
    validUntil: raw.quotationValidUntil,
    sentAt: raw.quotationSentAt,
    declineReason: raw.declineReason,
    createdAt: raw.createdAt,
  };
}

export function fetchQuotations(): Promise<LiveQuotation[]> {
  return apiFetch<RawQuotation[]>("/quotations").then((rows) => rows.map(toLiveQuotation));
}

export interface QuotationsSummary {
  open: number;
  valueOpen: number;
  acceptedThisMonth: number;
  conversionRate: number;
  trend: { month: string; rate: number }[];
}

export function fetchQuotationsSummary(): Promise<QuotationsSummary> {
  return apiFetch<QuotationsSummary>("/quotations/summary");
}

export interface CreateQuotationInput {
  customerId?: string;
  customerPhone?: string;
  customerName?: string;
  items: { productId: string; qty: number; priceOverride?: number }[];
  discount?: number;
  validUntil?: string;
  terms?: string;
}

export function createQuotation(input: CreateQuotationInput): Promise<LiveQuotation> {
  return apiFetch<RawQuotation>("/quotations", { method: "POST", body: JSON.stringify(input) }).then(toLiveQuotation);
}

/** Marks the quotation sent and emails the real PDF through the same invoice generator Invoices/Sales History use. */
export function sendQuotation(id: string): Promise<{ url: string }> {
  return apiFetch<{ url: string }>(`/quotations/${id}/send`, { method: "POST" });
}

export function declineQuotation(id: string, reason?: string): Promise<LiveQuotation> {
  return apiFetch<RawQuotation>(`/quotations/${id}/decline`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  }).then(toLiveQuotation);
}

export function duplicateQuotation(id: string): Promise<LiveQuotation> {
  return apiFetch<RawQuotation>(`/quotations/${id}/duplicate`, { method: "POST" }).then(toLiveQuotation);
}

/** Converts a quotation into a real pending order. */
export function convertQuotation(id: string): Promise<LiveOrder> {
  return apiFetch<RawOrder>(`/quotations/${id}/convert`, { method: "POST" }).then(toLiveOrder);
}
