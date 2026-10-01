/** Screen catalogue, icons and tones — taken verbatim from the Finance design (finance-model.js). */

export const IC: Record<string, string> = {
  overview: "M3 13h8V3H3zM13 21h8V11h-8zM13 3v6h8V3zM3 21h8v-6H3z",
  coa: "M4 4h6v6H4zM14 14h6v6h-6zM7 10v7h7",
  gl: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14ZM20 17v4H6.5A2.5 2.5 0 0 1 4 19.5",
  journals: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8ZM14 3v5h5M9 13h6M9 17h6",
  bankacc: "M3 10h18M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18M12 3l9 5H3z",
  feeds: "M4 4h16v4H4zM4 12h16M4 16h10M4 20h7",
  recon: "M7 16V4M3 8l4-4 4 4M17 8v12M21 16l-4 4-4-4",
  ar: "M12 3v14M6 11l6 6 6-6M5 21h14",
  ap: "M12 21V7M6 13l6-6 6 6M5 3h14",
  bills: "M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4",
  taxes: "M19 5 5 19M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
  fa: "M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6",
  budgets: "M12 3v9l7 4M21 12a9 9 0 1 1-9-9",
  statements: "M3 3v18h18M7 15l4-4 3 3 5-6",
  close: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  settings: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  alert: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  spark: "M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2Z",
  cash: "M2 7h20v10H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 12h.01M18 12h.01",
};

export interface ScreenDef {
  k: string;
  slug: string;
  g: string;
  l: string;
  short?: string;
  sub: string;
  primary: string;
  pa: string;
  sec: [string, string][];
}

export const SCREENS: ScreenDef[] = [
  { k: "overview", slug: "", g: "Overview", l: "Finance Overview", sub: "See the health of your books, balances, reconciliations and close process.", primary: "Review Finance Actions", pa: "reviewActions", sec: [["Reconcile", "go:recon"], ["New Journal", "newJournal"], ["Start Close", "go:close"]] },
  { k: "coa", slug: "accounts", g: "Books", l: "Chart of Accounts", sub: "Manage the accounts used to classify every accounting transaction.", primary: "Add Account", pa: "addAccount", sec: [["Export", "export"]] },
  { k: "gl", slug: "ledger", g: "Books", l: "General Ledger", sub: "Review posted debits and credits and trace every amount back to its source.", primary: "Explore Ledger", pa: "exploreLedger", sec: [["Export", "export"]] },
  { k: "journals", slug: "journals", g: "Books", l: "Journal Entries", sub: "Create, review, approve, post and reverse manual and system journals.", primary: "New Journal", pa: "newJournal", sec: [] },
  { k: "bankacc", slug: "bank-accounts", g: "Banking", l: "Bank & Cash Accounts", sub: "The accounting view of every bank, cash, card and clearing account.", primary: "Add / Connect Account", pa: "addBank", sec: [["Import Statement", "importStatement"]] },
  { k: "feeds", slug: "bank-feeds", g: "Banking", l: "Bank Feeds", sub: "Imported bank transactions waiting to be matched or categorized. Suggestions are never applied without you.", primary: "Review Transactions", pa: "reviewFeed", sec: [["Create Bank Rule", "createRule"]] },
  { k: "recon", slug: "reconciliation", g: "Banking", l: "Reconciliation", sub: "Prove each bank and cash balance against the ledger, then lock it.", primary: "Start Reconciliation", pa: "startRecon", sec: [] },
  { k: "ar", slug: "receivables", g: "Receivables & Payables", l: "Accounts Receivable", sub: "What customers owe you, by age — the accounting balance behind your sales.", primary: "Review Overdue", pa: "seg:Overdue", sec: [["Export Statement Data", "export"]] },
  { k: "ap", slug: "payables", g: "Receivables & Payables", l: "Accounts Payable", sub: "What you owe vendors, when it is due and what is cleared for payment.", primary: "Review Due Payments", pa: "seg:Due this week", sec: [["Export", "export"]] },
  { k: "bills", slug: "bills", g: "Receivables & Payables", l: "Bills", sub: "Capture, check and post vendor bills. Nothing posts until it is reviewed and approved.", primary: "Add Bill", pa: "addBill", sec: [["Scan Bill", "scanBill"], ["Import Bill", "importBill"]] },
  { k: "taxes", slug: "taxes", g: "Compliance & Assets", l: "Taxes", sub: "Tax collected and recoverable, what you owe, and every return from calculation to filed evidence.", primary: "Review Tax Period", pa: "reviewTax", sec: [["Tax & Currency Settings", "go:settings"]] },
  { k: "fa", slug: "fixed-assets", g: "Compliance & Assets", l: "Fixed Assets Accounting", sub: "Capitalization, depreciation and disposal for the assets your business owns.", primary: "Capitalize Asset", pa: "capitalize", sec: [["Run Depreciation", "runDep"]] },
  { k: "budgets", slug: "budgets", g: "Planning", l: "Budgets & Forecasts", sub: "Approved budgets and forecast versions, compared against posted actuals.", primary: "Create Budget", pa: "createBudget", sec: [["Import Spreadsheet", "importBudget"]] },
  { k: "statements", slug: "statements", g: "Reporting & Close", l: "Financial Statements", sub: "Profit & Loss, Balance Sheet and Cash Flow built only from the posted ledger.", primary: "View Statements", pa: "viewStatements", sec: [["Export", "exportStmt"]] },
  { k: "close", slug: "close", g: "Reporting & Close", l: "Period Close", sub: "Work through month-end controls, clear blockers, then approve and lock the period.", primary: "Start Close", pa: "startClose", sec: [] },
  { k: "settings", slug: "settings", g: "Configure", l: "Accounting Settings & Accountant Access", short: "Settings & Access", sub: "Accounting policy, periods, approvals, controls and who can do what.", primary: "Save Settings", pa: "saveSettings", sec: [] },
];

