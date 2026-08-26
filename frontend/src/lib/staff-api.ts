import { apiFetch } from "@/lib/api-client";
import { fetchProducts } from "@/lib/products-api";
import type { CommissionRule } from "@/lib/staff";

interface RawStaffMember {
  id: string;
  role: "owner" | "manager" | "staff";
  user: { id: string; name: string; email: string | null; phone: string | null };
}

/** Minimal read of the real staff roster — just what the bookings calendar needs (id + name) for
 * staff columns/pickers. Full staff CRUD/commissions/attendance screens are INT-009, out of scope
 * here; `lib/staff.ts`'s mock stays untouched for those. */
export interface BookingStaffOption {
  id: string;
  name: string;
}

export async function fetchStaff(): Promise<BookingStaffOption[]> {
  const raw = await apiFetch<RawStaffMember[]>("/staff");
  return raw.map((s) => ({ id: s.id, name: s.user.name }));
}

// --- Full staff CRUD (INT-009) ---

type RawCommissionRule =
  | { type: "percent"; value: number }
  | { type: "per_service"; amounts: Record<string, number> }
  | Record<string, never>;

/** Backend supports a distinct amount per service; the UI only ever sets one flat per-service rate,
 * so reading back just surfaces the first value found (they're all the same amount if set through this UI). */
function toCommissionRule(raw: RawCommissionRule | undefined): CommissionRule {
  if (!raw || !("type" in raw)) return { type: "none" };
  if (raw.type === "percent") return { type: "percent", rate: raw.value };
  if (raw.type === "per_service") {
    const amount = Object.values(raw.amounts)[0] ?? 0;
    return { type: "perService", amount };
  }
  return { type: "none" };
}

/** Applies one flat amount to every currently-active service, since the UI has no per-service picker. */
async function toRawCommissionRule(rule: CommissionRule): Promise<RawCommissionRule> {
  if (rule.type === "percent") return { type: "percent", value: rule.rate };
  if (rule.type === "perService") {
    const services = await fetchProducts({ kind: "service", active: true });
    const amounts = Object.fromEntries(services.map((s) => [s.id, rule.amount]));
    return { type: "per_service", amounts };
  }
  return {};
}

export interface LiveStaffMember {
  id: string;
  userId: string;
  name: string;
  role: "owner" | "manager" | "staff";
  email: string | null;
  phone: string | null;
  commissionRule: CommissionRule;
  customRoleId: string | null;
}

function toLiveStaffMember(
  raw: RawStaffMember & { commissionRule?: RawCommissionRule; customRoleId?: string | null },
): LiveStaffMember {
  return {
    id: raw.id,
    userId: raw.user.id,
    name: raw.user.name,
    role: raw.role,
    email: raw.user.email,
    phone: raw.user.phone,
    commissionRule: toCommissionRule(raw.commissionRule),
    customRoleId: raw.customRoleId ?? null,
  };
}

export async function fetchStaffList(): Promise<LiveStaffMember[]> {
  const raw = await apiFetch<(RawStaffMember & { commissionRule?: RawCommissionRule; customRoleId?: string | null })[]>("/staff");
  return raw.map(toLiveStaffMember);
}

export interface StaffDraft {
  name: string;
  email?: string;
  phone?: string;
  role: "manager" | "staff";
  commissionRule: CommissionRule;
}

export interface InviteStaffResult extends LiveStaffMember {
  tempPassword?: string;
}

export async function inviteStaff(draft: StaffDraft): Promise<InviteStaffResult> {
  const raw = await apiFetch<RawStaffMember & { commissionRule?: RawCommissionRule; tempPassword?: string }>("/staff", {
    method: "POST",
    body: JSON.stringify({
      name: draft.name,
      email: draft.email || undefined,
      phone: draft.phone || undefined,
      role: draft.role,
      commissionRule: await toRawCommissionRule(draft.commissionRule),
    }),
  });
  return { ...toLiveStaffMember(raw), tempPassword: raw.tempPassword };
}

export async function updateStaffMember(
  id: string,
  draft: { role: "manager" | "staff"; commissionRule: CommissionRule },
): Promise<LiveStaffMember> {
  const raw = await apiFetch<RawStaffMember & { commissionRule?: RawCommissionRule }>(`/staff/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ role: draft.role, commissionRule: await toRawCommissionRule(draft.commissionRule) }),
  });
  return toLiveStaffMember(raw);
}

export function removeStaffMember(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/staff/${id}`, { method: "DELETE" });
}

