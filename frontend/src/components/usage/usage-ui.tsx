"use client";

import { useEffect, type CSSProperties, type ReactNode } from "react";
import type { MetricState } from "@/lib/usage-api";

/**
 * Shared primitives for Settings → Account & billing and Usage & Limits, transcribed from
 * `docs/Noxtill Header Build/Noxtill Settings.dc.html` / `Noxtill Usage & Limits.dc.html`.
 * Colours come from `app-theme.css` tokens wherever the theme has one.
 */
export const U = {
  green: "var(--app-primary)",
  greenHover: "var(--app-primary-hover)",
  greenSoft: "#E8F6EE",
  greenTint: "#F7FCF9",
  greenLine: "#B7E2C8",
  border: "var(--app-border)",
  line: "#F2F4F7",
  subtle: "#F9FAFB",
  ink: "#0F172A",
  text: "var(--app-text)",
  text2: "var(--app-text-muted)",
  text3: "var(--app-text-faint)",
  muted: "var(--app-text-faintest)",
  faint: "var(--app-text-disabled)",
  warnBg: "var(--app-warning-bg)",
  warnLine: "#FEDF89",
  warnText: "var(--app-warning-text)",
  warnDeep: "#93370D",
  amberBg: "#FFFAEB",
  dangerBg: "#FEF3F2",
  dangerLine: "#FECDCA",
  danger: "var(--app-danger-strong)",
  dangerDeep: "#7A271A",
  infoBg: "#EEF4FF",
  info: "#3538CD",
  blueBar: "#B2DDFF",
};

export const section: CSSProperties = { background: "#fff", border: `1px solid ${U.border}`, borderRadius: 14 };
export const h2: CSSProperties = { margin: 0, fontSize: 15, fontWeight: 800, color: U.text };
export const sub: CSSProperties = { margin: "4px 0 0", fontSize: 12.5, color: U.muted };
export const th: CSSProperties = { padding: "10px 12px", fontWeight: 700, fontSize: 11.5, textAlign: "left" };
export const theadRow: CSSProperties = { background: U.subtle, color: U.muted, textAlign: "left" };
export const td: CSSProperties = { padding: "11px 12px" };
export const tr: CSSProperties = { borderTop: `1px solid ${U.line}` };

export function primaryBtn(disabled = false, extra?: CSSProperties): CSSProperties {
  return { background: U.green, color: "#fff", border: 0, borderRadius: 10, padding: "10px 16px", fontSize: 12.5, fontWeight: 800, cursor: disabled ? "not-allowed" : "pointer", minHeight: 44, opacity: disabled ? 0.45 : 1, display: "inline-flex", alignItems: "center", gap: 7, ...extra };
}
export function ghostBtn(disabled = false, extra?: CSSProperties): CSSProperties {
  return { border: `1px solid ${U.border}`, background: "#fff", borderRadius: 10, padding: "10px 14px", fontSize: 12.5, fontWeight: 700, color: U.text2, cursor: disabled ? "not-allowed" : "pointer", minHeight: 44, opacity: disabled ? 0.45 : 1, display: "inline-flex", alignItems: "center", gap: 7, ...extra };
}
export const selectStyle: CSSProperties = { padding: "9px 30px 9px 11px", border: `1px solid ${U.border}`, borderRadius: 10, fontSize: 12.5, fontWeight: 600, background: "#fff", minHeight: 40, color: U.text };
export const inputStyle: CSSProperties = { padding: "10px 12px", border: `1px solid ${U.border}`, borderRadius: 10, fontSize: 13, background: U.subtle, color: "#111827", minHeight: 44, fontWeight: 500, width: "100%" };

export type Tone = { bg: string; fg: string; bar: string; dot: string; label: string };

/** Design `stState()` — status by percentage used. */
export function toneFor(pct: number): Tone {
  if (pct >= 100) return { label: "Limit reached", bg: U.dangerBg, fg: U.danger, bar: "#F04438", dot: "#F04438" };
  if (pct >= 90) return { label: "High usage", bg: U.warnBg, fg: U.warnText, bar: "#F79009", dot: "#F79009" };
  if (pct >= 75) return { label: "Approaching limit", bg: U.amberBg, fg: U.warnText, bar: "#FDB022", dot: "#FDB022" };
  return { label: "Normal", bg: U.greenSoft, fg: "var(--app-primary-hover)", bar: U.green, dot: "transparent" };
}
export const greyTone: Tone = { label: "Not configured", bg: U.line, fg: U.text3, bar: "#D0D5DD", dot: "#D0D5DD" };

export function stateLabel(state: MetricState): string {
  return { ok: "Normal", approaching: "Approaching limit", at_limit: "High usage", exceeded: "Limit reached", not_configured: "Not configured", unavailable: "Unavailable" }[state];
}

