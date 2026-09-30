"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { hdApi, hdDownload, hdQs, type TRow, type Workspace } from "@/lib/helpdesk-api";
import { blankTF, branchParam, useHd, useWorkspace } from "./hd-store";
import { useHdActions, type HdActions } from "./hd-actions";
import { Rows, Skeleton, type Handlers } from "./hd-render";
import {
  K,
  O,
  PRI,
  PRIORITIES,
  R,
  TABS,
  ago,
  btn,
  card,
  cell,
  errText,
  fmtM,
  kpiRow,
  mkBars,
  mkTrend,
  plainCols,
  priB,
  seg,
  sel,
  ticketTable,
  type LayoutRow,
  type Table,
} from "./hd-core";

const label = (k: string) => {
  const i = TABS.findIndex((t) => t[0] === k);
  return `${String(i + 1).padStart(2, "0")} ${TABS[i][3]}`;
};

function Failed({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div role="alert" style={{ background: "#fff", border: "1px solid #FDD9D6", borderRadius: "16px", padding: "20px", fontSize: "12.5px", color: "#B42318", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ flex: 1 }}>Couldn’t load this screen — {errText(error)}</span>
      <button type="button" onClick={retry} style={{ border: "1px solid #FDD9D6", background: "#fff", borderRadius: "9px", padding: "8px 12px", fontSize: "12px", fontWeight: 700, color: "#B42318", cursor: "pointer" }}>
        Retry
      </button>
    </div>
  );
}

/** Shared ticket row actions (list, overview, analytics). */
function ticketRowAct(act: HdActions, rows: TRow[], id: string, v: string) {
  const t = rows.find((x) => x.number === id);
  if (!t || !v) return;
  if (v === "Open") return act.openTicket(id);
  if (v === "Assign" || v === "Reassign") return act.openModal("assign", { rows: [t] });
  if (v === "Change priority") return act.openModal("pri", { rows: [t] });
  if (v === "Resolve") return act.openModal("resolve", { rows: [t] });
  if (v === "Close") return act.openModal("close", { rows: [t] });
  if (v === "Reopen") return void act.call("Reopen", () => hdApi.reopen(id), () => `${id} reopened.`);
}

function emptyAct(act: HdActions, router: ReturnType<typeof useRouter>) {
  return (k: string) => {
    if (k === "new") return act.openModal("new");
    if (k === "connect") {
      act.flash("Support channels are connected in Unified Inbox — Helpdesk uses those connections.");
      return router.push("/unified-inbox");
    }
    if (k === "settings") return act.go("settings");
    if (k === "clear") return act.set({ tf: blankTF(), page: 0 });
    if (k === "kbclear") return act.set({ kbf: { q: "", cat: "", st: "", vis: "", stale: false } });
    if (k === "newart") return act.openModal("article", { id: null });
    if (k === "newreply") return act.openModal("reply", { id: null });
    if (k === "newmacro") return act.openModal("macro", { id: null });
  };
}

// ── 1 Overview ───────────────────────────────────────────────────────────────

export function OverviewScreen() {
  const { data: ws } = useWorkspace();
  const act = useHdActions(ws);
  const router = useRouter();
  const range = useHd((s) => s.range);
  const branch = useHd((s) => s.branch);
  const ovSeg = useHd((s) => s.ovSeg);
  const q = useQuery({ queryKey: ["hd", "overview", range, branch], queryFn: () => hdApi.overview(range, branchParam(branch)), placeholderData: keepPreviousData, refetchInterval: 60_000 });
  if (!ws || q.isLoading) return <Skeleton />;
  if (q.error || !q.data) return <Failed error={q.error} retry={() => void q.refetch()} />;
  const o = q.data;
  const k = o.kpis;
  const cfg = ws.settings.config;
  const branchName = branch === "all" ? "All branches" : (ws.branches.find((b) => b.id === branch)?.name ?? "");
  let rows: LayoutRow[];
  if (o.empty) {
    rows = [R("minmax(0,1fr)", [card({ empty: { t: "No support tickets yet.", d: "Tickets arrive from connected channels through Unified Inbox and the customer portal, or you can log one manually.", acts: [btn("new", "+ Create first ticket", "primary", !act.can("Reply")), btn("connect", "Connect support channel"), btn("settings", "Open Helpdesk Settings")] } })])];
  } else {
    const segNames: Array<[string, string]> = [
      ["unassigned", "Unassigned"],
      ["mine", "My Tickets"],
      ["risk", "SLA At Risk"],
      ["escalated", "Escalated"],
      ["waiting", "Waiting on Customer"],
      ["recent", "Recently Updated"],
    ];
    const cur = o.segments[ovSeg] ? ovSeg : "unassigned";
    const list = o.segments[cur].rows;
    rows = [
      kpiRow([
        K("open", "Open Tickets", k.open, `${k.fresh} new · ${k.unassigned} unassigned`, null, "#12A150"),
        K("urgent", "Urgent Tickets", k.urgent, "▲▲ Highest priority, still open", "#B42318", "#F04438"),
        K("wcust", "Waiting on Customer", k.wcust, "SLA paused while waiting", null, "#F79009"),
        K("wteam", "Waiting on Team", k.wteam, "Blocked on another team", null, "#C11574"),
        K("risk", "SLA At Risk", k.risk, `! Past the ${cfg.sla.warn}% warning threshold`, "#B54708", "#F79009"),
        K("breach", "SLA Breached", k.breach, "✕ Target already missed", "#B42318", "#F04438"),
        K("frt", "Avg First Response", fmtM(k.frt), `Tickets created in ${range.toLowerCase()}`, null, "#2E90FA"),
        K("res", "Avg Resolution", fmtM(k.res), "Resolved tickets in range", null, "#6941C6"),
        K("csat", "CSAT", k.csat == null ? "—" : k.csat + "%", `${k.csatN} survey responses`, "#0E8442", "#12A150"),
      ]),
      R("minmax(0,1.5fr) minmax(0,1fr)", [
        card({ title: "Tickets created vs resolved", sub: "Daily · " + branchName, trend: mkTrend(o.trend.labels, [{ t: "Created", c: "#0A1B2A", v: o.trend.created }, { t: "Resolved", c: "#12A150", v: o.trend.resolved }], "Today is live", "Tickets created versus resolved per day") }),
        card({ title: "Open tickets by priority", sub: "Priority shown with symbol and label, not colour alone", bars: mkBars(o.byPriority.map(([p, n]) => [`${PRI[p][2]} ${p}`, n, PRI[p][0]])) }),
      ]),
      R("minmax(0,1fr) minmax(0,1.5fr)", [
        card({ title: "Tickets by channel", sub: "Configured channels only · " + range, bars: mkBars(o.byChannel.filter(([c]) => ws.chanList.includes(c)), "#2E90FA") }),
        card({
          id: "ov",
          title: "Support queues",
          sub: "Live · scoped to what " + (ws.me.role === "Agent" ? "your role and assignments allow" : "you can access"),
          acts: [btn("all", "View All Tickets")],
          seg: seg(segNames.map(([sk, t]) => [sk, t, o.segments[sk].count]), cur),
          table: list.length ? ticketTable(list, "compact", { can: act.can }) : null,
          empty: list.length ? null : { t: cur === "mine" && !ws.me.isAgent ? "You aren’t a Helpdesk agent." : "Nothing here right now.", d: cur === "mine" && !ws.me.isAgent ? "Tickets can only be assigned to Staff with Helpdesk access." : "This queue is clear.", acts: [] },
          api: "GET /helpdesk/overview · GET /helpdesk/workspace",
        }),
      ]),
    ];
  }
  const map: Record<string, Record<string, string>> = { open: { st: "__active" }, urgent: { st: "__active", pri: "Urgent" }, wcust: { st: "Waiting on Customer" }, wteam: { st: "Waiting on Internal Team" }, risk: { sla: "At Risk" }, breach: { sla: "Breached", st: "__active" } };
  const h: Handlers = {
    kpiClick: (key) => {
      if (map[key]) return act.tfGo(map[key]);
      if (key === "csat") return act.go("csat");
      if (key === "frt" || key === "res") return act.go("analytics");
    },
    blockAct: (key) => key === "all" && act.tfGo({}),
    segPick: (_b, key) => act.set({ ovSeg: key }),
    rowOpen: (_b, id) => act.openTicket(id),
    emptyAct: emptyAct(act, router),
  };
  return <Rows rows={rows} h={h} label={label("overview")} />;
}

