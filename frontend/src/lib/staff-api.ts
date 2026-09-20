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
  /** Staff depth fix (UPD-INT-011): null means purely-commission pay, unchanged from before this
   * field existed. */
  hourlyRate: number | null;
  /** UPD-BE-STAFF-02: false means deactivated — access revoked, but every historical record
   * (attendance, commissions, shifts, orders) stays intact. Reactivatable via `reactivateStaffMember`. */
  active: boolean;
}

function toLiveStaffMember(
  raw: RawStaffMember & {
    commissionRule?: RawCommissionRule;
    customRoleId?: string | null;
    hourlyRate?: string | null;
    active?: boolean;
  },
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
    hourlyRate: raw.hourlyRate != null ? Number(raw.hourlyRate) : null,
    active: raw.active ?? true,
  };
}

/** `includeInactive` defaults to false, matching the backend default — pass true only for
 * screens (the Roster) that need to show and reactivate deactivated staff. */
export async function fetchStaffList(includeInactive = false): Promise<LiveStaffMember[]> {
  const raw = await apiFetch<
    (RawStaffMember & { commissionRule?: RawCommissionRule; customRoleId?: string | null; hourlyRate?: string | null; active?: boolean })[]
  >(`/staff${includeInactive ? "?includeInactive=true" : ""}`);
  return raw.map(toLiveStaffMember);
}

export interface StaffDraft {
  name: string;
  email?: string;
  phone?: string;
  role: "manager" | "staff";
  commissionRule: CommissionRule;
  hourlyRate?: number;
}

export interface InviteStaffResult extends LiveStaffMember {
  tempPassword?: string;
}

export async function inviteStaff(draft: StaffDraft): Promise<InviteStaffResult> {
  const raw = await apiFetch<RawStaffMember & { commissionRule?: RawCommissionRule; hourlyRate?: string | null; tempPassword?: string }>(
    "/staff",
    {
      method: "POST",
      body: JSON.stringify({
        name: draft.name,
        email: draft.email || undefined,
        phone: draft.phone || undefined,
        role: draft.role,
        commissionRule: await toRawCommissionRule(draft.commissionRule),
        hourlyRate: draft.hourlyRate,
      }),
    },
  );
  return { ...toLiveStaffMember(raw), tempPassword: raw.tempPassword };
}

export async function updateStaffMember(
  id: string,
  draft: { role: "manager" | "staff"; commissionRule: CommissionRule; hourlyRate?: number | null },
): Promise<LiveStaffMember> {
  const raw = await apiFetch<RawStaffMember & { commissionRule?: RawCommissionRule; hourlyRate?: string | null }>(`/staff/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      role: draft.role,
      commissionRule: await toRawCommissionRule(draft.commissionRule),
      hourlyRate: draft.hourlyRate,
    }),
  });
  return toLiveStaffMember(raw);
}

/** Deactivates (never hard-deletes, UPD-BE-STAFF-02) — the route stays DELETE for URL stability, but
 * the backend flips `active` to false; every historical record for this person is kept. */
export function removeStaffMember(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/staff/${id}`, { method: "DELETE" });
}

export async function reactivateStaffMember(id: string): Promise<LiveStaffMember> {
  const raw = await apiFetch<RawStaffMember & { commissionRule?: RawCommissionRule; customRoleId?: string | null; hourlyRate?: string | null; active?: boolean }>(
    `/staff/${id}/reactivate`,
    { method: "PATCH" },
  );
  return toLiveStaffMember(raw);
}

