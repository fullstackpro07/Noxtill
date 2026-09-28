"use client";

import type { CSSProperties, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";

export const PRIO: Record<string, { bg: string; fg: string; bar: string }> = {
  Critical: { bg: "#FEF3F2", fg: "#B42318", bar: "#F04438" },
  Attention: { bg: "#FEF6E7", fg: "#B54708", bar: "#F79009" },
  Opportunity: { bg: "#E8F7EE", fg: "#0E8442", bar: "#12A150" },
  Improving: { bg: "#EEF4FF", fg: "#3538CD", bar: "#8FD5FF" },
  Risk: { bg: "#FEF3F2", fg: "#B42318", bar: "#F04438" },
  Resolved: { bg: "#F2F4F7", fg: "#475467", bar: "#98A2B3" },
};

export const CONF: Record<string, { bg: string; fg: string }> = {
  High: { bg: "#E8F7EE", fg: "#0E8442" },
  Medium: { bg: "#FEF6E7", fg: "#B54708" },
  Low: { bg: "#F2F4F7", fg: "#475467" },
};

export const KIND_ICON: Record<string, string> = {
  credit: "M12 2v20M17 6.5c0-2-2.2-3-5-3s-5 1-5 3.2S9.5 10 12 10.5s5 1.4 5 3.6-2.2 3.4-5 3.4-5-1.2-5-3",
  stock: "M2.5 4.5A1.5 1.5 0 0 1 4 3h16a1.5 1.5 0 0 1 1.5 1.5V8H2.5ZM4.5 8v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8M10 12.5h4",
  customers: "M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0M22 21v-2a4 4 0 0 0-3-3.87",
  calendar: "M19 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2ZM16 2v4M8 2v4M3 10h18",
  branch: "M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16M9 21v-4h6v4M8.5 7h2M13.5 7h2",
  doc: "M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM15 2v5h5M9 14h6",
  warn: "M12 9v5M12 17.5h.01M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  truck: "M16 16h2a2 2 0 0 0 2-2v-3l-3-4h-3M2 6h11v10H9M9 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0M16 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0",
  star: "m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.8l6.5-.9Z",
  tag: "M20.6 13.4 12 22l-9-9V4a1 1 0 0 1 1-1h9l7.6 7.6a2 2 0 0 1 0 2.8ZM7.5 7.5h.01",
  check: "m5 13 4 4L19 7",
};

export function iconFor(key: string): string {
  if (key.startsWith("credit")) return KIND_ICON.credit;
  if (key.startsWith("stock")) return KIND_ICON.stock;
  if (key.startsWith("repeat") || key.startsWith("lapsed")) return KIND_ICON.customers;
  if (key.startsWith("quiet")) return KIND_ICON.calendar;
  if (key.startsWith("margin")) return KIND_ICON.branch;
  if (key.startsWith("quotation")) return KIND_ICON.doc;
  if (key.startsWith("delivery")) return KIND_ICON.truck;
  if (key.startsWith("low_reviews")) return KIND_ICON.star;
  if (key.startsWith("discount")) return KIND_ICON.tag;
  return KIND_ICON.warn;
}

export const card: CSSProperties = { background: "#fff", border: "1px solid #E6EAF0", borderRadius: "16px" };
export const eyebrow: CSSProperties = { fontSize: "10.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3" };

export function Icon({ d, size = 15, stroke = "currentColor", width = 2 }: { d: string; size?: number; stroke?: string; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export function Chip({ k, on, onClick, n }: { k: string; on: boolean; onClick: () => void; n?: number | string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: "7px", border: `1px solid ${on ? "#12A150" : "#E6EAF0"}`, background: on ? "#F7FCF9" : "#fff", color: on ? "#0E8442" : "#475467", borderRadius: "20px", padding: "7px 12px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", minHeight: "38px", whiteSpace: "nowrap" }}
    >
      {k}
      {n !== undefined && <span style={{ fontSize: "10.5px", opacity: 0.7 }}>{n}</span>}
    </button>
  );
}

export function Btn({ children, onClick, primary, disabled, title, style }: { children: ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean; title?: string; style?: CSSProperties }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={primary ? "bb-primary" : "bb-soft"}
      style={{
        border: primary ? 0 : "1px solid #E6EAF0",
        background: primary ? "#12A150" : "#fff",
        borderRadius: "10px",
        padding: "9px 15px",
        fontSize: "11.5px",
        fontWeight: primary ? 800 : 700,
        color: primary ? "#fff" : "#344054",
        cursor: disabled ? "not-allowed" : "pointer",
        minHeight: "40px",
        opacity: disabled ? 0.55 : 1,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Empty({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ padding: "44px 18px", textAlign: "center" }}>
      <div style={{ fontSize: "14px", fontWeight: 800, color: "#344054" }}>{title}</div>
      {sub && <div style={{ fontSize: "12px", color: "#98A2B3", marginTop: "4px", maxWidth: "56ch", marginLeft: "auto", marginRight: "auto", lineHeight: 1.5 }}>{sub}</div>}
    </div>
  );
}

export function Loading({ label = "Reading your records…" }: { label?: string }) {
  return <div style={{ padding: "44px 18px", textAlign: "center", fontSize: "12.5px", color: "#98A2B3" }}>{label}</div>;
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}

export function useBrainInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("brain") });
}

export function SectionHead({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div style={{ padding: "15px 17px", borderBottom: "1px solid #F2F4F7", display: "flex", alignItems: "center", gap: "11px", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: "170px" }}>
        <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 800, color: "#101828" }}>{title}</h2>
        {sub && <div style={{ fontSize: "11.5px", color: "#98A2B3", marginTop: "3px" }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

export function InfoBanner({ children, tone = "blue" }: { children: ReactNode; tone?: "blue" | "amber" }) {
  const t = tone === "blue" ? { bg: "#EEF4FF", bd: "#C7D7FE", fg: "#3538CD" } : { bg: "#FFFBF2", bd: "#FDE3B3", fg: "#93370D" };
  return (
    <div style={{ background: t.bg, border: `1px solid ${t.bd}`, borderRadius: "12px", padding: "12px 14px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={t.fg} strokeWidth={2} strokeLinecap="round" style={{ flex: "0 0 auto", marginTop: "1px" }}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 16v-4M12 8.5h.01" />
      </svg>
      <div style={{ fontSize: "12px", color: t.fg, lineHeight: 1.55 }}>{children}</div>
    </div>
  );
}