// ── 2 All Tickets ────────────────────────────────────────────────────────────

export function TicketsScreen() {
  const { data: ws } = useWorkspace();
  const act = useHdActions(ws);
  const router = useRouter();
  const tf = useHd((s) => s.tf);
  const sort = useHd((s) => s.sort);
  const page = useHd((s) => s.page);
  const selN = useHd((s) => s.sel);
  const branch = useHd((s) => s.branch);
  const set = useHd((s) => s.set);
  const q = useQuery({ queryKey: ["hd", "tickets", tf, sort, page, branch], queryFn: () => hdApi.tickets({ ...tf, sort, page, branch: branchParam(branch) }), placeholderData: keepPreviousData });
  const pageRows = q.data?.rows;
  useEffect(() => {
    set({ pageNumbers: (pageRows ?? []).map((r) => r.number) });
  }, [pageRows, set]);
  if (!ws || q.isLoading) return <Skeleton />;
  if (q.error || !q.data) return <Failed error={q.error} retry={() => void q.refetch()} />;
  const d = q.data;
  const cfg = ws.settings.config;
  const f = tf as unknown as Record<string, string>;
  const sels = [
    sel("st", "Status", f.st, O([{ v: "__active", t: "All active" }, ...cfg.statuses, ...cfg.customStatuses], "Any status")),
    sel("pri", "Priority", f.pri, O(PRIORITIES, "Any priority")),
    sel("sla", "SLA", f.sla, O(["Healthy", "At Risk", "Breached"], "Any SLA")),
    sel("agent", "Assigned agent", f.agent, O([{ v: "__none", t: "Unassigned" }, ...ws.agents.map((a) => ({ v: a.id, t: a.name }))], "Any agent")),
    sel("queue", "Queue", f.queue, O(ws.queues.map((x) => ({ v: x.id, t: x.name })), "Any queue")),
    sel("ch", "Channel", f.ch, O(ws.allChannels, "Any channel")),
    sel("cat", "Category", f.cat, O(cfg.categories, "Any category")),
    sel("br", "Branch", f.br, O(ws.branches.map((b) => ({ v: b.id, t: b.name })), "Any branch")),
    sel("date", "Created", f.date, O([{ v: "24h", t: "Last 24 hours" }, { v: "7d", t: "Last 7 days" }, { v: "30d", t: "Last 30 days" }], "Any date")),
    sel("cust", "Customer", f.cust, O(d.customers.map((c) => ({ v: c.id, t: c.name })), "Any customer")),
    sel("tag", "Tag", f.tag, O(d.tags.map((g) => ({ v: g, t: "#" + g })), "Any tag")),
    { k: "__sort", l: "Sort by", v: sort, bg: "#fff", bd: "#E6EAF0", opts: [["newest", "Newest"], ["oldest", "Oldest"], ["updated", "Last updated"], ["priority", "Priority"], ["sla", "SLA deadline"], ["customer", "Customer"]].map(([v, t]) => ({ v, t: "Sort: " + t })) },
  ];
  const nOn = Object.values(tf).filter(Boolean).length;
  const n = selN.length;
  const selRows = d.rows.filter((r) => selN.includes(r.number));
  const bulk = n
    ? {
        n,
        acts: [
          btn("assign", "Assign", "ghost", !act.can("Assign")),
          btn("status", "Change status"),
          btn("pri", "Change priority", "ghost", !act.can("Change priority")),
          btn("tag", "Add tag"),
          btn("queue", "Move queue", "ghost", !act.can("Reassign")),
          btn("merge", "Merge", "ghost", !act.can("Merge") || n < 2 || !cfg.advanced.ticketMerge, n < 2 ? "Select 2+ tickets to merge" : !cfg.advanced.ticketMerge ? "Merging is turned off in Settings › Advanced" : null),
          btn("close", "Close", "danger", !act.can("Close")),
        ],
      }
    : null;
  const rows = [
    R("minmax(0,1fr)", [
      card({
        id: "tk",
        filters: { search: "Search ticket #, subject, customer, email, phone or #tag", q: tf.q, sels, nOn: nOn || null, count: `${d.total} of ${d.base} tickets` },
        bulk,
        table: d.total ? ticketTable(d.rows, "full", { sel: selN, selectable: true, sort, can: act.can }) : null,
        empty: d.total ? null : d.base ? { t: "No tickets match these filters.", d: "Try removing a filter or searching by ticket number.", acts: [btn("clear", "Clear Filters", "primary")] } : { t: "No support tickets yet.", d: "Create one manually or connect a support channel.", acts: [btn("new", "+ New Ticket", "primary", !act.can("Reply"))] },
        pager: d.total > d.pageSize ? { t: `Page ${d.page + 1} of ${d.pages} · ${d.total} tickets · server-side, ${d.pageSize} per page`, noPrev: d.page === 0, noNext: d.page >= d.pages - 1 } : null,
        api: `GET /helpdesk/tickets${hdQs({ page: d.page + 1, sort })} · POST /helpdesk/tickets/bulk`,
      }),
    ]),
  ];
  const h: Handlers = {
    setQ: (_b, v) => set({ tf: { ...tf, q: v }, page: 0 }),
    setF: (_b, k, v) => (k === "__sort" ? set({ sort: v, page: 0 }) : set({ tf: { ...tf, [k]: v }, page: 0, sel: [] })),
    clearF: () => set({ tf: blankTF(), page: 0, sel: [] }),
    sortCol: (_b, k) => set({ sort: sort === k && k === "newest" ? "oldest" : k, page: 0 }),
    pageGo: (dd) => set({ page: Math.max(0, page + dd), sel: [] }),
    selRow: (id) => set({ sel: selN.includes(id) ? selN.filter((x) => x !== id) : [...selN, id] }),
    selAll: () => {
      const pg = d.rows.map((r) => r.number);
      set({ sel: pg.every((id) => selN.includes(id)) ? [] : pg });
    },
    selNone: () => set({ sel: [] }),
    bulkAct: (k) => {
      if (!selRows.length) return;
      act.openModal(k, { rows: selRows });
    },
    rowOpen: (_b, id) => act.openTicket(id),
    rowAct: (_b, id, v) => ticketRowAct(act, d.rows, id, v),
    emptyAct: emptyAct(act, router),
  };
  return <Rows rows={rows} h={h} label={label("tickets")} />;
}

// ── 4 Queues & Assignments ───────────────────────────────────────────────────

