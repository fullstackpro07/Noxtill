"use client";

import { useState, type ReactNode } from "react";
import { Check, Info, X } from "lucide-react";
import { Chip, R, HIcon, type Tone } from "./hub-ui";
import { useIntegrations } from "./integrations-store";

const ANIM_DRAWER = "nxDrawerIn .22s cubic-bezier(.2,.8,.3,1)";

export function CloseX({ onClick, size = 30, radius = 9 }: { onClick: () => void; size?: number; radius?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close"
      style={{ width: size, height: size, borderRadius: radius, display: "flex", alignItems: "center", justifyContent: "center", color: R.label, cursor: "pointer", flexShrink: 0, border: 0, background: "transparent" }}
    >
      <X size={16} strokeWidth={2.25} aria-hidden />
    </button>
  );
}

export type RowTone = "pos" | "neg" | "muted";

/** The label/value rows every panel and drawer section is built from. */
export function Rows({ rows, dense }: { rows: Array<{ label: string; value: ReactNode; tone?: RowTone }>; dense?: boolean }) {
  return (
    <>
      {rows.map((r, i) => (
        <div
          key={`${r.label}-${i}`}
          style={{ display: "flex", alignItems: dense ? "center" : "flex-start", gap: 12, padding: dense ? "10px 13px" : "11px 13px", borderTop: i === 0 ? "none" : `1px solid ${R.divider}`, background: i % 2 ? "#FCFCFD" : "#fff" }}
        >
          <div style={{ fontSize: 12, color: R.muted, fontWeight: 600, flex: "0 0 44%" }}>{r.label}</div>
          <div
            style={{ fontSize: 12.5, fontWeight: 700, textAlign: "right", flex: 1, textWrap: "pretty", fontVariantNumeric: "tabular-nums", wordBreak: "break-word", color: r.tone === "neg" ? "#B42318" : r.tone === "pos" ? "#15803D" : r.tone === "muted" ? R.faint : R.ink }}
          >
            {r.value}
          </div>
        </div>
      ))}
    </>
  );
}

export function RowsBox({ rows }: { rows: Array<{ label: string; value: ReactNode; tone?: RowTone }> }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ flex: "0 0 auto", border: `1px solid ${R.border}`, borderRadius: 12, overflow: "hidden" }}>
      <Rows rows={rows} />
    </div>
  );
}

export function Bullets({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ flex: "0 0 auto" }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: R.faint, marginBottom: 10 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {items.map((b, i) => (
          <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: R.green, marginTop: 6, flex: "0 0 6px" }} />
            <div style={{ fontSize: 12.5, color: R.text, lineHeight: 1.55, textWrap: "pretty" }}>{b}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <div style={{ flex: "0 0 auto", border: `1px solid ${R.border}`, background: "#FCFCFD", borderRadius: 12, padding: 13, display: "flex", gap: 9 }}>
      <Info size={15} style={{ flex: "0 0 15px", color: R.label, marginTop: 1 }} aria-hidden />
      <div style={{ fontSize: 11.5, color: R.muted, lineHeight: 1.55, textWrap: "pretty" }}>{children}</div>
    </div>
  );
}

export function CodeBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="nx-scroll" style={{ flex: "0 0 auto", border: "1px solid #E1E5EB", background: R.navy, borderRadius: 12, padding: 14, overflowX: "auto" }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#6EE7A0" }}>{label}</div>
      <pre style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#E6E8EC", lineHeight: 1.65, margin: "9px 0 0", whiteSpace: "pre" }}>{text}</pre>
    </div>
  );
}

export interface PanelAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "green" | "red";
}

