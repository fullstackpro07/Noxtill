import { apiFetch } from "@/lib/api-client";
import type { LiveInventoryItem } from "@/lib/inventory-api";
import type { OrdersSummary } from "@/lib/orders-api";
import type { ReviewsSummary } from "@/lib/reviews-api";
import type { AuditLogPage, QueryAuditLogInput } from "@/lib/audit-log-api";
import type { BranchAdvisorAnswer } from "@/lib/branches-api";

/**
 * Reads another branch's real data through the SAME endpoints that branch's own users hit —
 * scoped via the `X-Branch` header (TenancyGuard, BE-059), which only ever works for the caller's
 * own business or a direct child of it. This is what lets Branch 360 and the cross-branch
 * Inventory/Staff/Bookings tabs be genuinely real without any new backend surface: an owner
 * viewing a child branch's Orders/Inventory/Customers/Staff/Bookings/Credit/Reviews/Audit is
 * exactly the same read that branch's own manager gets, just threaded through a one-off header
 * instead of the global branch switcher (so it never changes what branch the rest of the app,
 * e.g. Fast Sale, believes it's acting as — see `ApiFetchOptions.branchId` in `api-client.ts`).
 *
 * Deliberately separate from each domain's own `*-api.ts`: those files' `fetchX` functions get
 * passed by reference as react-query `queryFn`s all over the app, so adding a positional options
 * param to them collides with TanStack's own `QueryFunctionContext` inference. These wrappers stay
 * out of that blast radius, and only carry the minimal real fields each Branches screen consumes,
 * not a full duplicate of each module's type system.
 */

export function fetchBranchOrdersSummary(branchId: string): Promise<OrdersSummary> {
  return apiFetch<OrdersSummary>("/orders/summary", {}, { branchId });
}

export function fetchBranchInventory(branchId: string): Promise<LiveInventoryItem[]> {
  return apiFetch<LiveInventoryItem[]>("/inventory", {}, { branchId });
}

interface RawBranchCustomer {
  id: string;
  lifetimeSpend: string;
  createdAt: string;
}

export interface BranchCustomerSummary {
  count: number;
  newThisMonth: number;
  totalLifetimeSpend: number;
}

export async function fetchBranchCustomerSummary(branchId: string): Promise<BranchCustomerSummary> {
  const rows = await apiFetch<RawBranchCustomer[]>("/customers", {}, { branchId });
  const now = new Date();
  const newThisMonth = rows.filter((c) => {
    const d = new Date(c.createdAt);
    return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
  }).length;
  return {
    count: rows.length,
    newThisMonth,
    totalLifetimeSpend: rows.reduce((sum, c) => sum + Number(c.lifetimeSpend), 0),
  };
}

export interface RawBranchAppointment {
  id: string;
  status: string;
  startsAt: string;
  endsAt: string;
  staffUserId: string | null;
}

export interface BranchBookingSummary {
  total: number;
  completed: number;
  cancelled: number;
  noShow: number;
  unassigned: number;
}

export async function fetchBranchAppointments(branchId: string, from?: string, to?: string): Promise<RawBranchAppointment[]> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return apiFetch<RawBranchAppointment[]>(`/appointments${qs ? `?${qs}` : ""}`, {}, { branchId });
}

export function summarizeBranchBookings(rows: RawBranchAppointment[]): BranchBookingSummary {
  return {
    total: rows.length,
    completed: rows.filter((r) => r.status === "completed").length,
    cancelled: rows.filter((r) => r.status === "cancelled").length,
    noShow: rows.filter((r) => r.status === "no_show").length,
    unassigned: rows.filter((r) => !r.staffUserId).length,
  };
}

export interface RawBranchStaffMember {
  id: string;
  role: "owner" | "manager" | "staff";
  user: { name: string };
  active?: boolean;
}

export function fetchBranchStaffList(branchId: string): Promise<RawBranchStaffMember[]> {
  return apiFetch<RawBranchStaffMember[]>("/staff", {}, { branchId });
}

export interface RawBranchShift {
  id: string;
  staffUserId: string;
  startsAt: string;
  endsAt: string;
  status: string;
}

export function fetchBranchShifts(branchId: string, from: string, to: string): Promise<RawBranchShift[]> {
  const params = new URLSearchParams({ from, to });
  return apiFetch<RawBranchShift[]>(`/shifts?${params.toString()}`, {}, { branchId });
}

interface RawBranchDebtor {
  customerId: string;
  balance: number;
  daysOutstanding: number;
}

export interface BranchCreditSummary {
  debtorCount: number;
  totalOutstanding: number;
  pastTermsCount: number;
}

export async function fetchBranchCreditSummary(branchId: string): Promise<BranchCreditSummary> {
  const rows = await apiFetch<RawBranchDebtor[]>("/credit", {}, { branchId });
  return {
    debtorCount: rows.length,
    totalOutstanding: rows.reduce((sum, d) => sum + Number(d.balance), 0),
    pastTermsCount: rows.filter((d) => d.daysOutstanding > 30).length,
  };
}

interface RawBranchProduct {
  id: string;
  name: string;
  active: boolean;
}

export function fetchBranchProducts(branchId: string): Promise<RawBranchProduct[]> {
  return apiFetch<RawBranchProduct[]>("/products", {}, { branchId });
}

export function fetchBranchReviewsSummary(branchId: string): Promise<ReviewsSummary> {
  return apiFetch<ReviewsSummary>("/reviews/summary", {}, { branchId });
}

/** Real AI Q&A scoped to one specific branch, regardless of which branch the global switcher is
 * currently on — used by Branch 360's "What should I do?" block. Same `/ai/branch-advisor`
 * endpoint `askBranchAdvisor` calls, just threaded through a one-off `X-Branch` override. */
export function fetchBranchAdvisorAnswer(branchId: string, question: string): Promise<BranchAdvisorAnswer> {
  return apiFetch<BranchAdvisorAnswer>("/ai/branch-advisor", { method: "POST", body: JSON.stringify({ question }) }, { branchId });
}

export function fetchBranchAuditLog(branchId: string, query: QueryAuditLogInput = {}): Promise<AuditLogPage> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return apiFetch<AuditLogPage>(`/audit-log${qs ? `?${qs}` : ""}`, {}, { branchId });
}