export function QueuesScreen() {
  const { data: ws } = useWorkspace();
  const act = useHdActions(ws);
  if (!ws) return <Skeleton />;
  const edit = act.manager;
  const agName = (id: string) => ws.agents.find((a) => a.id === id)?.name ?? "Former agent";
  const qcards = ws.queues.map((q) => ({
    id: q.id,
    t: q.name,
    aria: "Open queue " + q.name,
    d: q.desc,
    badge: q.active ? q.method : "Disabled",
    bbg: q.active ? "#F2F4F7" : "#FEF3F2",
    bfg: q.active ? "#344054" : "#B42318",
    bg: q.active ? "#fff" : "#FAFBFC",
    stats: [
      { l: "Open", v: q.stats.open, fg: "#101828" },
      { l: "Agents", v: q.members.length, fg: "#101828" },
      { l: "Oldest", v: fmtM(q.stats.oldestMins), fg: "#101828" },
      { l: "SLA at risk", v: q.stats.risk, fg: q.stats.risk ? "#B42318" : "#101828" },
      { l: "Avg wait", v: fmtM(q.stats.waitMins), fg: "#101828" },
      { l: "Branch", v: q.branchId ? q.branchName : "All", fg: "#101828" },
    ],
  }));
  const qt: Table = {
    sel: false,
    hasActs: true,
    cols: plainCols(["Queue", "Open tickets", "Assigned agents", "SLA at risk", "Oldest ticket", "Avg first response"], [2, 5]),
    rows: ws.queues.map((q) => ({
      id: q.id,
      bg: "#fff",
      actLabel: "Actions for " + q.name,
      acts: edit ? ["Open", "Edit queue", q.active ? "Disable queue" : "Enable queue"] : ["Open"],
      cells: [
        cell({ t: q.name, fw: 800, fg: "#101828", s: q.method + (q.active ? "" : " · disabled") }),
        cell({ t: String(q.stats.open), fw: 700 }),
        cell({ t: q.members.map((m) => agName(m).split(" ")[0]).join(", ") || "—", opt: "1" }),
        cell(q.stats.risk ? { bt: `! ${q.stats.risk} at risk`, bfg: "#B54708", bbg: "#FEF6E7" } : { t: "0" }),
        cell({ t: fmtM(q.stats.oldestMins) }),
        cell({ t: fmtM(q.stats.frMins), opt: "1" }),
      ],
      cardT: q.name,
      cardS: `${q.stats.open} open · ${q.members.length} agents · oldest ${fmtM(q.stats.oldestMins)}`,
      cardB: [{ t: q.method, bg: "#F2F4F7", fg: "#344054" }],
    })),
  };
  const wt: Table = {
    sel: false,
    hasActs: true,
    cols: plainCols(["Agent", "Open tickets", "Urgent", "SLA risk", "Status", "Capacity"]),
    rows: ws.agents.map((a) => {
      const pct = Math.round((a.open / a.cap) * 100);
      const over = pct > 100;
      return {
        id: a.id,
        bg: "#fff",
        actLabel: "Actions for " + a.name,
        acts: ["View tickets", ...(edit ? ["Assign tickets", "Edit skills & capacity"] : [])],
        cells: [
          cell({ t: a.name, fw: 800, fg: "#101828", s: `${a.title} · ${a.skills.join(", ") || "no skills set"}` }),
          cell({ t: String(a.open), fw: 700 }),
          cell({ t: String(a.urgent), fg: a.urgent ? "#B42318" : "#344054", fw: a.urgent ? 800 : 500 }),
          cell({ t: String(a.risk), fg: a.risk ? "#B54708" : "#344054" }),
          cell({ bt: (a.status === "Online" ? "● " : a.status === "Away" ? "◐ " : "○ ") + a.status, bfg: a.status === "Online" ? "#0E8442" : "#475467", bbg: a.status === "Online" ? "#ECFDF3" : "#F2F4F7", s: a.status === "Online" ? "Clocked in" : a.status === "Away" ? "On approved leave" : "Not clocked in" }),
          cell({ bt: `${over ? "▲ " : ""}${a.open} / ${a.cap} · ${pct}%`, bfg: over ? "#B42318" : pct > 80 ? "#B54708" : "#344054", bbg: over ? "#FEF3F2" : pct > 80 ? "#FEF6E7" : "#F2F4F7", s: over ? "Over capacity" : "" }),
        ],
        cardT: a.name,
        cardS: `${a.open} open · ${a.urgent} urgent · ${a.status}`,
        cardB: [{ t: pct + "% capacity", bg: over ? "#FEF3F2" : "#F2F4F7", fg: over ? "#B42318" : "#344054" }],
      };
    }),
  };
  const rows = [
    R("minmax(0,1fr)", [card({ id: "qc", title: "Queues", sub: "Custom queues supported. Advanced assignment modes only run once configured on the queue.", qcards })]),
    R("minmax(0,1.2fr) minmax(0,1fr)", [
      card({ id: "qt", title: "Queue table", table: qt, api: "GET /helpdesk/workspace · PATCH /helpdesk/queues/:id" }),
      card({
        id: "wl",
        title: "Agent workload",
        sub: "Agents come from Staff (presence from Attendance and Time off). Capacity = max open tickets.",
        acts: [btn("assign", "Assign Tickets", "ghost", !edit), btn("rebalance", "Rebalance", "primary", !edit)],
        table: ws.agents.length ? wt : null,
        empty: ws.agents.length ? null : { t: "No agents yet.", d: "Staff whose role includes Helpdesk access appear here.", acts: [] },
        info: edit ? null : "You can view queues. Editing queues and assignment rules requires Owner or Manager.",
        api: "POST /helpdesk/assignments/assign · POST /helpdesk/assignments/rebalance",
      }),
    ]),
  ];
  const h: Handlers = {
    cardOpen: (_b, id) => act.set({ drawer: { kind: "queue", id } }),
    rowOpen: (b, id) => (b === "qt" ? act.set({ drawer: { kind: "queue", id } }) : act.tfGo({ agent: id, st: "__active" })),
    blockAct: (k) => (k === "assign" ? act.openModal("assignMany", {}) : k === "rebalance" ? act.openModal("rebalance") : undefined),
    rowAct: (b, id, v) => {
      if (b === "qt") {
        const q = ws.queues.find((x) => x.id === id)!;
        if (v === "Open") return act.set({ drawer: { kind: "queue", id } });
        if (v === "Edit queue") return act.openModal("queueEdit", { id });
        if (v === "Disable queue") return q.sys ? act.flash("System queue can’t be disabled.") : act.openModal("qDisable", { id });
        if (v === "Enable queue") return void act.call("Enable queue", () => hdApi.queueActive(id, true), () => `${q.name} enabled.`);
      }
      if (b === "wl") {
        if (v === "View tickets") return act.tfGo({ agent: id, st: "__active" });
        if (v === "Assign tickets") return act.openModal("assignMany", { agent: id });
        if (v === "Edit skills & capacity") return act.openModal("agent", { id });
      }
    },
  };
  return <Rows rows={rows} h={h} label={label("queues")} />;
}

// ── 5 SLA & Escalations ──────────────────────────────────────────────────────

