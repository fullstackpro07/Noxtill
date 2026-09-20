"use client";

import type { CSSProperties, ReactNode } from "react";
import { X } from "lucide-react";
import { toast } from "@/lib/toast";

/** Shared v2 visual language for every Staff module screen — mirrors the exact tokens/patterns
 * already established in the Profit & Analytics rebuild (KpiTile, select/button styles, chart
 * geometry helpers, the "+ Add your own…" demo-placeholder convention) so both modules look and
 * behave identically. */

export const selectStyle: CSSProperties = {
  border: "1px solid var(--app-border)",
  background: "var(--app-surface)",
  color: "var(--app-text-muted)",
  borderRadius: 11,
  padding: "10px 12px",
  fontSize: 12.5,
  fontWeight: 600,
  minHeight: 44,
};

export const outlineBtnStyle: CSSProperties = {
  border: "1px solid var(--app-border)",
  background: "var(--app-surface)",
  borderRadius: 11,
  padding: "11px 15px",
  fontSize: 12.5,
  fontWeight: 700,
  color: "var(--app-text-muted)",
  minHeight: 44,
};

export function primaryBtnStyle(bg = "var(--app-primary)"): CSSProperties {
  return {
    background: bg,
    borderRadius: 11,
    padding: "11px 16px",
    fontSize: 12.5,
    fontWeight: 800,
    color: "#fff",
    minHeight: 44,
    border: 0,
  };
}

export const destructiveBtnStyle: CSSProperties = {
  background: "#B42318",
  borderRadius: 11,
  padding: "11px 16px",
  fontSize: 12.5,
  fontWeight: 800,
  color: "#fff",
  minHeight: 44,
  border: 0,
};

/** Many design filter selects include a trailing "+ Add your own…" option that the original
 * design itself treats as an inert demo placeholder (its own handler just flashes a toast and
 * returns). Kept for structural/pixel fidelity; wired to a real no-op toast instead of fabricated
 * behavior. */
/** Real, magnitude-derived confidence tier for an insight card — replaces a hardcoded per-insight
 * literal with a label that actually varies with how strong the underlying signal is (e.g. share
 * of team total, percentage swing). Thresholds are a judgment call like any other, but the tier
 * genuinely tracks the input instead of being fixed per insight type. */
export function confidenceTier(strengthPct: number): "High" | "Medium" | "Low" {
  if (strengthPct >= 35) return "High";
  if (strengthPct >= 18) return "Medium";
  return "Low";
}
export function confidenceTint(tier: "High" | "Medium" | "Low"): { bg: string; color: string } {
  if (tier === "High") return { bg: "#E8F7EE", color: "#0E8442" };
  if (tier === "Medium") return { bg: "#FEF6E7", color: "#B54708" };
  return { bg: "#F2F4F7", color: "#475467" };
}

export function handleFakeOption(value: string): boolean {
  if (value.indexOf("+ Add") === 0) {
    toast.info("Custom option builder — not available yet.");
    return true;
  }
  return false;
}

export function KpiTile({
  label,
  value,
  icon,
  bg,
  color,
  border,
  sub,
}: {
  label: string;
  value: string;
  icon: string;
  bg: string;
  color: string;
  border?: string;
  sub?: ReactNode;
}) {
  return (
    <div className="rounded-[14px]" style={{ background: "var(--app-surface)", border: border ?? "1px solid var(--app-border)", padding: 15 }}>
      <div className="mb-[9px] flex items-center gap-[9px]">
        <span className="flex items-center justify-center rounded-[9px]" style={{ width: 30, height: 30, background: bg, flex: "0 0 30px" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={icon} />
          </svg>
        </span>
        <span className="text-[12px] font-semibold" style={{ color: "var(--app-text-faint)" }}>{label}</span>
      </div>
      <div className="text-[21px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.5px" }}>{value}</div>
      {sub}
    </div>
  );
}

/** The Staff module's OTHER kpi-tile convention — used on every "v2" screen (Overview, Staff 360,
 * Tasks, Performance, Teams & Roles): no icon at all, just a label (plain or colored+bold when the
 * tile is highlighted) over a large value, with an optional small caption line underneath. Distinct
 * from `KpiTile` (icon-badge style), which the legacy screens (Roster, Attendance, ...) use — the
 * design genuinely mixes both conventions, not a mistake to reconcile. */
