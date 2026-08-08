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
}

function toLiveStaffMember(raw: RawStaffMember & { commissionRule?: RawCommissionRule }): LiveStaffMember {
  return {
    id: raw.id,
    userId: raw.user.id,
    name: raw.user.name,
    role: raw.role,
    email: raw.user.email,
    phone: raw.user.phone,
    commissionRule: toCommissionRule(raw.commissionRule),
  };
}

export async function fetchStaffList(): Promise<LiveStaffMember[]> {
  const raw = await apiFetch<(RawStaffMember & { commissionRule?: RawCommissionRule })[]>("/staff");
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