export function SlaScreen() {
  const { data: ws } = useWorkspace();
  const act = useHdActions(ws);
  const branch = useHd((s) => s.branch);
  const q = useQuery({ queryKey: ["hd", "sla", branch], queryFn: () => hdApi.sla(branchParam(branch)), placeholderData: keepPreviousData });
  if (!ws || q.isLoading) return <Skeleton />;
  if (q.error || !q.data) return <Failed error={q.error} retry={() => void q.refetch()} />;
  const k = q.data.kpis;
  const ed = act.can("Manage SLA");
  const ES: Record<string, [string, string, string]> = { Succeeded: ["✓ Succeeded", "#0E8442", "#ECFDF3"], Failed: ["✕ Failed", "#B42318", "#FEF3F2"] };
  const pt: Table = {
    hasActs: true,
    cols: plainCols(["Policy name", "Applies to", "Priority", "First response", "Resolution", "Business hours", "Status"]),
    rows: [...ws.policies]
      .sort((a, b) => a.order - b.order)
      .map((p) => ({
        id: p.id,
        bg: "#fff",
        actLabel: "Actions for " + p.name,
        acts: ed ? ["Edit", p.active ? "Disable" : "Enable", "Duplicate"] : ["View"],
        cells: [
          cell({ t: p.name, fw: 800, fg: "#101828", s: `Pauses: ${p.pause.join(", ") || "never"} · warn at ${p.warn}%` }),
          cell({ t: p.applies, s: p.applies === "All Tickets" ? "" : p.scope }),
          p.priority === "Any" ? cell({ t: "Any" }) : cell(priB(p.priority)),
          cell({ t: fmtM(p.fr), fw: 700 }),
          cell({ t: fmtM(p.res), fw: 700 }),
          cell({ t: p.hours }),
          cell(p.active ? { bt: "✓ Active", bfg: "#0E8442", bbg: "#ECFDF3" } : { bt: "○ Inactive", bfg: "#475467", bbg: "#F2F4F7" }),
        ],
        cardT: p.name,
        cardS: `First response ${fmtM(p.fr)} · Resolution ${fmtM(p.res)}`,
        cardB: [{ t: p.active ? "Active" : "Inactive", bg: "#F2F4F7", fg: "#344054" }],
      })),
  };
  const rt: Table = {
    hasActs: true,
    cols: plainCols(["Rule name", "Trigger", "Action", "Escalate to", "Status"]),
    rows: ws.rules.map((r) => ({
      id: r.id,
      bg: "#fff",
      actLabel: "Actions for " + r.name,
      acts: ed ? ["Edit", r.active ? "Disable" : "Enable"] : ["View"],
      cells: [cell({ t: r.name, fw: 800, fg: "#101828" }), cell({ t: r.trigger + (r.trigger === "Ticket Age" && r.ageHours ? ` > ${r.ageHours}h` : "") }), cell({ t: r.action }), cell({ t: r.targetName, s: r.targetType }), cell(r.active ? { bt: "✓ Active", bfg: "#0E8442", bbg: "#ECFDF3" } : { bt: "○ Inactive", bfg: "#475467", bbg: "#F2F4F7" })],
      cardT: r.name,
      cardS: `${r.trigger} → ${r.action} → ${r.targetName}`,
      cardB: [],
    })),
  };
  const log = q.data.log;
  const lt: Table = {
    hasActs: true,
    cols: plainCols(["Ticket", "Trigger", "Escalated to", "Time", "Result", "Status"]),
    rows: log.map((e) => ({
      id: e.id,
      bg: "#fff",
      actLabel: "Actions for escalation on " + e.ticket,
      acts: e.retryable && ed ? ["Open ticket", "Retry action"] : ["Open ticket"],
      cells: [cell({ t: e.ticket, ff: "ui-monospace,monospace", fw: 800, fg: "#101828" }), cell({ t: e.trigger, s: e.rule ?? "" }), cell({ t: e.target }), cell({ t: ago(e.at) }), cell({ t: e.result, mw: "260px" }), cell({ bt: ES[e.status]?.[0] ?? e.status, bfg: ES[e.status]?.[1] ?? "#344054", bbg: ES[e.status]?.[2] ?? "#F2F4F7" })],
      cardT: `${e.ticket} · ${e.trigger}`,
      cardS: e.result,
      cardB: [{ t: ES[e.status]?.[0] ?? e.status, fg: ES[e.status]?.[1] ?? "#344054", bg: ES[e.status]?.[2] ?? "#F2F4F7" }],
    })),
  };
  const rows = [
    kpiRow([
      K("comp", "SLA Compliance", k.compliance == null ? "—" : k.compliance + "%", "Tickets that met or are within target", k.compliance == null || k.compliance >= 90 ? "#0E8442" : "#B54708", "#12A150"),
      K("risk", "At Risk", k.risk, "! Past warning threshold", "#B54708", "#F79009"),
      K("breach", "Breached", k.breach, "✕ Open and over target", "#B42318", "#F04438"),
      K("frt", "Avg First Response", fmtM(k.frt), "All tickets in scope", null, "#2E90FA"),
      K("res", "Avg Resolution", fmtM(k.res), "Resolved tickets", null, "#6941C6"),
      K("esc", "Escalations This Month", k.escMonth, `${k.escFailed} failed`, null, "#C11574"),
    ]),
    R("minmax(0,1fr)", [card({ id: "pol", title: "SLA policies", sub: "First matching active policy applies: customer segment → queue → category → branch → priority → all tickets.", table: pt, empty: ws.policies.length ? null : { t: "No SLA policies.", d: "Tickets have no response targets until a policy applies.", acts: [] }, info: ed ? null : "Read-only: “Manage SLA” permission required to change policies.", api: "POST /helpdesk/sla/policies · PATCH /helpdesk/sla/policies/:id" })]),
    R("minmax(0,1fr) minmax(0,1.3fr)", [
      card({ id: "rul", title: "Escalation rules", sub: "Support-specific only. Cross-module automation belongs in Automations & Workflows.", table: ws.rules.length ? rt : null, empty: ws.rules.length ? null : { t: "No escalation rules.", d: "SLA risk and breaches are still detected and notified on; rules add queue moves, priority raises and alerts.", acts: [] }, api: "POST /helpdesk/sla/rules" }),
      card({ id: "log", title: "Escalation log", sub: "An escalation is only marked Succeeded after its internal action completes.", table: log.length ? lt : null, empty: log.length ? null : { t: "No escalations yet.", d: "Rules will log here when they fire.", acts: [] }, api: "GET /helpdesk/sla · POST /helpdesk/sla/escalations/:id/retry" }),
    ]),
  ];
  const openPolicy = (id: string) => {
    const p = ws.policies.find((x) => x.id === id)!;
    if (ed) return act.openModal("sla", { id });
    act.set({ drawer: { kind: "view", kicker: "SLA policy", title: p.name, sections: [{ h: "Policy", kv: [{ k: "Applies to", v: `${p.applies}${p.scope ? " · " + p.scope : ""}` }, { k: "First response", v: fmtM(p.fr) }, { k: "Resolution", v: fmtM(p.res) }, { k: "Hours", v: p.hours }, { k: "Pauses", v: p.pause.join(", ") || "Never" }, { k: "Warning", v: p.warn + "%" }] }] } });
  };
  const h: Handlers = {
    kpiClick: (key) => {
      if (key === "risk") return act.tfGo({ sla: "At Risk" });
      if (key === "breach") return act.tfGo({ sla: "Breached", st: "__active" });
      act.set({ drawer: { kind: "metric", id: key } });
    },
    rowOpen: (b, id) => {
      if (b === "pol") return openPolicy(id);
      if (b === "rul") return ed ? act.openModal("rule", { id }) : act.flash("Viewing only — “Manage SLA” permission required to edit.");
      if (b === "log") {
        const e = log.find((x) => x.id === id);
        if (e && e.ticket !== "Deleted ticket") act.openTicket(e.ticket);
      }
    },
    rowAct: (b, id, v) => {
      if (b === "pol") {
        if (v === "Edit" || v === "View") return openPolicy(id);
        const a = v === "Duplicate" ? "duplicate" : v === "Enable" ? "enable" : "disable";
        return void act.call(v + " policy", () => hdApi.policyAction(id, a), () => (a === "duplicate" ? "Duplicated as inactive copy." : `Policy ${a}d. Tickets re-evaluated.`));
      }
      if (b === "rul") {
        if (v === "Edit" || v === "View") return ed ? act.openModal("rule", { id }) : act.flash("Viewing only — “Manage SLA” permission required to edit.");
        return void act.call(v + " rule", () => hdApi.ruleActive(id, v === "Enable"), () => `Rule ${v.toLowerCase()}d.`);
      }
      if (b === "log") {
        const e = log.find((x) => x.id === id)!;
        if (v === "Open ticket") return e.ticket !== "Deleted ticket" ? act.openTicket(e.ticket) : undefined;
        if (v === "Retry action") return void act.call("Retry escalation", () => hdApi.retryEscalation(id), (r) => (r.ok ? "Escalation succeeded on retry." : `Retry failed — ${r.result}. Left as Failed.`));
      }
    },
  };
  return <Rows rows={rows} h={h} label={label("sla")} />;
}

