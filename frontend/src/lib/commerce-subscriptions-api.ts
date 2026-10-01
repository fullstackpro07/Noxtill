import { apiFetch } from "@/lib/api-client";

export type SubscriptionInterval = "week" | "month";
export type SubscriptionStatus = "active" | "paused" | "cancelled";
export type CampaignStatus = "open" | "closed" | "released";
export type PromiseRisk = "released" | "on_track" | "supply_short" | "past_promise";

export interface SubscriptionPlan {
  id: string;
  name: string;
  status: "active" | "archived";
  qtyPerCycle: number;
  interval: SubscriptionInterval;
  intervalCount: number;
  pricePerUnit: number | null;
  allowSkip: boolean;
  product: { id: string; name: string; sellingPrice: number; stockQty: number };
  activeSubscriptions: number;
}

export interface Subscription {
  id: string;
  status: SubscriptionStatus;
  statusReason: string | null;
  startedAt: string;
  nextRenewalAt: string;
  due: boolean;
  skipNextCycle: boolean;
  customer: { id: string; name: string; phone: string };
  plan: {
    id: string;
    name: string;
    interval: SubscriptionInterval;
    intervalCount: number;
    qtyPerCycle: number;
    allowSkip: boolean;
    product: { id: string; name: string };
  };
  cycleValue: number;
  recentCycles: Array<{ id: string; dueAt: string; status: "processing" | "order_created" | "skipped"; order: { id: string; orderNo: number; status: string } | null }>;
}

export interface PreorderCampaign {
  id: string;
  name: string;
  status: CampaignStatus;
  promisedDate: string;
  maxUnits: number | null;
  reservedUnits: number;
  notes: string | null;
  product: { id: string; name: string; stockQty: number };
  supply: { inStock: number; incomingBeforePromise: number; workOrders: string[] };
  risk: PromiseRisk;
  preorders: Array<{
    id: string;
    qty: number;
    status: "reserved" | "fulfilled" | "cancelled";
    customer: { id: string; name: string };
    promisedDate: string;
    promiseChanged: boolean;
    order: { id: string; orderNo: number } | null;
  }>;
}

export interface SubscriptionsSummary {
  activeSubscriptions: number;
  pausedSubscriptions: number;
  renewalsDue: number;
  upcomingUnits30d: number;
  recurringMonthlyValue: number;
  openPreorderUnits: number;
  promisesAtRisk: number;
}

const BASE = "/commerce/subscriptions-preorders";
const post = <T,>(path: string, body?: unknown) =>
  apiFetch<T>(`${BASE}${path}`, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const fetchSubscriptionsSummary = () => apiFetch<SubscriptionsSummary>(`${BASE}/summary`);
export const fetchSubscriptionPlans = () => apiFetch<SubscriptionPlan[]>(`${BASE}/plans`);
export const fetchSubscriptions = () => apiFetch<Subscription[]>(`${BASE}/subscriptions`);
export const fetchPreorderCampaigns = () => apiFetch<PreorderCampaign[]>(`${BASE}/campaigns`);

export const createSubscriptionPlan = (input: {
  name: string;
  productId: string;
  qtyPerCycle: number;
  interval: SubscriptionInterval;
  intervalCount?: number;
  pricePerUnit?: number | null;
  allowSkip?: boolean;
}) => post<{ id: string }>("/plans", input);
export const archiveSubscriptionPlan = (id: string) => post<{ id: string }>(`/plans/${id}/archive`);
export const subscribeCustomer = (input: { planId: string; customerId: string; firstRenewalAt: string }) =>
  post<{ id: string }>("/subscriptions", input);
export const processDueRenewals = () =>
  post<{ processed: number; failed: number; results: Array<{ subscriptionId: string; ok: boolean; error?: string }> }>("/subscriptions/process-due");
export const renewSubscription = (id: string) => post<{ orderId: string | null; status: string }>(`/subscriptions/${id}/renew`);
export const pauseSubscription = (id: string, reason: string) => post<{ id: string }>(`/subscriptions/${id}/pause`, { reason });
export const resumeSubscription = (id: string) => post<{ id: string }>(`/subscriptions/${id}/resume`);
export const cancelSubscription = (id: string, reason: string) => post<{ id: string }>(`/subscriptions/${id}/cancel`, { reason });
export const skipNextCycle = (id: string, skip: boolean) => post<{ id: string }>(`/subscriptions/${id}/${skip ? "skip-next" : "unskip"}`);

export const createPreorderCampaign = (input: { productId: string; name: string; promisedDate: string; maxUnits?: number; notes?: string }) =>
  post<{ id: string }>("/campaigns", input);
export const changePromiseDate = (id: string, promisedDate: string, reason: string) =>
  post<{ id: string }>(`/campaigns/${id}/promise-date`, { promisedDate, reason });
export const closeCampaign = (id: string) => post<{ id: string }>(`/campaigns/${id}/close`);
export const releaseCampaign = (id: string) => post<{ id: string }>(`/campaigns/${id}/release`);
export const reservePreorder = (id: string, input: { customerId: string; qty: number }) => post<{ id: string }>(`/campaigns/${id}/reserve`, input);
export const fulfillPreorder = (id: string) => post<{ orderId: string }>(`/preorders/${id}/fulfill`);
export const cancelPreorder = (id: string, reason: string) => post<{ cancelled: boolean }>(`/preorders/${id}/cancel`, { reason });
