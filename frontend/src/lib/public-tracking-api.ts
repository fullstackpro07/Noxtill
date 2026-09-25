import { apiFetch } from "@/lib/api-client";

export interface PublicTracking {
  businessName: string;
  code: string;
  status: "unassigned" | "assigned" | "picked_up" | "en_route" | "delivered" | "failed";
  address: string;
  promisedAt: string | null;
  deliveredAt: string | null;
  failureReason: string | null;
  riderFirstName: string | null;
  position: { lat: number; lng: number; minutesAgo: number } | null;
  proof: { signatureUrl: string | null; photoUrl: string | null } | null;
  shareLocationEnabled: boolean;
}

/** GET /public/track/:token — no auth; the token is the customer's private tracking link. */
export function fetchPublicTracking(token: string): Promise<PublicTracking> {
  return apiFetch<PublicTracking>(`/public/track/${token}`, {}, { skipAuth: true });
}