// ── 6 Knowledge Base ─────────────────────────────────────────────────────────

export function KnowledgeScreen() {
  const { data: ws } = useWorkspace();
  const act = useHdActions(ws);
  const router = useRouter();
  const f = useHd((s) => s.kbf);
  const q = useQuery({ queryKey: ["hd", "knowledge"], queryFn: () => hdApi.knowledge() });
  if (!ws || q.isLoading) return <Skeleton />;
  if (q.error || !q.data) return <Failed error={q.error} retry={() => void q.refetch()} />;
  const A = q.data.articles;
  const pubOk = q.data.canPublish;
  const pub = A.filter((a) => a.status === "Published");
  const views = pub.reduce((s, a) => s + a.views, 0);
  const rated = pub.filter((a) => a.helpful != null);
  const wsum = rated.reduce((s, a) => s + Math.max(1, a.views), 0);
  const help = rated.length ? Math.round(rated.reduce((s, a) => s + (a.helpful ?? 0) * Math.max(1, a.views), 0) / wsum) : null;
  const ql = f.q.trim().toLowerCase();
  const L = A.filter((a) => (!ql || [a.title, a.summary, a.body, a.slug, ...a.tags].join(" ").toLowerCase().includes(ql)) && (!f.cat || a.category === f.cat) && (!f.st || a.status === f.st) && (!f.vis || a.visibility === f.vis) && (!f.stale || a.stale));
  const SB: Record<string, [string, string, string]> = { Draft: ["✎ Draft", "#B54708", "#FEF6E7"], Published: ["✓ Published", "#0E8442", "#ECFDF3"], Archived: ["▣ Archived", "#475467", "#F2F4F7"] };
  const table: Table = {
    hasActs: true,
    cols: plainCols(["Title", "Category", "Status", "Author", "Last updated", "Views", "Helpful %"], [3, 5]),
    rows: L.map((a) => ({
      id: a.id,
      bg: "#fff",
      actLabel: "Actions for " + a.title,
      acts: ["Open", "Edit", ...(pubOk ? [a.status === "Published" ? "Unpublish" : a.status === "Draft" ? "Publish" : "Restore", ...(a.status !== "Archived" ? ["Archive"] : [])] : [])],
      cells: [
        cell({ t: a.title, fw: 800, fg: "#101828", mw: "320px", s: (a.visibility === "Internal Only" ? "🔒 " : "") + a.visibility + (a.stale ? " · needs review" : "") }),
        cell({ t: a.category }),
        cell({ bt: SB[a.status][0], bfg: SB[a.status][1], bbg: SB[a.status][2] }),
        cell({ t: a.author, opt: "1" }),
        cell({ t: a.updatedDays === 0 ? "Today" : a.updatedDays + "d ago" }),
        cell({ t: a.views.toLocaleString(), opt: "1" }),
        cell({ t: a.helpful == null ? "—" : a.helpful + "%", fg: a.helpful != null && a.helpful < 75 ? "#B54708" : "#344054", fw: 700 }),
      ],
      cardT: a.title,
      cardS: `${a.category} · ${a.visibility} · ${a.views} views`,
      cardB: [{ t: SB[a.status][0], fg: SB[a.status][1], bg: SB[a.status][2] }],
    })),
  };
  const rows = [
    kpiRow([
      K("pub", "Published Articles", pub.length, `${pub.filter((a) => a.visibility !== "Internal Only").length} visible to customers`, null, "#12A150"),
      K("draft", "Drafts", A.filter((a) => a.status === "Draft").length, "Not visible anywhere yet", null, "#F79009"),
      K("views", "Views", views.toLocaleString(), "Published articles · 90 days", null, "#2E90FA"),
      K("help", "Helpful %", help == null ? "—" : help + "%", "Weighted by views", null, "#12A150"),
      K("stale", "Needing Update", A.filter((a) => a.stale).length, "Not reviewed in 30+ days", "#B54708", "#F79009"),
    ]),
    R("minmax(0,1fr)", [
      card({
        id: "kb",
        filters: { search: "Search titles, summaries, content and tags", q: f.q, sels: [sel("cat", "Category", f.cat, O(q.data.categories, "Any category")), sel("st", "Status", f.st, O(["Draft", "Published", "Archived"], "Any status")), sel("vis", "Visibility", f.vis, O(["Internal Only", "Customer Portal", "Public"], "Any visibility"))], nOn: [f.q, f.cat, f.st, f.vis, f.stale ? "x" : ""].filter(Boolean).length || null, count: `${L.length} articles` },
        table: L.length ? table : null,
        empty: L.length ? null : A.length ? { t: "No articles match.", d: "Try a different search term.", acts: [btn("kbclear", "Clear Filters", "primary")] } : { t: "Create your first help article.", d: "Articles can be internal-only for agents, shown on customers’ ticket pages, or published to your public help center.", acts: [btn("newart", "+ New Article", "primary")] },
        info: "Internal-only articles are never returned by the customer portal or public help center and cannot be inserted into customer replies." + (pubOk ? "" : " Agents can write drafts; publishing requires a Manager."),
        api: "GET /helpdesk/knowledge · POST /helpdesk/knowledge · PATCH /helpdesk/knowledge/:id",
      }),
    ]),
  ];
  const open = (id: string) => {
    act.set({ drawer: { kind: "article", id } });
    void hdApi.articleView(id).catch(() => undefined);
  };
  const h: Handlers = {
    kpiClick: (k) => {
      const m: Record<string, Partial<typeof f>> = { pub: { st: "Published" }, draft: { st: "Draft" }, stale: { stale: true } };
      if (m[k]) return act.set({ kbf: { q: "", cat: "", vis: "", stale: false, st: "", ...m[k] } });
      act.set({ drawer: { kind: "metric", id: k } });
    },
    setQ: (_b, v) => act.set({ kbf: { ...f, q: v } }),
    setF: (_b, k, v) => act.set({ kbf: { ...f, [k]: v } }),
    clearF: () => act.set({ kbf: { q: "", cat: "", st: "", vis: "", stale: false } }),
    rowOpen: (_b, id) => open(id),
    rowAct: (_b, id, v) => {
      if (v === "Open") return open(id);
      if (v === "Edit") return act.openModal("article", { id });
      const a = { Publish: "publish", Unpublish: "unpublish", Archive: "archive", Restore: "restore" }[v];
      if (a) void act.call(v, () => hdApi.articleAction(id, a), () => `Article ${a === "restore" ? "restored as draft" : a + (a.endsWith("e") ? "d" : "ed")}.`);
    },
    emptyAct: emptyAct(act, router),
  };
  return <Rows rows={rows} h={h} label={label("kb")} />;
}

// ── 7 Macros & Saved Replies ─────────────────────────────────────────────────