export const GROUPS = ["Overview", "Books", "Banking", "Receivables & Payables", "Compliance & Assets", "Planning", "Reporting & Close", "Configure"];

export const screenOf = (pathname: string): ScreenDef => {
  const slug = pathname.replace(/^\/finance\/?/, "").split("/")[0] ?? "";
  return SCREENS.find((s) => s.slug === slug) ?? SCREENS[0];
};
export const hrefOf = (k: string) => {
  const s = SCREENS.find((x) => x.k === k);
  return s ? `/finance${s.slug ? `/${s.slug}` : ""}` : "/finance";
};

const PAL: Record<string, [string, string]> = {
  green: ["#E8F7EE", "#0E8442"],
  amber: ["#FEF6E7", "#B54708"],
  blue: ["#EFF8FF", "#175CD3"],
  violet: ["#F4F3FF", "#5925DC"],
  red: ["#FEF3F2", "#B42318"],
  gray: ["#F2F4F7", "#475467"],
  dark: ["#0A1B2A", "#FFFFFF"],
};
const TONE: Record<string, string> = {};
const setT = (t: string, l: string) => l.split("|").forEach((s) => (TONE[s] = t));
setT("green", "Posted|Reconciled|Matched|Filed|Completed|Active|Paid|Balanced|Healthy|Done|Capitalized|On Budget|Favorable|Current|N/A|3-Way Matched|Approved · Active|OK|Connected|Accepted|Fully Depreciated|Ready to Post");
setT("amber", "Pending Review|Needs Review|Review Required|Suggested|Part Paid|Partially Paid|On Hold|Due Soon|Estimated|Partial|Payment Pending|Open|Soft Close|Revised|Stale|Review|Qty Exception|Price Exception|Possible Duplicate|Due this week|Material|Temporary|Reopened|Not Started|Due");
setT("violet", "Approval Required|Submitted");
setT("blue", "Approved|Posting|Processing|In Progress|Calculated|Ready to Reconcile|Approved for Payment|High Confidence|Requested|New|Invited|Pending Approval");
setT("red", "Failed|Overdue|Not Reconciled|Blocked|Disputed|Reauthorize|Unfavorable|Mismatch|Critical|Missing Data|Out of Balance|Rejected|Not connected|Cannot Post");
setT("gray", "Draft|Excluded|Reversed|Voided|Inactive|Archived|Pending|Header|No PO|Not submitted|Manual|Expired|Revoked|Disposed|Never imported|Not run");
setT("dark", "Locked|Hard Closed");
TONE["Ready to Post"] = "blue";

export function chip(s: string) {
  const p = PAL[TONE[s] ?? "gray"];
  return { bg: p[0], fg: p[1] };
}

export function money(n: number | null | undefined, cur = "USD", dp = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  let s: string;
  try {
    s = new Intl.NumberFormat("en-US", { style: "currency", currency: cur, minimumFractionDigits: dp, maximumFractionDigits: dp }).format(Math.abs(n));
  } catch {
    s = `${cur} ${Math.abs(n).toFixed(dp)}`;
  }
  return (n < 0 ? "−" : "") + s;
}

export const num = (v: string | number | null | undefined) => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isNaN(n) ? 0 : n;
};
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const todayIso = () => new Date().toISOString().slice(0, 10);
export const mdy = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

export const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

export const ACCOUNT_TYPES: [string, string][] = [
  ["asset", "Asset"],
  ["liability", "Liability"],
  ["equity", "Equity"],
  ["revenue", "Revenue"],
  ["cos", "Cost of Sales"],
  ["expense", "Expense"],
  ["other_inc", "Other Income"],
  ["other_exp", "Other Expense"],
];
