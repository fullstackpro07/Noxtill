import { apiFetch, BASE_URL } from "./api-client";
import { useAuthStore } from "@/store/auth-store";
import { useBranchContextStore } from "@/store/branch-context-store";

const F = "/finance";

const qs = (o: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};
const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

/* ── shapes the Finance screens render (built server-side from real data) ── */

export interface FinCell {
  t: string;
  sub: string;
  isText: boolean;
  isChip: boolean;
  fw: number;
  color: string;
  ta: string;
  ai: string;
  pl: string;
  bg?: string;
  fg?: string;
}
export interface FinRow {
  id: string;
  seg: string[];
  text: string;
  cells: FinCell[];
  bg?: string;
  f?: Record<string, string>;
}
export interface FinTable {
  title: string;
  count: string;
  cols: [string, number?][];
  grid: string;
  minW: number;
  segs: string[];
  filters: [string, string[]][];
  moreFilters?: string[];
  rows: FinRow[];
}
export interface FinKpi {
  label: string;
  value: string;
  state: string;
  hasSt: boolean;
  stBg: string;
  stFg: string;
  icBg: string;
  icFg: string;
  meta: string;
  def: string;
  adv: string;
  go: string;
  seg: string;
  ic: string;
}
export interface FinNotice {
  bg: string;
  bd: string;
  fg: string;
  body_fg: string;
  title: string;
  body: string;
  al: string;
  a: string;
  hasA: boolean;
}
export interface FinFlowStep {
  l: string;
  n: string;
  bg: string;
  fg: string;
  bd: string;
  lc: string;
  lw: number;
  bar: string;
  last: boolean;
  barVis: string;
  sr: string;
}
export interface FinFlow {
  title: string;
  note: string;
  steps: FinFlowStep[];
}
export interface StmtRow {
  kind: string;
  l: string;
  a: string;
  b: string;
  c: string;
  code: string;
  fw: number;
  fs: string;
  col: string;
  tt: string;
  bt: string;
  bg: string;
  pt: string;
  pl: string;
  i: string;
  drill: boolean;
  cur: string;
}
export interface SettingRow {
  k?: string;
  l: string;
  d: string;
  val?: string;
  isSel: boolean;
  isTog: boolean;
  isStatic: boolean;
  opts?: string[];
  on?: boolean;
  locked?: boolean;
  tbg?: string;
  tx?: string;
  word?: string;
  a?: string;
  al?: string;
}

export interface Screen {
  notices: FinNotice[];
  kpis: FinKpi[];
  kpis2: FinKpi[];
  flow: FinFlow | null;
  table: FinTable | null;
  freshness: string;
  scope: { branchId: string | null; period: string; periodLabel: string; periodStatus: string };
  attention?: { issue: string; impact: string; amt: string; hasAmt: boolean; due: string; owner: string; al: string; a: string; dot: string; sev: string }[];
  health?: { l: string; v: string; bg: string; fg: string; word: string; ip: string; al: string; a: string; hasA: boolean }[];
  healthAt?: string | null;
  brief?: { key: string; finding: string; why: string; sources: string; conf: string; impact: string; al: string; a: string; appr: string }[];
  aging?: { l: string; v: string; w: string; c: string }[];
  agingTitle?: string;
  versions?: { id: string; l: string; s: string; sub: string; bg: string; fg: string; bd: string; bw: string; sh: string }[];
  selectedBudget?: { id: string; name: string; version: number; status: string; fiscalYear: number } | null;
  emptyBudgets?: boolean;
  bankCards?: Record<string, string>[];
  emptyBanks?: boolean;
  closeInfo?: { period: string; periodKey: string; runId: string | null; pct: string; w: string; done: number; total: number; target: string; owner: string; status: string; sBg: string; sFg: string; canFinal: boolean; started: boolean; fwhy: string };
  blockers?: { l: string; d: string; a: string; al: string }[];
  cutoff?: { ref: string; d: string; m: string }[];
  periods?: { id: string; l: string; s: string; d: string; bg: string; fg: string; canReopen: boolean }[];
  depr?: { title: string; rows: { a: string; open: string; dep: string; close: string; m: string }[]; total: string; status: string; je: string; blocked: string | null; canRun: boolean; period: string };
  pending?: { billId: string; bill: string; vendor: string; description: string; amount: number; date: string }[];
  stmt?: { type: string; tabs: { k: string; l: string; bg: string; fg: string; sh: string }[]; rows: StmtRow[]; title: string; sub: string; basis: string; hA: string; hB: string; hC: string; showB: boolean; showC: boolean; integrity: { ta: string; tle: string; d: string } | null; ok: boolean; grid: string; check: string; cmp: boolean };
  settings?: {
    version: number;
    sections: { id: string; t: string; d: string; rows: SettingRow[] }[];
    th: { a: string; b: string }[];
    sod: SettingRow[];
    people: { id: string; n: string; f: string; sc: string; p: string; e: string; s: string; bg: string; fg: string; canRevoke: boolean }[];
    nav: string[];
    expenseCategories: string[];
    expenseMap: Record<string, string>;
    canEdit: boolean;
    isOwner: boolean;
  };
  glFilters?: { accounts: { id: string; l: string }[]; sources: { k: string; l: string }[] };
  feedFilter?: { banks: { id: string; l: string }[]; bankId: string | null };
}

