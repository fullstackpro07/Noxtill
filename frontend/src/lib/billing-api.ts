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
