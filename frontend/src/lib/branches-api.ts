import { apiFetch } from "@/lib/api-client";

interface RawRollupBranch {
  businessId: string;
  name: string;
  ordersCount: number;
  revenue: number;
  grossProfit: number;
  reviewAvg: number | null;
  customerCount: number;
  creditOutstanding: number;
}

export interface RollupBranch extends RawRollupBranch {
  avgTicket: number;
}

export interface RollupDashboard {
  totals: {
    ordersCount: number;
    revenue: number;
    grossProfit: number;
    customerCount: number;
    creditOutstanding: number;
  };
  branches: RollupBranch[];
}

function withAvgTicket(branch: RawRollupBranch): RollupBranch {
  return { ...branch, avgTicket: branch.ordersCount > 0 ? branch.revenue / branch.ordersCount : 0 };
}

/** GET /rollup/dashboard — always returns the full branch group (root + all children), regardless of X-Branch. */
export async function fetchRollupDashboard(days?: number): Promise<RollupDashboard> {
  const query = days ? `?days=${days}` : "";
  const raw = await apiFetch<{ totals: RollupDashboard["totals"]; branches: RawRollupBranch[] }>(`/rollup/dashboard${query}`);
  return { totals: raw.totals, branches: raw.branches.map(withAvgTicket) };
}

export interface RollupWeek {
  weekStart: string;
  ordersCount: number;
  revenue: number;
  grossProfit: number;
}

export interface RollupCompareBranch {
  businessId: string;
  name: string;
  weeks: RollupWeek[];
}

/** GET /rollup/compare — same full-group scope as dashboard. */
export function fetchRollupCompare(weeks?: number): Promise<RollupCompareBranch[]> {
  const query = weeks ? `?weeks=${weeks}` : "";
  return apiFetch<RollupCompareBranch[]>(`/rollup/compare${query}`);
}

export interface BranchAdvisorAnswer {
  answer: string;
  disclaimer: string;
}

/**
 * POST /ai/branch-advisor — answers only for whichever business is currently scoped (JWT or the
 * X-Branch header apiFetch already attaches from the branch-context store), never an arbitrary
 * branchId param. Switching the branch dropdown re-scopes this by changing X-Branch, not the body.
 */
export function askBranchAdvisor(question: string): Promise<BranchAdvisorAnswer> {
  return apiFetch<BranchAdvisorAnswer>("/ai/branch-advisor", {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}

// --- All Branches management + Branch Settings (UPD-BE/FE-109) ---

export type PaymentMethodKey = "cash" | "card" | "online" | "credit";

export interface Branch {
  id: string;
  name: string;
  parentId: string | null;
  active: boolean;
  country: string | null;
  currency: string;
  timezone: string;
  channelPref: "whatsapp" | "sms" | "email";
  nightlyCloseTime: string;
  taxLabel: string;
  taxRate: number;
  workingHours: Record<string, [string, string][]>;
  branding: Record<string, unknown>;
  acceptedPaymentMethods: PaymentMethodKey[];
  createdAt: string;
}

interface RawBranch extends Omit<Branch, "taxRate"> {
  taxRate: string;
}

function toBranch(raw: RawBranch): Branch {
  return { ...raw, taxRate: Number(raw.taxRate) };
}

/** GET /branches — the caller's own branch group (itself + its root's other children). */
export async function fetchBranches(): Promise<Branch[]> {
  const raw = await apiFetch<RawBranch[]>("/branches");
  return raw.map(toBranch);
}

export interface CreateBranchInput {
  name: string;
  ownerName: string;
  ownerEmail?: string;
  ownerPhone?: string;
  country?: string;
  currency?: string;
  timezone?: string;
}

export interface CreateBranchResult {
  business: Branch;
  businessUser: { id: string; userId: string; role: string };
  tempPassword?: string;
}

export async function createBranch(input: CreateBranchInput): Promise<CreateBranchResult> {
  const raw = await apiFetch<{ business: RawBranch; businessUser: CreateBranchResult["businessUser"]; tempPassword?: string }>(
    "/branches",
    { method: "POST", body: JSON.stringify(input) },
  );
  return { business: toBranch(raw.business), businessUser: raw.businessUser, tempPassword: raw.tempPassword };
}

export type UpdateBranchInput = Partial<
  Pick<
    Branch,
    "name" | "country" | "currency" | "timezone" | "channelPref" | "nightlyCloseTime" | "taxLabel" | "taxRate" | "workingHours" | "branding" | "acceptedPaymentMethods"
  >
>;

export async function updateBranch(id: string, input: UpdateBranchInput): Promise<Branch> {
  const raw = await apiFetch<RawBranch>(`/branches/${id}`, { method: "PATCH", body: JSON.stringify(input) });
  return toBranch(raw);
}

export async function deactivateBranch(id: string): Promise<Branch> {
  const raw = await apiFetch<RawBranch>(`/branches/${id}`, { method: "DELETE" });
  return toBranch(raw);
}

export async function reactivateBranch(id: string): Promise<Branch> {
  const raw = await apiFetch<RawBranch>(`/branches/${id}/reactivate`, { method: "POST" });
  return toBranch(raw);
}

export async function copyBranchSettings(id: string, fromBranchId: string): Promise<Branch> {
  const raw = await apiFetch<RawBranch>(`/branches/${id}/copy-settings`, {
    method: "POST",
    body: JSON.stringify({ fromBranchId }),
  });
  return toBranch(raw);
}
