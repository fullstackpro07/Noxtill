import type { SlaState, TRow } from "@/lib/helpdesk-api";

// ── design constants ─────────────────────────────────────────────────────────

export const TABS: Array<[key: string, label: string, href: string, title: string, sub: string, icon: string]> = [
  ["overview", "Overview", "/helpdesk", "Helpdesk", "Support overview", "M3 14v-2a9 9 0 0 1 18 0v2M3 14h3v6H4a1 1 0 0 1-1-1ZM21 14h-3v6h2a1 1 0 0 0 1-1Z"],
  ["tickets", "All Tickets", "/helpdesk/tickets", "All Tickets", "Every support ticket you can access", "M4 5h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4ZM13 5v2M13 11v2M13 17v2"],
  ["detail", "Ticket Detail", "/helpdesk/tickets", "Ticket", "", "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2ZM8 9h8M8 13h5"],
  ["queues", "Queues & Assignments", "/helpdesk/queues", "Queues & Assignments", "Where tickets go and who handles them", "M3 6h18M3 12h12M3 18h6M17 15l3 3-3 3"],
  ["sla", "SLA & Escalations", "/helpdesk/sla", "SLA & Escalations", "Response and resolution commitments", "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2"],
  ["kb", "Knowledge Base", "/helpdesk/knowledge", "Knowledge Base", "Support articles for agents and customers", "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5ZM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"],
  ["macros", "Macros & Saved Replies", "/helpdesk/macros", "Macros & Saved Replies", "Reduce repetitive support work", "M13 2 3 14h9l-1 8 10-12h-9Z"],
  ["csat", "Customer Satisfaction", "/helpdesk/csat", "Customer Satisfaction", "Private support CSAT — separate from public Reviews & Reputation", "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"],
  ["analytics", "Analytics", "/helpdesk/analytics", "Helpdesk Analytics", "Support performance", "M3 3v18h18M7 15l3-4 3 3 5-6"],
  ["settings", "Settings", "/helpdesk/settings", "Helpdesk Settings", "Configure Helpdesk behaviour", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"],
];

export function screenOf(pathname: string): { key: string; number: string | null } {
  const sub = pathname.replace(/^\/helpdesk/, "").replace(/\/$/, "");
  const m = /^\/tickets\/([^/]+)/.exec(sub);
  if (m) return { key: "detail", number: decodeURIComponent(m[1]) };
  const t = TABS.find((x) => x[0] !== "detail" && x[2] === "/helpdesk" + sub);
  return { key: t ? t[0] : "overview", number: null };
}

export const PRI: Record<string, [string, string, string, number]> = {
  Urgent: ["#B42318", "#FEF3F2", "▲▲", 0],
  High: ["#B54708", "#FEF6E7", "▲", 1],
  Normal: ["#344054", "#F2F4F7", "●", 2],
  Low: ["#475467", "#F8F9FB", "▽", 3],
};
export const ST: Record<string, [string, string]> = {
  New: ["#175CD3", "#EFF8FF"],
  Open: ["#0E8442", "#ECFDF3"],
  "In Progress": ["#6941C6", "#F4F3FF"],
  "Waiting on Customer": ["#B54708", "#FEF6E7"],
  "Waiting on Internal Team": ["#C11574", "#FDF2FA"],
  Resolved: ["#067647", "#ECFDF3"],
  Closed: ["#475467", "#F2F4F7"],
};
export const PRIORITIES = ["Urgent", "High", "Normal", "Low"];
export const LINK_TYPES: Record<string, { prefix: string; available: boolean; why?: string }> = {
  Order: { prefix: "ORD-", available: true },
  Booking: { prefix: "BK-", available: true },
  Project: { prefix: "PRJ-", available: true },
  Invoice: { prefix: "INV-", available: false, why: "no invoicing module yet" },
  Payment: { prefix: "PAY-", available: false, why: "link the order instead" },
  Contract: { prefix: "CTR-", available: true },
  Asset: { prefix: "FA-", available: true },
  "Field Service job": { prefix: "FS-", available: true },
};
export const FILE_OK = ["jpg", "jpeg", "png", "gif", "webp", "pdf", "txt", "csv", "doc", "docx", "xls", "xlsx"];
export const ESC_REASONS = ["SLA at risk", "Customer complaint", "VIP customer", "Technical blocker", "Needs manager approval", "Other"];

export const METRIC: Record<string, [string, string]> = {
  frt: ["Avg First Response", "Mean minutes from ticket creation to the first customer-visible agent reply. Internal notes and system events do not count."],
  res: ["Avg Resolution", "Mean time from creation to Resolved. SLA pause time is not subtracted here — see SLA & Escalations for SLA-clock values."],
  comp: ["SLA Compliance", "Share of tickets in scope that are not breached (open) or missed (resolved)."],
  f: ["First Response Time", "Average first response for tickets matching the analytics filters."],
  t: ["Resolution Time", "Average creation-to-resolved time for tickets matching the filters."],
  x: ["CSAT", "Share of 4–5 star responses. Private support feedback, never published."],
  o: ["Reopen Rate", "Tickets reopened at least once ÷ tickets created in range."],
  score: ["CSAT Score", "Share of 4–5 star ratings across all responses."],
  resp: ["Responses", "Survey responses received."],
  rate: ["Response Rate", "Responses ÷ surveys actually sent. Scheduled-but-unsent surveys are excluded."],
  views: ["Views", "Article views from the help center, customer portal and agent side panel."],
  help: ["Helpful %", "Helpful votes ÷ total votes, weighted by views."],
};

// ── view-model types (the design's block contract) ───────────────────────────

export interface Btn {
  k: string;
  t: string;
  bg: string;
  fg: string;
  bd: string;
  dis: boolean;
  why: string;
}
export interface Cell {
  t: string;
  s: string;
  bt: string;
  bfg: string;
  bbg: string;
  fw: number;
  fg: string;
  ff: string;
  mw: string;
  opt: string;
}
export interface Col {
  t: string;
  sk?: string | null;
  plain: boolean;
  opt: string;
  fg: string;
  arrow: string;
  aria: string;
}
export interface TableRow {
  id: string;
  on?: boolean;
  bg: string;
  selLabel?: string;
  actLabel?: string;
  acts?: string[];
  cells: Cell[];
  cardT: string;
  cardS: string;
  cardB: Array<{ t: string; bg: string; fg: string }>;
}
export interface Table {
  sel?: boolean;
  allOn?: boolean;
  hasActs: boolean;
  cols: Col[];
  rows: TableRow[];
}
export interface Kpi {
  k: string;
  l: string;
  v: string;
  sub: string;
  fg: string;
  dot: string;
  aria: string;
}
export interface Bar {
  l: string;
  v: string;
  w: string;
  c: string;
  aria: string;
}
export interface Trend {
  legend: Array<{ c: string; t: string }>;
  note: string;
  aria: string;
  cols: Array<{ l: string; tip: string; bars: Array<{ c: string; h: string }> }>;
}
export interface QCard {
  id: string;
  t: string;
  aria: string;
  d: string;
  badge: string;
  bbg: string;
  bfg: string;
  bg: string;
  stats: Array<{ l: string; v: string | number; fg: string }>;
}
export interface SelF {
  k: string;
  l: string;
  v: string;
  opts: Array<{ v: string; t: string }>;
  bg: string;
  bd: string;
}
export interface Filters {
  search: string | null;
  q: string;
  sels: SelF[];
  nOn: number | null;
  count: string;
}
export interface Seg {
  k: string;
  t: string;
  n: string;
  on: boolean;
  bg: string;
  fg: string;
  bd: string;
}
export interface Card {
  card: true;
  id?: string;
  title?: string;
  sub?: string;
  acts?: Btn[];
  seg?: Seg[] | null;
  filters?: Filters | null;
  bulk?: { n: number; acts: Btn[] } | null;
  table?: Table | null;
  bars?: Bar[] | null;
  trend?: Trend | null;
  qcards?: QCard[] | null;
  empty?: { t: string; d: string; acts: Btn[] } | null;
  pager?: { t: string; noPrev: boolean; noNext: boolean } | null;
  info?: string | null;
  api?: string | null;
}
export type Block = { kpis: Kpi[] } | Card;
export interface LayoutRow {
  cols: string;
  blocks: Block[];
  collapse: "0" | "1";
}

// ── builders (ported from the design) ────────────────────────────────────────

export function btn(k: string, t: string, kind: "primary" | "dark" | "danger" | "ghost" = "ghost", dis = false, why?: string | null): Btn {
  const K = { primary: ["#12A150", "#fff", "#12A150"], dark: ["#0A1B2A", "#fff", "#0A1B2A"], danger: ["#fff", "#B42318", "#FDD9D6"], ghost: ["#fff", "#344054", "#E6EAF0"] }[kind];
  return { k, t, bg: K[0], fg: K[1], bd: K[2], dis: !!dis, why: dis ? why || "Not permitted for your role" : "" };
}
export function O(arr: Array<string | { v: string; t: string }>, all?: string | null): Array<{ v: string; t: string }> {
  return [...(all != null ? [{ v: "", t: all }] : []), ...arr.map((x) => (typeof x === "string" ? { v: x, t: x } : x))];
}
export function priB(p: string) {
  const P = PRI[p] ?? PRI.Normal;
  return { bt: `${P[2]} ${p}`, bfg: P[0], bbg: P[1] };
}
export function stB(s: string) {
  const C = ST[s] ?? ["#6941C6", "#F4F3FF"];
  return { bt: s, bfg: C[0], bbg: C[1] };
}
export function cell(o: Partial<Cell>): Cell {
  return { t: "", s: "", bt: "", bfg: "", bbg: "", fw: 500, fg: "#344054", ff: "inherit", mw: "none", opt: "0", ...o };
}
export function K(k: string, l: string, v: string | number, sub: string, fg?: string | null, dot?: string): Kpi {
  return { k, l, v: String(v), sub, fg: fg || "#0F172A", dot: dot || "#D0D5DD", aria: `${l}: ${v}. ${sub}. Open.` };
}
export function mkBars(items: Array<[string, number, string?]>, color?: string, fmt?: (v: number) => string): Bar[] {
  const max = Math.max(1, ...items.map((x) => x[1]));
  return items.map(([l, v, c]) => ({ l, v: fmt ? fmt(v) : String(v), w: Math.max(2, Math.round((v / max) * 100)) + "%", c: c || color || "#12A150", aria: `${l}: ${fmt ? fmt(v) : v}` }));
}
export function mkTrend(labels: string[], series: Array<{ t: string; c: string; v: number[] }>, note: string, aria: string): Trend {
  const max = Math.max(1, ...series.flatMap((s) => s.v));
  // Long ranges: label every nth column so dates stay readable (tooltips keep every date).
  const step = labels.length > 16 ? Math.ceil(labels.length / 10) : 1;
  return {
    legend: series.map((s) => ({ c: s.c, t: s.t })),
    note,
    aria,
    cols: labels.map((l, i) => ({ l: i % step === 0 || i === labels.length - 1 ? l : "", tip: `${l}: ${series.map((s) => `${s.t} ${s.v[i]}`).join(", ")}`, bars: series.map((s) => ({ c: s.c, h: Math.max(2, Math.round((s.v[i] / max) * 100)) + "%" })) })),
  };
}
export function seg(items: Array<[string, string, number | null | undefined]>, cur: string): Seg[] {
  return items.map(([k, t, n]) => ({ k, t, n: n == null ? "" : String(n), on: k === cur, bg: k === cur ? "#0A1B2A" : "#fff", fg: k === cur ? "#fff" : "#344054", bd: k === cur ? "#0A1B2A" : "#E6EAF0" }));
}
export function card(o: Omit<Card, "card">): Card {
  return { card: true, title: "", sub: "", acts: [], seg: null, filters: null, bulk: null, table: null, bars: null, trend: null, qcards: null, empty: null, pager: null, info: null, api: null, ...o };
}
export function R(cols: string, blocks: Block[], collapse = true): LayoutRow {
  return { cols, blocks, collapse: collapse ? "1" : "0" };
}
export function kpiRow(kpis: Kpi[]): LayoutRow {
  return R("minmax(0,1fr)", [{ kpis }], false);
}
export function plainCols(names: string[], opt: number[] = []): Col[] {
  return names.map((t, i) => ({ t, plain: true, opt: opt.includes(i) ? "1" : "0", fg: "#667085", arrow: "", aria: "none" }));
}
export function sel(k: string, l: string, v: string, opts: Array<{ v: string; t: string }>): SelF {
  return { k, l, v, opts, bg: v ? "#F7FCF9" : "#fff", bd: v ? "#12A150" : "#E6EAF0" };
}

// ── time & format ────────────────────────────────────────────────────────────

export function fmtM(m: number | null | undefined): string {
  if (m == null) return "—";
  m = Math.max(0, Math.round(m));
  if (m < 60) return m + "m";
  if (m < 1440) return Math.floor(m / 60) + "h" + (m % 60 ? " " + (m % 60) + "m" : "");
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return d + "d" + (h ? " " + h + "h" : "");
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function dt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const h = d.getHours();
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
export function ago(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = (Date.now() - new Date(iso).getTime()) / 60000;
  if (m < 1) return "just now";
  if (m < 60) return Math.round(m) + "m ago";
  if (m < 1440) return Math.floor(m / 60) + "h ago";
  if (m < 2880) return "Yesterday";
  return dt(iso).split(",")[0];
}
export function initials(n: string): string {
  return n
    .split(" ")
    .map((x) => x[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
export function fileSize(n: number): string {
  return n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
}
export function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ── shared ticket table (compact / full) ─────────────────────────────────────

export function slaCell(s: SlaState): Cell {
  return cell({ bt: s.t, bfg: s.fg, bbg: s.bg, s: s.sub });
}

export function rowActs(t: TRow, can: (c: string) => boolean): string[] {
  const a = ["Open"];
  if (t.open) {
    if (can(t.agentUserId ? "Reassign" : "Assign")) a.push(t.agentUserId ? "Reassign" : "Assign");
    if (can("Change priority")) a.push("Change priority");
    if (can("Resolve")) a.push("Resolve");
    if (can("Close")) a.push("Close");
  } else if (!t.mergedInto) a.push("Reopen");
  return a;
}

const LAST: Record<string, string> = { cust: "Customer", reply: "Agent reply", note: "Internal note", sys: "System" };

export function ticketTable(list: TRow[], mode: "full" | "compact", o: { sel?: string[]; selectable?: boolean; sort?: string; can: (c: string) => boolean }): Table {
  const full = mode === "full";
  const S = o.sel ?? [];
  const cols: Array<[string, string | null, string?]> = full
    ? [["Ticket #", "newest"], ["Subject", null], ["Customer", "customer"], ["Channel", null, "1"], ["Category", null, "1"], ["Priority", "priority"], ["Status", null], ["Assigned to", null], ["SLA", "sla"], ["Created", "oldest", "1"], ["Last updated", "updated", "1"]]
    : [["Ticket #", null], ["Subject", null], ["Customer", null, "1"], ["Priority", null], ["Status", null], ["Assigned", null, "1"], ["SLA", null], ["Last activity", null, "1"], ["Channel", null, "1"]];
  return {
    sel: !!o.selectable,
    allOn: !!o.selectable && list.length > 0 && list.every((t) => S.includes(t.number)),
    hasActs: full,
    cols: cols.map(([t, sk, opt]) => {
      const on = full && !!sk && o.sort === sk;
      return { t, sk: full ? sk : null, plain: !(full && sk), opt: opt || "0", fg: on ? "#0E8442" : "#667085", arrow: on ? "↓" : "", aria: on ? "descending" : "none" };
    }),
    rows: list.map((t) => {
      const s = t.sla;
      const P = priB(t.priority);
      const Sb = stB(t.status);
      const idC = cell({ t: t.number, ff: "ui-monospace,SFMono-Regular,monospace", fw: 800, fg: "#101828", s: t.escalated ? "⚑ Escalated" : t.reopenCount ? "↺ Reopened" : "" });
      const subj = cell({ t: t.subject, fw: 700, fg: "#101828", mw: "320px", s: full ? (t.tags.length ? t.tags.map((g) => "#" + g).join(" ") : "") : t.customerName });
      const cu = cell({ t: t.customerName, s: t.segment || t.branchName, opt: full ? "0" : "1" });
      const ag = cell({ t: t.agentName, fg: t.agentUserId ? "#344054" : "#B54708", fw: t.agentUserId ? 500 : 700, s: full ? t.queueName : "" });
      const cells = full
        ? [idC, subj, cu, cell({ t: t.channel, opt: "1", s: t.conversationId ? "Unified Inbox" : "" }), cell({ t: t.category, opt: "1", s: t.subcategory ?? "" }), cell(P), cell(Sb), ag, slaCell(s), cell({ t: ago(t.createdAt), opt: "1", s: t.branchName }), cell({ t: ago(t.updatedAt), opt: "1" })]
        : [idC, subj, cu, cell(P), cell(Sb), { ...ag, opt: "1" }, slaCell(s), cell({ t: ago(t.updatedAt), opt: "1", s: t.lastKind ? LAST[t.lastKind] : "" }), cell({ t: t.channel, opt: "1" })];
      const on = S.includes(t.number);
      return {
        id: t.number,
        on,
        bg: on ? "#F7FCF9" : "#fff",
        selLabel: "Select " + t.number,
        actLabel: "Actions for " + t.number,
        acts: rowActs(t, o.can),
        cells,
        cardT: `${t.number} · ${t.subject}`,
        cardS: `${t.customerName} · ${t.agentName} · ${ago(t.updatedAt)}`,
        cardB: [
          { t: P.bt, bg: P.bbg, fg: P.bfg },
          { t: Sb.bt, bg: Sb.bbg, fg: Sb.bfg },
          { t: s.t, bg: s.bg, fg: s.fg },
        ],
      };
    }),
  };
}

// ── macro conditions (mirror of backend helpdesk-conditions.util.ts) ─────────

const COND_FIELDS = ["category", "queue", "channel", "status", "priority", "branch", "tag"];

/** Whether a macro's conditions ("Category = Billing AND Tag != vip") hold for a ticket. */
export function macroMatches(conditions: string, t: Pick<TRow, "category" | "queueName" | "channel" | "status" | "priority" | "branchName" | "tags">): boolean {
  const text = (conditions ?? "").trim();
  if (!text || /^any ticket$/i.test(text)) return true;
  const eq = (a: string | null | undefined, b: string) => (a ?? "").toLowerCase() === b.toLowerCase();
  return text
    .split(/\s+and\s+|,/i)
    .map((x) => x.trim())
    .filter(Boolean)
    .every((part) => {
      const m = /^([a-z]+)\s*(!=|=)\s*(.+)$/i.exec(part);
      if (!m || !COND_FIELDS.includes(m[1].toLowerCase())) return false;
      const f = m[1].toLowerCase();
      const v = m[3].trim().replace(/^#/, "");
      const val = f === "queue" ? t.queueName : f === "branch" ? t.branchName : f === "category" ? t.category : f === "channel" ? t.channel : f === "status" ? t.status : f === "priority" ? t.priority : null;
      const hit = f === "tag" ? t.tags.some((g) => eq(g, v)) : eq(val, v);
      return m[2] === "!=" ? !hit : hit;
    });
}
