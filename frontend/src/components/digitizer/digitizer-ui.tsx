"use client";

import type { CSSProperties, MouseEventHandler, ReactNode } from "react";
import { DigitizerIcon } from "./digitizer-icon";
import type { Tone } from "./digitizer-types";
import type { ConfidenceLevel, DocStatus, DocumentKind, RowState } from "@/lib/digitizer-api";

// ─────────────────────────────── chips ───────────────────────────────

export const CHIP_THEMES: Record<Tone, [string, string, string]> = {
  green: ["#ECFDF3", "#BBF0CB", "#15803D"],
  amber: ["#FFFBEB", "#FDE49B", "#B45309"],
  red: ["#FEF3F2", "#FBD5D2", "#B42318"],
  blue: ["#EFF6FF", "#C7DBFE", "#1D4ED8"],
  purple: ["#F5F3FF", "#DDD3FE", "#6D28D9"],
  neutral: ["#F1F3F6", "#E1E5EB", "#45505F"],
};

export function chipStyle(tone: Tone = "neutral", extra?: CSSProperties): CSSProperties {
  const [bg, border, text] = CHIP_THEMES[tone] || CHIP_THEMES.neutral;
  return {
    height: "23px",
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    padding: "0 8px",
    borderRadius: "999px",
    background: bg,
    border: `1px solid ${border}`,
    color: text,
    fontSize: "10.5px",
    fontWeight: 700,
    whiteSpace: "nowrap",
    ...extra,
  };
}

export function Chip({
  tone = "neutral",
  children,
  style,
  onClick,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  style?: CSSProperties;
  onClick?: MouseEventHandler;
  title?: string;
}) {
  return (
    <div style={chipStyle(tone, style)} onClick={onClick} title={title}>
      {children}
    </div>
  );
}

// ─────────────────────────────── status vocabulary ───────────────────────────────

export const STATUS_META: Record<DocStatus, { label: string; icon: string; tone: Tone }> = {
  queued: { label: "Queued", icon: "files", tone: "neutral" },
  processing: { label: "Processing", icon: "refresh-cw", tone: "blue" },
  failed: { label: "Failed", icon: "circle-alert", tone: "red" },
  needs_review: { label: "Needs review", icon: "list-checks", tone: "amber" },
  total_mismatch: { label: "Total mismatch", icon: "circle-alert", tone: "red" },
  unbalanced: { label: "Unbalanced", icon: "triangle-alert", tone: "amber" },
  ready: { label: "Ready to import", icon: "circle-check", tone: "green" },
  imported: { label: "Imported", icon: "circle-check", tone: "green" },
};

export const KIND_ICON: Record<DocumentKind, string> = {
  customer_list: "file-text",
  purchase_invoice: "file-spreadsheet",
  sales_receipt: "receipt",
  inventory_sheet: "boxes",
  credit_ledger: "credit-card",
  booking_register: "calendar-check",
  product_list: "package",
  business_card: "file-text",
  staff_register: "user-round",
  other: "file-text",
  unknown: "circle-alert",
};

export const LEVEL_META: Record<ConfidenceLevel, { label: string; tone: Tone }> = {
  high: { label: "High", tone: "green" },
  medium: { label: "Medium", tone: "blue" },
  low: { label: "Low", tone: "amber" },
  unreadable: { label: "Unreadable", tone: "red" },
};

export const ROW_STATE_META: Record<RowState, { label: string; tone: Tone }> = {
  ready: { label: "Ready", tone: "green" },
  needs_review: { label: "Needs review", tone: "amber" },
  blocked: { label: "Blocked", tone: "red" },
  skipped: { label: "Skipped", tone: "neutral" },
  imported: { label: "Imported", tone: "green" },
  failed: { label: "Failed", tone: "red" },
};

export function StatusChip({ status, style }: { status: DocStatus; style?: CSSProperties }) {
  const m = STATUS_META[status];
  return (
    <Chip tone={m.tone} style={style}>
      <DigitizerIcon name={m.icon} size={12} />
      <span>{m.label}</span>
    </Chip>
  );
}

export function toneOfSummary(summary: string): Tone {
  if (summary === "Unreadable" || summary === "Nothing extracted") return "red";
  if (summary === "All high") return "green";
  return "amber";
}