export function MacrosScreen() {
  const { data: ws } = useWorkspace();
  const act = useHdActions(ws);
  const router = useRouter();
  const tab = useHd((s) => s.mTab);
  const mq = useHd((s) => s.mq);
  const q = useQuery({ queryKey: ["hd", "library"], queryFn: () => hdApi.library() });
  if (!ws || q.isLoading) return <Skeleton />;
  if (q.error || !q.data) return <Failed error={q.error} retry={() => void q.refetch()} />;
  const { replies, macros, canEdit } = q.data;
  const ql = mq.trim().toLowerCase();
  let block: Partial<Parameters<typeof card>[0]>;
  if (tab === "replies") {
    const L = replies.filter((r) => !ql || `${r.name} ${r.shortcut} ${r.body}`.toLowerCase().includes(ql));
    block = {
      table: L.length
        ? {
            hasActs: true,
            cols: plainCols(["Name", "Shortcut", "Content preview", "Team", "Usage", "Updated by"], [2, 4, 5]),
            rows: L.map((r) => ({
              id: r.id,
              bg: "#fff",
              actLabel: "Actions for " + r.name,
              acts: r.canEdit ? ["Edit", "Duplicate", "Delete"] : ["View", "Duplicate"],
              cells: [cell({ t: r.name, fw: 800, fg: "#101828", s: r.visibility }), cell({ t: r.shortcut, ff: "ui-monospace,monospace", fw: 700, fg: "#0E8442" }), cell({ t: r.body.length > 90 ? r.body.slice(0, 90) + "…" : r.body, mw: "360px", opt: "1" }), cell({ t: r.team }), cell({ t: String(r.usage), opt: "1" }), cell({ t: r.by, opt: "1" })],
              cardT: `${r.name} · ${r.shortcut}`,
              cardS: r.body.slice(0, 80) + (r.body.length > 80 ? "…" : ""),
              cardB: [{ t: r.team, bg: "#F2F4F7", fg: "#344054" }],
            })),
          }
        : null,
      empty: L.length ? null : { t: replies.length ? "No saved replies match." : "No saved replies yet.", d: "Saved replies insert text; variables like {{customer_name}} are filled when inserted.", acts: [btn("newreply", "+ New Saved Reply", "primary")] },
      api: "GET /helpdesk/library · POST /helpdesk/replies",
    };
  } else {
    const L = macros.filter((m) => !ql || `${m.name} ${m.conditions} ${m.actions.map((a) => a.join(" ")).join(" ")}`.toLowerCase().includes(ql));
    block = {
      table: L.length
        ? {
            hasActs: true,
            cols: plainCols(["Macro name", "Conditions", "Actions", "Usage", "Status"], [1, 3]),
            rows: L.map((m) => ({
              id: m.id,
              bg: "#fff",
              actLabel: "Actions for " + m.name,
              acts: canEdit ? ["Edit", m.status === "Active" ? "Disable" : "Enable", "Delete"] : ["View"],
              cells: [cell({ t: m.name, fw: 800, fg: "#101828" }), cell({ t: m.conditions, opt: "1" }), cell({ t: m.actions.map((a) => `${a[0]}: ${a[1]}`).join(" → "), mw: "380px" }), cell({ t: String(m.usage), opt: "1" }), cell(m.status === "Active" ? { bt: "✓ Active", bfg: "#0E8442", bbg: "#ECFDF3" } : { bt: "○ Disabled", bfg: "#475467", bbg: "#F2F4F7" })],
              cardT: m.name,
              cardS: m.actions.map((a) => a[0]).join(" → "),
              cardB: [{ t: m.status, bg: "#F2F4F7", fg: "#344054" }],
            })),
          }
        : null,
      empty: L.length ? null : { t: "No macros yet.", d: "Macros bundle a reply with status, priority, queue, agent and tag changes.", acts: [btn("newmacro", "+ New Macro", "primary", !canEdit)] },
      api: "GET /helpdesk/library · POST /helpdesk/macros · PATCH /helpdesk/macros/:id",
    };
  }
  const rows = [
    R("minmax(0,1fr)", [
      card({
        id: "mc",
        seg: seg(
          [
            ["macros", "Macros", macros.length],
            ["replies", "Saved Replies", replies.length],
          ],
          tab,
        ),
        filters: { search: tab === "replies" ? "Search saved replies or /shortcut" : "Search macros", q: mq, sels: [], nOn: null, count: "" },
        ...block,
        info: "Macros run with the permissions of the agent applying them — any action the agent isn’t allowed to perform is skipped and reported, never forced.",
      }),
    ]),
  ];
  const openRow = (id: string) => {
    if (tab === "replies") {
      const r = replies.find((x) => x.id === id)!;
      if (r.canEdit) return act.openModal("reply", { id });
      return act.set({ drawer: { kind: "view", kicker: "Saved reply · " + r.shortcut, title: r.name, sections: [{ h: "Body", text: r.body }, { h: "Details", kv: [{ k: "Team", v: r.team }, { k: "Visibility", v: r.visibility }, { k: "Used", v: r.usage + " times" }, { k: "Updated by", v: r.by }] }] } });
    }
    const m = macros.find((x) => x.id === id)!;
    if (canEdit) return act.openModal("macro", { id });
    act.set({ drawer: { kind: "view", kicker: "Macro", title: m.name, sections: [{ h: "Conditions", text: m.conditions }, { h: "Actions", bullets: m.actions.map((a) => `${a[0]}: ${a[1]}`) }] } });
  };
  const h: Handlers = {
    segPick: (_b, k) => act.set({ mTab: k as "macros" | "replies", mq: "" }),
    setQ: (_b, v) => act.set({ mq: v }),
    rowOpen: (_b, id) => openRow(id),
    rowAct: (_b, id, v) => {
      const isR = tab === "replies";
      const it = isR ? replies.find((x) => x.id === id) : macros.find((x) => x.id === id);
      if (!it) return;
      if (v === "Edit" || v === "View") return openRow(id);
      if (v === "Delete") return act.openModal("del", { id, what: isR ? "reply" : "macro", label: it.name });
      if (v === "Duplicate") return void act.call("Duplicate", () => hdApi.duplicateReply(id), () => "Duplicated.");
      if (v === "Enable" || v === "Disable") return void act.call(v, () => hdApi.macroStatus(id, v === "Enable" ? "Active" : "Disabled"), () => `Macro ${v.toLowerCase()}d.`);
    },
    emptyAct: emptyAct(act, router),
  };
  return <Rows rows={rows} h={h} label={label("macros")} />;
}

// ── 8 Customer Satisfaction ──────────────────────────────────────────────────

