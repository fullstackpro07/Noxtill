import { apiFetch } from "@/lib/api-client";

export type WaitlistStatus = "waiting" | "offered" | "booked" | "expired" | "cancelled";

interface RawWaitlistEntry {
  id: string;
  customerId: string;
  customer: { name: string; phone: string };
  serviceId: string;
  service: { name: string };
  staffUserId: string | null;
  preferredFrom: string | null;
  preferredTo: string | null;
  status: WaitlistStatus;
  offeredStartsAt: string | null;
  offeredEndsAt: string | null;
  createdAt: string;
}

export interface WaitlistEntry {
  id: string;
  customerName: string;
  customerPhone: string;
  serviceName: string;
  staffUserId: string | null;
  preferredFrom: string | null;
  preferredTo: string | null;
  status: WaitlistStatus;
  offeredStartsAt: string | null;
  offeredEndsAt: string | null;
  createdAt: string;
}

function toWaitlistEntry(raw: RawWaitlistEntry): WaitlistEntry {
  return {
    id: raw.id,
    customerName: raw.customer.name,
    customerPhone: raw.customer.phone,
    serviceName: raw.service.name,
    staffUserId: raw.staffUserId,
    preferredFrom: raw.preferredFrom,
    preferredTo: raw.preferredTo,
    status: raw.status,
    offeredStartsAt: raw.offeredStartsAt,
    offeredEndsAt: raw.offeredEndsAt,
    createdAt: raw.createdAt,
  };
}

export async function fetchWaitlist(status?: WaitlistStatus): Promise<WaitlistEntry[]> {
  const query = status ? `?status=${status}` : "";
  const raw = await apiFetch<RawWaitlistEntry[]>(`/waitlist${query}`);
  return raw.map(toWaitlistEntry);
}

export interface JoinWaitlistInput {
  serviceId: string;
  staffId?: string;
  customerName: string;
  customerPhone: string;
  preferredFrom?: string;
  preferredTo?: string;
}

export function joinWaitlist(input: JoinWaitlistInput): Promise<WaitlistEntry> {
  return apiFetch<RawWaitlistEntry>("/waitlist", { method: "POST", body: JSON.stringify(input) }).then(toWaitlistEntry);
}

export function offerWaitlistSlot(id: string, startsAt: string, endsAt: string): Promise<WaitlistEntry> {
  return apiFetch<RawWaitlistEntry>(`/waitlist/${id}/offer`, {
    method: "POST",
    body: JSON.stringify({ startsAt, endsAt }),
  }).then(toWaitlistEntry);
}

export function acceptWaitlistOffer(id: string): Promise<{ id: string }> {
  return apiFetch(`/waitlist/${id}/accept`, { method: "POST" });
}

export function cancelWaitlistEntry(id: string): Promise<WaitlistEntry> {
  return apiFetch<RawWaitlistEntry>(`/waitlist/${id}/cancel`, { method: "POST" }).then(toWaitlistEntry);
}
