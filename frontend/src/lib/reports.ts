export type ReportKind = "monthly" | "pnl" | "sales" | "staff" | "reviews" | "credit_recovery" | "tax";

export interface ReportDef {
  key: ReportKind;
  label: string;
  description: string;
}

/** Matches the backend's report set (BE-076) — role gate (staff sees own-sales only) is enforced server-side once live. */
export const REPORT_DEFS: ReportDef[] = [
  { key: "monthly", label: "Monthly summary", description: "Revenue, orders, and reviews in one PDF." },
  { key: "pnl", label: "Profit & loss", description: "Revenue minus COGS and expenses for the month." },
  { key: "sales", label: "Sales report", description: "Every order, itemized, for a date range." },
  { key: "staff", label: "Staff performance", description: "Sales and commissions per team member." },
  { key: "reviews", label: "Reviews summary", description: "Rating trend and response rate across platforms." },
  { key: "tax", label: "Tax report", description: "Taxable sales and tax collected for the month." },
];

export interface ExcelExportDef {
  key: string;
  label: string;
}

/** Matches GET /exports/{...}.xlsx (BE-077). */
export const EXCEL_EXPORTS: ExcelExportDef[] = [
  { key: "sales", label: "Sales" },
  { key: "customers", label: "Customers" },
  { key: "credit", label: "Credit" },
  { key: "stock", label: "Stock" },
  { key: "expenses", label: "Expenses" },
];