/** UPD-FE-113 — sends only `customRoleId`, leaving role/commissionRule untouched (unlike `updateStaffMember`, which requires both). */
export async function assignCustomRole(id: string, customRoleId: string | null): Promise<LiveStaffMember> {
  const raw = await apiFetch<
    RawStaffMember & { commissionRule?: RawCommissionRule; customRoleId?: string | null; hourlyRate?: string | null }
  >(`/staff/${id}`, {
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
  /** UPD-BE-STAFF-04: real label derived from the staff member's own `commissionRule`. */
  ruleLabel: string;
  /** UPD-BE-STAFF-04: real all-time outstanding advances for this person — informational only,
   * "Mark Paid" here never settles advances (see `CommissionPayment`'s backend doc comment). */
  advancesOutstanding: number;
  /** UPD-BE-STAFF-04: whether this specific month's commission has been marked paid. */
  paid: boolean;
}

export function fetchCommissions(month: string): Promise<CommissionEntry[]> {
  return apiFetch<CommissionEntry[]>(`/staff/commissions?month=${month}`);
}

export function markCommissionPaid(staffUserId: string, month: string): Promise<{ id: string; paidAt: string }> {
  return apiFetch("/staff/commissions/mark-paid", { method: "POST", body: JSON.stringify({ staffUserId, month }) });
}

export function sendCommissionStatement(staffUserId: string, month: string): Promise<unknown> {
  return apiFetch("/staff/commissions/send-statement", { method: "POST", body: JSON.stringify({ staffUserId, month }) });
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
  edited?: boolean;
  staffUser: { id: string; user: { id: string; name: string } };
}

export interface AttendanceRow {
  id: string;
  staffUserId: string;
  staffName: string;
  checkIn: string;
  checkOut: string | null;
  /** UPD-BE-STAFF-03: true only for a manually-added or corrected row — the original value stays
   * in the real audit log either way. */
  edited: boolean;
}

function toAttendanceRow(raw: RawAttendanceRow): AttendanceRow {
  return {
    id: raw.id,
    staffUserId: raw.staffUserId,
    staffName: raw.staffUser.user.name,
    edited: raw.edited ?? false,
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

// --- Manual entry / correction (UPD-BE-STAFF-03) ---

export interface ManualAttendanceInput {
  staffUserId: string;
  checkIn: string;
  checkOut: string;
  reason: string;
}

export async function createManualAttendance(input: ManualAttendanceInput): Promise<AttendanceRow> {
  const raw = await apiFetch<RawAttendanceRow>("/attendance/manual", { method: "POST", body: JSON.stringify(input) });
  return toAttendanceRow(raw);
}

export interface CorrectAttendanceInput {
  checkIn: string;
  checkOut?: string | null;
  note: string;
}

export async function correctAttendance(id: string, input: CorrectAttendanceInput): Promise<AttendanceRow> {
  const raw = await apiFetch<RawAttendanceRow>(`/attendance/${id}`, { method: "PATCH", body: JSON.stringify(input) });
  return toAttendanceRow(raw);
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
  swapWithShiftId: string | null;
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
  /** Staff depth fix (UPD-INT-011): the covering staff member's own shift being traded back — set
   * means this is a real two-way swap, not just a one-way coverage handoff. */
  swapWithShiftId: string | null;
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
    swapWithShiftId: raw.swapWithShiftId,
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

export async function requestShiftSwap(
  id: string,
  input: { coveringUserId?: string; reason?: string; swapWithShiftId?: string },
): Promise<Shift> {
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

export interface SchedulePublishStatus {
  published: boolean;
  publishedAt: string | null;
}

/** Real, shared publish status for a week — a row exists only once `notifyShifts` has actually
 * been called for that week, visible to every viewer (not per-browser localStorage). */
export function fetchSchedulePublishStatus(weekStart: string): Promise<SchedulePublishStatus> {
  return apiFetch<SchedulePublishStatus>(`/shifts/publish-status?weekStart=${encodeURIComponent(weekStart)}`);
}

// --- Time Off (real backend, UPD-BE-031 — no prior frontend consumer existed for this) ---

interface RawTimeOff {
  id: string;
  staffUserId: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  approved: boolean;
  reviewedByUserId: string | null;
  createdAt: string;
  staffUser: { id: string; user: { id: string; name: string } };
}

export type TimeOffStatus = "pending" | "approved" | "rejected";

export interface TimeOff {
  id: string;
  staffUserId: string;
  staffName: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  status: TimeOffStatus;
  createdAt: string;
}

function toTimeOff(raw: RawTimeOff): TimeOff {
  return {
    id: raw.id,
    staffUserId: raw.staffUserId,
    staffName: raw.staffUser.user.name,
    startsAt: raw.startsAt,
    endsAt: raw.endsAt,
    reason: raw.reason,
    status: raw.reviewedByUserId == null ? "pending" : raw.approved ? "approved" : "rejected",
    createdAt: raw.createdAt,
  };
}

export async function fetchTimeOff(staffUserId?: string): Promise<TimeOff[]> {
  const query = staffUserId ? `?staffUserId=${staffUserId}` : "";
  const raw = await apiFetch<RawTimeOff[]>(`/time-off${query}`);
  return raw.map(toTimeOff);
}

export interface CreateTimeOffInput {
  staffUserId?: string;
  startsAt: string;
  endsAt: string;
  reason?: string;
}

export async function requestTimeOff(input: CreateTimeOffInput): Promise<TimeOff> {
  const raw = await apiFetch<RawTimeOff>("/time-off", { method: "POST", body: JSON.stringify(input) });
  return toTimeOff(raw);
}

export async function approveTimeOff(id: string): Promise<TimeOff> {
  const raw = await apiFetch<RawTimeOff>(`/time-off/${id}/approve`, { method: "PATCH" });
  return toTimeOff(raw);
}

export async function rejectTimeOff(id: string): Promise<TimeOff> {
  const raw = await apiFetch<RawTimeOff>(`/time-off/${id}/reject`, { method: "PATCH" });
  return toTimeOff(raw);
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
  /** Staff depth fix (UPD-INT-011): multiplies a staff member's `hourlyRate` for overtime hours. */
  overtimeRateMultiplier: number;
  /** UPD-BE-STAFF-03: minutes after a scheduled shift's start before a check-in counts as Late. */
  lateThresholdMinutes: number;
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
  category: string | null;
  recordedByName?: string | null;
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
  category: string | null;
  recordedByName: string | null;
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
    category: raw.category,
    recordedByName: raw.recordedByName ?? null,
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
  category?: string;
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

export async function settleAdvance(staffUserId: string, advanceId: string): Promise<Advance> {
  const raw = await apiFetch<RawAdvance>(`/staff/${staffUserId}/advances/${advanceId}/settle`, { method: "PATCH" });
  return toAdvance(raw);
}

// --- Payroll Export (UPD-BE-034, extended UPD-BE-STAFF-06) ---

export interface PayrollExportResult {
  url: string;
  warnings: string[];
}

export interface PayrollRow {
  businessUserId: string;
  name: string;
  role: string;
  hoursWorked: number;
  overtimeHours: number;
  hourlyRate: number;
  hourlyPay: number;
  commission: number;
  advancesDeducted: number;
  otherAdjustments: number;
  netPay: number;
}

export interface PayrollPreview {
  rows: PayrollRow[];
  warnings: string[];
}

/** Read-only — computes the same numbers `exportPayroll` would, without netting advances or
 * generating a file. Safe to call on every page load. */
export function fetchPayrollPreview(month: string): Promise<PayrollPreview> {
  return apiFetch<PayrollPreview>(`/payroll/preview?month=${month}`);
}

export function exportPayroll(month: string): Promise<PayrollExportResult> {
  return apiFetch<PayrollExportResult>(`/payroll/export.xlsx?month=${month}`);
}

export type PayrollLineItemType = "add" | "deduct";

interface RawPayrollLineItem {
  id: string;
  staffUserId: string;
  month: string;
  label: string;
  amount: string;
  type: PayrollLineItemType;
  staffUser: { id: string; user: { id: string; name: string } };
}

export interface PayrollLineItem {
  id: string;
  staffUserId: string;
  staffName: string;
  month: string;
  label: string;
  amount: number;
  type: PayrollLineItemType;
}

function toPayrollLineItem(raw: RawPayrollLineItem): PayrollLineItem {
  return {
    id: raw.id,
    staffUserId: raw.staffUserId,
    staffName: raw.staffUser.user.name,
    month: raw.month,
    label: raw.label,
    amount: Number(raw.amount),
    type: raw.type,
  };
}

export async function fetchPayrollLineItems(month: string): Promise<PayrollLineItem[]> {
  const raw = await apiFetch<RawPayrollLineItem[]>(`/payroll/line-items?month=${month}`);
  return raw.map(toPayrollLineItem);
}

export interface PayrollLineItemDraft {
  staffUserId: string;
  month: string;
  label: string;
  amount: number;
  type: PayrollLineItemType;
}

export async function createPayrollLineItem(draft: PayrollLineItemDraft): Promise<PayrollLineItem> {
  const raw = await apiFetch<RawPayrollLineItem>("/payroll/line-items", { method: "POST", body: JSON.stringify(draft) });
  return toPayrollLineItem(raw);
}

export function deletePayrollLineItem(id: string): Promise<void> {
  return apiFetch<void>(`/payroll/line-items/${id}`, { method: "DELETE" });
}
