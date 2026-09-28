"use client";

import type { CSSProperties, ReactNode } from "react";
import { ApiError } from "@/lib/api-client";
import type { Health } from "@/lib/projects-api";

/* ── design colour maps (exact values from Noxtill Projects & Tasks.dc.html) ── */

export const ICON = {
  ok: "M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14l-3-3",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  warn: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0ZM12 9v4M12 17h.01",
  crit: "M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9ZM15 9l-6 6M9 9l6 6",
  none: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM8 12h8",
};

export const HEALTH: Record<string, { bg: string; fg: string; bar: string; icon: string }> = {
  Healthy: { bg: "#ECFDF3", fg: "#067647", bar: "#12A150", icon: ICON.ok },
  Watch: { bg: "#FEF6E7", fg: "#B54708", bar: "#F79009", icon: ICON.eye },
  "At Risk": { bg: "#FEF3F2", fg: "#B42318", bar: "#F04438", icon: ICON.warn },
  Risk: { bg: "#FEF3F2", fg: "#B42318", bar: "#F04438", icon: ICON.warn },
  Critical: { bg: "#B42318", fg: "#fff", bar: "#912018", icon: ICON.crit },
  "No Data": { bg: "#F2F4F7", fg: "#475467", bar: "#D0D5DD", icon: ICON.none },
};
export const health = (h: string) => HEALTH[h] ?? HEALTH["No Data"];

const S: Record<string, [string, string]> = {
  Draft: ["#F2F4F7", "#475467"],
  Planned: ["#EFF4FF", "#2F4FB3"],
  Active: ["#ECFDF3", "#067647"],
  "On Hold": ["#F2F4F7", "#344054"],
  "At Risk": ["#FEF6E7", "#B54708"],
  Blocked: ["#FEF3F2", "#B42318"],
  Completed: ["#E7F6EE", "#0E8442"],
  Cancelled: ["#F2F4F7", "#667085"],
  Archived: ["#F2F4F7", "#667085"],
  Backlog: ["#F2F4F7", "#475467"],
  "To Do": ["#EFF4FF", "#2F4FB3"],
  "In Progress": ["#FEF6E7", "#B54708"],
  "In Review": ["#F4F3FF", "#5925DC"],
  Done: ["#ECFDF3", "#067647"],
  "Ready for Approval": ["#F4F3FF", "#5925DC"],
  Approved: ["#ECFDF3", "#067647"],
  Overdue: ["#FEF3F2", "#B42318"],
};
export function st(s: string): { bg: string; fg: string } {
  const m = S[s] ?? ["#F2F4F7", "#475467"];
  return { bg: m[0], fg: m[1] };
}

export const PR: Record<string, { fg: string; bg: string }> = {
  Urgent: { fg: "#B42318", bg: "#FEF3F2" },
  High: { fg: "#C4320A", bg: "#FFF4ED" },
  Medium: { fg: "#2F4FB3", bg: "#EFF4FF" },
  Low: { fg: "#475467", bg: "#F2F4F7" },
  None: { fg: "#98A2B3", bg: "#F9FAFB" },
};
export const pr = (p: string) => PR[p] ?? PR.None;

export const APS: Record<string, [string, string]> = {
  Draft: ["#F2F4F7", "#475467"],
  Sent: ["#EFF4FF", "#2F4FB3"],
  Viewed: ["#F4F3FF", "#5925DC"],
  Approved: ["#ECFDF3", "#067647"],
  Rejected: ["#FEF3F2", "#B42318"],
  "Changes Requested": ["#FEF6E7", "#B54708"],
  Expired: ["#F2F4F7", "#667085"],
  Cancelled: ["#F2F4F7", "#667085"],
};
export const aps = (s: string) => ({ bg: (APS[s] ?? APS.Draft)[0], fg: (APS[s] ?? APS.Draft)[1] });

