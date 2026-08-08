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
  source: "link" | "qr" | "walk_in";
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
  };
}

export interface AppointmentFilters {
  from?: string;
  to?: string;
  staff?: string;
}

export async function fetchAppointments(filters: AppointmentFilters = {}): Promise<LiveAppointment[]> {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.staff) params.set("staff", filters.staff);
  const query = params.toString();
  const raw = await apiFetch<RawAppointment[]>(`/appointments${query ? `?${query}` : ""}`);
  return raw.map(toLiveAppointment);
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