export interface Boot {
  actor: { name: string; title: string; role: string; view: boolean; manage: boolean; approve: boolean; admin: boolean; scoped: boolean };
  entity: string;
  base: string;
  branches: { id: string; name: string; currency: string }[];
  allBranches: boolean;
  periods: { k: string; l: string }[];
  badges: Record<string, number>;
  sweep: { lastSweepAt: string | null; backfilledAt: string | null; error: string | null; running: boolean };
  settingsVersion: number;
  periodStatus: Record<string, string>;
  departments: string[];
  thresholds: { journalDirect: number; journalOwner: number; billOwner: number };
  accounts: { id: string; code: string; name: string; type: string; header: boolean; active: boolean; control: string | null; currency: string | null; systemKey: string | null }[];
  taxCodes: { code: string; name: string; rate: string | number; kind: string }[];
  bankAccounts: { id: string; name: string; mask: string | null; currency: string; kind: string; glAccountId: string; active: boolean }[];
}

export interface ListItem {
  t: string;
  s: string;
  v: string;
  k?: string;
}
export interface Rec {
  kind: string;
  title: string;
  sub: string;
  status: string;
  amount: string;
  tabs: string[];
  kv: [string, string][];
  adv: [string, string][];
  note: string;
  noteTone: "info" | "warn" | "bad";
  lines: { acct: string; desc: string; dr: number | null; cr: number | null }[];
  trace: { mod: string; ref: string; d: string; href?: string; open?: string }[];
  lists: Record<string, ListItem[]>;
  actions: { l: string; a: string; kind: "p" | "s" | "d"; dis?: boolean; why?: string }[];
  compare?: { left: [string, string][]; right: [string, string][]; diff: string; dfg: string; conf: string; ev: string; hasRight: boolean } | null;
  threeWay?: { rows: { a: string; b: string; c: string; d: string; e: string; fg: string }[]; tol: string } | null;
  evidence?: { type: string; id: string };
  minDate?: string;
  cur: string;
}

export interface Step {
  k: string;
  l: string;
  ok: boolean;
  d: string;
}

export interface ReconWorkspace {
  recon: { id: string; status: string; periodEnd: string; statementBalance: string; preparedById: string | null; reopenReason: string | null };
  account: { id: string; name: string; mask: string | null; currency: string };
  opening: number;
  statement: number;
  cleared: number;
  explained: number;
  diff: number;
  book: number;
  rows: { id: string; date: string; desc: string; amt: number; status: string; matched: boolean; timing: boolean; led: string | null; je: string | null; jeId: string | null; suggestion: string | null }[];
  outstanding: { id: string; date: string; amt: number; je: string; desc: string | null }[];
  matchedCount: number;
  openCount: number;
  preparer: string;
  approver: string | null;
  canApprove: boolean;
  sodOn: boolean;
  me: string;
}