/** UPD-FE-113 — sends only `customRoleId`, leaving role/commissionRule untouched (unlike `updateStaffMember`, which requires both). */
export async function assignCustomRole(id: string, customRoleId: string | null): Promise<LiveStaffMember> {
  const raw = await apiFetch<RawStaffMember & { commissionRule?: RawCommissionRule; customRoleId?: string | null }>(`/staff/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ customRoleId }),
  });
  return toLiveStaffMember(raw);
}

export interface CommissionEntry {
  businessUserId: string;
  name: string;
  role: string;
  totalSales: number;
  commission: number;
}

export function fetchCommissions(month: string): Promise<CommissionEntry[]> {
  return apiFetch<CommissionEntry[]>(`/staff/commissions?month=${month}`);
}

export interface TeamInboxTask {
  id: string;
  type: "appointment" | "complaint" | "restock";
  title: string;
  detail: string;
  assigneeStaffId: string | null;
  dueAt: string | null;
}

export function fetchTeamInbox(): Promise<TeamInboxTask[]> {
  return apiFetch<TeamInboxTask[]>("/staff/inbox");
}

export function toggleAttendance(): Promise<{ id: string; checkIn: string; checkOut: string | null }> {
  return apiFetch("/attendance/toggle", { method: "POST" });
}

// --- Attendance history (UPD-BE/FE-113) ---

interface RawAttendanceRow {
  id: string;
  staffUserId: string;
  checkIn: string;
  checkOut: string | null;
  staffUser: { id: string; user: { id: string; name: string } };
}

export interface AttendanceRow {
  id: string;
  staffUserId: string;
  staffName: string;
  checkIn: string;
  checkOut: string | null;
}

function toAttendanceRow(raw: RawAttendanceRow): AttendanceRow {
  return {
    id: raw.id,
    staffUserId: raw.staffUserId,
    staffName: raw.staffUser.user.name,
    checkIn: raw.checkIn,
    checkOut: raw.checkOut,
  };
}

export async function fetchAttendance(params: { staffUserId?: string; from?: string; to?: string } = {}): Promise<AttendanceRow[]> {
  const query = new URLSearchParams();
  if (params.staffUserId) query.set("staffUserId", params.staffUserId);
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  const qs = query.toString();
  const raw = await apiFetch<RawAttendanceRow[]>(`/attendance${qs ? `?${qs}` : ""}`);
  return raw.map(toAttendanceRow);
}

// --- Shifts & Schedule (UPD-BE-031, extended UPD-BE/FE-113) ---

export type ShiftStatus = "scheduled" | "completed" | "cancelled";
export type ShiftSwapStatus = "pending" | "approved" | "rejected" | null;

interface RawShift {
  id: string;
  staffUserId: string;
  startsAt: string;
  endsAt: string;
  status: ShiftStatus;
  note: string | null;
  swapStatus: ShiftSwapStatus;
  swapRequestedByUserId: string | null;
  swapCoveringUserId: string | null;
  swapReason: string | null;
  swapReviewedByUserId: string | null;
  staffUser: { id: string; user: { id: string; name: string } };
}

export interface Shift {
  id: string;
  staffUserId: string;
  staffName: string;
  startsAt: string;
  endsAt: string;
  status: ShiftStatus;
  note: string | null;
  swapStatus: ShiftSwapStatus;
  swapRequestedByUserId: string | null;
  swapCoveringUserId: string | null;
  swapReason: string | null;
}

function toShift(raw: RawShift): Shift {
  return {
    id: raw.id,
    staffUserId: raw.staffUserId,
    staffName: raw.staffUser.user.name,
    startsAt: raw.startsAt,
    endsAt: raw.endsAt,
    status: raw.status,
    note: raw.note,
    swapStatus: raw.swapStatus,
    swapRequestedByUserId: raw.swapRequestedByUserId,
    swapCoveringUserId: raw.swapCoveringUserId,
    swapReason: raw.swapReason,
  };
}

export async function fetchShifts(params: { from?: string; to?: string; staffUserId?: string } = {}): Promise<Shift[]> {
  const query = new URLSearchParams();
  if (params.staffUserId) query.set("staffUserId", params.staffUserId);
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  const qs = query.toString();
  const raw = await apiFetch<RawShift[]>(`/shifts${qs ? `?${qs}` : ""}`);
  return raw.map(toShift);
}

export interface ShiftDraft {
  staffUserId: string;
  startsAt: string;
  endsAt: string;
  note?: string;
}

export async function createShift(draft: ShiftDraft): Promise<Shift> {
  const raw = await apiFetch<RawShift>("/shifts", { method: "POST", body: JSON.stringify(draft) });
  return toShift(raw);
}

export async function updateShift(id: string, draft: Partial<Pick<ShiftDraft, "startsAt" | "endsAt" | "note">> & { status?: ShiftStatus }): Promise<Shift> {
  const raw = await apiFetch<RawShift>(`/shifts/${id}`, { method: "PATCH", body: JSON.stringify(draft) });
  return toShift(raw);
}

export function deleteShift(id: string): Promise<void> {
  return apiFetch<void>(`/shifts/${id}`, { method: "DELETE" });
}

export async function requestShiftSwap(id: string, input: { coveringUserId?: string; reason?: string }): Promise<Shift> {
  const raw = await apiFetch<RawShift>(`/shifts/${id}/swap-request`, { method: "POST", body: JSON.stringify(input) });
  return toShift(raw);
}

export async function approveShiftSwap(id: string): Promise<Shift> {
  const raw = await apiFetch<RawShift>(`/shifts/${id}/swap-request/approve`, { method: "PATCH" });
  return toShift(raw);
}

export async function rejectShiftSwap(id: string): Promise<Shift> {
  const raw = await apiFetch<RawShift>(`/shifts/${id}/swap-request/reject`, { method: "PATCH" });
  return toShift(raw);
}

export interface NotifyShiftsResult {
  notifiedCount: number;
  notified: { staffUserId: string; name: string }[];
}

export function notifyShifts(from: string, to: string): Promise<NotifyShiftsResult> {
  return apiFetch<NotifyShiftsResult>("/shifts/notify", { method: "POST", body: JSON.stringify({ from, to }) });
}

// --- Timesheets (UPD-BE-032, extended UPD-BE/FE-113) ---

export interface TimesheetRow {
  businessUserId: string;
  name: string;
  role: "owner" | "manager" | "staff";
  hoursWorked: number;
  overtimeHours: number;
  scheduledShiftCount: number;
  approved: boolean;
  approvedByUserId: string | null;
  approvedAt: string | null;
}

export function fetchTimesheets(month: string): Promise<TimesheetRow[]> {
  return apiFetch<TimesheetRow[]>(`/timesheets?month=${month}`);
}

export function approveTimesheet(staffUserId: string, month: string): Promise<{ approvedByUserId: string; approvedAt: string }> {
  return apiFetch(`/timesheets/${staffUserId}/approve?month=${month}`, { method: "POST" });
}

export interface TimesheetSettings {
  overtimeThresholdHoursPerWeek: number;
  breakThresholdHours: number;
  breakMinutesPerShift: number;
}

export function fetchTimesheetSettings(): Promise<TimesheetSettings> {
  return apiFetch<TimesheetSettings>("/timesheets/settings");
}

export function updateTimesheetSettings(settings: Partial<TimesheetSettings>): Promise<TimesheetSettings> {
  return apiFetch<TimesheetSettings>("/timesheets/settings", { method: "PATCH", body: JSON.stringify(settings) });
}

// --- Advances (UPD-BE-033, extended UPD-BE/FE-113) ---

export type AdvanceStatus = "outstanding" | "deducted" | "cancelled";

interface RawAdvance {
  id: string;
  staffUserId: string;
  amount: string;
  reason: string | null;
  status: AdvanceStatus;
  deductedInMonth: string | null;
  createdAt: string;
  staffUser?: { id: string; user: { id: string; name: string } };
}

export interface Advance {
  id: string;
  staffUserId: string;
  staffName: string | null;
  amount: number;
  reason: string | null;
  status: AdvanceStatus;
  deductedInMonth: string | null;
  createdAt: string;
}

function toAdvance(raw: RawAdvance): Advance {
  return {
    id: raw.id,
    staffUserId: raw.staffUserId,
    staffName: raw.staffUser?.user.name ?? null,
    amount: Number(raw.amount),
    reason: raw.reason,
    status: raw.status,
    deductedInMonth: raw.deductedInMonth,
    createdAt: raw.createdAt,
  };
}

export async function fetchAllAdvances(): Promise<Advance[]> {
  const raw = await apiFetch<RawAdvance[]>("/advances");
  return raw.map(toAdvance);
}

export interface AdvanceDraft {
  amount: number;
  reason?: string;
}

export async function createAdvance(staffUserId: string, draft: AdvanceDraft): Promise<Advance> {
  const raw = await apiFetch<RawAdvance>(`/staff/${staffUserId}/advances`, { method: "POST", body: JSON.stringify(draft) });
  return toAdvance(raw);
}

export async function updateAdvance(staffUserId: string, advanceId: string, draft: Partial<AdvanceDraft>): Promise<Advance> {
  const raw = await apiFetch<RawAdvance>(`/staff/${staffUserId}/advances/${advanceId}`, { method: "PATCH", body: JSON.stringify(draft) });
  return toAdvance(raw);
}

export function cancelAdvance(staffUserId: string, advanceId: string): Promise<void> {
  return apiFetch<void>(`/staff/${staffUserId}/advances/${advanceId}`, { method: "DELETE" });
}

// --- Payroll Export (UPD-BE-034) ---

export interface PayrollExportResult {
  url: string;
  warnings: string[];
}

export function exportPayroll(month: string): Promise<PayrollExportResult> {
  return apiFetch<PayrollExportResult>(`/payroll/export.xlsx?month=${month}`);
}
