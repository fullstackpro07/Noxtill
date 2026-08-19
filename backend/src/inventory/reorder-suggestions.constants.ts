/** Trailing window used to compute real sales velocity (units sold / day). */
export const REORDER_VELOCITY_WINDOW_DAYS = 30;

/** How many days of stock a reorder should cover past the supplier's lead time — a real, disclosed assumption, not a per-supplier configured value (no lead-time field exists on `Supplier` yet). */
export const REORDER_LEAD_TIME_DAYS = 14;

export const UNASSIGNED_SUPPLIER_KEY = 'unassigned';