export const EXT: Record<string, [string, string]> = {
  PDF: ["#FEF3F2", "#B42318"],
  FIG: ["#F4F3FF", "#5925DC"],
  XLS: ["#ECFDF3", "#067647"],
  XLSX: ["#ECFDF3", "#067647"],
  CSV: ["#ECFDF3", "#067647"],
  DOC: ["#EFF4FF", "#2F4FB3"],
  DOCX: ["#EFF4FF", "#2F4FB3"],
  PNG: ["#FEF6E7", "#B54708"],
  JPG: ["#FEF6E7", "#B54708"],
  JPEG: ["#FEF6E7", "#B54708"],
  MD: ["#F2F4F7", "#475467"],
};
export const ext = (e: string) => EXT[e] ?? EXT.MD;

export const ACCESS: Record<string, { label: string; bg: string; fg: string }> = {
  client_shared: { label: "Client shared", bg: "#ECFDF3", fg: "#067647" },
  internal: { label: "Internal", bg: "#F2F4F7", fg: "#344054" },
  private: { label: "Private", bg: "#FEF6E7", fg: "#B54708" },
};

/** Time-entry status shown with the task colour it maps to in the design. */
export const TIME_ST: Record<string, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "Draft" },
  submitted: { label: "Submitted", tone: "In Review" },
  approved: { label: "Approved", tone: "Done" },
  rejected: { label: "Rejected", tone: "Blocked" },
};

export const pill = (on: boolean) => ({ background: on ? "#E7F6EE" : "#fff", color: on ? "#0E8442" : "#475467", border: `1px solid ${on ? "#12A150" : "#E6EAF0"}` });
export const seg = (on: boolean) => ({ background: on ? "#E7F6EE" : "transparent", color: on ? "#0E8442" : "#475467" });

/* ── formatting ── */

