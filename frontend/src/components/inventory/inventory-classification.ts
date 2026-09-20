import type { Role } from "@/lib/nav-items";

/** Shared movement/urgency classification, used by every Inventory screen that needs it, so the
 * same product never gets labelled two different ways on two different screens. Thresholds are
 * disclosed in Settings (`inventory-settings-view.tsx`) — keep those numbers in sync with these. */

/** A product with real sales velocity and this many days of cover or fewer counts as "Fast-moving"
 * (Valuation) / a "fast mover" (Overview). Above it, still selling but "Slow-moving". Zero velocity
 * at all (regardless of cover) is "Dead". */
export const FAST_MOVER_MAX_DAYS_OF_COVER = 30;

export type Movement = "Fast" | "Slow" | "Dead";

export function classifyMovement(velocityPerDay: number, daysOfCover: number | null): Movement {
  if (velocityPerDay <= 0) return "Dead";
  if (daysOfCover != null && daysOfCover <= FAST_MOVER_MAX_DAYS_OF_COVER) return "Fast";
  return "Slow";
}

/** Out of stock, or this many days of cover or fewer, is "Critical". Below that but still under
 * `URGENCY_HIGH_DAYS` is "High"; everything else below threshold is "Medium". Used for both Low
 * Stock's "Priority" column and Reorder Suggestions' "Urgency" column. */
export const URGENCY_CRITICAL_DAYS = 3;
export const URGENCY_HIGH_DAYS = 7;

export type Urgency = "Critical" | "High" | "Medium";

export function classifyUrgency(stockQty: number, daysOfCover: number | null): Urgency {
  if (stockQty <= 0) return "Critical";
  if (daysOfCover != null && daysOfCover <= URGENCY_CRITICAL_DAYS) return "Critical";
  if (daysOfCover != null && daysOfCover <= URGENCY_HIGH_DAYS) return "High";
  return "Medium";
}

/**
 * Real backend gates (`purchase-orders.controller.ts` / `inventory.controller.ts`): the entire
 * Purchase Orders API requires `purchases.manage`, and applying a stock count requires
 * `stock_counts.apply` — both are on the owner+manager capability set by default, with staff
 * holding neither. This checks the default system-role mapping only; a business that has edited
 * a custom role's capabilities (Roles & Permissions) can grant either one to a "staff" user, and
 * this has no way to see that from the frontend today — so treat a `false` here as "hide the
 * action to spare the common case a failed request," never as a hard guarantee, and always let
 * the real 403 (which already surfaces the backend's own message) be the final word.
 */
export function canManagePurchasesByDefaultRole(role: Role): boolean {
  return role === "owner" || role === "manager";
}
export function canApplyStockCountsByDefaultRole(role: Role): boolean {
  return role === "owner" || role === "manager";
}
