export type ReportKind =
  | "monthly"
  | "pnl"
  | "sales"
  | "staff"
  | "reviews"
  | "inventory"
  | "credit_recovery"
  | "tax"
  | "marketing"
  | "product_performance";

export const REPORT_KIND_LABELS: Record<ReportKind, string> = {
  monthly: "Monthly business report",
  pnl: "Profit & loss",
  sales: "Sales report",
  staff: "Staff performance",
  reviews: "Reviews report",
  inventory: "Inventory report",
  credit_recovery: "Credit recovery",
  tax: "Tax summary",
  marketing: "Marketing performance",
  product_performance: "Product performance",
};
