"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { hdApi, type Article, type Detail, type TRow, type Workspace } from "@/lib/helpdesk-api";
import { useHd } from "./hd-store";
import { useHdActions } from "./hd-actions";
import { DrawerPanel, ModalForm, type DrawerView, type Field, type ModalView } from "./hd-render";
import { ESC_REASONS, FILE_OK, LINK_TYPES, METRIC, O, PRI, PRIORITIES, btn, dt, fmtM, ago, priB, stB } from "./hd-core";

const F = (name: string, label: string, type: Field["type"], o: Partial<Field> = {}): Field => ({ name, label, type, ...o });
const priOpts = () => PRIORITIES.map((p) => ({ v: p, t: `${PRI[p][2]} ${p}` }));
const B = (t: string, bg = "#F2F4F7", fg = "#344054") => ({ t, bg, fg });

function useDebounced<T>(v: T, ms = 250) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export function HdOverlays({ ws }: { ws: Workspace }) {
  const act = useHdActions(ws);
  const modal = useHd((s) => s.modal);
  const modalErr = useHd((s) => s.modalErr);
  const busy = useHd((s) => s.busy);
  const drawer = useHd((s) => s.drawer);
  const set = useHd((s) => s.set);
  const closeModal = useHd((s) => s.closeModal);
  const [custQ, setCustQ] = useState("");
  const dq = useDebounced(custQ);

  // Escape closes the top-most overlay (design behaviour).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const s = useHd.getState();
      if (s.modal) s.closeModal();
      else if (s.drawer) s.set({ drawer: null });
      else if (s.dMore) s.set({ dMore: false });
      else if (s.split) s.set({ split: null });
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const kind = modal?.kind;
  const customers = useQuery({ queryKey: ["hd", "customers", dq], queryFn: () => hdApi.customers(dq), enabled: kind === "new" });
  const mergeCust = kind === "merge" ? (modal!.rows as TRow[] | undefined)?.[0]?.customerId : undefined;
  const mergeCands = useQuery({ queryKey: ["hd", "merge", mergeCust], queryFn: () => hdApi.tickets({ st: "__active", cust: mergeCust, limit: 200, branch: "all" }), enabled: kind === "merge" && !!mergeCust });
  const amQ = kind === "assignMany" ? (modal!.q as string | undefined) : undefined;
  const assignList = useQuery({ queryKey: ["hd", "assignMany", amQ ?? ""], queryFn: () => hdApi.tickets(amQ ? { st: "__active", queue: amQ, limit: 200, sort: "oldest" } : { st: "__active", agent: "__none", limit: 200, sort: "oldest" }), enabled: kind === "assignMany" });
  const plan = useQuery({ queryKey: ["hd", "rebalance-plan"], queryFn: () => hdApi.rebalance(false), enabled: kind === "rebalance" });
  const kb = useQuery({ queryKey: ["hd", "knowledge"], queryFn: () => hdApi.knowledge(), enabled: kind === "article" || drawer?.kind === "article" });
  const lib = useQuery({ queryKey: ["hd", "library"], queryFn: () => hdApi.library(), enabled: kind === "reply" || kind === "macro" });

  const agentOpts = [{ v: "", t: "Unassigned" }, ...ws.agents.map((a) => ({ v: a.id, t: `${a.name} — ${a.open}/${a.cap} open · ${a.status}` }))];
  const cfg = ws.settings.config;
  const statusList = [...cfg.statuses, ...cfg.customStatuses];
  const agName = (id: string | null | undefined) => ws.agents.find((a) => a.id === id)?.name ?? "Unassigned";
  const err = (m: string) => set({ modalErr: m });

  let mv: ModalView | null = null;
  if (modal) {
    const rows = (modal.rows as TRow[] | undefined) ?? [];
    const ids = rows.map((r) => r.number);
    const one = rows.length === 1 ? rows[0] : null;
    const lbl = ids.length > 1 ? `${ids.length} tickets` : ids[0];
    const bulkOk = (verb: string) => (r: { done: number; skipped: Array<{ number: string; why: string }> }) => {
      set({ sel: [] });
      return r.skipped.length ? `${verb} ${r.done}. Skipped ${r.skipped.length}: ${r.skipped[0].number} — ${r.skipped[0].why}` : `${verb} ${r.done === 1 ? ids[0] : r.done + " tickets"}.`;
    };
    const many = (action: string, verb: string, value?: string, note?: string) => act.call(verb, () => hdApi.bulk(ids, action, value, note), bulkOk(verb));

    if (kind === "new") {
      const opts = customers.data ?? [];
      mv = {
        title: "New ticket",
        sub: "Customer is linked to its canonical CRM record — Helpdesk never stores its own customer copy.",
        primaryT: "Create ticket",
        fields: [
          F("cust", "Customer", "select", { req: true, value: (modal.cust as string) ?? "", options: [{ v: "", t: customers.isLoading ? "Loading customers…" : "Select a CRM customer…" }, ...opts.map((c) => ({ v: c.id, t: `${c.name}${c.sub ? " · " + c.sub : ""}` }))], help: "Not listed? Create the customer in Customers (CRM) first — Helpdesk never creates its own customer copy.", search: { ph: "Search customers by name, phone or email", onChange: setCustQ } }),
          F("subj", "Subject", "text", { req: true, ph: "Short summary", af: true }),
          F("desc", "Description", "area", { ph: "What does the customer need?" }),
          F("ch", "Channel", "select", { value: "Manual", options: O(ws.chanList) }),
          F("cat", "Category", "select", { value: cfg.categories[0], options: O(cfg.categories) }),
          F("sub", "Subcategory", "text", { ph: "Optional, e.g. Duplicate charge" }),
          F("pri", "Priority", "select", { value: cfg.general.defaultPriority, options: O(PRIORITIES) }),
          F("agent", "Assigned agent", "select", { options: agentOpts }),
          F("q", "Queue", "select", { value: "", options: [{ v: "", t: `Default (routed by category, else ${cfg.general.defaultQueue})` }, ...ws.queues.filter((q) => q.active).map((q) => ({ v: q.id, t: q.name }))] }),
          F("br", "Branch", "select", { value: "", options: [{ v: "", t: cfg.general.defaultBranch === "Customer’s home branch" ? "Customer’s home branch" : `Default (${cfg.general.defaultBranch})` }, ...ws.branches.map((b) => ({ v: b.id, t: b.name }))] }),
          F("tags", "Tags", "text", { ph: "comma, separated" }),
          F("atts", "Attachments", "file", { help: "JPG, PNG, PDF, TXT, CSV, DOCX, XLSX · max 10 MB each · content type is checked before storage" }),
        ],
        submit: async (fd) => {
          const v = (n: string) => String(fd.get(n) ?? "").trim();
          if (!v("cust")) return err("Select a customer from CRM.");
          if (!v("subj")) return err("Subject is required.");
          const files = fd.getAll("atts").filter((f): f is File => f instanceof File && !!f.name);
          const badF = files.filter((f) => !FILE_OK.includes((f.name.split(".").pop() ?? "").toLowerCase()) || f.size > 10485760);
          if (badF.length) return err(`Blocked attachment: ${badF.map((f) => f.name).join(", ")} — type not allowed or over 10 MB.`);
          const body = new FormData();
          const put = (k: string, x: string) => x && body.append(k, x);
          put("customerId", v("cust"));
          put("subject", v("subj"));
          put("description", v("desc"));
          put("channel", v("ch"));
          put("category", v("cat"));
          put("subcategory", v("sub"));
          put("priority", v("pri"));
          put("agentId", v("agent"));
          put("queueId", v("q"));
          put("branchId", v("br"));
          put("tags", v("tags"));
          for (const f of files) body.append("files", f);
          const r = await act.call("Create ticket", () => hdApi.createTicket(body), (t) => `Ticket ${t.number} created.`);
          if (r) act.openTicket(r.number);
        },
      };
    } else if (kind === "assign") {
      mv = { title: `${one && one.agentUserId ? "Reassign " : "Assign "}${lbl}`, primaryT: "Assign", fields: [F("agent", "Agent", "select", { value: one?.agentUserId ?? "", options: agentOpts, af: true, help: "Agents come from Staff. Load shown as open / capacity." })], submit: (fd) => void many("assign", fd.get("agent") ? "Assigned" : "Unassigned", String(fd.get("agent") ?? "")) };
    } else if (kind === "status") {
      mv = { title: `Change status · ${lbl}`, primaryT: "Change status", fields: [F("st", "Status", "select", { value: one?.status ?? "Open", options: O(statusList.filter((x) => (x !== "Closed" || act.can("Close")) && (x !== "Resolved" || act.can("Resolve")))), af: true, help: "Waiting on Customer pauses SLA on policies configured to pause." })], submit: (fd) => void many("status", "Status changed on", String(fd.get("st"))) };
    } else if (kind === "pri") {
      mv = { title: `Change priority · ${lbl}`, primaryT: "Change priority", fields: [F("pri", "Priority", "select", { value: one?.priority ?? "Normal", options: priOpts(), af: true, help: "Priority changes can switch the applicable SLA policy." })], submit: (fd) => void many("priority", "Priority changed on", String(fd.get("pri"))) };
    } else if (kind === "tag") {
      mv = { title: `Add tag · ${lbl}`, primaryT: "Add tag", fields: [F("tag", "Tag", "text", { req: true, ph: "e.g. refund", af: true })], submit: (fd) => (String(fd.get("tag") ?? "").trim() ? void many("tag", "Tag added to", String(fd.get("tag"))) : err("Enter a tag.")) };
    } else if (kind === "queue") {
      mv = { title: `Move queue · ${lbl}`, primaryT: "Move", fields: [F("q", "Queue", "select", { value: one?.queueId ?? "", options: ws.queues.filter((q) => q.active).map((q) => ({ v: q.id, t: q.name })), af: true })], submit: (fd) => void many("queue", "Moved", String(fd.get("q"))) };
    } else if (kind === "close") {
      mv = { title: `Close ${lbl}?`, sub: "Closed is the final state. Customers can’t reply into a closed ticket; reopening follows the reopen policy.", primaryT: `Close ${ids.length > 1 ? ids.length + " tickets" : "ticket"}`, pBg: "#B42318", fields: [F("note", "Internal note (optional)", "area", { rows: 2, ph: "Why are these being closed?" })], submit: (fd) => void many("close", "Closed", undefined, String(fd.get("note") ?? "")) };
    } else if (kind === "resolve") {
      mv = { title: `Resolve ${lbl}`, sub: "Resolved tickets can still reopen. A CSAT survey is scheduled if enabled for the channel.", primaryT: "Resolve", fields: [F("note", "Resolution note (internal, optional)", "area", { rows: 3, af: true })], submit: (fd) => void many("resolve", "Resolved", undefined, String(fd.get("note") ?? "")) };
    } else if (kind === "merge") {
      if (rows.length > 1) {
        const diff = new Set(rows.map((r) => r.customerId)).size > 1;
        mv = {
          title: `Merge ${rows.length} tickets`,
          sub: "Pick the ticket to keep. The others are closed and their messages, notes, attachments, source references and audit history move into it.",
          primaryT: "Merge",
          note: diff ? "These tickets belong to different customers. Merging across customers is blocked." : null,
          fields: [F("dst", "Keep ticket", "select", { req: true, value: rows[0].number, options: rows.map((t) => ({ v: t.number, t: `${t.number} · ${t.subject} · ${t.customerName}` })) })],
          submit: async (fd) => {
            if (diff) return err("Can’t merge tickets from different customers.");
            const dst = String(fd.get("dst"));
            const r = await act.call("Merge", () => hdApi.merge(dst, ids.filter((i) => i !== dst)), () => `Merged ${ids.length - 1} ticket(s) into ${dst}.`);
            if (r) {
              set({ sel: [] });
              act.openTicket(dst);
            }
          },
        };
      } else if (one) {
        const cand = (mergeCands.data?.rows ?? []).filter((x) => x.number !== one.number);
        mv = {
          title: `Merge ${one.number} into…`,
          sub: `Everything on ${one.number} — messages, notes, attachments, source ${one.channel} and audit history — is preserved on the target. ${one.number} is then closed.`,
          primaryT: "Merge",
          note: mergeCands.isSuccess && !cand.length ? `${one.customerName} has no other open ticket to merge into. Tickets of other customers can’t be merged.` : null,
          fields: [F("dst", "Target ticket", "select", { req: true, options: [{ v: "", t: mergeCands.isLoading ? "Loading…" : "Select ticket…" }, ...cand.map((x) => ({ v: x.number, t: `★ Same customer · ${x.number} · ${x.subject}` }))], af: true })],
          submit: async (fd) => {
            const dst = String(fd.get("dst") ?? "");
            if (!dst) return err("Pick a target ticket.");
            const r = await act.call("Merge", () => hdApi.merge(dst, [one.number]), () => `${one.number} merged into ${dst} · history preserved`);
            if (r) act.openTicket(dst);
          },
        };
      }
    } else if (kind === "escalate" && one) {
      const esc = ws.queues.find((q) => q.sys === "escalations");
      mv = {
        title: `Escalate ${lbl}`,
        primaryT: "Escalate",
        pBg: "#C11574",
        fields: [
          F("reason", "Escalation reason", "select", { req: true, options: O(ESC_REASONS, "Select a reason…"), af: true }),
          F("to", "Escalate to", "select", { value: esc?.active ? "escalations" : "", options: [...(esc?.active ? [{ v: "escalations", t: `Escalations queue${esc.members.length ? " (" + esc.members.map(agName).join(", ") + ")" : ""}` }] : []), ...ws.agents.map((a) => ({ v: a.id, t: `${a.name} · ${a.title}` }))] }),
          F("pri", "Priority", "select", { value: one.priority, options: priOpts() }),
          F("note", "Internal note", "area", { rows: 3, ph: "Context for whoever picks this up" }),
        ],
        submit: (fd) => {
          if (!fd.get("reason")) return err("Choose an escalation reason.");
          void act.call("Escalate", () => hdApi.escalate(one.number, { reason: fd.get("reason"), to: fd.get("to"), priority: fd.get("pri"), note: fd.get("note") }), () => `${one.number} escalated.`);
        },
      };
    } else if (kind === "follower" && one) {
      mv = {
        title: `Followers · ${lbl}`,
        sub: "Followers get internal notifications for this ticket.",
        primaryT: "Save followers",
        fields: [F("fol", "Team members", "checks", { options: ws.agents.map((a) => ({ v: a.id, t: `${a.name} · ${a.title}`, on: one.followers.includes(a.id) })) })],
        submit: (fd) => void act.call("Followers", () => hdApi.followers(one.number, fd.getAll("fol").map(String)), () => "Followers updated."),
      };
    } else if (kind === "link" && one) {
      mv = {
        title: "Link related record",
        sub: "Only existing canonical records can be linked. Helpdesk stores the reference, not a copy.",
        primaryT: "Link",
        fields: [
          F("type", "Record type", "select", { value: "Order", options: Object.entries(LINK_TYPES).map(([k, v]) => ({ v: k, t: v.available ? k : `${k} — not available (${v.why})` })) }),
          F("rid", "Record ID", "text", { req: true, ph: "e.g. ORD-1042, BK-310, PRJ-2026-00001", af: true }),
        ],
        submit: (fd) => {
          const type = String(fd.get("type"));
          const rid = String(fd.get("rid") ?? "").trim().toUpperCase();
          const def = LINK_TYPES[type];
          if (!def.available) return err(`${type} can’t be linked — ${def.why}.`);
          if (!rid.startsWith(def.prefix)) return err(`${type} IDs start with ${def.prefix}`);
          void act.call("Link record", () => hdApi.link(one.number, type, String(fd.get("rid")).trim()), () => `${rid} linked.`);
        },
      };
    } else if (kind === "split" && one) {
      const pick = useHd.getState().split ?? [];
      mv = {
        title: "Split into new ticket",
        sub: `${pick.length} selected item(s) will be copied into a new ticket for the same customer. The original keeps its history and gets a link.`,
        primaryT: "Create ticket",
        fields: [F("subj", "New subject", "text", { req: true, value: `Split from ${one.number}: `, af: true }), F("pri", "Priority", "select", { value: one.priority, options: O(PRIORITIES) }), F("agent", "Assign to", "select", { value: one.agentUserId ?? "", options: agentOpts })],
        submit: async (fd) => {
          if (!String(fd.get("subj") ?? "").trim()) return err("Subject is required.");
          const r = await act.call("Split", () => hdApi.split(one.number, { messageIds: pick, subject: fd.get("subj"), priority: fd.get("pri"), agentId: fd.get("agent") || undefined }), (t) => `Created ${t.number} from ${pick.length} item(s).`);
          if (r) {
            set({ split: null });
            act.openTicket(r.number);
          }
        },
      };
    } else if (kind === "queueEdit") {
      const q = modal.id ? ws.queues.find((x) => x.id === modal.id) : null;
      const cur = q ?? { name: "", desc: "", members: [] as string[], categories: [] as string[], branchId: null as string | null, method: "Manual", active: true, priorityRule: "None" };
      mv = {
        title: q ? `Edit queue · ${q.name}` : "Create queue",
        primaryT: q ? "Save queue" : "Create queue",
        fields: [
          F("name", "Queue name", "text", { req: true, value: cur.name, af: true }),
          F("desc", "Description", "area", { rows: 2, value: cur.desc }),
          F("active", "Status", "select", { value: cur.active ? "Active" : "Inactive", options: O(["Active", "Inactive"]) }),
          F("members", "Members (from Staff)", "checks", { options: ws.agents.map((a) => ({ v: a.id, t: `${a.name} · ${a.skills.join(", ") || "no skills set"}`, on: cur.members.includes(a.id) })) }),
          F("cats", "Ticket categories", "checks", { options: cfg.categories.map((c) => ({ v: c, t: c, on: cur.categories.includes(c) })) }),
          F("branch", "Branch scope", "select", { value: cur.branchId ?? "all", options: [{ v: "all", t: "All branches" }, ...ws.branches.map((b) => ({ v: b.id, t: b.name }))] }),
          F("prule", "Priority rule", "select", { value: cur.priorityRule, options: O(["None", "Urgent first", "VIP first", "Oldest first"]) }),
          F("method", "Assignment method", "select", { value: cur.method, options: O(["Manual", "Round Robin", "Least Loaded", "Skill Based", "Branch Based"]), help: "Skill Based needs categories matched to agent skills. Branch Based needs a specific branch scope. Nothing auto-assigns until configured." }),
        ],
        submit: (fd) => {
          const v = (n: string) => String(fd.get(n) ?? "").trim();
          if (!v("name")) return err("Queue name is required.");
          const method = v("method");
          const cats = fd.getAll("cats").map(String);
          const members = fd.getAll("members").map(String);
          if (method === "Skill Based" && !cats.length) return err("Skill Based needs at least one ticket category to match agent skills.");
          if (method === "Branch Based" && v("branch") === "all") return err("Branch Based needs a specific branch scope.");
          if (method !== "Manual" && !members.length) return err(`${method} needs at least one member.`);
          void act.call("Save queue", () => hdApi.saveQueue(q?.id ?? null, { name: v("name"), description: v("desc"), active: v("active") === "Active", members, categories: cats, branchId: v("branch"), priorityRule: v("prule"), method }), () => `Queue “${v("name")}” saved.`);
        },
      };
    } else if (kind === "qDisable") {
      const q = ws.queues.find((x) => x.id === modal.id)!;
      const n = q.stats.open;
      mv = {
        title: `Disable ${q.name}?`,
        sub: n ? `${n} open tickets are in this queue. They must move to another queue first.` : "No open tickets in this queue.",
        primaryT: "Disable queue",
        pBg: "#B42318",
        fields: n ? [F("to", "Move open tickets to", "select", { options: ws.queues.filter((x) => x.id !== q.id && x.active).map((x) => ({ v: x.id, t: x.name })) })] : [],
        submit: (fd) =>
          void act.call("Disable queue", () => hdApi.queueActive(q.id, false, String(fd.get("to") ?? "") || undefined), () => {
            set({ drawer: null });
            return `${q.name} disabled.`;
          }),
      };
    } else if (kind === "assignMany") {
      const un = assignList.data?.rows ?? [];
      mv = {
        title: `Assign tickets${amQ ? " · " + (ws.queues.find((q) => q.id === amQ)?.name ?? "") : ""}`,
        primaryT: "Assign selected",
        fields: assignList.isLoading
          ? [F("none", "Tickets", "read", { value: "Loading…" })]
          : un.length
            ? [F("tids", "Tickets", "checks", { options: un.map((t) => ({ v: t.number, t: `${t.number} · ${t.priority} · ${t.subject}${t.agentUserId ? " (" + t.agentName + ")" : ""}`, on: !t.agentUserId })) }), F("agent", "Assign to", "select", { req: true, value: (modal.agent as string) ?? "", options: [{ v: "", t: "Choose an agent…" }, ...agentOpts.slice(1)] })]
            : [F("none", "Tickets", "read", { value: "No tickets to assign." })],
        submit: (fd) => {
          if (!un.length) return closeModal();
          const tids = fd.getAll("tids").map(String);
          if (!tids.length) return err("Select at least one ticket.");
          if (!fd.get("agent")) return err("Choose an agent.");
          void act.call("Assign tickets", () => hdApi.assignMany(tids, String(fd.get("agent"))), (r) => `${r.done} ticket(s) assigned to ${agName(String(fd.get("agent")))}.${r.skipped.length ? ` Skipped ${r.skipped.length}: ${r.skipped[0].why}` : ""}`);
        },
      };
    } else if (kind === "rebalance") {
      const p = plan.data?.plan ?? [];
      mv = {
        title: "Rebalance workload",
        sub: plan.isLoading ? "Working out the moves…" : p.length ? "Moves tickets from agents over capacity to the least-loaded eligible member of the same queue. Only Online agents receive tickets." : "Everyone is within capacity. Nothing to move.",
        primaryT: p.length ? `Apply ${p.length} move(s)` : "Close",
        fields: [F("plan", "Proposed moves", "read", { value: p.length ? p.map((x) => `${x.number}: ${x.from} → ${x.to}`).join("\n") : "None" })],
        submit: () => (p.length ? void act.call("Rebalance", () => hdApi.rebalance(true), (r) => `Rebalanced · ${r.plan.length} ticket(s) moved.`) : closeModal()),
      };
    } else if (kind === "sla") {
      const p = modal.id ? ws.policies.find((x) => x.id === modal.id) : null;
      const cur = p ?? { name: "", applies: "Specific Priority", scope: "", priority: "Normal", fr: 60, res: 480, hours: "Standard hours", pause: [...(cfg.sla.pauseWaiting ? ["Waiting on Customer"] : []), ...(cfg.sla.pauseInternal ? ["Waiting on Internal Team"] : [])], warn: cfg.sla.warn, active: true };
      mv = {
        title: p ? "Edit SLA policy" : "New SLA policy",
        primaryT: "Save policy",
        fields: [
          F("name", "Policy name", "text", { req: true, value: cur.name, af: true }),
          F("applies", "Applies to", "select", { value: cur.applies, options: O(["All Tickets", "Specific Priority", "Category", "Queue", "Customer Segment", "Branch"]) }),
          F("scope", "Scope value", "text", { value: cur.applies === "Specific Priority" ? "" : cur.scope, ph: "e.g. Billing, VIP, a branch name", help: "Needed for Category, Queue, Customer Segment (a CRM segment name or customer tag) and Branch." }),
          F("pri", "Priority", "select", { value: cur.priority, options: O(["Any", ...PRIORITIES]) }),
          F("fr", "First response target (minutes)", "number", { req: true, value: String(cur.fr), min: 1 }),
          F("res", "Resolution target (minutes)", "number", { req: true, value: String(cur.res), min: 1 }),
          F("hours", "Business hours calendar", "select", { value: cur.hours, options: O(["24/7", "Standard hours"]) }),
          F("pause", "Pause SLA when", "checks", { options: ["Waiting on Customer", "Waiting on Internal Team", ...cfg.customStatuses].map((x) => ({ v: x, t: x, on: cur.pause.includes(x) })) }),
          F("warn", "Warning threshold (%)", "number", { value: String(cur.warn), min: 10, max: 99 }),
          F("active", "Status", "select", { value: cur.active ? "Active" : "Inactive", options: O(["Active", "Inactive"]) }),
        ],
        submit: (fd) => {
          const v = (n: string) => String(fd.get(n) ?? "").trim();
          const fr = Number(v("fr"));
          const res = Number(v("res"));
          const applies = v("applies");
          if (!v("name")) return err("Policy name is required.");
          if (!(fr > 0) || !(res > 0)) return err("Targets must be positive minutes.");
          if (res < fr) return err("Resolution target must be at least the first response target.");
          if (applies !== "All Tickets" && applies !== "Specific Priority" && !v("scope")) return err(`${applies} needs a scope value.`);
          void act.call("Save SLA policy", () => hdApi.savePolicy(p?.id ?? null, { name: v("name"), applies, scope: v("scope"), priority: v("pri"), fr, res, hours: v("hours"), pause: fd.getAll("pause").map(String), warn: Number(v("warn")) || 75, active: v("active") === "Active" }), () => "Policy saved. Open tickets re-evaluated.");
        },
      };
    } else if (kind === "rule") {
      const r = modal.id ? ws.rules.find((x) => x.id === modal.id) : null;
      const cur = r ?? { name: "", trigger: "SLA At Risk", action: "Notify", target: "", ageHours: 24, active: true };
      const managers = ws.agents.filter((a) => a.role !== "Agent");
      mv = {
        title: r ? "Edit escalation rule" : "New escalation rule",
        primaryT: "Save rule",
        note: "Support-specific only. Cross-module workflows belong in Automations & Workflows.",
        fields: [
          F("name", "Rule name", "text", { req: true, value: cur.name, af: true }),
          F("trig", "Trigger", "select", { value: cur.trigger, options: O(["SLA At Risk", "SLA Breached", "Priority = Urgent", "No Agent Assigned", "Ticket Age"]) }),
          F("age", "Ticket age threshold (hours)", "number", { value: String(cur.ageHours ?? 24), help: "Only used by the Ticket Age trigger." }),
          F("action", "Action", "select", { value: cur.action, options: O(["Notify", "Reassign", "Move queue", "Raise priority", "Create internal alert"]) }),
          F("to", "Escalate to", "select", { value: cur.target || (managers[0] ? "user:" + managers[0].id : ""), options: [...managers.map((a) => ({ v: "user:" + a.id, t: "Manager · " + a.name })), ...ws.queues.filter((q) => q.active).map((q) => ({ v: "queue:" + q.id, t: "Queue · " + q.name })), ...ws.agents.filter((a) => a.role === "Agent").map((a) => ({ v: "user:" + a.id, t: "Agent · " + a.name }))] }),
          F("active", "Status", "select", { value: cur.active ? "Active" : "Inactive", options: O(["Active", "Inactive"]) }),
        ],
        submit: (fd) => {
          const v = (n: string) => String(fd.get(n) ?? "").trim();
          if (!v("name")) return err("Rule name is required.");
          if ((v("action") === "Move queue" || v("action") === "Reassign") && !v("to").startsWith("queue:")) return err(`${v("action")} needs a queue as the target.`);
          void act.call("Save rule", () => hdApi.saveRule(r?.id ?? null, { name: v("name"), trigger: v("trig"), ageHours: Number(v("age")) || 24, action: v("action"), target: v("to"), active: v("active") === "Active" }), () => `Rule “${v("name")}” saved.`);
        },
      };
    } else if (kind === "article") {
      const all = kb.data?.articles ?? [];
      const a: Pick<Article, "title" | "slug" | "category" | "summary" | "body" | "tags" | "visibility" | "related" | "status"> & { version?: number } = (modal.id ? all.find((x) => x.id === modal.id) : null) ?? { title: "", slug: "", category: cfg.kbCategories[0] ?? "General", summary: "", body: "", tags: [], visibility: "Internal Only", related: [], status: "Draft" };
      const pub = act.manager;
      mv = {
        title: modal.id ? "Edit article" : "New article",
        sub: modal.id && a.version ? `Saving creates version ${a.version + 1}.` : null,
        primaryT: "Save article",
        fields: modal.id && kb.isLoading
          ? [F("x", "Article", "read", { value: "Loading…" })]
          : [
              F("title", "Title", "text", { req: true, value: a.title, af: true }),
              F("slug", "Slug", "text", { value: a.slug, ph: "auto from title" }),
              F("cat", "Category", "select", { value: a.category, options: O(cfg.kbCategories) }),
              F("summary", "Summary", "text", { value: a.summary }),
              F("body", "Content", "area", { rows: 7, value: a.body }),
              F("tags", "Tags", "text", { value: a.tags.join(", ") }),
              F("vis", "Visibility", "select", { value: a.visibility, options: O(["Internal Only", "Customer Portal", "Public"]), help: "Internal Only content is never exposed to customers. Public articles appear in your help center; Customer Portal articles appear on customers’ ticket pages." }),
              F("related", "Related articles", "checks", { options: all.filter((x) => x.id !== modal.id && x.status !== "Archived").map((x) => ({ v: x.id, t: x.title, on: a.related.includes(x.id) })) }),
              F("st", "Status", "select", { value: pub ? a.status : "Draft", options: O(pub ? ["Draft", "Published", "Archived"] : ["Draft"]), help: pub ? "" : "Agents save drafts; a Manager publishes." }),
            ],
        submit: (fd) => {
          const v = (n: string) => String(fd.get(n) ?? "").trim();
          if (!v("title")) return err("Title is required.");
          void act.call("Save article", () => hdApi.saveArticle((modal.id as string) ?? null, { title: v("title"), slug: v("slug"), category: v("cat"), summary: v("summary"), body: String(fd.get("body") ?? ""), tags: v("tags"), visibility: v("vis"), related: fd.getAll("related").map(String), status: v("st") || "Draft" }), (r) => `Article saved as ${r.status}.`);
        },
      };
    } else if (kind === "category") {
      mv = { title: "New knowledge category", primaryT: "Create category", fields: [F("name", "Category name", "text", { req: true, af: true })], submit: (fd) => (String(fd.get("name") ?? "").trim() ? void act.call("Create category", () => hdApi.kbCategory(String(fd.get("name")).trim()), () => `Category “${String(fd.get("name")).trim()}” created.`) : err("Name is required.")) };
    } else if (kind === "reply") {
      const r = modal.id ? lib.data?.replies.find((x) => x.id === modal.id) : null;
      const cur = r ?? { name: "", shortcut: "/", body: "", visibility: act.manager ? "All agents" : "Only me", team: "All queues" };
      mv = {
        title: r ? "Edit saved reply" : "New saved reply",
        primaryT: "Save reply",
        fields: [
          F("name", "Name", "text", { req: true, value: cur.name, af: true }),
          F("sc", "Shortcut", "text", { req: true, value: cur.shortcut, help: "Starts with /, letters and dashes only." }),
          F("body", "Reply body", "area", { req: true, rows: 5, value: cur.body, help: "Safe variables: {{customer_name}} {{ticket_number}} {{agent_name}}. Other {{…}} are rejected." }),
          F("vis", "Visibility", "select", { value: cur.visibility, options: O(act.manager ? ["All agents", "Managers only", "Only me"] : ["Only me"]) }),
          F("team", "Team / queue", "select", { value: cur.team, options: O(["All queues", ...ws.queues.map((q) => q.name)]) }),
        ],
        submit: (fd) => {
          const v = (n: string) => String(fd.get(n) ?? "").trim();
          if (!v("name") || !v("body")) return err("Name and body are required.");
          if (!/^\/[a-z-]+$/.test(v("sc"))) return err("Shortcut must look like /refund.");
          const badVar = (v("body").match(/\{\{\s*([a-z_]+)\s*\}\}/g) ?? []).map((x) => x.replace(/[{}\s]/g, "")).filter((x) => !["customer_name", "ticket_number", "agent_name"].includes(x));
          if (badVar.length) return err(`Unsupported variable: {{${badVar[0]}}}. Allowed: customer_name, ticket_number, agent_name.`);
          void act.call("Save reply", () => hdApi.saveReply(r?.id ?? null, { name: v("name"), shortcut: v("sc"), body: String(fd.get("body")), visibility: v("vis"), team: v("team") }), () => `Saved reply ${v("sc")} saved.`);
        },
      };
    } else if (kind === "macro") {
      const x = modal.id ? lib.data?.macros.find((m) => m.id === modal.id) : null;
      const get = (n: string) => (x?.actions.find((a) => a[0] === n) ?? [])[1] ?? "";
      mv = {
        title: x ? "Edit macro" : "New macro",
        primaryT: "Save macro",
        note: "Macros never bypass permissions — each action is checked against the applying agent’s role.",
        fields: [
          F("name", "Macro name", "text", { req: true, value: x?.name ?? "", af: true }),
          F("cond", "Conditions", "text", { value: x?.conditions ?? "", ph: "e.g. Category = Billing", help: "Field = Value joined with AND — Category, Queue, Channel, Status, Priority, Branch or Tag (use != to exclude). The macro is only offered, and only runs, on tickets that match. Leave empty for any ticket." }),
          F("a_reply", "Insert reply", "select", { value: get("Insert reply"), options: O((lib.data?.replies ?? []).map((r) => r.name), "— none —") }),
          F("a_status", "Set status", "select", { value: get("Set status"), options: O(statusList, "— none —") }),
          F("a_pri", "Set priority", "select", { value: get("Set priority"), options: O(PRIORITIES, "— none —") }),
          F("a_queue", "Assign queue", "select", { value: get("Assign queue"), options: O(ws.queues.map((q) => q.name), "— none —") }),
          F("a_agent", "Assign agent", "select", { value: get("Assign agent"), options: O(ws.agents.map((a) => a.name), "— none —") }),
          F("a_tag", "Add tags", "text", { value: get("Add tag") }),
          F("st", "Status", "select", { value: x?.status ?? "Active", options: O(["Active", "Disabled"]) }),
        ],
        submit: (fd) => {
          const v = (n: string) => String(fd.get(n) ?? "").trim();
          if (!v("name")) return err("Macro name is required.");
          const acts = [["Insert reply", v("a_reply")], ["Set status", v("a_status")], ["Set priority", v("a_pri")], ["Assign queue", v("a_queue")], ["Assign agent", v("a_agent")], ["Add tag", v("a_tag")]].filter((a) => a[1]);
          if (!acts.length) return err("Add at least one action.");
          void act.call("Save macro", () => hdApi.saveMacro(x?.id ?? null, { name: v("name"), conditions: v("cond"), actions: acts, status: v("st") }), () => `Macro “${v("name")}” saved.`);
        },
      };
    } else if (kind === "del") {
      mv = {
        title: `Delete ${String(modal.label)}?`,
        sub: "This can’t be undone. Tickets that used it keep their history.",
        primaryT: "Delete",
        pBg: "#B42318",
        fields: [],
        submit: () => void act.call("Delete", () => (modal.what === "reply" ? hdApi.deleteReply(String(modal.id)) : hdApi.deleteMacro(String(modal.id))), () => `${String(modal.label)} deleted.`),
      };
    } else if (kind === "delTicket" && one) {
      mv = {
        title: `Delete ${one.number}?`,
        sub: "Only allowed while nothing has reached the customer (no reply, no survey). This removes the ticket and its timeline permanently.",
        primaryT: "Delete ticket",
        pBg: "#B42318",
        fields: [],
        submit: async () => {
          const r = await act.call("Delete ticket", () => hdApi.remove(one.number), () => `${one.number} deleted.`);
          if (r) act.go("tickets");
        },
      };
    } else if (kind === "survey") {
      const c = cfg.csat;
      mv = {
        title: "CSAT survey settings",
        primaryT: "Save survey settings",
        note: "CSAT stays private. It is never published or sent to Reviews & Reputation.",
        fields: [
          F("enabled", "Send after ticket resolution", "select", { value: c.enabled ? "On" : "Off", options: O(["On", "Off"]) }),
          F("delay", "Delay before sending", "select", { value: c.delay, options: O(["Immediately", "30 minutes", "2 hours", "24 hours"]) }),
          F("scale", "Rating scale", "select", { value: c.scale, options: O(["1–5 stars", "Good / Bad", "1–10"]) }),
          F("comment", "Optional comment", "select", { value: c.comment ? "Yes" : "No", options: O(["Yes", "No"]) }),
          F("channels", "Channels", "checks", { options: ["Email", "WhatsApp", "Portal", "SMS", "Social"].map((v) => ({ v, t: v, on: c.channels.includes(v) })) }),
          F("followUp", "Follow-up for poor rating", "select", { value: c.followUp, options: O(["Rating ≤ 2 creates internal follow-up", "Rating ≤ 3 creates internal follow-up", "No automatic follow-up"]) }),
        ],
        submit: (fd) => {
          const ch = fd.getAll("channels").map(String);
          if (fd.get("enabled") === "On" && !ch.length) return err("Choose at least one channel.");
          void act.call("Save survey settings", () => hdApi.csatSettings({ enabled: fd.get("enabled") === "On", delay: fd.get("delay"), scale: fd.get("scale"), comment: fd.get("comment") === "Yes", channels: ch, followUp: fd.get("followUp") }), () => "Survey settings saved.");
        },
      };
    } else if (kind === "followup") {
      mv = {
        title: `Follow up on negative feedback · ${String(modal.id)}`,
        sub: "Adds an internal note to the ticket and tracks the follow-up. Nothing is sent to the customer automatically.",
        primaryT: "Create follow-up",
        fields: [F("note", "Internal follow-up note", "area", { req: true, rows: 3, af: true, value: "Call customer to understand the poor rating and agree next steps." }), F("agent", "Owner", "select", { value: (modal.agent as string) || ws.me.userId, options: agentOpts.slice(1) })],
        submit: (fd) => (String(fd.get("note") ?? "").trim() ? void act.call("Create follow-up", () => hdApi.followUp(String(modal.id), String(fd.get("note")), String(fd.get("agent"))), () => `Follow-up created for ${String(modal.id)}. Nothing was sent to the customer.`) : err("Add a note.")),
      };
    } else if (kind === "agent") {
      const a = ws.agents.find((x) => x.id === modal.id)!;
      mv = {
        title: `Agent · ${a.name}`,
        sub: "Skills drive Skill Based queues; capacity is the most open tickets before this agent counts as over capacity. Name, role and presence come from Staff.",
        primaryT: "Save agent",
        fields: [F("skills", "Skills (ticket categories)", "checks", { options: cfg.categories.map((c) => ({ v: c, t: c, on: a.skills.includes(c) })) }), F("cap", "Capacity (max open tickets)", "number", { value: String(a.cap), min: 1, max: 500 })],
        submit: (fd) => void act.call("Save agent", () => hdApi.saveAgent(a.id, fd.getAll("skills").map(String), Number(fd.get("cap")) || 10), () => `${a.name} updated.`),
      };
    }
  }

  // ── drawers ────────────────────────────────────────────────────────────
  let dv: DrawerView | null = null;
  const close = () => set({ drawer: null });
  if (drawer) {
    const mng = act.manager;
    if (drawer.kind === "queue") {
      const q = ws.queues.find((x) => x.id === drawer.id);
      if (q) {
        const s = q.stats;
        dv = {
          kicker: "Queue",
          title: q.name,
          badges: [B(q.active ? "✓ Active" : "○ Disabled", q.active ? "#ECFDF3" : "#FEF3F2", q.active ? "#0E8442" : "#B42318"), B(q.method), B(q.branchName)],
          sections: [
            { h: "Description", text: q.desc || "No description." },
            { h: "Live", kv: [{ k: "Open tickets", v: s.open }, { k: "SLA at risk", v: s.risk }, { k: "Oldest ticket", v: fmtM(s.oldestMins) }, { k: "Avg wait", v: fmtM(s.waitMins) }] },
            { h: "Configuration", kv: [{ k: "Members", v: q.members.map(agName).join(", ") || "None" }, { k: "Ticket categories", v: q.categories.join(", ") || "Any" }, { k: "Branch scope", v: q.branchName }, { k: "Priority rule", v: q.priorityRule }, { k: "Assignment method", v: q.method }] },
            { h: `Open tickets${q.priorityRule !== "None" ? " · " + q.priorityRule : ""}`, items: q.tickets.length ? q.tickets.map((t) => ({ a: `${t.number} · ${t.subject}`, c: t.customerName, b: t.priority, d: t.sla.t })) : [{ a: "No open tickets", c: "", b: "", d: "" }] },
          ],
          acts: [
            { ...btn("q-assign", "Assign Tickets", "primary", !mng), on: () => act.openModal("assignMany", { q: q.id }) },
            { ...btn("q-edit", "Edit Queue", "ghost", !mng), on: () => act.openModal("queueEdit", { id: q.id }) },
            { ...btn("q-toggle", q.active ? "Disable Queue" : "Enable Queue", q.active ? "danger" : "ghost", !mng || !!q.sys, q.sys ? "System queue can’t be disabled" : null), on: () => (q.active ? act.openModal("qDisable", { id: q.id }) : void act.call("Enable queue", () => hdApi.queueActive(q.id, true), () => `${q.name} enabled.`)) },
            { ...btn("q-tickets", "View tickets"), on: () => act.tfGo({ queue: q.id, st: "__active" }) },
          ],
        };
      }
    } else if (drawer.kind === "article") {
      const a = kb.data?.articles.find((x) => x.id === drawer.id);
      if (a) {
        dv = {
          kicker: "Knowledge article · " + a.category,
          title: a.title,
          badges: [B(a.status), B((a.visibility === "Internal Only" ? "🔒 " : "") + a.visibility, a.visibility === "Internal Only" ? "#FEF6E7" : "#EFF8FF", a.visibility === "Internal Only" ? "#B54708" : "#175CD3"), ...(a.stale ? [B("Needs review", "#FEF6E7", "#B54708")] : [])],
          sections: [
            { h: "Article", warn: a.visibility === "Internal Only" ? "Internal only — never shown in the customer portal or public help center and can’t be inserted into customer replies." : null, text: (a.summary ? a.summary + "\n\n" : "") + (a.body || "No content yet.") },
            { h: "Details", kv: [{ k: "Author", v: a.author }, { k: "Last reviewed", v: a.reviewedAt ? dt(a.reviewedAt).split(",")[0] : "Never" }, { k: "Slug", v: "/" + a.slug }, { k: "Linked tickets", v: a.linked }, { k: "Views (90 days)", v: a.views.toLocaleString() }, { k: "Helpful", v: a.helpful == null ? "—" : `${a.helpful}% of ${a.votes} votes` }] },
            { h: "Version history", items: a.versions.map((v, i) => ({ a: `v${v.v} · ${v.note}`, c: v.by, b: ago(v.at), d: i === 0 ? "Current" : "" })) },
            { h: "Feedback", items: a.feedback.length ? a.feedback.map((f) => ({ a: `“${f.text}”`, c: f.source === "public" ? "Help center visitor" : f.source === "portal" ? "Portal visitor" : "Agent", b: f.helpful ? "Helpful" : "Not helpful", d: "" })) : [{ a: "No feedback yet", c: "", b: "", d: "" }] },
          ],
          acts: [
            { ...btn("a-edit", "Edit", "primary"), on: () => act.openModal("article", { id: a.id }) },
            { ...btn("a-review", "Mark reviewed", "ghost", !mng), on: () => void act.call("Update article", () => hdApi.articleAction(a.id, "review"), () => "Article marked reviewed.") },
            { ...btn("a-pub", a.status === "Published" ? "Unpublish" : "Publish", "ghost", !mng || a.status === "Archived", a.status === "Archived" ? "Restore first" : "Publishing requires a Manager"), on: () => void act.call("Update article", () => hdApi.articleAction(a.id, a.status === "Published" ? "unpublish" : "publish"), () => `Article ${a.status === "Published" ? "unpublished" : "published"}.`) },
            { ...btn("a-arch", a.status === "Archived" ? "Restore" : "Archive", "danger", !mng), on: () => void act.call("Update article", () => hdApi.articleAction(a.id, a.status === "Archived" ? "restore" : "archive"), () => `Article ${a.status === "Archived" ? "restored" : "archived"}.`) },
          ],
        };
      }
    } else if (drawer.kind === "ctx") {
      const d = drawer.detail as Detail;
      const t = d.ticket;
      if (drawer.id === "customer" && d.customer) {
        const c = d.customer;
        dv = {
          kicker: "Customer · from CRM",
          title: c.name,
          badges: [B(c.segment)],
          sections: [
            { h: "Contact", kv: [{ k: "Email", v: c.email ?? "—" }, { k: "Phone", v: c.phone }, { k: "Customer since", v: c.since }, { k: "Open tickets", v: c.openTickets }, { k: "Previous tickets", v: c.previousTickets }, { k: "Credit", v: c.credit }] },
            { h: "Recent orders", items: c.orders.length ? c.orders.map((o) => ({ a: o.a, c: o.b, b: o.c, d: "" })) : [{ a: "None", c: "", b: "", d: "" }] },
            { h: "Recent bookings", items: c.bookings.length ? c.bookings.map((o) => ({ a: o.a, c: o.b, b: o.c, d: "" })) : [{ a: "None", c: "", b: "", d: "" }] },
            { h: "Other tickets", items: c.prev.length ? c.prev.map((p) => ({ a: `${p.number} · ${p.subject}`, c: "", b: p.status, d: "" })) : [{ a: "None", c: "", b: "", d: "" }] },
          ],
          acts: [{ ...btn("crm", "Open CRM profile", "primary"), on: () => window.open(`/customers/${c.id}`, "_self") }],
        };
      } else {
        const S = stB(t.status);
        const P = priB(t.priority);
        dv = {
          kicker: "Ticket " + t.number,
          title: "Details",
          badges: [B(S.bt, S.bbg, S.bfg), B(P.bt, P.bbg, P.bfg), B("SLA " + t.sla.t, t.sla.bg, t.sla.fg)],
          sections: [
            { h: "Ticket", kv: [{ k: "Status", v: t.status }, { k: "Priority", v: t.priority }, { k: "Category", v: t.category }, { k: "Subcategory", v: t.subcategory || "—" }, { k: "Assigned agent", v: t.agentName }, { k: "Team / queue", v: t.queueName }, { k: "Branch", v: t.branchName }, { k: "Source channel", v: t.channel }, { k: "Created", v: dt(t.createdAt) }, { k: "SLA", v: `${t.sla.t} · ${t.sla.sub}` }] },
            { h: "Tags", text: t.tags.map((g) => "#" + g).join("  ") || "No tags" },
            { h: "Followers", text: t.followers.map(agName).join(", ") || "None" },
            { h: "Related records", items: d.links.length ? d.links.map((l) => ({ a: l.label, c: l.type, b: "", d: "" })) : [{ a: "None", c: "", b: "", d: "" }] },
          ],
          acts: [],
        };
      }
    } else if (drawer.kind === "audit") {
      const d = drawer.detail as Detail;
      const L = [
        ...d.audit.map((a) => ({ ts: a.at, a: a.what, c: `${a.by} · ${dt(a.at)}`, b: "", d: a.detail })),
        ...d.messages.map((m) => ({ ts: m.at, a: m.kind === "sys" ? m.body : { cust: "Customer message", reply: "Public reply sent", note: "Internal note added" }[m.kind] ?? m.kind, c: `${m.by} · ${dt(m.at)}`, b: "", d: "" })),
      ].sort((x, y) => y.ts.localeCompare(x.ts));
      dv = { kicker: "Audit history", title: `${d.ticket.number} · ${d.ticket.subject}`, badges: [B(`${L.length} entries`)], sections: [{ h: "Immutable log · who, what, when", items: L }], acts: [] };
    } else if (drawer.kind === "metric") {
      const m = METRIC[drawer.id as string] ?? [String(drawer.id), ""];
      const b = useHd.getState().branch;
      dv = { kicker: "Metric definition", title: m[0], badges: [B("Live data")], sections: [{ h: "How it’s calculated", text: m[1] || "Computed live from the tickets in scope." }, { h: "Scope", text: `Filtered server-side to your business, branch scope (${b === "all" ? "All branches" : (ws.branches.find((x) => x.id === b)?.name ?? "")}) and role permissions.` }], acts: [] };
    } else if (drawer.kind === "view") {
      dv = { kicker: String(drawer.kicker), title: String(drawer.title), badges: [B("Read-only")], sections: drawer.sections as DrawerView["sections"], acts: [] };
    } else if (drawer.kind === "role") {
      const caps = Object.entries(ws.me.caps);
      dv = {
        kicker: "Your Helpdesk role",
        title: `${ws.me.role} · ${ws.me.name}`,
        badges: [B(ws.me.isAgent ? "Helpdesk agent" : "Not an agent")],
        sections: [
          { h: "Allowed", bullets: caps.filter(([, v]) => v).map(([k]) => k) },
          { h: "Not allowed", bullets: caps.filter(([, v]) => !v).map(([k]) => k).length ? caps.filter(([, v]) => !v).map(([k]) => k) : ["Nothing — Owners have every capability."] },
          { h: "Where this comes from", text: "Your Staff role (Owner, Manager or Staff → Agent) and the Helpdesk permission matrix in Settings › Permissions. The server checks these on every request." },
        ],
        acts: [],
      };
    }
  }

  return (
    <>
      {dv ? <DrawerPanel v={dv} onClose={close} /> : null}
      {mv ? <ModalForm m={mv} err={modalErr} busy={busy} onClose={closeModal} /> : null}
    </>
  );
}
