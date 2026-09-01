import { apiFetch } from "@/lib/api-client";

export interface BillingStatus {
  planKey: string | null;
  planName: string | null;
  price: number | null;
  msgQuota: number;
  msgUsed: number;
  userLimit: number | null;
  aiCostCapUsd: number;
  aiCostUsedUsd: number;
  trialEndsAt: string | null;
  hasActiveSubscription: boolean;
}

/** GET /billing/status (INT-014) — real current plan + usage; nothing read this back before this ticket. */
export function fetchBillingStatus(): Promise<BillingStatus> {
  return apiFetch<BillingStatus>("/billing/status");
}

/** POST /billing/checkout (BE-064) — real Stripe Checkout session; fails cleanly with BILLING_GATEWAY_NOT_CONFIGURED without a real Stripe key. */
export function createCheckout(planKey: string, gateway?: string): Promise<{ url: string }> {
  const origin = window.location.origin;
  return apiFetch<{ url: string }>("/billing/checkout", {
    method: "POST",
    body: JSON.stringify({
      planKey,
      gateway,
      successUrl: `${origin}/settings/billing?checkout=success`,
      cancelUrl: `${origin}/settings/billing?checkout=cancel`,
    }),
  });
}

export interface BillingInvoice {
  id: string;
  number: string | null;
  status: string | null;
  amountDue: number;
  amountPaid: number;
  currency: string;
  createdAt: string;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
}

/** GET /billing/invoices (UPD-BE-121) — real Stripe invoice history; empty without a stripeCustomerId. */
export function fetchBillingInvoices(): Promise<BillingInvoice[]> {
  return apiFetch<BillingInvoice[]>("/billing/invoices");
}

export interface AddOnCatalogEntry {
  key: string;
  label: string;
}

export interface AddOnsState {
  catalog: AddOnCatalogEntry[];
  active: string[];
}

/** GET /billing/add-ons (UPD-BE-121) */
export function fetchAddOns(): Promise<AddOnsState> {
  return apiFetch<AddOnsState>("/billing/add-ons");
}

/** PATCH /billing/add-ons (UPD-BE-121) */
export function updateAddOns(keys: string[]): Promise<AddOnsState> {
  return apiFetch<AddOnsState>("/billing/add-ons", {
    method: "PATCH",
    body: JSON.stringify({ keys }),
  });
}

/** POST /billing/cancel (UPD-BE-121) — cancels this business's own active subscription. */
export function cancelSubscription(): Promise<{ cancelled: true }> {
  return apiFetch<{ cancelled: true }>("/billing/cancel", { method: "POST" });
}
