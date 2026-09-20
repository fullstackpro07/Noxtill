import { useQuery } from "@tanstack/react-query";
import { fetchBranches, type Branch } from "@/lib/branches-api";
import {
  fetchBranchOrdersSummary,
  fetchBranchProducts,
  fetchBranchInventory,
  fetchBranchCustomerSummary,
  fetchBranchAppointments,
  summarizeBranchBookings,
  fetchBranchStaffList,
  fetchBranchCreditSummary,
  fetchBranchReviewsSummary,
  fetchBranchAuditLog,
} from "@/lib/branch-scoped-api";
import type { OrdersSummary } from "@/lib/orders-api";
import type { LiveInventoryItem } from "@/lib/inventory-api";
import type { ReviewsSummary } from "@/lib/reviews-api";
import type { AuditLogRow } from "@/lib/audit-log-api";
import type { RawBranchStaffMember } from "@/lib/branch-scoped-api";

function todayRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export interface BranchWorkspace {
  branch: Branch;
  orders: OrdersSummary | null;
  products: { total: number; active: number };
  inventory: LiveInventoryItem[];
  customers: { count: number; newThisMonth: number; totalLifetimeSpend: number };
  bookings: ReturnType<typeof summarizeBranchBookings>;
  staff: RawBranchStaffMember[];
  credit: { debtorCount: number; totalOutstanding: number; pastTermsCount: number };
  reviews: ReviewsSummary | null;
  activity: AuditLogRow[];
}

/** Fetches every real per-branch domain slice Branch 360 shows, in one batch, scoped to that one
 * branch via X-Branch — the same real endpoints that branch's own users hit, not new backend
 * surface. A slice that fails independently (e.g. reviews not yet enabled) degrades to empty
 * rather than failing the whole workspace. */
export function useBranchWorkspace(branchId: string | null) {
  return useQuery({
    queryKey: ["branch-workspace", branchId],
    queryFn: async (): Promise<BranchWorkspace> => {
      if (!branchId) throw new Error("no branch selected");
      const branches = await fetchBranches();
      const branch = branches.find((b) => b.id === branchId);
      if (!branch) throw new Error("branch not found");

      const { from, to } = todayRange();
      const settle = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);

      const [orders, products, inventory, customers, bookingRows, staff, credit, reviews, activityPage] = await Promise.all([
        settle(fetchBranchOrdersSummary(branchId), null as OrdersSummary | null),
        settle(fetchBranchProducts(branchId), []),
        settle(fetchBranchInventory(branchId), []),
        settle(fetchBranchCustomerSummary(branchId), { count: 0, newThisMonth: 0, totalLifetimeSpend: 0 }),
        settle(fetchBranchAppointments(branchId, from, to), []),
        settle(fetchBranchStaffList(branchId), []),
        settle(fetchBranchCreditSummary(branchId), { debtorCount: 0, totalOutstanding: 0, pastTermsCount: 0 }),
        settle(fetchBranchReviewsSummary(branchId), null as ReviewsSummary | null),
        settle(fetchBranchAuditLog(branchId, { pageSize: 10 }), { total: 0, page: 1, pageSize: 10, rows: [] }),
      ]);

      return {
        branch,
        orders,
        products: { total: products.length, active: products.filter((p) => p.active).length },
        inventory,
        customers,
        bookings: summarizeBranchBookings(bookingRows),
        staff,
        credit,
        reviews,
        activity: activityPage.rows,
      };
    },
    enabled: !!branchId,
  });
}