export function SimpleKpiTile({
  label,
  value,
  valueSize = 23,
  labelColor,
  valueColor,
  border,
  sub,
}: {
  label: string;
  value: string;
  valueSize?: number;
  /** Pass the highlight color (e.g. "#0E8442") to make the label bold+colored, matching a
   * highlighted-border tile; omit for the plain gray label most tiles use. */
  labelColor?: string;
  valueColor?: string;
  border?: string;
  sub?: ReactNode;
}) {
  return (
    <div className="rounded-[14px]" style={{ background: "var(--app-surface)", border: border ?? "1px solid var(--app-border)", padding: 15 }}>
      <div className="text-[12px]" style={{ color: labelColor ?? "var(--app-text-faint)", fontWeight: labelColor ? 700 : 600 }}>{label}</div>
      <div className="mt-1.5 font-extrabold" style={{ fontSize: valueSize, color: valueColor ?? "var(--app-text)" }}>{value}</div>
      {sub}
    </div>
  );
}

export function KpiSkeleton({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-[86px] animate-pulse rounded-[14px]" style={{ background: "var(--app-surface-2)" }} />
      ))}
    </>
  );
}

/** Same status-chip color map style as the design's own `chip()` helper — one lookup table shared
 * across every Staff screen so the same status word always renders identically. */
const CHIP_COLORS: Record<string, [string, string]> = {
  Owner: ["#0A1B2A", "#fff"],
  Manager: ["#EEF4FF", "#3538CD"],
  Staff: ["#F2F4F7", "#475467"],
  "Family Member": ["#F5EBFE", "#7E22CE"],
  In: ["#E8F7EE", "#0E8442"],
  Working: ["#E8F7EE", "#0E8442"],
  Out: ["#F2F4F7", "#475467"],
  Off: ["#F2F4F7", "#475467"],
  Late: ["#FEF6E7", "#B54708"],
  "Late start": ["#FEF6E7", "#B54708"],
  Absent: ["#FEF3F2", "#B42318"],
  "On leave": ["#EEF4FF", "#3538CD"],
  Active: ["#E8F7EE", "#0E8442"],
  Inactive: ["#F2F4F7", "#475467"],
  Scheduled: ["#E8F7EE", "#0E8442"],
  Completed: ["#E8F7EE", "#0E8442"],
  Unfilled: ["#FEF3F2", "#B42318"],
  Cancelled: ["#F2F4F7", "#475467"],
  "Swap Requested": ["#FEF6E7", "#B54708"],
  pending: ["#FEF6E7", "#B54708"],
  Pending: ["#FEF6E7", "#B54708"],
  approved: ["#E8F7EE", "#0E8442"],
  Approved: ["#EEF4FF", "#3538CD"],
  rejected: ["#FEF3F2", "#B42318"],
  Rejected: ["#FEF3F2", "#B42318"],
  Overtime: ["#FEF6E7", "#B54708"],
  paid: ["#E8F7EE", "#0E8442"],
  Paid: ["#E8F7EE", "#0E8442"],
  unpaid: ["#FEF6E7", "#B54708"],
  Unpaid: ["#FEF6E7", "#B54708"],
  outstanding: ["#FEF6E7", "#B54708"],
  Outstanding: ["#FEF6E7", "#B54708"],
  deducted: ["#E8F7EE", "#0E8442"],
  Settled: ["#E8F7EE", "#0E8442"],
  Unsettled: ["#FEF3F2", "#B42318"],
  High: ["#FEF3F2", "#B42318"],
  Normal: ["#FEF6E7", "#B54708"],
  Low: ["#F2F4F7", "#475467"],
  Today: ["#FEF6E7", "#B54708"],
  Tomorrow: ["#EEF4FF", "#3538CD"],
  Overdue: ["#FEF3F2", "#B42318"],
};

export function chip(status: string): { bg: string; fg: string } {
  const [bg, fg] = CHIP_COLORS[status] ?? ["#F2F4F7", "#475467"];
  return { bg, fg };
}

export function Chip({ label }: { label: string }) {
  const c = chip(label);
  return (
    <span className="inline-flex items-center rounded-full text-[11px] font-extrabold" style={{ padding: "3px 10px", background: c.bg, color: c.fg }}>
      {label}
    </span>
  );
}