export function CsatScreen() {
  const { data: ws } = useWorkspace();
  const act = useHdActions(ws);
  const branch = useHd((s) => s.branch);
  const f = useHd((s) => s.cf);
  const q = useQuery({ queryKey: ["hd", "csat", branch], queryFn: () => hdApi.csat(branchParam(branch)) });
  if (!ws || q.isLoading) return <Skeleton />;
  if (q.error || !q.data) return <Failed error={q.error} retry={() => void q.refetch()} />;
  const c = q.data;
  const k = c.kpis;
  const band = (r: number) => (r >= 4 ? "Positive" : r === 3 ? "Neutral" : "Negative");
  const L = c.responses.filter((x) => (!f.rating || band(x.rating) === f.rating) && (!f.agent || x.agentId === f.agent));
  const stars = (r: number) => "★".repeat(r) + "☆".repeat(5 - r);
  const rawLabel = (x: (typeof L)[number]) => (x.scale === "1–10" ? `${x.raw}/10` : x.scale === "Good / Bad" ? (x.rating >= 4 ? "Good" : "Bad") : `${x.rating}/5`);
  const table: Table = {
    hasActs: true,
    cols: plainCols(["Ticket #", "Customer", "Rating", "Feedback", "Agent", "Category", "Date"], [5]),
    rows: L.map((x) => ({
      id: x.number,
      bg: x.rating <= 2 && x.followUp !== "Done" ? "#FFFBFA" : "#fff",
      actLabel: "Actions for " + x.number,
      acts: ["Open ticket", ...(x.rating <= 2 && act.manager ? [x.followUp ? (x.followUp === "Open" ? "Mark follow-up done" : "Reopen follow-up") : "Create follow-up"] : [])],
      cells: [
        cell({ t: x.number, ff: "ui-monospace,monospace", fw: 800, fg: "#101828" }),
        cell({ t: x.customer }),
        cell({ bt: `${stars(x.rating)} ${rawLabel(x)}`, bfg: x.rating >= 4 ? "#0E8442" : x.rating === 3 ? "#475467" : "#B42318", bbg: x.rating >= 4 ? "#ECFDF3" : x.rating === 3 ? "#F2F4F7" : "#FEF3F2", s: band(x.rating) + (x.followUp ? " · follow-up " + x.followUp.toLowerCase() : "") }),
        cell({ t: x.comment || "—", mw: "300px", fg: x.comment ? "#344054" : "#98A2B3" }),
        cell({ t: x.agent }),
        cell({ t: x.category, opt: "1", s: x.channel }),
        cell({ t: ago(x.at) }),
      ],
      cardT: `${x.number} · ${stars(x.rating)}`,
      cardS: `${x.comment || "No comment"} · ${x.agent}`,
      cardB: [{ t: band(x.rating), bg: "#F2F4F7", fg: "#344054" }],
    })),
  };
  const cs = c.settings;
  const surv: Array<[string, string]> = [
    ["Send after resolution", cs.enabled ? "On" : "Off"],
    ["Delay", cs.delay],
    ["Rating scale", cs.scale],
    ["Optional comment", cs.comment ? "Yes" : "No"],
    ["Channels", cs.channels.join(", ") || "None"],
    ["Poor rating", cs.followUp],
  ];
  const trendHas = c.trend.some((w) => w.pct != null);
  const rows = [
    kpiRow([
      K("score", "CSAT Score", k.score == null ? "—" : k.score + "%", "Share of 4–5 star ratings", "#0E8442", "#12A150"),
      K("resp", "Responses", k.responses, `Last ${c.windowDays} days`, null, "#2E90FA"),
      K("Positive", "Positive", k.positive, "★ 4–5 stars", null, "#12A150"),
      K("Neutral", "Neutral", k.neutral, "★ 3 stars", null, "#98A2B3"),
      K("Negative", "Negative", k.negative, "★ 1–2 stars · follow-up required", "#B42318", "#F04438"),
      K("rate", "Response Rate", k.rate == null ? "—" : k.rate + "%", `${k.responses} of ${k.sent} surveys sent${k.failed ? ` · ${k.failed} not delivered` : ""}`, null, "#6941C6"),
    ]),
    R("minmax(0,1fr) minmax(0,1fr)", [
      card({ title: "CSAT trend", sub: "% positive per week", trend: trendHas ? mkTrend(c.trend.map((w) => w.label), [{ t: "CSAT %", c: "#12A150", v: c.trend.map((w) => w.pct ?? 0) }], "Weekly", "CSAT trend by week") : null, empty: trendHas ? null : { t: "No ratings yet.", d: "Surveys are sent after tickets are resolved.", acts: [] } }),
      card({ title: "CSAT by agent", sub: "% positive", bars: mkBars(c.byAgent.map(([l, v]) => [l, v]), "#12A150", (v) => v + "%") }),
    ]),
    R("minmax(0,1fr) minmax(0,1fr)", [card({ title: "CSAT by category", bars: mkBars(c.byCategory.map(([l, v]) => [l, v]), "#2E90FA", (v) => v + "%") }), card({ title: "CSAT by channel", bars: mkBars(c.byChannel.map(([l, v]) => [l, v]), "#6941C6", (v) => v + "%") })]),
    R("minmax(0,1.6fr) minmax(0,1fr)", [
      card({
        id: "cs",
        title: "Feedback",
        filters: { search: null, q: "", sels: [sel("rating", "Rating", f.rating, O(["Positive", "Neutral", "Negative"], "Any rating")), sel("agent", "Agent", f.agent, O(ws.agents.map((a) => ({ v: a.id, t: a.name })), "Any agent"))], nOn: [f.rating, f.agent].filter(Boolean).length || null, count: `${L.length} responses` },
        table: L.length ? table : null,
        empty: L.length ? null : { t: c.responses.length ? "No responses match." : "No CSAT responses yet.", d: "Surveys are sent after tickets are resolved.", acts: [] },
        api: "GET /helpdesk/csat",
      }),
      card({ id: "sv", title: "Survey settings", acts: [btn("survey", "Edit", "ghost", !act.manager)], table: { hasActs: false, cols: plainCols(["Setting", "Value"]), rows: surv.map(([a, b], i) => ({ id: "s" + i, bg: "#fff", cells: [cell({ t: a, fw: 700, fg: "#101828" }), cell({ t: b })], cardT: a, cardS: b, cardB: [] })) }, info: "CSAT is private support feedback. It is never published or treated as a public review — public reviews live in Reviews & Reputation.", api: "PATCH /helpdesk/csat/settings" }),
    ]),
  ];
  const h: Handlers = {
    kpiClick: (key) => (["Positive", "Neutral", "Negative"].includes(key) ? act.set({ cf: { ...f, rating: key } }) : act.set({ drawer: { kind: "metric", id: key } })),
    setF: (_b, key, v) => act.set({ cf: { ...f, [key]: v } }),
    clearF: () => act.set({ cf: { rating: "", agent: "" } }),
    blockAct: (key) => key === "survey" && act.openModal("survey"),
    rowOpen: (b, id) => b === "cs" && act.openTicket(id),
    rowAct: (_b, id, v) => {
      const x = c.responses.find((r) => r.number === id);
      if (v === "Open ticket") return act.openTicket(id);
      if (v === "Create follow-up") return act.openModal("followup", { id, agent: x?.agentId ?? "" });
      if (v === "Mark follow-up done" || v === "Reopen follow-up") return void act.call(v, () => hdApi.followUpState(id, v === "Mark follow-up done" ? "Done" : "Open"), () => `Follow-up ${v === "Mark follow-up done" ? "marked done" : "reopened"}.`);
    },
  };
  return <Rows rows={rows} h={h} label={label("csat")} />;
}

// ── 9 Analytics ──────────────────────────────────────────────────────────────