export function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${m}/${d}/${y}`;
}
export const fmtShort = (iso: string | null | undefined) => (iso ? fmt(iso).slice(0, 5) : "—");

export function days(iso: string, today: string): number {
  return Math.round((new Date(iso.slice(0, 10) + "T12:00:00Z").getTime() - new Date(today + "T12:00:00Z").getTime()) / 864e5);
}
export function left(iso: string | null, today: string, done = false): [string, string] {
  if (done) return ["Done", "#067647"];
  if (!iso) return ["No date", "#98A2B3"];
  const d = days(iso, today);
  if (d < 0) return [`${-d}d overdue`, "#B42318"];
  if (d === 0) return ["Due today", "#B54708"];
  return [`${d}d left`, d <= 7 ? "#B54708" : "#667085"];
}
export function addD(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function money(n: number | null | undefined, currency: string): string {
  if (n == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${Math.round(n).toLocaleString("en-US")}`;
  }
}
export const ini = (n: string) =>
  n
    .split(" ")
    .filter(Boolean)
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
export function hm(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h}h${r ? " " + r + "m" : ""}` : `${r}m`;
}
export const hrs = (mins: number) => {
  const v = Math.round((mins / 60) * 10) / 10;
  return (Number.isInteger(v) ? String(v) : v.toFixed(1)) + "h";
};
export function ago(iso: string, nowMs = Date.now()): string {
  const s = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 1000));
  if (s < 60) return "Just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr${h > 1 ? "s" : ""} ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 30) return `${d} days ago`;
  return fmt(iso.slice(0, 10));
}
export const fileSize = (b: number) => (b > 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1e3)) + " KB");

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return e instanceof Error ? e.message : "Something went wrong";
}

export function downloadCsv(filename: string, csv: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = filename;
  a.click();
}

/* ── small presentational pieces ── */

export function Svg({ d, size = 15, sw = 2 }: { d: string; size?: number; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function HealthBadge({ h, label }: { h: Health | string; label?: string }) {
  const m = health(h);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 700, color: m.fg, background: m.bg, borderRadius: "6px", padding: "3px 7px", whiteSpace: "nowrap" }}>
      <Svg d={m.icon} size={12} sw={2.4} />
      {label ?? h}
    </span>
  );
}

export function Badge({ s, label, pad = "3px 7px" }: { s: string; label?: string; pad?: string }) {
  const m = st(s);
  return <span style={{ fontSize: "11px", fontWeight: 700, color: m.fg, background: m.bg, borderRadius: "6px", padding: pad, whiteSpace: "nowrap" }}>{label ?? s}</span>;
}

export function Bar({ pct, w = "60px", h = "6px", color = "#12A150" }: { pct: number; w?: string; h?: string; color?: string }) {
  return (
    <span style={{ display: "inline-block", width: w, height: h, background: "#F2F4F7", borderRadius: "6px", overflow: "hidden", flex: w === "100%" ? 1 : undefined }}>
      <span style={{ display: "block", height: "100%", width: Math.max(0, Math.min(100, pct)) + "%", background: color, borderRadius: "6px" }} />
    </span>
  );
}

export function Avatar({ name, size = 24, bg = "#E7F6EE", fg = "#0E8442", fs = "10px" }: { name: string; size?: number; bg?: string; fg?: string; fs?: string }) {
  return (
    <span style={{ width: size, height: size, borderRadius: "50%", background: bg, color: fg, fontSize: fs, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: `0 0 ${size}px` }}>{ini(name || "?")}</span>
  );
}

export const card: CSSProperties = { background: "#fff", border: "1px solid #E6EAF0", borderRadius: "14px" };
export const th: CSSProperties = { padding: "10px 8px" };
export const theadRow: CSSProperties = { background: "#FAFBFC", textAlign: "left", color: "#667085", fontSize: "11px", textTransform: "uppercase", letterSpacing: ".3px" };
export const inputSt: CSSProperties = { height: "40px", border: "1px solid #E6EAF0", borderRadius: "10px", padding: "0 12px", fontSize: "12.5px", background: "#fff" };
export const selectSt: CSSProperties = { height: "40px", border: "1px solid #E6EAF0", borderRadius: "10px", padding: "0 10px", fontSize: "12.5px", background: "#fff" };
export const fieldLabel: CSSProperties = { display: "flex", flexDirection: "column", gap: "5px", fontSize: "12px", fontWeight: 700, color: "#344054" };
export const fieldInput: CSSProperties = { height: "40px", border: "1px solid #E6EAF0", borderRadius: "9px", padding: "0 11px", fontSize: "13px" };
export const fieldSelect: CSSProperties = { height: "40px", border: "1px solid #E6EAF0", borderRadius: "9px", padding: "0 9px", fontSize: "13px" };
export const btnGhost: CSSProperties = { height: "40px", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "0 13px", fontSize: "12.5px", fontWeight: 700, color: "#344054", cursor: "pointer" };
export const btnPrimary: CSSProperties = { height: "40px", border: 0, background: "#12A150", borderRadius: "10px", padding: "0 14px", fontSize: "12.5px", fontWeight: 800, color: "#fff", cursor: "pointer" };
export const pillBtn = (on: boolean): CSSProperties => ({ ...pill(on), borderRadius: "20px", padding: "7px 12px", fontSize: "12px", fontWeight: 700, cursor: "pointer" });

export function Kpi({ label, value, fg = "#0F172A", onClick, active, size = 21, sub }: { label: string; value: ReactNode; fg?: string; onClick?: () => void; active?: boolean; size?: number; sub?: ReactNode }) {
  const inner = (
    <>
      <div style={{ fontSize: "11.5px", fontWeight: 700, color: "#667085" }}>{label}</div>
      <div style={{ fontSize: size + "px", fontWeight: 800, color: fg, marginTop: "3px" }}>{value}</div>
      {sub}
    </>
  );
  const style: CSSProperties = { textAlign: "left", background: "#fff", border: `1px solid ${active ? "#12A150" : "#E6EAF0"}`, borderRadius: "13px", padding: "12px 14px", minWidth: 0 };
  return onClick ? (
    <button type="button" className="pt-hov" onClick={onClick} style={{ ...style, cursor: "pointer" }}>
      {inner}
    </button>
  ) : (
    <div style={style}>{inner}</div>
  );
}

export function Empty({ title, body, children, pad = "36px" }: { title?: string; body: string; children?: ReactNode; pad?: string }) {
  return (
    <div style={{ padding: `${pad} 20px`, textAlign: "center", display: "flex", flexDirection: "column", gap: "8px", alignItems: "center" }}>
      {title && <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#101828" }}>{title}</div>}
      <div style={{ fontSize: "12.5px", color: "#667085" }}>{body}</div>
      {children}
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div style={{ ...card, padding: "40px", textAlign: "center", fontSize: "12.5px", color: "#667085" }}>{label}</div>;
}

export function ErrorBox({ error }: { error: unknown }) {
  return <div role="alert" style={{ ...card, padding: "18px", fontSize: "12.5px", color: "#B42318", fontWeight: 700 }}>{errorText(error)}</div>;
}

/** Right-side drawer shell with the design's header/footer framing. */
export function Drawer({ label, width = 420, title, kicker, onClose, children, footer }: { label: string; width?: number; title: ReactNode; kicker?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <aside data-drawer="1" role="dialog" aria-label={label} style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: width + "px", background: "#fff", zIndex: 95, boxShadow: "-12px 0 40px rgba(16,24,40,.14)", display: "flex", flexDirection: "column", animation: "nxdr .28s ease" }}>
      <div style={{ padding: "16px 18px", borderBottom: "1px solid #F0F2F5", display: "flex", gap: "10px", alignItems: kicker ? "flex-start" : "center" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {kicker && <div style={{ fontSize: "11px", color: "#98A2B3", fontWeight: 600 }}>{kicker}</div>}
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#101828", lineHeight: 1.3, wordBreak: "break-word" }}>{title}</div>
        </div>
        <CloseBtn onClick={onClose} />
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: "13px" }}>{children}</div>
      {footer && <div style={{ padding: "12px 18px", borderTop: "1px solid #F0F2F5", display: "flex", gap: "8px" }}>{footer}</div>}
    </aside>
  );
}

export function CloseBtn({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Close" style={{ border: 0, background: "#F2F4F7", width: "32px", height: "32px", borderRadius: "8px", cursor: "pointer", fontSize: "16px", color: "#344054", flex: "0 0 32px" }}>
      ×
    </button>
  );
}

export const footBtnPrimary: CSSProperties = { flex: 1, border: 0, background: "#12A150", color: "#fff", borderRadius: "10px", padding: "11px", fontSize: "12.5px", fontWeight: 800, cursor: "pointer" };
export const footBtnGhost: CSSProperties = { border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "11px 14px", fontSize: "12.5px", fontWeight: 700, color: "#344054", cursor: "pointer" };
export const errLine: CSSProperties = { fontSize: "11.5px", color: "#B42318", fontWeight: 700 };

export const STYLES = `
.ui-projects a{text-decoration:none}
.ui-projects .pt-hov:hover{border-color:#12A150!important}
.ui-projects .pt-hovsh:hover{border-color:#12A150!important;box-shadow:0 4px 14px rgba(16,24,40,.06)}
.ui-projects .pt-tab:hover{color:#0E8442!important}
.ui-projects .pt-row:hover{background:#F6FBF8!important}
.ui-projects .pt-soft:hover{border-color:#E6EAF0!important;background:#FAFBFC!important}
.ui-projects .pt-primary:hover{background:#0E8442!important}
.ui-projects .pt-ghost:hover{border-color:#12A150!important;color:#0E8442!important}
.ui-projects .pt-card:hover{border-color:#12A150!important}
.ui-projects :focus-visible{outline:2px solid #12A150;outline-offset:2px}
@keyframes nxin{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
@keyframes nxdr{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}
@media(prefers-reduced-motion:reduce){.ui-projects *{animation:none!important;transition:none!important}}
@media(max-width:1180px){.ui-projects [data-2col]{grid-template-columns:minmax(0,1fr)!important}}
@media(max-width:900px){.ui-projects [data-hidesm]{display:none!important}}
@media(max-width:620px){.ui-projects [data-kpi]{grid-template-columns:repeat(2,minmax(0,1fr))!important}.ui-projects [data-drawer]{width:100%!important}}
`;