export function Pill({ children, bg, fg, size = 11, style }: { children: ReactNode; bg: string; fg: string; size?: number; style?: CSSProperties }) {
  return <span style={{ fontSize: size, fontWeight: 800, borderRadius: 20, padding: size <= 10.5 ? "2px 8px" : "3px 9px", background: bg, color: fg, whiteSpace: "nowrap", ...style }}>{children}</span>;
}

/** `role="progressbar"`; never rendered for a not_configured metric (a 0% bar implies a limit). */
export function Bar({ pct, color, height = 7, label, reservedPct, reservedColor = U.blueBar }: { pct: number; color: string; height?: number; label: string; reservedPct?: number; reservedColor?: string }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100} style={{ height, borderRadius: height, background: U.line, overflow: "hidden", display: "flex" }}>
      <div style={{ height: "100%", width: `${p}%`, background: color, borderRadius: height }} />
      {reservedPct ? <div style={{ height: "100%", width: `${Math.max(0, Math.min(100 - p, reservedPct))}%`, background: reservedColor }} /> : null}
    </div>
  );
}

export function Fact({ k, v, big = false, fg }: { k: string; v: ReactNode; big?: boolean; fg?: string }) {
  return (
    <div style={{ background: U.subtle, borderRadius: 10, padding: big ? "10px 12px" : "9px 11px" }}>
      <dt style={{ fontSize: big ? 11 : 10.5, color: U.muted, fontWeight: 600 }}>{k}</dt>
      <dd style={{ margin: "4px 0 0", fontSize: big ? 16 : 13, fontWeight: 800, color: fg ?? U.text }}>{v}</dd>
    </div>
  );
}

export function Dot({ color = U.green }: { color?: string }) {
  return <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flex: "0 0 5px", marginTop: 7 }} />;
}

export function Rule({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 12.5, color: U.text2, lineHeight: 1.5 }}>
      <Dot color={color} />
      <span>{children}</span>
    </div>
  );
}

export function Modal({ title, onClose, children, width = 480 }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,27,42,.45)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width, maxWidth: "100%", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(16,24,40,.28)", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 20px 0" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: U.text, flex: 1, letterSpacing: "-.2px" }}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, border: 0, background: U.line, borderRadius: 9, cursor: "pointer", color: U.text3, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
      </div>
    </div>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="status" aria-live="polite" style={{ position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)", background: "#0A1B2A", color: "#fff", fontSize: 12.5, fontWeight: 600, padding: "11px 16px", borderRadius: 11, boxShadow: "0 14px 34px rgba(16,24,40,.25)", zIndex: 100, maxWidth: "calc(100vw - 40px)" }}>
      {message}
    </div>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  const shim: CSSProperties = { borderRadius: 6, background: "linear-gradient(90deg,#F2F4F7,#E7EBF0,#F2F4F7)", backgroundSize: "320px 100%", animation: "nxshim 1.2s linear infinite" };
  return (
    <div aria-busy="true" aria-label="Loading" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <style>{"@keyframes nxshim{0%{background-position:-320px 0}100%{background-position:320px 0}}"}</style>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ ...section, padding: 18, display: "flex", flexDirection: "column", gap: 11 }}>
          <div style={{ ...shim, height: 12, width: "32%" }} />
          <div style={{ ...shim, height: 10, width: "76%" }} />
          <div style={{ ...shim, height: 10, width: "58%" }} />
        </div>
      ))}
    </div>
  );
}

export function ErrorState({ title, body, onRetry }: { title: string; body: string; onRetry?: () => void }) {
  return (
    <div role="alert" style={{ ...section, borderColor: U.dangerLine, padding: 28, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: U.danger }}>{title}</div>
      <div style={{ fontSize: 12.5, color: U.muted, maxWidth: 520, lineHeight: 1.55 }}>{body}</div>
      {onRetry ? (
        <button type="button" onClick={onRetry} style={primaryBtn()}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function NoAccess({ body }: { body: string }) {
  return (
    <div style={{ ...section, padding: 32, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: U.text }}>You don&apos;t have access to this section</div>
      <div style={{ fontSize: 12.5, color: U.muted, lineHeight: 1.55, maxWidth: 520 }}>{body}</div>
    </div>
  );
}

// ---------------------------------------------------------------- formatting

export const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
export const money = (n: number, digits?: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: digits ?? (n % 1 ? 2 : 0), maximumFractionDigits: digits ?? 2 });
export const money2 = (n: number) => money(n, 2);
export const dateUtc = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—";
export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
export function rangeUtc(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
  const sTxt = s.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
  return `${sTxt} – ${dateUtc(end)}`;
}
export function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}
export const pctOf = (used: number, limit: number | null | undefined) => (limit ? Math.min(100, Math.round((used / limit) * 100)) : 0);
