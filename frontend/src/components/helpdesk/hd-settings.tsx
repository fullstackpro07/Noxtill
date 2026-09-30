"use client";

import { useEffect, useMemo } from "react";
import { hdApi, type HdConfig } from "@/lib/helpdesk-api";
import { useHd, useWorkspace } from "./hd-store";
import { useHdActions } from "./hd-actions";
import { Skeleton } from "./hd-render";
import { PRI, errText } from "./hd-core";

type SecKey = keyof HdConfig;
const SECS: Array<[string, string, string, SecKey[]]> = [
  ["general", "General", "Defaults for new tickets, numbering and closing rules.", ["general"]],
  ["statuses", "Ticket Statuses", "Lifecycle states. A status used by tickets can’t be deleted until those tickets are migrated.", ["customStatuses"]],
  ["priorities", "Priorities", "Fixed priority scale used by SLA policies.", []],
  ["categories", "Categories", "Used for routing, SLA scope and reporting.", ["categories"]],
  ["channels", "Channels", "Support sources. Connections are owned by Unified Inbox and Integrations — not duplicated here.", []],
  ["queues", "Queues", "Queue definitions live in Queues & Assignments.", []],
  ["assignment", "Assignment", "Support-specific assignment behaviour. Cross-module automation lives in Automations & Workflows.", ["assignment"]],
  ["hours", "Business Hours", "Used by SLA policies set to “Standard hours”.", ["hours"]],
  ["sla", "SLA", "Engine behaviour. Policies are managed in SLA & Escalations.", ["sla"]],
  ["notify", "Notifications", "Internal notifications for your team only.", ["notify"]],
  ["comms", "Customer Communication", "Signatures and automatic acknowledgements.", ["comms"]],
  ["perms", "Permissions", "Role capabilities, enforced server-side on every request.", ["perms"]],
  ["retention", "Data Retention", "How long tickets, notes and attachments are kept.", ["retention"]],
  ["advanced", "Advanced", "Merge, split, collision detection and API access.", ["advanced"]],
];

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const getPath = (o: unknown, p: string): unknown => p.split(".").reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o);
function setPath<T>(o: T, p: string, v: unknown): T {
  const c = clone(o) as Record<string, unknown>;
  const ks = p.split(".");
  let x = c;
  for (const k of ks.slice(0, -1)) x = x[k] as Record<string, unknown>;
  x[ks[ks.length - 1]] = v;
  return c as T;
}

const TZS: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
})();

