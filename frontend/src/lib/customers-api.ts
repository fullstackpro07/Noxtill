import { apiFetch } from "@/lib/api-client";

export interface CustomerSearchResult {
  id: string;
  name: string;
  phone: string;
}

/** GET /customers?q= — name/phone substring search. Used standalone by the POS credit lookup. */
export function searchCustomers(q: string): Promise<CustomerSearchResult[]> {
  if (!q.trim()) return Promise.resolve([]);
  return apiFetch<CustomerSearchResult[]>(`/customers?q=${encodeURIComponent(q)}`);
}

export interface DebtorRow {
  customerId: string;
  balance: number;
}

/** GET /credit — only customers with balance > 0; anyone absent from this list simply owes nothing. */
export function fetchDebtors(): Promise<DebtorRow[]> {
  return apiFetch<DebtorRow[]>("/credit");
}

export interface LiveCustomer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  birthday: string | null;
  notes: string | null;
  tags: string[];
  consentMarketing: boolean;
  optedOut: boolean;
  lifetimeSpend: number;
  visitCount: number;
  lastVisitAt: string | null;
  createdAt: string;
}

interface RawCustomer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  birthday: string | null;
  notes: string | null;
  tags: string[];
  consentMarketing: boolean;
  optedOut: boolean;
  lifetimeSpend: string;
  visitCount: number;
  lastVisitAt: string | null;
  createdAt: string;
}

function toLiveCustomer(raw: RawCustomer): LiveCustomer {
  return { ...raw, lifetimeSpend: Number(raw.lifetimeSpend) };
}

/** GET /customers — the full list, unfiltered; list/detail screens filter client-side same as every other module. */
export function fetchCustomers(): Promise<LiveCustomer[]> {
  return apiFetch<RawCustomer[]>("/customers").then((rows) => rows.map(toLiveCustomer));
}

export interface CustomerOrderItem {
  name: string;
  price: number;
  qty: number;
}

export interface CustomerOrder {
  id: string;
  orderNo: number;
  total: number;
  createdAt: string;
  items: CustomerOrderItem[];
}

export interface CustomerFeedback {
  id: string;
  stars: number;
  message: string | null;
  status: "open" | "in_progress" | "resolved";
  createdAt: string;
}

export interface CustomerDetail extends LiveCustomer {
  orders: CustomerOrder[];
  privateFeedback: CustomerFeedback[];
}

interface RawCustomerDetail extends RawCustomer {
  orders: {
    id: string;
    orderNo: number;
    total: string;
    createdAt: string;
    items: { name: string; price: string; qty: number }[];
  }[];
  privateFeedback: CustomerFeedback[];
}

/** GET /customers/:id — includes the last 20 orders and any private feedback/complaints tied to this customer. */
export function fetchCustomer(id: string): Promise<CustomerDetail> {
  return apiFetch<RawCustomerDetail>(`/customers/${id}`).then((raw) => ({
    ...toLiveCustomer(raw),
    orders: raw.orders.map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      total: Number(o.total),
      createdAt: o.createdAt,
      items: o.items.map((i) => ({ name: i.name, price: Number(i.price), qty: i.qty })),
    })),
    privateFeedback: raw.privateFeedback,
  }));
}

export interface UpdateCustomerInput {
  name?: string;
  address?: string;
  notes?: string;
  tags?: string[];
  consentMarketing?: boolean;
}

export function updateCustomer(id: string, input: UpdateCustomerInput): Promise<LiveCustomer> {
  return apiFetch<RawCustomer>(`/customers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }).then(toLiveCustomer);
}

/** DELETE /customers/:id — GDPR erasure; `confirm` must exactly match the customer's current phone number. */
export function eraseCustomer(id: string, confirm: string): Promise<LiveCustomer> {
  return apiFetch<RawCustomer>(`/customers/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ confirm }),
  }).then(toLiveCustomer);
}