export function ToggleSwitch({ on, onToggle, disabled, label }: { on: boolean; onToggle: () => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      disabled={disabled}
      className="relative rounded-full"
      style={{ width: 38, height: 21, border: 0, background: on ? "#12A150" : "#D5DCE4", opacity: disabled ? 0.55 : 1 }}
    >
      <span className="absolute rounded-full bg-white" style={{ top: 2, width: 17, height: 17, left: on ? 19 : 2, transition: "left .12s" }} />
    </button>
  );
}

export function avatarInitials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

export const AVATAR_PALETTE = ["#12A150", "#3538CD", "#F97316", "#7E22CE", "#0E8442", "#B54708"];

export function Avatar({ name, index = 0, size = 34 }: { name: string; index?: number; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-extrabold text-white"
      style={{ width: size, height: size, fontSize: size * 0.36, background: AVATAR_PALETTE[index % AVATAR_PALETTE.length] }}
    >
      {avatarInitials(name)}
    </span>
  );
}

export function currentMonthValue(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function recentMonths(count = 6): { value: string; label: string }[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
    return { value, label };
  });
}

/** Same bar-chart geometry the design's own `bars()` helper computes, reused for every Staff bar chart. */
export function bars(vals: number[], max: number, W: number, PH: number, T: number) {
  const slot = (W - 44) / vals.length;
  return vals.map((v, i) => ({
    i,
    x: +(34 + i * slot + slot * 0.2).toFixed(1),
    w: +(slot * 0.6).toFixed(1),
    h: +((v / Math.max(1, max)) * PH).toFixed(1),
    y: +(T + PH - (v / Math.max(1, max)) * PH).toFixed(1),
    cx: +(34 + i * slot + slot / 2).toFixed(1),
  }));
}

/** Same line-chart geometry the design's own `lineOf()` helper computes. */
export function lineOf(vals: number[], min: number, max: number, W: number, PH: number, T: number) {
  const n = vals.length;
  const x = (i: number) => 34 + i * ((W - 48) / Math.max(1, n - 1));
  const y = (v: number) => T + PH * (1 - (v - min) / Math.max(1, max - min));
  const pts = vals.map((v, i) => ({ x: +x(i).toFixed(1), y: +y(v).toFixed(1) }));
  const line = pts.map((p, i) => (i ? "L" : "M") + p.x + " " + p.y).join(" ");
  const area = `${line} L${pts[n - 1].x} ${T + PH} L${pts[0].x} ${T + PH} Z`;
  return { pts, line, area };
}

/** Center-overlay modal chrome — exact match for the design's `modalOpen` wrapper and for
 * `AiSuggestModal`'s already-established pattern in the Profit & Analytics rebuild. */
export function CenterModal({
  title,
  onClose,
  children,
  footer,
  width = 480,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  width?: number;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-5" style={{ background: "rgba(10,27,42,.42)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full flex-col rounded-[18px]"
        style={{ maxWidth: width, background: "var(--app-surface)", boxShadow: "0 30px 80px rgba(10,27,42,.32)" }}
      >
        <div className="flex items-center gap-3" style={{ padding: 17, borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 flex-1 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="flex items-center justify-center rounded-[9px]" style={{ width: 34, height: 34, border: "1px solid var(--app-border)", color: "var(--app-text-faint)" }}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto" style={{ padding: 17 }}>
          {children}
        </div>
        <div className="flex justify-end gap-2.5" style={{ padding: "14px 17px", borderTop: "1px solid var(--app-surface-2)" }}>
          {footer}
        </div>
      </div>
    </div>
  );
}

/** Real client-side CSV export of whatever's currently on screen (respecting active filters) —
 * every design screen's "Export" button wires to this instead of a fabricated "queued" toast,
 * since the real filtered data is already loaded in the browser. */
export function exportCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast.success(`${filename} downloaded.`);
}

export function DisclosureNote({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 text-[11.5px] leading-relaxed" style={{ color: "var(--app-text-disabled)" }}>
      {children}
    </p>
  );
}

export function InfoBanner({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warning" }) {
  const styles =
    tone === "warning"
      ? { background: "#FFFBF2", border: "1px solid #FDE3B3", color: "#93370D" }
      : { background: "#EEF4FF", border: "1px solid #C7D7FE", color: "#3538CD" };
  return (
    <div className="rounded-[11px] text-[12px] leading-relaxed" style={{ ...styles, padding: "11px 14px" }}>
      {children}
    </div>
  );
}
