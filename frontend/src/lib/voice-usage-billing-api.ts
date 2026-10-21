import { apiFetch } from "./api-client";

export interface VoiceSellingRate {
  provider: string;
  unit: string;
  price: string;
  perQuantity: string;
}
export interface VoiceBillingRate {
  id: string;
  version: number;
  sourceVersion: string;
  sourceReference: string;
  currency: string;
  currencyMinorUnits: number;
  rates: VoiceSellingRate[];
  effectiveFrom: string;
  approvedAt: string | null;
}
export interface VoiceBillingDraft {
  id: string;
  total: string;
  currency: string;
  currencyMinorUnits: number;
  status: "draft" | "approved" | "cancelled" | "posting" | "posted";
  periodStart: string;
  /** Set only after Stripe accepted the invoice item. */
  postedAt?: string | null;
  providerInvoiceItemId?: string | null;
  postError?: string | null;
  createdAt: string;
  approvedAt: string | null;
  decisionReason: string | null;
  itemCount: number;
  rateVersion: { version: number };
}
export interface VoiceUsageBilling {
  month: string;
  configuredSource: Omit<
    VoiceBillingRate,
    "id" | "version" | "approvedAt"
  > | null;
  configurationError: string | null;
  rateVersions: VoiceBillingRate[];
  drafts: VoiceBillingDraft[];
  batchSize: number;
  invoiceHandoff: string;
  margin: string;
}
export interface VoiceUsageBillingDetail extends Omit<
  VoiceBillingDraft,
  "itemCount"
> {
  evidenceHash: string;
  items: {
    usageRecordId: string;
    provider: string;
    unit: string;
    quantity: string;
    price: string;
    perQuantity: string;
    amount: string;
    usageState: string;
    providerCost: string | null;
    providerCurrency: string | null;
    measuredAt: string;
  }[];
}
const base = "/billing/voice-usage";
export const fetchVoiceUsageBilling = (month: string) =>
  apiFetch<VoiceUsageBilling>(`${base}?month=${encodeURIComponent(month)}`);
export const captureVoiceBillingRates = () =>
  apiFetch<VoiceBillingRate>(`${base}/rates/capture`, { method: "POST" });
export const approveVoiceBillingRate = (id: string, reason: string) =>
  apiFetch<VoiceBillingRate>(`${base}/rates/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
export const createVoiceBillingDraft = (rateVersionId: string, month: string) =>
  apiFetch<{ id: string }>(`${base}/drafts`, {
    method: "POST",
    body: JSON.stringify({ rateVersionId, month }),
  });
export const fetchVoiceBillingDraft = (id: string) =>
  apiFetch<VoiceUsageBillingDetail>(`${base}/drafts/${id}`);
export const decideVoiceBillingDraft = (
  id: string,
  decision: "approve" | "cancel",
  reason: string,
) =>
  apiFetch<{ id: string }>(`${base}/drafts/${id}/${decision}`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });

/** Sends an approved draft to Stripe once, as a pending item on the business's next invoice. */
export const postVoiceBillingDraft = (id: string) =>
  apiFetch<{ id: string; status: string; providerInvoiceItemId: string | null }>(`${base}/drafts/${id}/post`, { method: "POST" });
