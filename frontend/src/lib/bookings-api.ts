import { apiFetch } from "@/lib/api-client";
import type { AppointmentStatus } from "@/lib/bookings";

interface RawService {
  id: string;
  name: string;
  durationMin: number | null;
}

interface RawCustomer {
  id: string;
  name: string;
}

interface RawStaffUser {
  id: string;
  user: { name: string };
}

interface RawAppointment {
  id: string;
  serviceId: string;
  service: RawService;
  staffUserId: string | null;
  staffUser: RawStaffUser | null;
  customerId: string;
  customer: RawCustomer;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  source: "link" | "qr" | "walk_in" | "waitlist" | "phone";
}

export interface LiveAppointment {
  id: string;
  staffId?: string;
  staffName?: string;
  customerName: string;
  serviceName: string;
  date: string;
  startHour: number;
  durationHours: number;
  status: AppointmentStatus;
  source: RawAppointment["source"];
  startsAt: string;
}

/** Local-time hour math (matches the calendar's existing browser-local assumption) — startHour/durationHours may be fractional for non-hour-aligned service durations. */
function toLiveAppointment(raw: RawAppointment): LiveAppointment {
  const starts = new Date(raw.startsAt);
  const ends = new Date(raw.endsAt);
  const startHour = starts.getHours() + starts.getMinutes() / 60;
  const rawDurationHours = (ends.getTime() - starts.getTime()) / (1000 * 60 * 60);
  // A malformed/missing endsAt would otherwise produce NaN, which silently breaks the calendar's
  // pixel-height math downstream (Math.max(NaN, min) is NaN, not min) — fall back to a sane default.
  const durationHours = Number.isFinite(rawDurationHours) && rawDurationHours > 0 ? rawDurationHours : 0.5;
  const year = starts.getFullYear();
  const month = String(starts.getMonth() + 1).padStart(2, "0");
  const day = String(starts.getDate()).padStart(2, "0");

  return {
    id: raw.id,
    staffId: raw.staffUserId ?? undefined,
    staffName: raw.staffUser?.user.name,
    customerName: raw.customer.name,
    serviceName: raw.service.name,
    date: `${year}-${month}-${day}`,
    startHour,
    durationHours,
    status: raw.status,
    source: raw.source,
    startsAt: raw.startsAt,
  };
}

export interface AppointmentFilters {
  from?: string;
  to?: string;
  staff?: string;
  status?: AppointmentStatus;
}

export async function fetchAppointments(filters: AppointmentFilters = {}): Promise<LiveAppointment[]> {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.staff) params.set("staff", filters.staff);
  if (filters.status) params.set("status", filters.status);
  const query = params.toString();
  const raw = await apiFetch<RawAppointment[]>(`/appointments${query ? `?${query}` : ""}`);
  return raw.map(toLiveAppointment);
}

/** Booking Requests (UPD-FE-014) — approve/decline/suggest-alternative act on an appointment already in "requested" status. */
export function approveAppointmentRequest(id: string): Promise<LiveAppointment> {
  return apiFetch<RawAppointment>(`/appointments/${id}/approve`, { method: "POST" }).then(toLiveAppointment);
}

export function declineAppointmentRequest(id: string, reason?: string): Promise<LiveAppointment> {
  return apiFetch<RawAppointment>(`/appointments/${id}/decline`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  }).then(toLiveAppointment);
}

export function suggestAlternativeTime(id: string, startsAt: string): Promise<{ id: string }> {
  return apiFetch(`/appointments/${id}/suggest-alternative`, {
    method: "POST",
    body: JSON.stringify({ startsAt }),
  });
}

export interface BulkActionResult {
  cancelled?: number;
  sent?: number;
  failed: string[];
}

/** Appointments List bulk actions (UPD-FE-072). */
export function bulkCancelAppointments(ids: string[]): Promise<BulkActionResult> {
  return apiFetch("/appointments/bulk-cancel", { method: "POST", body: JSON.stringify({ ids }) });
}

export function bulkRemindAppointments(ids: string[]): Promise<BulkActionResult> {
  return apiFetch("/appointments/bulk-remind", { method: "POST", body: JSON.stringify({ ids }) });
}

export interface NoShowReport {
  months: number;
  overallRate: number;
  trend: { month: string; total: number; noShows: number; rate: number }[];
  repeatOffenders: { customerId: string; name: string; noShowCount: number }[];
}

/** No-Shows reporting (UPD-FE-018). */
export function fetchNoShowReport(months?: number): Promise<NoShowReport> {
  const query = months ? `?months=${months}` : "";
  return apiFetch(`/appointments/no-show-report${query}`);
}

export async function updateAppointmentStatus(id: string, status: AppointmentStatus): Promise<LiveAppointment> {
  const raw = await apiFetch<RawAppointment>(`/appointments/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  return toLiveAppointment(raw);
}

export interface RescheduleInput {
  startsAt: string;
  staffUserId?: string;
}

export async function rescheduleAppointment(id: string, input: RescheduleInput): Promise<LiveAppointment> {
  const raw = await apiFetch<RawAppointment>(`/appointments/${id}/reschedule`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return toLiveAppointment(raw);
}

export interface CreateWalkInInput {
  serviceId: string;
  staffId?: string;
  startsAt: string;
  customerName: string;
  customerPhone: string;
}

export async function createWalkInAppointment(input: CreateWalkInInput): Promise<LiveAppointment> {
  const raw = await apiFetch<RawAppointment>("/appointments", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return toLiveAppointment(raw);
}