export function SettingsScreen() {
  const { data: ws } = useWorkspace();
  const act = useHdActions(ws);
  const sec = useHd((s) => s.sec);
  const draft = useHd((s) => s.draft);
  const draftVersion = useHd((s) => s.draftVersion);
  const addText = useHd((s) => s.addText);
  const busy = useHd((s) => s.busy);
  const set = useHd((s) => s.set);
  const saved = ws?.settings.config;
  const version = ws?.settings.version ?? 0;

  useEffect(() => {
    if (saved && (!draft || draftVersion !== version)) set({ draft: clone(saved), draftVersion: version });
  }, [saved, version, draft, draftVersion, set]);

  const dirtyOf = useMemo(() => (keys: SecKey[]) => !!draft && !!saved && keys.some((k) => JSON.stringify(draft[k]) !== JSON.stringify(saved[k])), [draft, saved]);
  if (!ws || !draft || !saved) return <Skeleton />;
  const D = draft;
  const ro = !act.can("Manage settings");
  const cur = SECS.find((x) => x[0] === sec) ?? SECS[0];
  const dirtyN = SECS.filter((x) => dirtyOf(x[3])).length;
  const upd = (k: string, v: unknown) => set({ draft: setPath(D, k, v) });
  const use = ws.usage;

  type Row =
    | { kind: "select"; key: string; l: string; h?: string; v: string; opts: string[] | Array<{ v: string; t: string }> }
    | { kind: "text"; key: string; l: string; h?: string; v: string; type?: string }
    | { kind: "read"; l: string; h?: string; v: string }
    | { kind: "toggle"; key: string; l: string; h?: string; on: boolean }
    | { kind: "btn"; key: string; l: string; h?: string; v: string }
    | { kind: "chips"; key: string; l: string; h?: string; all: string[]; on: string[] }
    | { kind: "list"; key?: string; l: string; h?: string; items: Array<{ t: string; sub: string; canDel: boolean }>; addLabel?: string }
    | { kind: "matrix"; l: string; h?: string };
  const g = D.general;
  let rows: Row[] = [];
  if (sec === "general")
    rows = [
      { kind: "select", key: "general.defaultQueue", l: "Default queue", v: g.defaultQueue, opts: ws.queues.filter((q) => q.active).map((q) => q.name), h: "Used when no queue matches the ticket’s category." },
      { kind: "select", key: "general.defaultPriority", l: "Default priority", v: g.defaultPriority, opts: ["Urgent", "High", "Normal", "Low"] },
      { kind: "text", key: "general.numberFormat", l: "Ticket number format", v: g.numberFormat, h: `Use {#####} for the sequence. Next: ${ws.settings.nextNumber}${g.numberFormat !== saved.general.numberFormat ? " (under the saved format)" : ""}` },
      { kind: "select", key: "general.defaultBranch", l: "Default branch", v: g.defaultBranch, opts: ["Customer’s home branch", ...ws.branches.map((b) => b.name)] },
      { kind: "select", key: "general.autoClose", l: "Auto-close", v: g.autoClose, opts: ["Never", "3 days after Resolved", "5 days after Resolved", "7 days after Resolved", "14 days after Resolved"], h: "Background job closes resolved tickets. Runs every minute, idempotent, audited." },
      { kind: "select", key: "general.reopen", l: "Reopen policy", v: g.reopen, opts: ["Customer reply within 7 days reopens", "Customer reply within 14 days reopens", "Customer reply within 30 days reopens", "Never — create a new ticket"], h: "A customer reply after the window (or on a closed ticket) opens a follow-up ticket instead." },
    ];
  if (sec === "statuses")
    rows = [
      {
        kind: "list",
        key: "customStatuses",
        l: "Statuses",
        h: "Default statuses can’t be removed. Custom statuses can be removed when no ticket uses them.",
        items: [...D.statuses.map((x) => ({ t: x, sub: `Default · ${use.status[x]?.open ?? 0} active`, canDel: false })), ...D.customStatuses.map((x) => ({ t: x, sub: `Custom · ${use.status[x]?.all ?? 0} tickets`, canDel: true }))],
        addLabel: "New custom status, e.g. Awaiting Parts",
      },
      { kind: "read", l: "Lifecycle", v: "New → Open → In Progress → Waiting on Customer / Waiting on Internal Team → Resolved → Closed. Closed or Resolved can be Reopened per the reopen policy. Every transition is audited." },
    ];
  if (sec === "priorities") rows = [{ kind: "list", l: "Priorities", items: D.priorities.map((p) => ({ t: `${PRI[p][2]} ${p}`, sub: `${use.priorityOpen[p] ?? 0} open`, canDel: false })) }, { kind: "read", l: "Indicators", v: "Each priority has a symbol and label, so it never relies on colour alone." }];
  if (sec === "categories") rows = [{ kind: "list", key: "categories", l: "Categories", h: "Categories in use by open tickets must be migrated before removal.", items: D.categories.map((x) => ({ t: x, sub: `${use.category[x] ?? 0} tickets`, canDel: true })), addLabel: "New category, e.g. Warranty" }];
  if (sec === "channels")
    rows = [
      { kind: "list", l: "Configured channels", items: ws.channels.map((c) => ({ t: c.ch, sub: `${c.status} · ${c.desc} · via ${c.via}`, canDel: false })) },
      { kind: "btn", key: "inbox", l: "Connections", v: "Manage in Unified Inbox ↗", h: "Helpdesk never creates its own channel connections." },
    ];
  if (sec === "queues") rows = [{ kind: "list", l: "Queues", items: ws.queues.map((q) => ({ t: q.name, sub: `${q.active ? q.method : "Disabled"} · ${q.members.length} agents`, canDel: false })) }, { kind: "btn", key: "queues", l: "Edit queues", v: "Open Queues & Assignments" }];
  if (sec === "assignment")
    rows = [
      { kind: "select", key: "assignment.method", l: "Assignment mode", v: D.assignment.method, opts: ["Per queue", "Manual everywhere"], h: "“Per queue” uses each queue’s method. Advanced methods only run on queues where they’re configured." },
      { kind: "toggle", key: "assignment.respectCapacity", l: "Respect agent capacity", on: D.assignment.respectCapacity, h: "Skip agents at or over their capacity." },
      { kind: "toggle", key: "assignment.skipAway", l: "Skip Away / Offline agents", on: D.assignment.skipAway, h: "Only agents clocked in (Staff › Attendance) receive tickets automatically." },
      { kind: "toggle", key: "assignment.reassignOnLeave", l: "Reassign when agent goes on leave", on: D.assignment.reassignOnLeave, h: "Uses approved leave records from Staff › Time off." },
    ];
  if (sec === "hours")
    rows = [
      { kind: "select", key: "hours.tz", l: "Timezone", v: D.hours.tz, opts: TZS.length ? (TZS.includes(D.hours.tz) ? TZS : [D.hours.tz, ...TZS]) : [D.hours.tz] },
      { kind: "chips", key: "hours.days", l: "Working days", all: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], on: D.hours.days },
      { kind: "text", key: "hours.open", l: "Opening time", v: D.hours.open, type: "time" },
      { kind: "text", key: "hours.close", l: "Closing time", v: D.hours.close, type: "time" },
      { kind: "text", key: "hours.holidays", l: "Holidays", v: D.hours.holidays, h: "Dates as YYYY-MM-DD, comma-separated. SLA clocks on business-hours policies stop on holidays." },
    ];
  if (sec === "sla")
    rows = [
      { kind: "text", key: "sla.warn", l: "Warning threshold (%)", v: String(D.sla.warn), h: "Ticket becomes “At risk” after this share of its target has elapsed. Each policy can override it.", type: "number" },
      { kind: "toggle", key: "sla.pauseWaiting", l: "Pause on Waiting on Customer", on: D.sla.pauseWaiting, h: "Default for new policies." },
      { kind: "toggle", key: "sla.pauseInternal", l: "Pause on Waiting on Internal Team", on: D.sla.pauseInternal, h: "Usually off — internal delays should count." },
      { kind: "btn", key: "slas", l: "Policies", v: "Open SLA & Escalations" },
    ];
  if (sec === "notify")
    rows = [
      ...Object.keys(D.notify).map((ev): Row => ({ kind: "chips", key: "notify." + ev, l: ev, all: ["In-app", "Email", "SMS"], on: D.notify[ev] })),
      { kind: "read", l: "Delivery", v: "In-app honours each person’s own notification preferences. Email goes out through the platform email provider. SMS to staff isn’t available in Noxtill yet, so SMS alerts are never sent — the escalation log says so when a rule asks for it." },
    ];
  if (sec === "comms")
    rows = [
      { kind: "text", key: "comms.signature", l: "Reply signature", v: D.comms.signature, h: "Added to every public reply. Variables: {{agent_name}}, {{customer_name}}, {{ticket_number}}" },
      { kind: "toggle", key: "comms.ack", l: "Automatic acknowledgement", on: D.comms.ack, h: "Sent once on ticket creation via the ticket’s channel, with the customer’s portal link." },
      { kind: "text", key: "comms.ackText", l: "Acknowledgement text", v: D.comms.ackText, h: "Variables: {{ticket_number}}, {{customer_name}}" },
      { kind: "select", key: "comms.lang", l: "Languages", v: D.comms.lang, opts: ["English", "English + Urdu", "Urdu"], h: "Your team’s reply languages. Nothing is translated automatically." },
    ];
  if (sec === "perms") rows = [{ kind: "matrix", l: "Role capabilities", h: "Owner always has every capability. Staff members are Agents; Managers are Managers." }];
  if (sec === "retention")
    rows = [
      { kind: "select", key: "retention.closed", l: "Closed tickets", v: D.retention.closed, opts: ["1 year", "2 years", "3 years", "5 years", "7 years"] },
      { kind: "select", key: "retention.attachments", l: "Attachments", v: D.retention.attachments, opts: ["90 days after close", "1 year after close", "Same as ticket"] },
      { kind: "read", l: "Internal notes", v: D.retention.notes },
      { kind: "read", l: "Purge job", v: D.retention.purge + " · tenant-scoped, idempotent, retryable" },
    ];
  if (sec === "advanced")
    rows = [
      { kind: "toggle", key: "advanced.ticketMerge", l: "Allow merging", on: D.advanced.ticketMerge },
      { kind: "toggle", key: "advanced.split", l: "Allow splitting", on: D.advanced.split },
      { kind: "toggle", key: "advanced.collision", l: "Agent collision detection", on: D.advanced.collision, h: "Warn when another agent replied while you were writing; send again to reply anyway." },
      { kind: "read", l: "API access", v: D.advanced.apiAccess },
    ];

  const save = async () => {
    if (!/\{#+\}/.test(D.general.numberFormat)) return act.flash("Ticket number format must include {#####}.");
    set({ busy: true });
    try {
      const r = await hdApi.saveSettings(version, D);
      set({ busy: false });
      act.flash(r.changed.length ? `Settings saved · v${r.version} · ${r.changed.length} section(s) audited` : "Nothing changed.");
      await act.invalidate();
    } catch (e) {
      set({ busy: false });
      act.flash("Save settings failed — " + errText(e) + " Nothing was saved.");
    }
  };

  const inp = { border: "1px solid #E6EAF0", borderRadius: "10px", padding: "9px 10px", fontSize: "12.5px", minHeight: "40px", width: "100%", maxWidth: "340px", background: "#fff" };
  return (
    <>
      <div data-screen-label="10 Helpdesk Settings" data-2col="1" style={{ display: "grid", gridTemplateColumns: "220px minmax(0,1fr)", gap: "14px", alignItems: "start" }}>
        <nav data-setnav="1" aria-label="Settings sections" style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: "14px", padding: "6px", display: "flex", flexDirection: "column", gap: "2px", position: "sticky", top: "60px" }}>
          {SECS.map(([k, t, , keys]) => {
            const on = k === sec;
            return (
              <button key={k} type="button" onClick={() => set({ sec: k })} aria-current={on ? "page" : undefined} style={{ border: 0, background: on ? "#ECFDF3" : "transparent", textAlign: "left", borderRadius: "9px", padding: "10px 11px", fontSize: "12.5px", fontWeight: on ? 800 : 600, color: on ? "#0E8442" : "#344054", cursor: "pointer", whiteSpace: "nowrap", display: "flex", justifyContent: "space-between", gap: "8px", minHeight: "40px", alignItems: "center" }}>
                {t}
                {dirtyOf(keys) ? <span aria-label="Unsaved" style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#F79009" }} /> : null}
              </button>
            );
          })}
        </nav>
        <section style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: "16px", overflow: "hidden", minWidth: 0 }}>
          <div style={{ padding: "16px 18px", borderBottom: "1px solid #F2F4F7", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: "200px" }}>
              <div style={{ fontSize: "15px", fontWeight: 800, color: "#0F172A" }}>{cur[1]}</div>
              <div style={{ fontSize: "12px", color: "#667085", marginTop: "3px", lineHeight: 1.45 }}>{cur[2]}</div>
            </div>
            <span style={{ fontSize: "11px", fontWeight: 700, color: "#667085" }}>Settings v{version}</span>
          </div>
          {ro ? <div style={{ margin: "14px 18px 0", background: "#FAFBFC", border: "1px solid #E6EAF0", borderRadius: "10px", padding: "10px 12px", fontSize: "12px", color: "#475467" }}>Read-only for {ws.me.role} · {ws.me.name}. Only roles with “Manage settings” can change Helpdesk settings. Permission is enforced by the server on PATCH /helpdesk/settings.</div> : null}
          <div style={{ padding: "6px 18px 18px" }}>
            {rows.map((f, i) => (
              <div key={i} data-2col="1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.3fr)", gap: "16px", padding: "14px 0", borderBottom: "1px solid #F2F4F7", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: "12.5px", fontWeight: 800, color: "#101828" }}>{f.l}</div>
                  {f.h ? <div style={{ fontSize: "11.5px", color: "#667085", marginTop: "3px", lineHeight: 1.45 }}>{f.h}</div> : null}
                </div>
                <div style={{ minWidth: 0 }}>
                  {f.kind === "select" ? (
                    <select aria-label={f.l} value={f.v} onChange={(e) => upd(f.key, e.target.value)} disabled={ro} style={inp}>
                      {f.opts.map((o) => (typeof o === "string" ? <option key={o}>{o}</option> : <option key={o.v} value={o.v}>{o.t}</option>))}
                    </select>
                  ) : f.kind === "text" ? (
                    <input type={f.type ?? "text"} aria-label={f.l} value={f.v} onChange={(e) => upd(f.key, f.key === "sla.warn" ? Math.max(0, Math.min(99, Number(e.target.value) || 0)) : e.target.value)} disabled={ro} style={inp} />
                  ) : f.kind === "read" ? (
                    <div style={{ fontSize: "12.5px", color: "#344054", background: "#FAFBFC", borderRadius: "9px", padding: "9px 11px", lineHeight: 1.45 }}>{f.v}</div>
                  ) : f.kind === "toggle" ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <button type="button" role="switch" aria-checked={f.on} aria-label={f.l} onClick={() => upd(f.key, !getPath(D, f.key))} disabled={ro} style={{ width: "44px", height: "26px", borderRadius: "14px", border: 0, background: f.on ? "#12A150" : "#D0D5DD", position: "relative", cursor: "pointer", padding: 0, flex: "0 0 44px" }}>
                        <span style={{ position: "absolute", top: "3px", left: f.on ? "21px" : "3px", width: "20px", height: "20px", borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
                      </button>
                      <span style={{ fontSize: "11.5px", color: "#475467" }}>{f.on ? "On" : "Off"}</span>
                    </div>
                  ) : f.kind === "btn" ? (
                    <button type="button" onClick={() => (f.key === "queues" ? act.go("queues") : f.key === "slas" ? act.go("sla") : window.location.assign("/unified-inbox/channels"))} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "8px 12px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "38px" }}>
                      {f.v}
                    </button>
                  ) : f.kind === "chips" ? (
                    <div role="group" aria-label={f.l} style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {f.all.map((v) => {
                        const on = f.on.includes(v);
                        return (
                          <button key={v} type="button" aria-pressed={on} disabled={ro} onClick={() => upd(f.key, on ? f.on.filter((x) => x !== v) : [...f.on, v])} style={{ border: `1px solid ${on ? "#12A150" : "#E6EAF0"}`, background: on ? "#ECFDF3" : "#fff", borderRadius: "20px", padding: "6px 11px", fontSize: "11.5px", fontWeight: 700, color: on ? "#0E8442" : "#475467", cursor: "pointer", minHeight: "34px" }}>
                            {on ? "✓" : "+"} {v}
                          </button>
                        );
                      })}
                    </div>
                  ) : f.kind === "list" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                      {f.items.map((it) => (
                        <div key={it.t} style={{ display: "flex", gap: "8px", alignItems: "center", border: "1px solid #F2F4F7", borderRadius: "9px", padding: "7px 8px 7px 11px" }}>
                          <span style={{ flex: 1, fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{it.t}</span>
                          <span style={{ fontSize: "11px", color: "#667085" }}>{it.sub}</span>
                          {it.canDel && f.key ? (
                            <button
                              type="button"
                              disabled={ro}
                              aria-label={"Remove " + it.t}
                              onClick={() => {
                                const k = f.key as "customStatuses" | "categories";
                                const inUse = k === "customStatuses" ? (use.status[it.t]?.all ?? 0) : saved.categories.includes(it.t) ? (use.category[it.t] ?? 0) : 0;
                                if (inUse && k === "customStatuses") return act.flash(`Can’t remove “${it.t}” — ${inUse} ticket(s) use it. Migrate them first.`);
                                upd(k, (D[k] as string[]).filter((x) => x !== it.t));
                              }}
                              style={{ border: "1px solid #FDD9D6", background: "#fff", borderRadius: "7px", padding: "4px 9px", fontSize: "11px", fontWeight: 800, color: "#B42318", cursor: "pointer", minHeight: "30px" }}
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>
                      ))}
                      {f.addLabel && f.key ? (
                        <div style={{ display: "flex", gap: "6px" }}>
                          <input aria-label={f.addLabel} placeholder={f.addLabel} value={addText[f.key] ?? ""} onChange={(e) => set({ addText: { ...addText, [f.key!]: e.target.value } })} disabled={ro} style={{ flex: 1, border: "1px solid #E6EAF0", borderRadius: "9px", padding: "8px 10px", fontSize: "12.5px", minHeight: "38px" }} />
                          <button
                            type="button"
                            disabled={ro}
                            onClick={() => {
                              const k = f.key as "customStatuses" | "categories";
                              const v = (addText[k] ?? "").trim();
                              if (!v) return;
                              const exist = k === "customStatuses" ? [...D.statuses, ...D.customStatuses] : D.categories;
                              if (exist.some((x) => x.toLowerCase() === v.toLowerCase())) return act.flash(`“${v}” already exists.`);
                              set({ draft: { ...D, [k]: [...D[k], v] }, addText: { ...addText, [k]: "" } });
                            }}
                            style={{ border: "1px solid #12A150", background: "#fff", borderRadius: "9px", padding: "8px 12px", fontSize: "12px", fontWeight: 800, color: "#0E8442", cursor: "pointer", minHeight: "38px" }}
                          >
                            Add
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div style={{ overflowX: "auto", border: "1px solid #F2F4F7", borderRadius: "10px" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                        <thead>
                          <tr style={{ background: "#FAFBFC" }}>
                            <th scope="col" style={{ textAlign: "left", padding: "8px 10px", fontSize: "11px", color: "#667085" }}>
                              Capability
                            </th>
                            {["Owner", "Manager", "Agent"].map((r) => (
                              <th key={r} scope="col" style={{ padding: "8px 10px", fontSize: "11px", color: "#667085", textAlign: "center" }}>
                                {r}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(D.perms).map(([cap, v]) => (
                            <tr key={cap} style={{ borderTop: "1px solid #F2F4F7" }}>
                              <td style={{ padding: "7px 10px", fontWeight: 600, color: "#101828" }}>{cap}</td>
                              {v.map((on, r) => (
                                <td key={r} style={{ textAlign: "center", padding: "5px" }}>
                                  <input
                                    type="checkbox"
                                    aria-label={`${cap} for ${["Owner", "Manager", "Agent"][r]}`}
                                    checked={!!on}
                                    disabled={ro || r === 0}
                                    onChange={() => {
                                      const p = clone(D.perms);
                                      p[cap][r] = p[cap][r] ? 0 : 1;
                                      set({ draft: { ...D, perms: p } });
                                    }}
                                    style={{ width: "17px", height: "17px", accentColor: "#12A150" }}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      {dirtyN > 0 && !ro ? (
        <div role="region" aria-label="Unsaved changes" style={{ position: "sticky", bottom: "14px", background: "#0A1B2A", borderRadius: "14px", padding: "12px 14px", display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", boxShadow: "0 14px 40px rgba(10,27,42,.25)" }}>
          <span style={{ flex: 1, minWidth: "200px", fontSize: "12.5px", color: "#E7EEF4", fontWeight: 600 }}>
            {dirtyN} section(s) changed. Saving creates settings v{version + 1} and an audit record.
          </span>
          <button type="button" onClick={() => set({ draft: clone(saved) })} style={{ border: "1px solid #1D3547", background: "transparent", borderRadius: "9px", padding: "9px 13px", fontSize: "12px", fontWeight: 700, color: "#AFC0CE", cursor: "pointer", minHeight: "38px" }}>
            Discard
          </button>
          <button type="button" onClick={() => void save()} disabled={busy} style={{ border: 0, background: "#12A150", borderRadius: "9px", padding: "9px 15px", fontSize: "12px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "38px" }}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      ) : null}
    </>
  );
}