export const toneBorder = (tone: Tone) => (tone === "red" ? "#FBD5D2" : tone === "amber" ? "#FDE49B" : "#E6E8EC");
export const toneInk = (tone: Tone) => (tone === "red" ? "#B42318" : tone === "amber" ? "#B45309" : "#0F172A");
export const toneSoftBg = (tone: Tone) => (tone === "red" ? "#FEE4E2" : tone === "amber" ? "#FEF3C7" : "#ECFDF3");
export const toneBar = (tone: Tone) =>
  tone === "red" ? "#DC2626" : tone === "amber" ? "#F59E0B" : tone === "blue" ? "#2563EB" : tone === "neutral" ? "#C3CAD4" : "#16A34A";

// ─────────────────────────────── formatting ───────────────────────────────

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export function formatMoney(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return n.toLocaleString();
  }
}

/** "Today 9:14 AM", "Yesterday 4:38 PM", "3 days ago", or a date — from a real timestamp. */
export function whenLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

export function durationLabel(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} second${s === 1 ? "" : "s"}`;
  const m = Math.floor(s / 60);
  return `${m} min ${s % 60}s`;
}

export function pagesLabel(pageCount: number, records: number): string {
  return `${plural(pageCount, "page")} · ${plural(records, "record")}`;
}

export function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ─────────────────────────────── layout pieces ───────────────────────────────

export const cardStyle: CSSProperties = {
  background: "#fff",
  border: "1px solid #E6E8EC",
  borderRadius: "13px",
  boxShadow: "0 1px 2px rgba(16,24,40,.05)",
};

export function Card({ children, style, padding = "17px" }: { children: ReactNode; style?: CSSProperties; padding?: string | 0 }) {
  return <div style={{ minWidth: 0, ...cardStyle, padding, ...style }}>{children}</div>;
}

export function CardHeader({ title, note, icon, children }: { title: string; note?: ReactNode; icon?: string; children?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
      {icon && <DigitizerIcon name={icon} size={16} style={{ color: "#45505F" }} />}
      <div style={{ fontSize: "14px", fontWeight: 800 }}>{title}</div>
      {note && <div style={{ marginLeft: "auto", fontSize: "11px", color: "#94A3B8" }}>{note}</div>}
      {children}
    </div>
  );
}

export function TableCard({ children, minWidth }: { children: ReactNode; minWidth: string }) {
  return (
    <div style={{ overflowX: "auto" }} className="nx-scroll">
      <table style={{ width: "100%", minWidth, borderCollapse: "collapse" }}>{children}</table>
    </div>
  );
}

export function Th({ children, align = "left", first, last }: { children?: ReactNode; align?: "left" | "center" | "right"; first?: boolean; last?: boolean }) {
  return (
    <th
      style={{
        textAlign: align,
        padding: `11px ${last ? "18px" : "12px"} 11px ${first ? "18px" : "12px"}`,
        fontSize: "10.5px",
        fontWeight: 800,
        letterSpacing: ".07em",
        textTransform: "uppercase",
        color: "#7A8798",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

export const theadStyle: CSSProperties = { background: "#FAFBFC", borderBottom: "1px solid #E6E8EC" };

export function CardFooterNote({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: "12px 18px", borderTop: "1px solid #EEF0F3", background: "#FCFCFD", fontSize: "11px", color: "#94A3B8", lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

export function Kpi({ label, value, meta, tone = "neutral", onClick }: { label: string; value: string; meta: string; tone?: Tone; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "#fff",
        borderRadius: "12px",
        padding: "14px 15px",
        cursor: onClick ? "pointer" : "default",
        boxShadow: "0 1px 2px rgba(16,24,40,.04)",
        border: `1px solid ${toneBorder(tone)}`,
      }}
    >
      <div style={{ fontSize: "11.5px", fontWeight: 700, color: "#5B6675" }}>{label}</div>
      <div style={{ fontSize: "19px", fontWeight: 800, letterSpacing: "-.03em", marginTop: "7px", fontVariantNumeric: "tabular-nums", color: toneInk(tone) }}>{value}</div>
      <div style={{ fontSize: "10.5px", color: "#94A3B8", marginTop: "4px", lineHeight: 1.4 }}>{meta}</div>
    </div>
  );
}

export function KpiGrid({ children, min = 150 }: { children: ReactNode; min?: number }) {
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: "12px" }}>{children}</div>;
}

export function BarRow({
  label,
  meta,
  value,
  width,
  tone,
  onClick,
  chip,
}: {
  label: string;
  meta: string;
  value: string;
  width: number;
  tone: Tone;
  onClick?: () => void;
  chip?: boolean;
}) {
  return (
    <div onClick={onClick} style={{ cursor: onClick ? "pointer" : "default" }}>
      <div style={{ display: "flex", alignItems: chip ? "center" : "baseline", gap: "8px", fontSize: "12px", marginBottom: "5px" }}>
        {chip ? <div style={chipStyle(tone, { height: "20px", fontSize: "9.5px" })}>{label}</div> : <span style={{ fontWeight: 700 }}>{label}</span>}
        <span style={{ color: "#94A3B8", fontSize: chip ? "11px" : undefined }}>{meta}</span>
        <span style={{ marginLeft: "auto", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{value}</span>
      </div>
      <div style={{ height: "9px", borderRadius: "5px", background: "#F1F3F6", overflow: "hidden" }}>
        <div style={{ width: `${Math.max(width, 0)}%`, height: "100%", borderRadius: "5px", background: toneBar(tone), transition: "width .3s" }} />
      </div>
    </div>
  );
}

export function Btn({
  children,
  onClick,
  primary,
  danger,
  disabled,
  small,
  icon,
  title,
  style,
}: {
  children: ReactNode;
  onClick?: MouseEventHandler;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  small?: boolean;
  icon?: string;
  title?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      role="button"
      title={title}
      onClick={disabled ? undefined : onClick}
      style={{
        height: small ? "30px" : "32px",
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: primary ? "0 12px" : "0 10px",
        borderRadius: primary ? "9px" : "8px",
        border: `1px solid ${primary ? "#16A34A" : danger ? "#FBD5D2" : "#D5DAE2"}`,
        background: primary ? "#16A34A" : "#fff",
        color: primary ? "#fff" : danger ? "#B42318" : "#45505F",
        fontSize: "12px",
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        whiteSpace: "nowrap",
        flexShrink: 0,
        ...style,
      }}
    >
      {icon && <DigitizerIcon name={icon} size={14} />}
      <span>{children}</span>
    </div>
  );
}

export function Empty({ title, children, icon = "scan-text", action }: { title: string; children?: ReactNode; icon?: string; action?: ReactNode }) {
  return (
    <div style={{ padding: "34px 20px", textAlign: "center" }}>
      <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "#F1F3F6", color: "#7A8798", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
        <DigitizerIcon name={icon} size={19} />
      </div>
      <div style={{ fontSize: "13.5px", fontWeight: 800, marginTop: "12px" }}>{title}</div>
      {children && <div style={{ fontSize: "12px", color: "#7A8798", marginTop: "5px", lineHeight: 1.55, maxWidth: "440px", margin: "5px auto 0" }}>{children}</div>}
      {action && <div style={{ marginTop: "14px", display: "flex", justifyContent: "center" }}>{action}</div>}
    </div>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div style={{ ...cardStyle, padding: "34px", textAlign: "center", fontSize: "12.5px", color: "#7A8798" }}>
      <DigitizerIcon name="loader" size={16} style={{ margin: "0 auto 8px", animation: "nxSpin 1s linear infinite" }} />
      {label}
    </div>
  );
}

export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div style={{ ...cardStyle, borderColor: "#FBD5D2", padding: "18px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
      <DigitizerIcon name="circle-alert" size={18} style={{ color: "#B42318" }} />
      <div style={{ flex: 1, minWidth: "200px" }}>
        <div style={{ fontSize: "13px", fontWeight: 800 }}>Could not load this</div>
        <div style={{ fontSize: "12px", color: "#5B6675", marginTop: "2px" }}>{message}</div>
      </div>
      {onRetry && <Btn onClick={onRetry}>Try again</Btn>}
    </div>
  );
}

export function Notice({ tone = "neutral", icon = "info", children }: { tone?: Tone; icon?: string; children: ReactNode }) {
  const [bg, border, ink] = CHIP_THEMES[tone];
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: "11px", padding: "11px 13px", display: "flex", gap: "9px", alignItems: "flex-start" }}>
      <DigitizerIcon name={icon} size={15} style={{ color: ink, marginTop: "1px" }} />
      <div style={{ fontSize: "12px", color: "#45505F", lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}

export function DocThumb({ icon, tone, size = 28 }: { icon: string; tone: Tone; size?: number }) {
  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        flex: `0 0 ${size}px`,
        borderRadius: "8px",
        background: toneSoftBg(tone),
        color: tone === "red" ? "#B42318" : tone === "amber" ? "#B45309" : "#15803D",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <DigitizerIcon name={icon} size={Math.round(size / 2)} />
    </div>
  );
}

export const monoStyle: CSSProperties = { fontFamily: "var(--font-mono, monospace)" };
