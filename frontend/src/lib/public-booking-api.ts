import { apiFetch } from "@/lib/api-client";

export interface PublicBookingBusiness {
  businessName: string;
  branding: Record<string, unknown>;
  welcomeText: string | null;
  brandColor: string | null;
}

/** GET /public/booking/:biz — no auth; business header info for the public booking page. */
export function fetchPublicBookingInfo(slug: string): Promise<PublicBookingBusiness> {
  return apiFetch<PublicBookingBusiness>(`/public/booking/${slug}`, {}, { skipAuth: true });
}

export interface PublicService {
  id: string;
  name: string;
  durationMin: number | null;
  sellingPrice: string;
}

/** GET /public/booking/:biz/services — active, service-kind products only. */
export function fetchPublicServices(slug: string): Promise<PublicService[]> {
  return apiFetch<PublicService[]>(`/public/booking/${slug}/services`, {}, { skipAuth: true });
}

export interface PublicSlotsQuery {
  service: string;
  staff?: string;
  date: string;
}

/** GET /public/booking/:biz/slots — real ISO datetime strings, not hour numbers. */
export function fetchPublicSlots(slug: string, query: PublicSlotsQuery): Promise<{ slots: string[] }> {
  const params = new URLSearchParams({ service: query.service, date: query.date });
  if (query.staff) params.set("staff", query.staff);
  return apiFetch<{ slots: string[] }>(`/public/booking/${slug}/slots?${params.toString()}`, {}, { skipAuth: true });
}

export interface CreatePublicBookingInput {
  serviceId: string;
  staffId?: string;
  startsAt: string;
  customerName: string;
  customerPhone: string;
}

export interface PublicBookingResult {
  id: string;
  startsAt: string;
  endsAt: string;
}

/** POST /public/booking/:biz — a real 409 here means "that slot was just taken", the ticket's actual slot-lock race scenario. */
export function createPublicBooking(slug: string, input: CreatePublicBookingInput): Promise<PublicBookingResult> {
  return apiFetch<PublicBookingResult>(
    `/public/booking/${slug}`,
    { method: "POST", body: JSON.stringify(input) },
    { skipAuth: true },
  );
}

/** Booking Link & QR analytics (UPD-BE-090) — a real page-load counter; called once by the page itself. */
export function recordPublicBookingVisit(slug: string, source?: "link" | "qr"): Promise<void> {
  return apiFetch(`/public/booking/${slug}/visit`, { method: "POST", body: JSON.stringify({ source }) }, { skipAuth: true });
}
