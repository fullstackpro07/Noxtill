import { apiFetch, BASE_URL } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth-store";
import { useBranchContextStore } from "@/store/branch-context-store";

/** Settings → Usage & Limits and Account & billing (backend `src/usage/`). */

export type MetricState = "ok" | "approaching" | "at_limit" | "exceeded" | "not_configured" | "unavailable";

export interface ResolvedMetric {
  code: string;
  kind: "capacity" | "allowance" | "spend_cap" | "feature" | "passthrough";
  included: number | null;
  purchased: number;
  used: number;
  reserved: number;
  remaining: number | null;
  state: MetricState;
  enforced: boolean;
  resetsAt: string | null;
}

export interface SpendCapState {
  group: "voice" | "messaging";
  capUsd: number;
  spentUsd: number;
  reservedUsd: number;
  remainingUsd: number;
  maxCallMinutes: number | null;
  fallback: string | null;
}

export interface EntitlementSet {
  businessId: string;
  resolvedAt: string;
  version: number;
  planKey: string;
  planName: string;
  scheduledPlanKey: string | null;
  scheduledInterval: "month" | "year" | null;
  interval: "month" | "year";
  status: "trialing" | "active" | "past_due" | "paused" | "cancelled";
  meteredPaused: boolean;
  suspended: boolean;
  billingPeriod: { start: string; end: string };
  usagePeriod: { start: string; end: string };
  trialEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  metrics: Record<string, ResolvedMetric>;
  spendCaps: Record<"voice" | "messaging", SpendCapState>;
  features: Record<string, boolean | null>;
}

export interface CatalogPlan {
  key: string;
  name: string;
  status: string;
  purchasable: boolean;
  monthly: number | null;
  yearly: number | null;
  trialDays: number;
  current: boolean;
  entitlements: Record<string, number | null>;
}

export interface PlanCatalog {
  currentPlanKey: string;
  scheduledPlanKey: string | null;
  plans: CatalogPlan[];
}

export interface PriceRow {
  metricCode: string;
  countryCode: string;
  numberType: string;
  unitPriceUsd: number;
  per: number;
}

export interface Purchase {
  id: string;
  metricCode: string;
  quantity: number;
  unitPriceUsd: number;
  recurring: boolean;
  status: "pending" | "active" | "cancelled" | "failed";
  createdAt: string;
  activeFrom: string | null;
}

export interface FeatureCredits {
  operationCode: string;
  label: string;
  module: string;
  operations: number;
  credits: number;
}

export interface UsageOverview {
  set: EntitlementSet;
  catalog: PlanCatalog;
  prices: PriceRow[];
  purchases: Purchase[];
  people: { id: string; userId: string; name: string; email: string; role: string; active: boolean; pending: boolean }[];
  locations: { id: string; name: string; active: boolean; isRoot: boolean }[];
  numbers: { number: string; tollfree: boolean; since: string }[];
  agentSeats: { id: string; name: string; active: boolean }[];
  storage: { bytes: number; objects: number; truncated: boolean; areas: { area: string; bytes: number; objects: number }[] } | null;
  providers: { stripe: boolean; email: boolean; emailFrom: string | null; sms: boolean; voice: boolean; whatsapp: boolean; whatsappNumber: string | null };
  byFeature: FeatureCredits[];
  hasDefaultCard: boolean;
}

export const fetchEntitlements = () => apiFetch<EntitlementSet>("/usage/entitlements");
export const fetchUsageOverview = () => apiFetch<UsageOverview>("/usage/overview");

export interface ReservationRow {
  id: string;
  operation: string;
  module: string;
  reserved: number;
  actual: number | null;
  state: "reserved" | "committed" | "released" | "expired";
  bucket: string | null;
  reason: string | null;
  reservedAt: string;
  settledAt: string | null;
}
export const fetchCreditsByFeature = () =>
  apiFetch<{ period: { start: string; end: string }; rows: FeatureCredits[]; recent: ReservationRow[] }>("/usage/credits/by-feature");

export interface HistoryRow {
  id: string;
  at: string;
  feature: string;
  module: string;
  category: string;
  metric: string;
  quantity: number;
  unit: string;
  priceUsd: number | null;
  status: string;
}
export function fetchUsageHistory(q: { category?: string; status?: string; q?: string; cursor?: string }) {
  const p = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => v && p.set(k, v));
  return apiFetch<{ rows: HistoryRow[]; total: number; nextCursor: string | null }>(`/usage/history?${p.toString()}`);
}