export interface ScanResult {
  attachment: { key: string; name: string; size: number; type: string };
  vendor: string | null;
  supplierId: string | null;
  supplierName: string | null;
  invoiceNo: string | null;
  billDate: string | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  lines: { description: string | null; qty: number | null; unitPrice: number | null; total: number | null }[];
  confidence: Record<string, number>;
  basis: string;
}

export interface BillMeta {
  suppliers: { id: string; name: string; businessId: string }[];
  purchaseOrders: { id: string; ref: string; status: string; supplier: { id: string; name: string }; items: { id: string; productId: string; name: string; qtyOrdered: number; qtyReceived: number; unitCost: number }[] }[];
}

export type Scope = { period?: string; branch?: string; cur?: string };

export const finApi = {
  boot: () => apiFetch<Boot>(`${F}/boot`),
  screen: (key: string, q: Record<string, unknown>) => apiFetch<Screen>(`${F}/screen/${key}${qs(q)}`),
  record: (kind: string, id: string, q: Record<string, unknown>) => apiFetch<Rec>(`${F}/record/${kind}/${encodeURIComponent(id)}${qs(q)}`),
  workspace: (id: string) => apiFetch<ReconWorkspace>(`${F}/reconciliations/${id}`),
  sweep: (full = false) => apiFetch<{ sweep: { posted: number; reposted: number; reversed: number; failed: number; errors: string[] }; payouts: number }>(`${F}/sweep`, json("POST", { full })),
  dismiss: (key: string) => apiFetch(`${F}/brief/dismiss`, json("POST", { key })),
  approvals: () => apiFetch<{ id: string; subjectType: string; subjectId: string; title: string; amount: string | null; rule: string; approverRole: string; requestedBy: string; createdAt: string }[]>(`${F}/approvals`),
  approveGeneric: (id: string, comment?: string) => apiFetch(`${F}/approvals/${id}/approve`, json("POST", { comment })),
  rejectGeneric: (id: string, reason: string) => apiFetch(`${F}/approvals/${id}/reject`, json("POST", { reason })),

  createJournal: (b: Record<string, unknown>) => apiFetch<{ id: string; number: string; version: number }>(`${F}/journals`, json("POST", b)),
  updateJournal: (id: string, b: Record<string, unknown>) => apiFetch<{ id: string; number: string; version: number }>(`${F}/journals/${id}`, json("PUT", b)),
  journalAction: (id: string, action: "submit" | "review" | "post", body?: unknown) => apiFetch<{ ok?: boolean; steps?: Step[]; status?: string; journal?: { number: string; status: string; failureReason: string | null } }>(`${F}/journals/${id}/${action}`, json("POST", body ?? {})),
  approveJournal: (id: string, comment?: string) => apiFetch(`${F}/journals/${id}/approve`, json("POST", { comment })),
  rejectJournal: (id: string, reason: string) => apiFetch(`${F}/journals/${id}/reject`, json("POST", { reason })),
  voidJournal: (id: string, note?: string) => apiFetch(`${F}/journals/${id}/void`, json("POST", { note })),
  reverseJournal: (id: string, date: string, reason: string) => apiFetch<{ ok: boolean; steps: Step[]; reversal: { number: string; status: string } }>(`${F}/journals/${id}/reverse`, json("POST", { date, reason })),

  addAccount: (b: Record<string, unknown>) => apiFetch<{ pending: boolean; account: { code: string; name: string } | null }>(`${F}/accounts`, json("POST", b)),
  editAccount: (id: string, b: Record<string, unknown>) => apiFetch<{ pending: boolean }>(`${F}/accounts/${id}`, json("PATCH", b)),
  setActive: (id: string, active: boolean) => apiFetch(`${F}/accounts/${id}/active`, json("POST", { active })),

  addBank: (b: Record<string, unknown>) => apiFetch<{ id: string; name: string }>(`${F}/bank-accounts`, json("POST", b)),
  editBank: (id: string, b: Record<string, unknown>) => apiFetch(`${F}/bank-accounts/${id}`, json("PATCH", b)),
  importStatement: (id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return apiFetch<{ imported: number; duplicates: number; rows: number; closing: number | null }>(`${F}/bank-accounts/${id}/import`, { method: "POST", body: fd });
  },
  candidates: (lineId: string) => apiFetch<{ ledger: { id: string; date: string; journal: string; label: string | null; amount: number }[]; bills: { id: string; label: string; open: number; currency: string }[] }>(`${F}/bank-lines/${lineId}/candidates`),
  match: (lineId: string, b: Record<string, unknown> = {}) => apiFetch(`${F}/bank-lines/${lineId}/match`, json("POST", b)),
  split: (lineId: string, parts: { accountId: string; amount: number; description?: string }[]) => apiFetch(`${F}/bank-lines/${lineId}/split`, json("POST", { parts })),
  unmatch: (lineId: string) => apiFetch(`${F}/bank-lines/${lineId}/unmatch`, json("POST")),
  exclude: (lineId: string, reason: string) => apiFetch(`${F}/bank-lines/${lineId}/exclude`, json("POST", { reason })),
  rules: () => apiFetch<{ id: string; name: string; contains: string; direction: string; accountId: string; mode: string; hits: number }[]>(`${F}/bank-rules`),
  createRule: (b: Record<string, unknown>) => apiFetch<{ rescanned: number }>(`${F}/bank-rules`, json("POST", b)),
  deleteRule: (id: string) => apiFetch(`${F}/bank-rules/${id}`, json("DELETE")),

  startRecon: (b: Record<string, unknown>) => apiFetch<{ id: string }>(`${F}/reconciliations`, json("POST", b)),
  timing: (id: string, lineId: string, on: boolean, note?: string) => apiFetch(`${F}/reconciliations/${id}/timing`, json("POST", { lineId, on, note })),
  reconAction: (id: string, action: "submit" | "approve") => apiFetch(`${F}/reconciliations/${id}/${action}`, json("POST")),
  reopenRecon: (id: string, reason: string) => apiFetch(`${F}/reconciliations/${id}/reopen`, json("POST", { reason })),

  dispute: (orderId: string, reason: string) => apiFetch(`${F}/ar/${orderId}/dispute`, json("POST", { reason })),
  resolveDispute: (orderId: string, reason: string) => apiFetch(`${F}/ar/${orderId}/resolve`, json("POST", { reason })),
  collections: (itemId: string, tone: string) => apiFetch<{ sent: number; skipped: number }>(`${F}/ar/collections`, json("POST", { itemId, tone })),

  billDuplicates: (q: Record<string, unknown>) => apiFetch<{ id: string; number: string; vendorName: string; total: string }[]>(`${F}/bills/duplicates${qs(q)}`),
  billMeta: () => apiFetch<BillMeta>(`${F}/bills/meta`),
  bill: (id: string) => apiFetch<{ id: string; number: string; vendorName: string; supplierId: string | null; vendorInvoiceNo: string | null; billDate: string; dueDate: string; purchaseOrderId: string | null; branchId: string | null; currency: string; notes: string | null; intake: string; total: string; amountPaid: string; lines: { description: string; accountId: string; qty: string; unitCost: string; amount: string; taxCode: string | null; taxAmount: string; poItemId: string | null }[] }>(`${F}/bills/${id}`),
  scanBill: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return apiFetch<ScanResult>(`${F}/bills/scan`, { method: "POST", body: fd });
  },
  uploadBillDoc: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return apiFetch<{ key: string; name: string; size: number; type: string }>(`${F}/bills/upload`, { method: "POST", body: fd });
  },
  createBill: (b: Record<string, unknown>) => apiFetch<{ id: string; number: string; status: string }>(`${F}/bills`, json("POST", b)),
  updateBill: (id: string, b: Record<string, unknown>) => apiFetch<{ id: string; number: string; status: string }>(`${F}/bills/${id}`, json("PUT", b)),
  billAction: (id: string, action: string, body?: unknown) => apiFetch<{ number?: string }>(`${F}/bills/${id}/${action}`, json("POST", body ?? {})),
  voidPayment: (id: string, reason: string) => apiFetch(`${F}/bill-payments/${id}/void`, json("POST", { reason })),

  taxAction: (id: string, action: string, body?: unknown) => apiFetch(`${F}/tax/${id}/${action}`, json("POST", body ?? {})),
  taxCode: (b: Record<string, unknown>) => apiFetch(`${F}/tax-codes`, json("POST", b)),

  capitalize: (b: Record<string, unknown>) => apiFetch<{ number: string }>(`${F}/assets`, json("POST", b)),
  depPreview: (period: string) => apiFetch<{ rows: { id: string; name: string; number: string; open: number; dep: number; close: number; method: string }[]; total: number; run: { journalId: string; total: number } | null; blocked: string | null }>(`${F}/depreciation${qs({ period })}`),
  depRun: (period: string) => apiFetch<{ journal: { number: string }; total: number; assets: number }>(`${F}/depreciation`, json("POST", { period })),
  dispose: (id: string, b: Record<string, unknown>) => apiFetch<{ gain: number; journal: { number: string } }>(`${F}/assets/${id}/dispose`, json("POST", b)),

  budget: (id: string) => apiFetch<{ id: string; name: string; version: number; status: string; fiscalYear: number; lines: { accountId: string; year: number; month: number; amount: string; department: string | null }[]; months: { year: number; month: number }[] }>(`${F}/budgets/${id}`),
  createBudget: (b: Record<string, unknown>) => apiFetch<{ id: string; name: string; version: number }>(`${F}/budgets`, json("POST", b)),
  importBudget: (file: File, name: string, fiscalYear: number) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("name", name);
    fd.append("fiscalYear", String(fiscalYear));
    return apiFetch<{ created: { id: string; name: string; version: number } | null; errors: string[]; rows: number }>(`${F}/budgets/import`, { method: "POST", body: fd });
  },
  budgetLine: (id: string, b: Record<string, unknown>) => apiFetch(`${F}/budgets/${id}/line`, json("PUT", b)),
  budgetAction: (id: string, action: string, body?: unknown) => apiFetch<{ id?: string; name?: string; version?: number }>(`${F}/budgets/${id}/${action}`, json("POST", body ?? {})),

  startClose: (period: string) => apiFetch(`${F}/close/start`, json("POST", { period })),
  taskAction: (id: string, action: string, body?: unknown) => apiFetch(`${F}/close/tasks/${id}/${action}`, json("POST", body ?? {})),
  finalApprove: (runId: string) => apiFetch(`${F}/close/${runId}/final`, json("POST")),
  reopenPeriod: (key: string, reason: string) => apiFetch<{ requested: boolean }>(`${F}/periods/${key}/reopen`, json("POST", { reason })),

  setRate: (b: Record<string, unknown>) => apiFetch(`${F}/fx/rates`, json("POST", b)),
  fxPreview: (period: string) => apiFetch<{ rows: { code: string; name: string; currency: string; txn: number; booked: number; rate: number | null; target: number | null; diff: number }[]; missing: string[] }>(`${F}/fx/revaluation${qs({ period })}`),
  revalue: (period: string) => apiFetch<{ posted: number }>(`${F}/fx/revalue`, json("POST", { period })),
  saveSettings: (version: number, patch: Record<string, unknown>) => apiFetch<{ version: number; pendingOwner: boolean }>(`${F}/settings`, json("PUT", { version, patch })),
  invite: (b: Record<string, unknown>) => apiFetch<{ grant: { id: string }; tempPassword?: string }>(`${F}/access/invite`, json("POST", b)),
  revoke: (id: string) => apiFetch(`${F}/access/${id}/revoke`, json("POST")),

  attach: (type: string, id: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return apiFetch<{ name: string }>(`${F}/attach/${type}/${id}`, { method: "POST", body: fd });
  },
  fileUrl: (key: string) => apiFetch<{ url: string }>(`${F}/file${qs({ key })}`),
};

/** Downloads an export with the session's auth and branch headers. */
export async function finDownload(path: string, q: Record<string, unknown> = {}): Promise<string> {
  const token = useAuthStore.getState().accessToken;
  const branch = useBranchContextStore.getState().selectedBranchId;
  const res = await fetch(`${BASE_URL}${F}${path}${qs(q)}`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(branch ? { "X-Branch": branch } : {}) } });
  if (!res.ok) {
    let msg = `Export failed (${res.status})`;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      if (j.error?.message) msg = j.error.message;
    } catch {
      /* not JSON */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "export";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return name;
}