export function AnalyticsScreen() {
  const { data: ws } = useWorkspace();
  const act = useHdActions(ws);
  const range = useHd((s) => s.range);
  const branch = useHd((s) => s.branch);
  const af = useHd((s) => s.af);
  const params = { ...af, range, branch: branchParam(branch) };
  const q = useQuery({ queryKey: ["hd", "analytics", params], queryFn: () => hdApi.analytics(params), placeholderData: keepPreviousData, enabled: !!ws && act.can("View analytics") });
  if (!ws || q.isLoading) return <Skeleton />;
  if (q.error || !q.data) return <Failed error={q.error} retry={() => void q.refetch()} />;
  const a = q.data;
  const k = a.kpis;
  const cfg = ws.settings.config;
  const labels = a.series.map((s) => s.label);
  const filt = card({
    id: "an",
    title: "Filters & export",
    filters: {
      search: null,
      q: "",
      sels: [
        sel("agent", "Agent", af.agent, O(ws.agents.map((x) => ({ v: x.id, t: x.name })), "All agents")),
        sel("queue", "Team / queue", af.queue, O(ws.queues.map((x) => ({ v: x.id, t: x.name })), "All queues")),
        sel("cat", "Category", af.cat, O(cfg.categories, "All categories")),
        sel("pri", "Priority", af.pri, O(PRIORITIES, "All priorities")),
        sel("ch", "Channel", af.ch, O(ws.chanList, "All channels")),
      ],
      nOn: Object.values(af).filter(Boolean).length || null,
      count: `${a.count} tickets · date range and branch from header`,
    },
    acts: [btn("csv", "Export CSV"), btn("xls", "Export Excel"), btn("pdf", "PDF", "ghost", true, "The export service supports CSV and Excel only")],
  });
  const agT: Table = {
    hasActs: false,
    cols: plainCols(["Agent", "Assigned", "Resolved", "First response", "Resolution time", "SLA %", "Reopen %", "CSAT"]),
    rows: a.agents.map((r) => ({
      id: r.id,
      bg: "#fff",
      cells: [
        cell({ t: r.name, fw: 800, fg: "#101828", s: r.title }),
        cell({ t: String(r.assigned) }),
        cell({ t: String(r.resolved) }),
        cell({ t: r.frH == null ? "—" : r.frH + "h" }),
        cell({ t: r.resH == null ? "—" : r.resH + "h" }),
        cell({ t: r.sla == null ? "—" : r.sla + "%", fg: r.sla != null && r.sla < 85 ? "#B54708" : "#344054", fw: 700 }),
        cell({ t: r.reopen == null ? "—" : r.reopen + "%" }),
        cell({ t: r.csat == null ? "—" : "★ " + r.csat.toFixed(1) }),
      ],
      cardT: r.name,
      cardS: `${r.resolved} resolved · SLA ${r.sla ?? "—"}% · CSAT ${r.csat ?? "—"}`,
      cardB: [],
    })),
  };
  const note = a.weekly ? "Weekly rollup" : "Daily rollup";
  const rows = [
    R("minmax(0,1fr)", [filt], false),
    kpiRow([
      K("c", "Tickets Created", k.created, range, null, "#0A1B2A"),
      K("r", "Tickets Resolved", k.resolved, `${Math.round((k.resolved / Math.max(1, k.created)) * 100)}% of created`, null, "#12A150"),
      K("f", "First Response Time", fmtM(k.frt), "Average", null, "#2E90FA"),
      K("t", "Resolution Time", fmtM(k.res), "Average", null, "#6941C6"),
      K("s", "SLA Compliance", k.compliance == null ? "—" : k.compliance + "%", `${k.bad} breached or missed`, null, "#12A150"),
      K("o", "Reopen Rate", k.reopenRate == null ? "—" : k.reopenRate + "%", `${k.reopened} reopened`, null, "#F79009"),
      K("b", "Backlog", k.backlog, "Open tickets", null, "#C11574"),
      K("x", "CSAT", k.csat == null ? "—" : k.csat + "%", `${k.csatN} responses`, null, "#12A150"),
    ]),
    R("minmax(0,1fr) minmax(0,1fr)", [card({ title: "1 · Ticket volume over time", trend: mkTrend(labels, [{ t: "Tickets", c: "#0A1B2A", v: a.series.map((s) => s.created) }], note, "Ticket volume") }), card({ title: "2 · Created vs resolved", trend: mkTrend(labels, [{ t: "Created", c: "#0A1B2A", v: a.series.map((s) => s.created) }, { t: "Resolved", c: "#12A150", v: a.series.map((s) => s.resolved) }], note, "Created versus resolved") })]),
    R("minmax(0,1fr) minmax(0,1fr)", [card({ title: "3 · First response time trend", sub: "Minutes", trend: mkTrend(labels, [{ t: "Avg first response (min)", c: "#2E90FA", v: a.series.map((s) => s.frt) }], "", "First response minutes") }), card({ title: "4 · Resolution time trend", sub: "Hours", trend: mkTrend(labels, [{ t: "Avg resolution (h)", c: "#6941C6", v: a.series.map((s) => s.res) }], "", "Resolution hours") })]),
    R("minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)", [card({ title: "5 · By category", bars: mkBars(a.byCategory, "#2E90FA") }), card({ title: "6 · By channel", bars: mkBars(a.byChannel.filter(([c]) => ws.allChannels.includes(c)), "#6941C6") }), card({ title: "7 · By priority", bars: mkBars(a.byPriority.map(([p, n]) => [`${PRI[p][2]} ${p}`, n, PRI[p][0]])) })]),
    R("minmax(0,1fr) minmax(0,1fr)", [card({ title: "8 · SLA compliance", sub: "% of tickets created each period that are within target", trend: mkTrend(labels, [{ t: "SLA %", c: "#12A150", v: a.series.map((s) => s.sla ?? 0) }], "", "SLA compliance") }), card({ title: "9 · Agent performance", sub: "Tickets resolved", bars: mkBars(a.agents.map((r) => [r.name, r.resolved] as [string, number]).sort((x, y) => y[1] - x[1]), "#0A1B2A") })]),
    R("minmax(0,1fr)", [card({ title: "Agent performance", table: a.agents.length ? agT : null, empty: a.agents.length ? null : { t: "No agents.", d: "Staff with Helpdesk access appear here.", acts: [] }, api: "GET /helpdesk/analytics" })]),
    R("minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)", [
      card({ title: "Backlog · age bands", bars: mkBars(a.bands, "#C11574") }),
      card({ title: "Backlog · by queue", bars: mkBars(a.byQueue, "#0A1B2A") }),
      card({
        title: "Backlog · SLA risk",
        bars: mkBars(
          a.slaRisk.map(([l, n]) => {
            const m: Record<string, [string, string]> = { Healthy: ["✓ Healthy", "#12A150"], Paused: ["‖ Paused", "#98A2B3"], "At risk": ["! At risk", "#F79009"], Breached: ["✕ Breached", "#F04438"] };
            return [m[l][0], n, m[l][1]];
          }),
        ),
      }),
    ]),
    R("minmax(0,1fr)", [card({ id: "old", title: "Oldest open tickets", table: a.oldest.length ? ticketTable(a.oldest, "compact", { can: act.can }) : null, empty: a.oldest.length ? null : { t: "No backlog.", d: "Every ticket in scope is resolved.", acts: [] }, api: "GET /helpdesk/analytics · GET /helpdesk/analytics/export" })]),
  ];
  const map: Record<string, Record<string, string>> = { b: { st: "__active" }, c: {}, r: { st: "Resolved" }, s: { sla: "Breached" } };
  const h: Handlers = {
    kpiClick: (key) => (map[key] ? act.tfGo(map[key]) : act.set({ drawer: { kind: "metric", id: key } })),
    setF: (_b, key, v) => act.set({ af: { ...af, [key]: v } }),
    clearF: () => act.set({ af: { agent: "", queue: "", cat: "", pri: "", ch: "" } }),
    blockAct: (key) => {
      if (key !== "csv" && key !== "xls") return;
      const kind = key === "xls" ? "xlsx" : "csv";
      void hdDownload(`/analytics/export${hdQs({ ...params, kind })}`, `helpdesk-analytics.${kind}`)
        .then((n) => act.flash(`Exported ${n} tickets (${kind.toUpperCase()}). Customer data exported by ID only.`))
        .catch((e) => act.flash("Export failed — " + errText(e)));
    },
    rowOpen: (b, id) => b === "old" && act.openTicket(id),
  };
  return <Rows rows={rows} h={h} label={label("analytics")} />;
}

export type { Workspace };
