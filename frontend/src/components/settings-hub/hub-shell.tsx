"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { useSession } from "@/lib/session";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { useBranchContextStore } from "@/store/branch-context-store";
import {
  fetchHubCategories,
  fetchHubCategory,
  fetchHubHealth,
  fetchHubHome,
  pinHubRow,
  resetHubCategory,
  saveHubChanges,
  toggleHubMatrix,
  type HubCategory,
  type HubCategoryDetail,
  type HubRow,
  type HubTone,
} from "@/lib/settings-hub-api";
import { ErrorCard } from "@/components/reports/reports-ui";
import { HIcon, R, Toggle, actionBtn, cardBox, chipStyle, smallBtn, type Tone } from "./hub-ui";
import { stagedKey, useHub } from "./hub-store";
import { HubOverlays, RowAction } from "./hub-overlays";

const errMsg = (e: unknown, fallback = "Please try again.") => (e instanceof ApiError ? e.message : fallback);
const GROUP_ORDER = ["Platform", "Access", "Money", "Operations", "Engagement", "Intelligence", "Governance"];
const ASK_PROMPTS: { key: string; label: string }[] = [
  { key: "profit", label: "Who can see profit?" },
  { key: "risky", label: "Which permissions are risky?" },
  { key: "channels", label: "What channels are connected?" },
  { key: "recent", label: "What changed recently?" },
];

function catFromPath(pathname: string): string {
  const m = pathname.match(/^\/settings\/?([^/]*)/);
  return m && m[1] ? m[1] : "general";
}

// ---------------------------------------------------------------- header controls (rendered by the shared Topbar)

