"use client";

import { useState, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { BulletList, Chip, NoteBox, PanelRows, R, RIcon, type Tone } from "./reports-ui";
import { useReports } from "./reports-context";

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

export interface PanelAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "green" | "red";
}

/** The 560px side panel: kicker + title + badge, a scrolling body, and a Cancel / primary footer. */
export function PanelFrame({
  kicker,
  title,
  badge,
  badgeTone = "neutral",
  answerLabel,
  answer,
  rows,
  children,
  bulletsTitle,
  bullets,
  note,
  primary,
  secondary = "Close",
}: {
  kicker: string;
  title: string;
  badge?: string;
  badgeTone?: Tone;
  answerLabel?: string;
  answer?: string | null;
  rows?: { label: string; value: ReactNode; tone?: "pos" | "neg" | "neutral"; onClick?: () => void }[];
  children?: ReactNode;
  bulletsTitle?: string;
  bullets?: string[];
  note?: string;
  primary?: PanelAction;
  secondary?: string;
}) {
  const { closeOverlays } = useReports();
  return (
    <div
      onClick={closeOverlays}
      style={{ position: "fixed", inset: 0, zIndex: 155, background: "rgba(12,23,39,.36)", display: "flex", justifyContent: "flex-end" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
        style={{ width: 560, maxWidth: "100%", height: "100%", background: "#fff", boxShadow: "-18px 0 44px rgba(12,23,39,.16)", display: "flex", flexDirection: "column", animation: ANIM_DRAWER }}
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
          {answer ? (
            <div style={{ flex: "0 0 auto", border: "1px solid #DDD3FE", background: "#FBFAFF", borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#6D28D9" }}>{answerLabel ?? "Answer"}</div>
              <div style={{ fontSize: 13, color: R.ink, lineHeight: 1.6, marginTop: 8, textWrap: "pretty" }}>{answer}</div>
            </div>
          ) : null}
          {children}
          {rows && rows.length > 0 ? (
            <div style={{ flex: "0 0 auto", border: `1px solid ${R.border}`, borderRadius: 12, overflow: "hidden" }}>
              <PanelRows rows={rows} />
            </div>
          ) : null}
          {bullets && bullets.length > 0 ? <BulletList title={bulletsTitle ?? "Details"} bullets={bullets} /> : null}
          {note ? <NoteBox>{note}</NoteBox> : null}
        </div>

        <div style={{ padding: "14px 20px", borderTop: `1px solid ${R.divider}`, background: "#FCFCFD", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={closeOverlays}
            style={{ height: 38, display: "flex", alignItems: "center", padding: "0 14px", borderRadius: 10, border: `1px solid ${R.btnBorder}`, background: "#fff", fontSize: 13, fontWeight: 700, color: R.text, cursor: "pointer" }}
          >
            {secondary}
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

export function ConfirmModal() {
  const { confirm, closeOverlays } = useReports();
  const [busy, setBusy] = useState(false);
  if (!confirm) return null;
  const palette =
    confirm.tone === "red"
      ? { bg: "#FEF3F2", fg: "#B42318" }
      : confirm.tone === "amber"
        ? { bg: "#FFFBEB", fg: "#B45309" }
        : { bg: "#ECFDF3", fg: "#15803D" };

  const run = async () => {
    setBusy(true);
    try {
      await confirm.onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={closeOverlays}
      style={{ position: "fixed", inset: 0, zIndex: 170, background: "rgba(12,23,39,.44)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-label={confirm.title}
        style={{ width: "100%", maxWidth: 540, background: "#fff", borderRadius: 18, boxShadow: "0 24px 60px rgba(12,23,39,.28)", overflow: "hidden", animation: "nxModalIn .2s cubic-bezier(.2,.8,.3,1)" }}
      >
        <div style={{ padding: "22px 24px 0", display: "flex", gap: 14 }}>
          <div style={{ width: 38, height: 38, flex: "0 0 38px", borderRadius: 11, background: palette.bg, color: palette.fg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <RIcon name={confirm.icon} size={19} />
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
                <div style={{ fontSize: 12.5, fontWeight: 700, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.value}</div>
              </div>
            ))}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "20px 24px", marginTop: 18, borderTop: `1px solid ${R.divider}`, background: "#FCFCFD" }}>
          <button
            type="button"
            onClick={() => (confirm.onCancel ? confirm.onCancel() : closeOverlays())}
            style={{ height: 38, display: "flex", alignItems: "center", padding: "0 14px", borderRadius: 10, border: `1px solid ${R.btnBorder}`, background: "#fff", fontSize: 13, fontWeight: 700, color: R.text, cursor: "pointer" }}
          >
            {confirm.cancel}
          </button>
          <button
            type="button"
            onClick={run}
            disabled={busy}
            style={{ height: 38, display: "flex", alignItems: "center", padding: "0 14px", borderRadius: 10, border: 0, background: confirm.tone === "red" ? "#DC2626" : R.green, color: "#fff", fontSize: 13, fontWeight: 700, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 }}
          >
            {confirm.primary}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ToastView() {
  const { toast, closeToast } = useReports();
  if (!toast) return null;
  return (
    <div
      role="status"
      style={{ position: "fixed", right: 24, bottom: 24, zIndex: 175, width: 340, maxWidth: "calc(100vw - 32px)", background: "#fff", border: `1px solid ${R.border}`, borderLeft: `3px solid ${R.green}`, borderRadius: 12, boxShadow: "0 14px 34px rgba(12,23,39,.14)", padding: "13px 14px", display: "flex", gap: 11, animation: "nxToastIn .2s cubic-bezier(.2,.8,.3,1)" }}
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
