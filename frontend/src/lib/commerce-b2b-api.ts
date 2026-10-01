import { apiFetch } from "@/lib/api-client";

export type B2bAccountStatus = "active" | "suspended";
export type B2bPriceListStatus = "active" | "archived";

export type ReorderSignal =
  | { status: "insufficient_history"; orders: number }
  | { status: "due" | "not_due"; averageGapDays: number; lastOrderAt: string; nextExpectedAt: string };

export interface B2bAccount {
  id: string;
  companyName: string;
  taxId: string | null;
  status: B2bAccountStatus;
  suspendedReason: string | null;
  notes: string | null;
  customer: { id: string; name: string; phone: string; email: string | null };
  tier: { id: string; name: string; defaultDiscountPct: number } | null;
  priceList: { id: string; name: string } | null;
  paymentTermsDays: number | null;
  minOrderValue: number | null;
  credit: { limit: number | null; balance: number; available: number | null; overLimit: boolean };
  ytdOrderValue: number;
  ytdOrders: number;
  lastOrderAt: string | null;
  openQuotes: number;
  reorder: ReorderSignal;
}

export interface B2bTier {
  id: string;
  name: string;
  defaultDiscountPct: number;
  minOrderValue: number | null;
  paymentTermsDays: number | null;
  accounts: number;
}

export interface B2bPriceList {
  id: string;
  name: string;
  status: B2bPriceListStatus;
  notes: string | null;
  accounts: number;
  items: Array<{
    id: string;
    unitPrice: number;
    minQty: number;
    product: { id: string; name: string; sku: string | null; basePrice: number };
  }>;
}

export interface B2bSummary {
  activeAccounts: number;
  suspendedAccounts: number;
  ytdOrderValue: number;
  receivables: number;
  overCreditLimit: number;
  openQuotes: number;
  reordersDue: number;
}

export interface B2bQuotePreview {
  lines: Array<{
    productId: string;
    name: string;
    qty: number;
    basePrice: number;
    unitPrice: number;
    source: "price_list" | "tier_discount" | "base_price";
    note: string | null;
    lineTotal: number;
  }>;
  total: number;
  minOrderValue: number | null;
  credit: { limit: number | null; balance: number; availableAfter: number | null };
  paymentTermsDays: number | null;
  warnings: string[];
}

const BASE = "/commerce/b2b";
const send = <T,>(path: string, method: string, body?: unknown) =>
  apiFetch<T>(`${BASE}${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export const fetchB2bSummary = () => apiFetch<B2bSummary>(`${BASE}/summary`);
export const fetchB2bAccounts = () => apiFetch<B2bAccount[]>(`${BASE}/accounts`);
export const fetchB2bTiers = () => apiFetch<B2bTier[]>(`${BASE}/tiers`);
export const fetchB2bPriceLists = () => apiFetch<B2bPriceList[]>(`${BASE}/price-lists`);

export interface B2bAccountInput {
  customerId?: string;
  companyName?: string;
  taxId?: string | null;
  tierId?: string | null;
  priceListId?: string | null;
  paymentTermsDays?: number | null;
  minOrderValue?: number | null;
  notes?: string | null;
}

export const createB2bAccount = (input: B2bAccountInput) => send<{ id: string }>("/accounts", "POST", input);
export const updateB2bAccount = (id: string, input: B2bAccountInput) => send<{ id: string }>(`/accounts/${id}`, "PATCH", input);
export const suspendB2bAccount = (id: string, reason: string) => send<{ id: string }>(`/accounts/${id}/suspend`, "POST", { reason });
export const reactivateB2bAccount = (id: string) => send<{ id: string }>(`/accounts/${id}/reactivate`, "POST");
export const previewB2bQuote = (id: string, lines: Array<{ productId: string; qty: number }>) =>
  send<B2bQuotePreview>(`/accounts/${id}/quote-preview`, "POST", { lines });

export const createB2bTier = (input: { name: string; defaultDiscountPct?: number; minOrderValue?: number | null; paymentTermsDays?: number | null }) =>
  send<{ id: string }>("/tiers", "POST", input);

export const createB2bPriceList = (input: { name: string; notes?: string }) => send<{ id: string }>("/price-lists", "POST", input);
export const updateB2bPriceList = (id: string, input: { name?: string; status?: B2bPriceListStatus }) =>
  send<{ id: string }>(`/price-lists/${id}`, "PATCH", input);
export const setB2bPrice = (id: string, input: { productId: string; unitPrice: number; minQty?: number }) =>
  send<{ id: string }>(`/price-lists/${id}/items`, "POST", input);
export const removeB2bPrice = (id: string, productId: string) => send<{ removed: boolean }>(`/price-lists/${id}/items/${productId}`, "DELETE");