function HeaderSearch() {
  const openPanel = useHub((s) => s.openPanel);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      e.preventDefault();
      openPanel({ type: "search" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPanel]);
  return (
    <button type="button" onClick={() => openPanel({ type: "search" })} style={{ width: "100%", minWidth: 0, height: 38, minHeight: 38, display: "flex", alignItems: "center", gap: 9, padding: "0 12px", background: R.page, border: `1px solid ${R.border}`, borderRadius: 10, cursor: "text", textAlign: "left" }}>
      <HIcon name="search" size={15} style={{ color: R.label }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#8B97A6", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Search settings — “credit limit”, “WhatsApp”, “timezone”…</span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: R.label, background: "#fff", border: `1px solid ${R.border}`, borderBottomWidth: 2, borderRadius: 5, padding: "2px 6px" }}>/</span>
    </button>
  );
}

function ScopePill() {
  const session = useSession();
  const branchId = useBranchContextStore((s) => s.selectedBranchId);
  const setBranch = useBranchContextStore((s) => s.setSelectedBranchId);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const branches = session.business.branches;
  const current = branchId ? branches.find((b) => b.id === branchId) : null;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const choose = (id: string | null) => {
    setBranch(id);
    setOpen(false);
    void qc.invalidateQueries({ queryKey: ["settings-hub"] });
  };
  const selectable = branches.length > 0;
  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button type="button" onClick={() => selectable && setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} style={{ ...chipStyle(current ? "green" : "neutral"), height: 34, minHeight: 34, flexShrink: 0, fontSize: 12.5, padding: "0 11px", cursor: selectable ? "pointer" : "default" }}>
        <HIcon name="building-2" size={14} />
        <span style={{ whiteSpace: "nowrap", flexShrink: 0 }}>{current?.name ?? session.business.name}</span>
        {selectable ? <HIcon name="chevron-down" size={14} style={{ opacity: 0.7 }} /> : null}
      </button>
      {open ? (
        <div role="listbox" style={{ position: "absolute", right: 0, top: 40, zIndex: 60, minWidth: 210, background: "#fff", border: `1px solid ${R.border}`, borderRadius: 10, boxShadow: "0 14px 34px rgba(12,23,39,.14)", padding: 5 }}>
          {[{ id: null as string | null, name: `${session.business.name} (main)` }, ...branches.map((b) => ({ id: b.id as string | null, name: b.name }))].map((b) => {
            const on = (b.id ?? null) === (branchId ?? null);
            return (
              <button key={b.id ?? "root"} type="button" role="option" aria-selected={on} onClick={() => choose(b.id)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 7, border: 0, background: on ? R.greenSoft : "transparent", color: on ? "#15803D" : R.ink, fontSize: 12.5, fontWeight: on ? 700 : 600, cursor: "pointer" }}>
                {b.name}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function HeaderActions() {
  const openPanel = useHub((s) => s.openPanel);
  const openConfirm = useHub((s) => s.openConfirm);
  const notify = useHub((s) => s.notify);
  const staged = useHub((s) => s.staged);
  const clearStaged = useHub((s) => s.clearStaged);
  const saving = useHub((s) => s.saving);
  const setSaving = useHub((s) => s.setSaving);
  const qc = useQueryClient();
  const health = useQuery({ queryKey: ["settings-hub", "health"], queryFn: fetchHubHealth });
  const list = Object.values(staged);
  const dirty = list.length > 0;
  const needs = health.data ? health.data.items.length > 0 : false;

  const save = async () => {
    setSaving(true);
    try {
      await saveHubChanges(list.map(({ category, rowKey, value }) => ({ category, rowKey, value })));
      clearStaged();
      void qc.invalidateQueries({ queryKey: ["settings-hub"] });
      notify("Settings saved", "Recorded in the audit log with before and after values.");
    } catch (e) {
      notify("Couldn't save your changes", errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ScopePill />
      <button type="button" onClick={() => openPanel({ type: "health" })} style={{ ...chipStyle(needs ? "amber" : "green"), height: 34, minHeight: 34, flexShrink: 0, fontSize: 12.5, padding: "0 11px", cursor: "pointer" }}>
        <HIcon name="activity" size={13} />
        <span style={{ whiteSpace: "nowrap", flexShrink: 0 }}>Config: {health.data ? (needs ? "Needs attention" : "Healthy") : "…"}</span>
      </button>
      <span style={{ ...chipStyle(dirty ? "amber" : "green"), height: 34, minHeight: 34, flexShrink: 0, fontSize: 12.5, padding: "0 11px" }}>
        <HIcon name={saving ? "loader-circle" : dirty ? "circle-alert" : "circle-check"} size={13} />
        <span style={{ whiteSpace: "nowrap", flexShrink: 0 }}>{saving ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved"}</span>
      </span>
      {dirty ? (
        <>
          <button
            type="button"
            onClick={() =>
              openConfirm({
                title: "Discard your changes?",
                tone: "red",
                icon: "rotate-ccw",
                body: "The changes you made have not been saved. Discarding returns every setting to its saved value.",
                rows: [{ label: "Unsaved changes", value: `${list.length} setting${list.length === 1 ? "" : "s"}` }],
                primary: "Discard changes",
                cancel: "Keep editing",
                onConfirm: () => {
                  clearStaged();
                  useHub.getState().closeOverlays();
                },
              })
            }
            style={{ height: 34, minHeight: 34, flexShrink: 0, display: "flex", alignItems: "center", padding: "0 11px", borderRadius: 10, border: `1px solid ${R.btnBorder}`, background: "#fff", fontSize: 12.5, fontWeight: 700, color: R.text, cursor: "pointer" }}
          >
            Discard
          </button>
          <button type="button" onClick={save} disabled={saving} style={{ height: 34, minHeight: 34, flexShrink: 0, display: "flex", alignItems: "center", gap: 7, padding: "0 13px", borderRadius: 10, background: R.green, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: 0 }}>
            <HIcon name="save" size={15} />
            <span style={{ whiteSpace: "nowrap" }}>Save changes</span>
          </button>
        </>
      ) : null}
      <button type="button" onClick={() => openPanel({ type: "ask", key: "risky" })} style={{ height: 34, minHeight: 34, flexShrink: 0, display: "flex", alignItems: "center", gap: 7, padding: "0 11px", borderRadius: 10, border: "1px solid #DDD3FE", background: "#FBFAFF", fontSize: 12.5, fontWeight: 700, color: "#6D28D9", cursor: "pointer" }}>
        <HIcon name="sparkles" size={15} />
        <span style={{ whiteSpace: "nowrap" }}>Ask</span>
      </button>
    </>
  );
}

// ---------------------------------------------------------------- rail

function Rail({ categories, active, onGo }: { categories: HubCategory[] | undefined; active: string; onGo: (key: string) => void }) {
  return (
    <div className="nx-scroll" style={{ width: 246, flex: "0 1 246px", minWidth: 172, borderRight: `1px solid ${R.border}`, background: "#fff", padding: "14px 10px 24px", overflowY: "auto" }}>
      {!categories
        ? Array.from({ length: 5 }, (_, i) => <div key={i} style={{ height: 34, borderRadius: 8, background: "#F5F6F8", margin: "0 0 6px" }} />)
        : GROUP_ORDER.map((group) => {
            const items = categories.filter((c) => c.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group} style={{ marginBottom: 12 }}>
                <div style={{ padding: "8px 10px 6px", fontSize: 9.5, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: R.faint }}>{group}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {items.map((c) => {
                    const on = c.key === active;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => onGo(c.key)}
                        aria-current={on ? "page" : undefined}
                        style={{ display: "flex", alignItems: "center", gap: 9, height: 34, padding: "0 10px", borderRadius: 8, fontSize: 12.5, cursor: "pointer", border: 0, textAlign: "left", width: "100%", background: on ? "#ECFDF3" : "transparent", color: on ? "#15803D" : R.text, fontWeight: on ? 700 : 600, boxShadow: on ? "inset 2px 0 0 #16A34A" : "none" }}
                      >
                        <HIcon name={c.icon} size={15} />
                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
                        {c.badge ? <span style={{ minWidth: 17, height: 17, padding: "0 5px", borderRadius: 9, fontSize: 9.5, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#FEF3F2", color: "#B42318" }}>{c.badge}</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
    </div>
  );
}

// ---------------------------------------------------------------- rows

function valueTone(t: HubTone): Tone {
  return t;
}

function RowView({ category, row, affects }: { category: string; row: HubRow; affects: string[] }) {
  const openSetting = useHub((s) => s.openSetting);
  const openConfirm = useHub((s) => s.openConfirm);
  const stage = useHub((s) => s.stage);
  const unstage = useHub((s) => s.unstage);
  const staged = useHub((s) => s.staged[stagedKey(category, row.key)]);
  const notify = useHub((s) => s.notify);
  const qc = useQueryClient();

  const control = row.control;
  const isToggle = control?.type === "toggle";
  const savedOn = isToggle ? control.on : false;
  const on = isToggle ? (staged ? Boolean(staged.value) : savedOn) : false;
  const valueText = isToggle && staged ? (on ? "On" : "Off") : row.value;

  const apply = async (next: boolean) => {
    try {
      await saveHubChanges([{ category, rowKey: row.key, value: next }]);
      void qc.invalidateQueries({ queryKey: ["settings-hub"] });
      notify(`${row.label} ${next ? "turned on" : "turned off"}`, "Recorded in the audit log with before and after values.");
    } catch (e) {
      notify("Couldn't change this setting", errMsg(e));
    }
  };

  const onToggle = () => {
    if (!isToggle) return;
    const next = !on;
    if (row.risk === "High") {
      openConfirm({
        title: `${on ? "Turn off" : "Turn on"} ${row.label}?`,
        tone: "amber",
        icon: "triangle-alert",
        body: row.impact ?? "This is a high-impact setting. Noxtill shows what it affects before applying the change, and records who changed it.",
        rows: [
          { label: "Setting", value: row.label },
          { label: "Current", value: on ? "On" : "Off" },
          { label: "New", value: next ? "On" : "Off" },
          { label: "Scope", value: row.scope },
          { label: "Affects", value: affects.join(", ") },
          { label: "Recorded in audit", value: "Yes" },
        ],
        primary: "Apply change",
        cancel: "Cancel",
        onConfirm: async () => {
          await apply(next);
          useHub.getState().closeOverlays();
        },
      });
      return;
    }
    if (next === savedOn) unstage(category, row.key);
    else stage({ category, rowKey: row.key, value: next, label: row.label, from: savedOn ? "On" : "Off", to: next ? "On" : "Off" });
  };

  const tone: Tone = valueTone(row.valueTone);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openSetting(category, row.key)}
      onKeyDown={(e) => (e.key === "Enter" ? openSetting(category, row.key) : undefined)}
      style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", cursor: "pointer", borderTop: `1px solid ${R.rowLine}`, flexWrap: "wrap", background: row.effective ? "#FFFDF5" : "#fff" }}
    >
      <div style={{ flex: "1 1 300px", minWidth: 240 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>{row.label}</div>
          {row.scope !== "Business" ? <span style={chipStyle(row.scope === "Branch" ? "blue" : "neutral", { height: 19, fontSize: 9 })}>{row.scope}</span> : null}
          {row.risk === "High" ? <span style={chipStyle("amber", { height: 19, fontSize: 9 })}>High risk</span> : null}
          {staged ? <span style={chipStyle("amber", { height: 19, fontSize: 9 })}>Unsaved</span> : null}
        </div>
        <div style={{ fontSize: 11, color: R.label, marginTop: 4, lineHeight: 1.5, textWrap: "pretty" }}>{row.description}</div>
        {row.effective ? <div style={{ fontSize: 10.5, color: "#B45309", marginTop: 5, fontWeight: 700 }}>{row.effective}</div> : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
        <span style={{ ...chipStyle(tone), height: 24, fontSize: 11, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }}>{valueText}</span>
        {isToggle ? <Toggle on={on} onClick={onToggle} disabled={!row.editable} label={row.label} /> : null}
        {control?.type === "action" ? (
          <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} role="presentation">
            <RowAction row={row} control={control} />
          </span>
        ) : null}
        <HIcon name="chevron-right" size={15} style={{ color: "#C3CAD4" }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- notification matrix

function MatrixView({ matrix }: { matrix: NonNullable<HubCategoryDetail["matrix"]> }) {
  const notify = useHub((s) => s.notify);
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: (v: { event: string; channel: string; on: boolean }) => toggleHubMatrix(v.event, v.channel, v.on),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["settings-hub"] }),
    onError: (e) => notify("Couldn't change this notification", errMsg(e)),
  });
  const th: React.CSSProperties = { textAlign: "center", padding: "11px 6px", fontSize: 9.5, fontWeight: 800, letterSpacing: ".07em", textTransform: "uppercase", color: R.label, whiteSpace: "nowrap" };
  return (
    <div style={cardBox}>
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${R.divider}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13.5, fontWeight: 800 }}>Notification channel matrix</div>
        <div style={{ fontSize: 11, color: R.faint }}>Only connected channels can be enabled</div>
      </div>
      <div className="nx-scroll" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#FAFBFC", borderBottom: `1px solid ${R.border}` }}>
              <th style={{ ...th, textAlign: "left", padding: "11px 12px 11px 18px", fontSize: 10.5 }}>Category</th>
              <th style={{ ...th, textAlign: "left" }}>Priority</th>
              {matrix.channels.map((c) => (
                <th key={c.key} style={th}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((r) => (
              <tr key={r.event} style={{ borderBottom: `1px solid ${R.rowLine}`, background: "#fff" }}>
                <td style={{ padding: "10px 12px 10px 18px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{r.label}</td>
                <td style={{ padding: "10px 6px" }}>
                  <span style={chipStyle(r.priority === "high" ? "amber" : "neutral", { height: 20, fontSize: 9.5 })}>{r.priority === "high" ? "High" : r.priority === "low" ? "Low" : "Normal"}</span>
                </td>
                {r.cells.map((cl) => {
                  const ch = matrix.channels.find((c) => c.key === cl.channel);
                  return (
                    <td key={cl.channel} style={{ padding: "10px 6px", textAlign: "center" }}>
                      <button
                        type="button"
                        aria-label={`${r.label} · ${ch?.label ?? cl.channel}${cl.blocked ? " (not connected)" : cl.on ? " on" : " off"}`}
                        aria-pressed={cl.on}
                        onClick={() => {
                          if (cl.blocked) return notify(`${ch?.label ?? cl.channel} is not connected`, ch?.reason ?? "This channel cannot be enabled until it is connected.");
                          if (r.locked && cl.on) return notify(`${r.label} notifications cannot be disabled`, "They can be rerouted to a different channel, but not switched off.");
                          toggle.mutate({ event: r.event, channel: cl.channel, on: !cl.on });
                        }}
                        style={{ width: 20, height: 20, borderRadius: 5, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: cl.blocked ? "not-allowed" : "pointer", background: cl.on ? R.green : cl.blocked ? "#F1F3F6" : "#fff", border: `1px solid ${cl.on ? R.green : cl.blocked ? "#E1E5EB" : "#C3CAD4"}`, color: cl.on ? "#fff" : "#C3CAD4", padding: 0 }}
                      >
                        {cl.on ? <HIcon name="check" size={11} strokeWidth={2.25} /> : cl.blocked ? <HIcon name="x" size={10} strokeWidth={2.25} /> : null}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding: "12px 18px", borderTop: `1px solid ${R.divider}`, background: "#FCFCFD", fontSize: 11, color: R.faint, lineHeight: 1.5 }}>
        A crossed cell means the channel is not available for internal alerts, so it cannot be enabled. Priority is fixed by the kind of alert and decides whether a sound plays during your quiet hours. Your choices apply to you only.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- home

function HomeView({ onGo }: { onGo: (key: string) => void }) {
  const q = useQuery({ queryKey: ["settings-hub", "home"], queryFn: fetchHubHome });
  const d = q.data;
  if (q.isError) return <ErrorCard message={errMsg(q.error, "Settings home could not be loaded.")} onRetry={() => void q.refetch()} />;
  const border = (t: HubTone) => (t === "amber" ? "#FDE49B" : t === "blue" ? "#C7DBFE" : t === "red" ? "#FBD5D2" : "#BBF0CB");
  const color = (t: HubTone) => (t === "amber" ? "#B45309" : t === "blue" ? "#1D4ED8" : t === "red" ? "#B42318" : "#15803D");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))", gap: 12 }}>
        {(d?.health ?? Array.from({ length: 6 }, () => null)).map((h, i) =>
          h ? (
            <button key={h.label} type="button" onClick={() => onGo(h.category)} style={{ background: "#fff", borderRadius: 12, padding: "13px 14px", cursor: "pointer", boxShadow: "0 1px 2px rgba(16,24,40,.04)", border: `1px solid ${border(h.tone)}`, textAlign: "left" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <HIcon name={h.icon} size={15} style={{ color: color(h.tone) }} />
                <div style={{ fontSize: 12, fontWeight: 700, color: R.text }}>{h.label}</div>
              </div>
              <div style={{ fontSize: 14.5, fontWeight: 800, marginTop: 8, color: color(h.tone) }}>{h.status}</div>
              <div style={{ fontSize: 10.5, color: R.faint, marginTop: 4, lineHeight: 1.4 }}>{h.meta}</div>
            </button>
          ) : (
            <div key={i} style={{ background: "#fff", borderRadius: 12, height: 92, border: `1px solid ${R.border}` }} />
          ),
        )}
      </div>

      <div style={{ ...cardBox, overflow: "visible", padding: "16px 18px" }}>
        <div style={{ fontSize: 13.5, fontWeight: 800 }}>Quick actions</div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {(d?.quickActions ?? []).map((a) => (
            <button key={a.label} type="button" onClick={() => onGo(a.category)} style={{ height: 34, display: "flex", alignItems: "center", gap: 7, padding: "0 12px", borderRadius: 10, border: `1px solid ${R.btnBorder}`, background: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, color: R.text }}>
              <HIcon name={a.icon} size={13} />
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 14, alignItems: "start" }}>
        <div style={{ ...cardBox, minWidth: 0 }}>
          <div style={{ padding: "13px 16px", borderBottom: `1px solid ${R.divider}`, fontSize: 12.5, fontWeight: 800 }}>Recent changes</div>
          {d && d.recentChanges.length === 0 ? <div style={{ padding: "16px", fontSize: 12, color: R.muted }}>No configuration change has been recorded yet.</div> : null}
          {(d?.recentChanges ?? []).map((c, i) => (
            <button key={`${c.change}-${i}`} type="button" onClick={() => onGo(c.category)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", cursor: "pointer", borderTop: i === 0 ? "none" : `1px solid ${R.rowLine}`, width: "100%", background: "#fff", border: 0, textAlign: "left" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700 }}>{c.change}</div>
                <div style={{ fontSize: 10, color: R.faint, marginTop: 2 }}>{c.meta}</div>
              </div>
              <HIcon name="chevron-right" size={13} style={{ color: "#C3CAD4" }} />
            </button>
          ))}
        </div>
        <div style={{ ...cardBox, minWidth: 0 }}>
          <div style={{ padding: "13px 16px", borderBottom: `1px solid ${R.divider}`, fontSize: 12.5, fontWeight: 800 }}>Pinned and frequent</div>
          {d && d.pinned.length === 0 ? <div style={{ padding: "16px", fontSize: 12, color: R.muted }}>Pin a setting from its detail panel, or open settings a few times and they appear here.</div> : null}
          {(d?.pinned ?? []).map((p, i) => (
            <button key={`${p.category}-${p.rowKey}`} type="button" onClick={() => { onGo(p.category); setTimeout(() => useHub.getState().openSetting(p.category, p.rowKey), 250); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", cursor: "pointer", borderTop: i === 0 ? "none" : `1px solid ${R.rowLine}`, width: "100%", background: "#fff", border: 0, textAlign: "left" }}>
              <HIcon name={p.icon} size={14} style={{ color: R.label }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700 }}>{p.label}</div>
                <div style={{ fontSize: 10, color: R.faint, marginTop: 2 }}>{p.meta}</div>
              </div>
              <span style={chipStyle(p.pin === "Pinned" ? "amber" : "neutral", { height: 19, fontSize: 9 })}>{p.pin}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- category

function CategoryView({ catKey, onGo }: { catKey: string; onGo: (key: string) => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const openPanel = useHub((s) => s.openPanel);
  const openConfirm = useHub((s) => s.openConfirm);
  const notify = useHub((s) => s.notify);
  const isHome = catKey === "home";
  const q = useQuery({ queryKey: ["settings-hub", "category", catKey], queryFn: () => fetchHubCategory(catKey) });
  const d = q.data;

  if (q.isError) return <ErrorCard message={errMsg(q.error, "This section could not be loaded.")} onRetry={() => void q.refetch()} />;

  const reset = () =>
    openConfirm({
      title: `Reset ${d?.title ?? "this section"} to defaults?`,
      tone: "red",
      icon: "rotate-ccw",
      body: `Every setting in this section that has a Noxtill default returns to it. This affects ${(d?.affects ?? []).join(", ")}.`,
      rows: [
        { label: "Section", value: d?.title ?? "" },
        { label: "Settings affected", value: "Those with a Noxtill default" },
        { label: "Recorded in audit", value: "Yes" },
      ],
      primary: "Reset section",
      cancel: "Cancel",
      onConfirm: async () => {
        try {
          const r = await resetHubCategory(catKey);
          void qc.invalidateQueries({ queryKey: ["settings-hub"] });
          useHub.getState().closeOverlays();
          notify("Section reset", `${r.reset} setting${r.reset === 1 ? "" : "s"} returned to default.`);
        } catch (e) {
          notify("Couldn't reset this section", errMsg(e));
        }
      },
    });

  return (
    <div style={{ maxWidth: 1240, display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
        <div style={{ width: 44, height: 44, flex: "0 0 44px", borderRadius: 12, background: R.greenSoft, color: "#15803D", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <HIcon name={d?.icon ?? "sliders-horizontal"} size={20} />
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-.02em" }}>{d?.title ?? " "}</div>
          <div style={{ fontSize: 12.5, color: R.muted, marginTop: 4, lineHeight: 1.55, textWrap: "pretty" }}>{d?.description ?? " "}</div>
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {(d?.actions ?? []).map((a) => (
            <button
              key={a.label}
              type="button"
              style={actionBtn(a.primary)}
              onClick={() => {
                if (a.kind === "reset") reset();
                else if (a.kind === "history") openPanel({ type: "history", category: catKey });
                else if (a.href) router.push(a.href);
              }}
            >
              <HIcon name={a.icon} size={14} />
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {d?.notice ? (
        <div style={{ border: "1px solid #FDE49B", background: "#FFFBEB", borderRadius: 12, padding: "13px 15px", display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap", color: "#B45309" }}>
          <HIcon name={d.notice.icon} size={16} style={{ color: "#B45309" }} />
          <div style={{ flex: 1, minWidth: 200, fontSize: 11.5, lineHeight: 1.55, textWrap: "pretty" }}>{d.notice.text}</div>
          {d.notice.action ? (
            <button type="button" onClick={() => router.push(d.notice!.action!.href)} style={smallBtn}>
              {d.notice.action.label}
            </button>
          ) : null}
        </div>
      ) : null}

      {isHome ? <HomeView onGo={onGo} /> : null}
      {d?.matrix ? <MatrixView matrix={d.matrix} /> : null}

      {!d && !isHome ? (
        <div style={{ ...cardBox, height: 220 }} />
      ) : (
        (d?.groups ?? []).map((g) => (
          <div key={g.title} style={cardBox}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${R.divider}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 13.5, fontWeight: 800 }}>{g.title}</div>
              {g.hint ? <div style={{ fontSize: 11, color: R.faint }}>{g.hint}</div> : null}
              {g.badge ? <span style={{ ...chipStyle(g.badgeTone), height: 21, fontSize: 10, marginLeft: "auto" }}>{g.badge}</span> : null}
            </div>
            <div>
              {g.rows.map((r, i) => (
                <div key={r.key} style={i === 0 ? { marginTop: -1 } : undefined}>
                  <RowView category={catKey} row={r} affects={d?.affects ?? []} />
                </div>
              ))}
            </div>
            {g.footer ? <div style={{ padding: "11px 18px", borderTop: `1px solid ${R.divider}`, background: "#FCFCFD", fontSize: 11, color: R.faint, lineHeight: 1.5 }}>{g.footer}</div> : null}
          </div>
        ))
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 14, alignItems: "start" }}>
        <div style={{ minWidth: 0, background: "#fff", border: `1px solid ${d && d.health.length ? "#FDE49B" : R.border}`, borderRadius: 12, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <HIcon name="activity" size={15} style={{ color: d && d.health.length ? "#B45309" : "#15803D" }} />
            <div style={{ fontSize: 12.5, fontWeight: 800, color: d && d.health.length ? "#B45309" : "#15803D" }}>Configuration health</div>
          </div>
          <div style={{ fontSize: 11.5, color: d && d.health.length ? "#B45309" : R.muted, marginTop: 7, lineHeight: 1.5, textWrap: "pretty" }}>
            {d ? (d.health.length ? `Needs attention · ${d.health.length} item${d.health.length === 1 ? "" : "s"}. Nothing is fixed automatically.` : "Nothing in this section needs attention.") : " "}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 11 }}>
            {(d?.health ?? []).map((h) => (
              <button key={h.key} type="button" onClick={() => onGo(h.category)} style={{ background: "#fff", border: "1px solid #FDE49B", borderRadius: 9, padding: 10, cursor: "pointer", textAlign: "left" }}>
                <span style={chipStyle(h.tone, { height: 19, fontSize: 9 })}>{h.risk}</span>
                <div style={{ fontSize: 11.5, fontWeight: 700, marginTop: 6, lineHeight: 1.4, textWrap: "pretty" }}>{h.title}</div>
                <div style={{ fontSize: 10.5, color: "#15803D", fontWeight: 700, marginTop: 6 }}>{h.action} →</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ minWidth: 0, background: "#fff", border: `1px solid ${R.border}`, borderRadius: 12, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <HIcon name="workflow" size={15} style={{ color: R.text }} />
            <div style={{ fontSize: 12.5, fontWeight: 800 }}>This section affects</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {(d?.affects ?? []).map((a) => (
              <span key={a} style={chipStyle("neutral", { height: 21, fontSize: 10 })}>
                {a}
              </span>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: R.faint, marginTop: 11, lineHeight: 1.5, textWrap: "pretty" }}>{d?.affectsNote}</div>
        </div>

        <div style={{ minWidth: 0, background: "#fff", border: `1px solid ${R.border}`, borderRadius: 12, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <HIcon name="info" size={15} style={{ color: R.text }} />
            <div style={{ fontSize: 12.5, fontWeight: 800 }}>About this section</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {(d?.help ?? []).map((h, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: R.green, marginTop: 6, flex: "0 0 5px" }} />
                <div style={{ fontSize: 11.5, color: R.text, lineHeight: 1.5, textWrap: "pretty" }}>{h}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ minWidth: 0, background: "#FBFAFF", border: "1px solid #DDD3FE", borderRadius: 12, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <HIcon name="sparkles" size={15} style={{ color: "#6D28D9" }} />
            <div style={{ fontSize: 12.5, fontWeight: 800, color: "#6D28D9" }}>Ask about settings</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
            {ASK_PROMPTS.map((p) => (
              <button key={p.key} type="button" onClick={() => openPanel({ type: "ask", key: p.key })} style={{ background: "#fff", border: "1px solid #DDD3FE", borderRadius: 9, padding: "9px 10px", fontSize: 11.5, fontWeight: 600, color: R.text, cursor: "pointer", lineHeight: 1.4, textAlign: "left" }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- shell

export function HubShell({ children }: { children?: ReactNode }) {
  void children;
  const pathname = usePathname();
  const router = useRouter();
  const catKey = catFromPath(pathname);
  const session = useSession();
  const branchId = useBranchContextStore((s) => s.selectedBranchId);
  const branch = branchId ? session.business.branches.find((b) => b.id === branchId) : undefined;
  const reset = useHub((s) => s.reset);
  const openConfirm = useHub((s) => s.openConfirm);
  const notify = useHub((s) => s.notify);
  const categories = useQuery({ queryKey: ["settings-hub", "categories"], queryFn: fetchHubCategories });
  const qc = useQueryClient();

  useEffect(() => reset, [reset]);

  useModuleHeader({
    title: "Settings",
    subtitle: `${session.business.name} · ${branch?.name ?? "Whole business"}`,
    search: <HeaderSearch />,
    actions: <HeaderActions />,
  });

  const go = (key: string) => {
    const staged = Object.values(useHub.getState().staged);
    if (staged.length === 0) {
      router.push(`/settings/${key}`);
      return;
    }
    openConfirm({
      title: "You have unsaved changes",
      tone: "amber",
      icon: "triangle-alert",
      body: "Leaving this section now would discard the changes you have made. Nothing has been saved yet.",
      rows: [{ label: "Unsaved changes", value: `${staged.length} setting${staged.length === 1 ? "" : "s"}` }],
      primary: "Save and continue",
      cancel: "Stay here",
      onConfirm: async () => {
        try {
          await saveHubChanges(staged.map(({ category, rowKey, value }) => ({ category, rowKey, value })));
          useHub.getState().clearStaged();
          void qc.invalidateQueries({ queryKey: ["settings-hub"] });
          useHub.getState().closeOverlays();
          notify("Settings saved", "Recorded in the audit log with before and after values.");
          router.push(`/settings/${key}`);
        } catch (e) {
          notify("Couldn't save your changes", errMsg(e));
        }
      },
    });
  };

  const pinRow = useMutation({ mutationFn: (v: { c: string; r: string }) => pinHubRow(v.c, v.r) });
  void pinRow;

  return (
    <div style={{ display: "flex", alignItems: "stretch", minHeight: "calc(100vh - 78px)", background: R.page }}>
      <Rail categories={categories.data} active={catKey} onGo={go} />
      <div className="nx-scroll" style={{ flex: "1 1 560px", minWidth: 380, padding: "20px 24px 32px", overflowY: "auto" }}>
        <CategoryView key={catKey} catKey={catKey} onGo={go} />
      </div>
      <HubOverlays />
    </div>
  );
}
