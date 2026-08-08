import { apiFetch } from "@/lib/api-client";

interface RawRollupBranch {
  businessId: string;
  name: string;
  ordersCount: number;
  revenue: number;
  grossProfit: number;
  reviewAvg: number | null;
}

export interface RollupBranch extends RawRollupBranch {
  avgTicket: number;
}

export interface RollupDashboard {
  totals: { ordersCount: number; revenue: number; grossProfit: number };
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