export type CommPeriod = "current" | "previous" | "last30" | "custom";
interface ChannelCounts {
  sent: number;
  queued: number;
  delivered: number;
  accepted: number;
  failed: number;
  marketing: number;
  utility: number;
}
export interface CommunicationUsage {
  window: { start: string; end: string };
  providers: UsageOverview["providers"];
  spendCap: SpendCapState;
  email: ChannelCounts & { billable: number; charge: number };
  sms: ChannelCounts & { incoming: number; segments: number; charge: number; byCountry: { iso: string; sent: number; billable: number; charge: number }[] };
  whatsapp: ChannelCounts & { incoming: number; billable: number; charge: number };
  history: { id: string; at: string; channel: string; countryCode: string | null; type: string; quantity: number; unit: string; priceUsd: number | null; status: string }[];
}
export function fetchCommunication(period: CommPeriod, from?: string, to?: string) {
  const p = new URLSearchParams({ period });
  if (from) p.set("from", from);
  if (to) p.set("to", to);
  return apiFetch<CommunicationUsage>(`/usage/communication?${p.toString()}`);
}

export interface VoiceCallRow {
  id: string;
  callSid: string;
  direction: string;
  from: string;
  startedAt: string;
  status: string;
  isTestCall: boolean;
  handledBy: string;
  durationMin: number;
  aiBillableMin: number;
  aiChargeUsd: number;
  humanBillableMin: number;
  humanChargeUsd: number;
  humanRateMissing: boolean;
  rejectedReason: string | null;
}
export interface VoiceUsage {
  set: EntitlementSet;
  prices: PriceRow[];
  receptionist: boolean | null;
  spendCap: SpendCapState;
  maxCallMinutes: number;
  numbers: { number: string; tollfree: boolean; since: string }[];
  agentSeats: { id: string; name: string; active: boolean }[];
  calls: VoiceCallRow[];
  admissions: { at: string; kind: "hold" | "declined"; state: string; amountUsd: number; actualUsd: number | null; reason: string | null }[];
  speechAnalysisTracked: boolean;
}
export const fetchVoiceUsage = () => apiFetch<VoiceUsage>("/usage/voice");

export const updateSpendCap = (group: "voice" | "messaging", body: { capUsd: number; maxCallMinutes?: number }) =>
  apiFetch<Record<string, SpendCapState>>(`/usage/spend-caps/${group}`, { method: "PUT", body: JSON.stringify(body) });

export type PurchaseKey = "credits" | "seat" | "location" | "localnum" | "tollfree" | "agentseat" | "storage" | "videominutes" | "recordinghours";
export const startPurchase = (key: PurchaseKey, country?: string) =>
  apiFetch<{ status: "checkout" | "active"; checkoutUrl?: string; purchaseId: string }>("/usage/purchase", {
    method: "POST",
    body: JSON.stringify({ key, approved: true, ...(country ? { country } : {}) }),
  });

/** Exact monthly price of a phone number in a country (live provider price x markup rule). */
export interface NumberQuote {
  countryCode: string;
  numberType: "local" | "tollfree";
  priceUsd: number;
  source: "live" | "floor";
}
export const fetchNumberPrice = (country: string, type: "local" | "tollfree") =>
  apiFetch<NumberQuote>(`/usage/number-price?country=${encodeURIComponent(country)}&type=${type}`);

/** Countries we publish prices for (the SMS catalogue), used to offer a country list. */
export const fetchPriceCountries = () =>
  apiFetch<{ countryCode: string; unitPriceUsd: number }[]>("/usage/country-prices?metric=sms_segments");

export const fetchPlans = () => apiFetch<PlanCatalog>("/plans");

export interface PlanChangeResult {
  kind: "upgrade" | "downgrade" | "interval" | "trial_selection";
  effective: "immediate" | "period_end" | "trial_end";
  effectiveAt: string;
  checkoutUrl?: string;
  message: string;
}
export const changePlan = (planKey: string, interval: "month" | "year", authorized: boolean) =>
  apiFetch<PlanChangeResult>("/subscription/change-plan", { method: "POST", body: JSON.stringify({ planKey, interval, authorized }) });
export const cancelScheduledChange = () => apiFetch<{ cancelled: boolean }>("/subscription/scheduled", { method: "DELETE" });

export interface PlatformCard {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
  createdAt: string;
}
export const fetchPaymentMethods = () => apiFetch<{ stripeConfigured: boolean; methods: PlatformCard[] }>("/subscription/payment-methods");
export const startCardSetup = (body: { password: string; makeDefault?: boolean; replaceId?: string }) =>
  apiFetch<{ checkoutUrl: string | null }>("/subscription/payment-methods/setup", { method: "POST", body: JSON.stringify(body) });
export const makeCardDefault = (id: string, password: string) =>
  apiFetch<{ stripeConfigured: boolean; methods: PlatformCard[] }>(`/subscription/payment-methods/${id}/default`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });

/** Download the usage history CSV with the session's auth (same pattern as the other module exports). */
export async function downloadUsageCsv(): Promise<void> {
  const token = useAuthStore.getState().accessToken;
  const branch = useBranchContextStore.getState().selectedBranchId;
  const res = await fetch(`${BASE_URL}/usage/history.csv`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(branch ? { "X-Branch": branch } : {}) },
  });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "noxtill-usage-history.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
