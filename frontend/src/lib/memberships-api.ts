import { apiFetch } from "@/lib/api-client";

export type BillingInterval = "monthly" | "yearly";
export type MembershipStatus = "pending" | "active" | "cancelled" | "expired";
export type MembershipMethod = "cash" | "online";

export interface MembershipPlan {
  id: string;
  name: string;
  price: string;
  interval: BillingInterval;
  benefits: string | null;
  stripePriceId: string | null;
  active: boolean;
}

export interface Membership {
  id: string;
  planId: string;
  customerId: string;
  status: MembershipStatus;
  method: MembershipMethod;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  plan: MembershipPlan;
  customer: { id: string; name: string; phone: string };
  createdAt: string;
}

/** GET /membership-plans */
export function fetchMembershipPlans(): Promise<MembershipPlan[]> {
  return apiFetch<MembershipPlan[]>("/membership-plans");
}

export interface CreateMembershipPlanInput {
  name: string;
  price: number;
  interval?: BillingInterval;
  benefits?: string;
  stripePriceId?: string;
}

/** POST /membership-plans */
export function createMembershipPlan(input: CreateMembershipPlanInput): Promise<MembershipPlan> {
  return apiFetch<MembershipPlan>("/membership-plans", { method: "POST", body: JSON.stringify(input) });
}

/** GET /memberships — omit customerId for every membership at this business. */
export function fetchMemberships(customerId?: string): Promise<Membership[]> {
  const qs = customerId ? `?customerId=${customerId}` : "";
  return apiFetch<Membership[]>(`/memberships${qs}`);
}

export interface EnrollMembershipInput {
  customerId: string;
  planId: string;
  method: MembershipMethod;
  successUrl?: string;
  cancelUrl?: string;
}

/** POST /memberships — a cash membership activates immediately; an online one returns a real Stripe checkoutUrl and lands pending until the real webhook (or a fallback manual activate) confirms it. */
export function createMembership(input: EnrollMembershipInput): Promise<{ membership: Membership; checkoutUrl: string | null }> {
  return apiFetch<{ membership: Membership; checkoutUrl: string | null }>("/memberships", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** POST /memberships/:id/activate — manual fallback for a business without Stripe webhooks configured. */
export function activateMembership(id: string): Promise<Membership> {
  return apiFetch<Membership>(`/memberships/${id}/activate`, { method: "POST" });
}

/** POST /memberships/:id/renew-cash — the real cash-renewal action; extends the real due date by one real billing interval. */
export function renewCashMembership(id: string): Promise<Membership> {
  return apiFetch<Membership>(`/memberships/${id}/renew-cash`, { method: "POST" });
}

/** POST /memberships/:id/cancel — a real Stripe cancellation for an online membership before the local status flips. */
export function cancelMembership(id: string): Promise<Membership> {
  return apiFetch<Membership>(`/memberships/${id}/cancel`, { method: "POST" });
}