/** The 580px side panel: kicker + title + badge, a scrolling body, and a Cancel / primary footer. */
export function PanelFrame({
  kicker,
  title,
  badge,
  badgeTone = "neutral",
  children,
  primary,
  secondary,
}: {
  kicker: string;
  title: string;
  badge?: string;
  badgeTone?: Tone;
  children: ReactNode;
  primary?: PanelAction;
  secondary?: PanelAction | string;
}) {
  const { closeOverlays } = useIntegrations();
  const sec: PanelAction = typeof secondary === "object" ? secondary : { label: secondary ?? "Close", onClick: closeOverlays };
  return (
    <div onClick={closeOverlays} style={{ position: "fixed", inset: 0, zIndex: 165, background: "rgba(12,23,39,.36)", display: "flex", justifyContent: "flex-end" }}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
        style={{ width: 580, maxWidth: "100%", height: "100%", background: "#fff", boxShadow: "-18px 0 44px rgba(12,23,39,.16)", display: "flex", flexDirection: "column", animation: ANIM_DRAWER }}
      >
        <div style={{ padding: "18px 20px", borderBottom: `1px solid ${R.divider}`, display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: R.faint }}>{kicker}</div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-.01em", marginTop: 4, textWrap: "pretty" }}>{title}</div>
            {badge ? (
              <div style={{ marginTop: 9 }}>
                <Chip tone={badgeTone} style={{ height: 23, fontSize: 11 }}>
                  {badge}
                </Chip>
              </div>
            ) : null}
          </div>
          <CloseX onClick={closeOverlays} />
        </div>
        <div className="nx-scroll" style={{ flex: 1, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {children}
        </div>
        <div style={{ padding: "14px 20px", borderTop: `1px solid ${R.divider}`, background: "#FCFCFD", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={sec.onClick}
            disabled={sec.disabled}
            style={{ height: 38, display: "flex", alignItems: "center", padding: "0 14px", borderRadius: 10, border: `1px solid ${R.btnBorder}`, background: "#fff", fontSize: 13, fontWeight: 700, color: R.text, cursor: "pointer" }}
          >
            {sec.label}
          </button>
          {primary ? (
            <button
              type="button"
              onClick={primary.onClick}
              disabled={primary.disabled}
              style={{ height: 38, display: "flex", alignItems: "center", padding: "0 14px", borderRadius: 10, border: 0, background: primary.tone === "red" ? "#DC2626" : R.green, color: "#fff", fontSize: 13, fontWeight: 700, cursor: primary.disabled ? "not-allowed" : "pointer", opacity: primary.disabled ? 0.55 : 1 }}
            >
              {primary.label}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** The design's side-by-side comparison card (Noxtill vs store). */
export function CompareCard({
  side,
  tone,
  badge,
  fields,
  action,
  onAction,
  busy,
}: {
  side: string;
  tone: "green" | "amber";
  badge?: string;
  fields: Array<{ label: string; value: string; highlight?: boolean }>;
  action: string;
  onAction: () => void;
  busy?: boolean;
}) {
  const green = tone === "green";
  return (
    <div style={{ border: `1px solid ${green ? "#BBF0CB" : "#FDE49B"}`, borderRadius: 12, padding: 13, background: green ? "#F9FEFB" : "#FFFDF5" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: green ? "#15803D" : "#B45309" }}>{side}</div>
        {badge ? (
          <Chip tone={tone} style={{ height: 19, fontSize: 9 }}>
            {badge}
          </Chip>
        ) : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 10 }}>
        {fields.map((f) => (
          <div key={f.label} style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "7px 8px", borderRadius: 7, background: f.highlight ? (green ? "#DCFCE7" : "#FEF3C7") : "transparent" }}>
            <div style={{ fontSize: 10.5, color: R.label, fontWeight: 600, flex: "0 0 42%" }}>{f.label}</div>
            <div style={{ fontSize: 11.5, fontWeight: f.highlight ? 800 : 600, textAlign: "right", flex: 1, fontFamily: "'JetBrains Mono', monospace", color: f.highlight ? (green ? "#15803D" : "#B45309") : R.ink }}>{f.value}</div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onAction}
        disabled={busy}
        style={{ width: "100%", height: 30, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 11, borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: busy ? "wait" : "pointer", background: green ? R.green : "#fff", color: green ? "#fff" : R.text, border: `1px solid ${green ? R.green : R.btnBorder}`, opacity: busy ? 0.7 : 1 }}
      >
        {action}
      </button>
    </div>
  );
}

export function ConfirmModal() {
  const { confirm, closeOverlays } = useIntegrations();
  const [busy, setBusy] = useState(false);
  if (!confirm) return null;
  const palette = confirm.tone === "red" ? { bg: "#FEF3F2", fg: "#B42318" } : confirm.tone === "amber" ? { bg: "#FFFBEB", fg: "#B45309" } : { bg: "#ECFDF3", fg: "#15803D" };

  const run = async () => {
    setBusy(true);
    try {
      await confirm.onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={closeOverlays} style={{ position: "fixed", inset: 0, zIndex: 175, background: "rgba(12,23,39,.44)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-label={confirm.title}
        style={{ width: "100%", maxWidth: 560, background: "#fff", borderRadius: 18, boxShadow: "0 24px 60px rgba(12,23,39,.28)", overflow: "hidden", animation: "nxModalIn .2s cubic-bezier(.2,.8,.3,1)" }}
      >
        <div style={{ padding: "22px 24px 0", display: "flex", gap: 14 }}>
          <div style={{ width: 38, height: 38, flex: "0 0 38px", borderRadius: 11, background: palette.bg, color: palette.fg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <HIcon name={confirm.icon} size={19} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-.01em", textWrap: "pretty" }}>{confirm.title}</div>
            <div style={{ fontSize: 12.5, color: R.muted, lineHeight: 1.6, marginTop: 6, textWrap: "pretty" }}>{confirm.body}</div>
          </div>
          <CloseX onClick={closeOverlays} />
        </div>
        {confirm.rows && confirm.rows.length > 0 ? (
          <div style={{ margin: "18px 24px 0", border: `1px solid ${R.border}`, borderRadius: 12, overflow: "hidden" }}>
            {confirm.rows.map((r, i) => (
              <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 13px", borderTop: i === 0 ? "none" : `1px solid ${R.divider}`, background: i % 2 ? "#FCFCFD" : "#fff" }}>
                <div style={{ fontSize: 12, color: R.muted, fontWeight: 600, flex: 1 }}>{r.label}</div>
                <div style={{ fontSize: 12.5, fontWeight: 700, textAlign: "right", fontVariantNumeric: "tabular-nums", color: r.tone === "neg" ? "#B42318" : r.tone === "pos" ? "#15803D" : R.ink }}>{r.value}</div>
              </div>
            ))}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "20px 24px", marginTop: 18, borderTop: `1px solid ${R.divider}`, background: "#FCFCFD" }}>
          <button type="button" onClick={closeOverlays} style={{ height: 38, display: "flex", alignItems: "center", padding: "0 14px", borderRadius: 10, border: `1px solid ${R.btnBorder}`, background: "#fff", fontSize: 13, fontWeight: 700, color: R.text, cursor: "pointer" }}>
            {confirm.cancel}
          </button>
          {confirm.review ? (
            <button type="button" onClick={confirm.review.onClick} style={{ height: 38, display: "flex", alignItems: "center", padding: "0 14px", borderRadius: 10, border: `1px solid ${R.btnBorder}`, background: "#fff", fontSize: 13, fontWeight: 700, color: R.text, cursor: "pointer" }}>
              {confirm.review.label}
            </button>
          ) : null}
          <button type="button" onClick={run} disabled={busy} style={{ height: 38, display: "flex", alignItems: "center", padding: "0 14px", borderRadius: 10, border: 0, background: confirm.tone === "red" ? "#DC2626" : R.green, color: "#fff", fontSize: 13, fontWeight: 700, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 }}>
            {confirm.primary}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ToastView() {
  const { toast, closeToast } = useIntegrations();
  if (!toast) return null;
  return (
    <div
      role="status"
      style={{ position: "fixed", right: 24, bottom: 24, zIndex: 185, width: 340, maxWidth: "calc(100vw - 32px)", background: "#fff", border: `1px solid ${R.border}`, borderLeft: `3px solid ${R.green}`, borderRadius: 12, boxShadow: "0 14px 34px rgba(12,23,39,.14)", padding: "13px 14px", display: "flex", gap: 11, animation: "nxToastIn .2s cubic-bezier(.2,.8,.3,1)" }}
    >
      <div style={{ width: 26, height: 26, flex: "0 0 26px", borderRadius: 8, background: R.greenSoft, color: "#15803D", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Check size={15} strokeWidth={2.25} aria-hidden />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, textWrap: "pretty" }}>{toast.title}</div>
        {toast.sub ? <div style={{ fontSize: 12, color: R.muted, marginTop: 2, textWrap: "pretty" }}>{toast.sub}</div> : null}
      </div>
      <CloseX onClick={closeToast} size={24} radius={7} />
    </div>
  );
}

/** A labelled text input used by every form panel. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: R.text, marginBottom: 6 }}>{label}</div>
      {children}
      {hint ? <div style={{ fontSize: 10.5, color: R.faint, marginTop: 5, lineHeight: 1.45 }}>{hint}</div> : null}
    </div>
  );
}

export const inputCss = {
  height: 40,
  width: "100%",
  padding: "0 12px",
  border: `1px solid ${R.btnBorder}`,
  borderRadius: 10,
  background: "#fff",
  fontSize: 12.5,
  color: R.ink,
  outline: "none",
} as const;
