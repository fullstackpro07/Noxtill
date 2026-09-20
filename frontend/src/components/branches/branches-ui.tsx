"use client";

import type { CSSProperties, ReactNode } from "react";
import { X } from "lucide-react";

/** Exact palette from the canonical Branches design (Dashboard module with sidebar — the same
 * source family as the rest of the v2 dashboard, matching the real `--app-primary: #12a150`
 * theme). Kept local to this module (not the shared `--app-*` tokens) so a future palette tweak
 * to one doesn't silently drift the other, but the values themselves now match. */
export const BR = {
  bg: "#F4F6F8",
  surface: "#fff",
  border: "#E6EAF0",
  borderStrong: "#D5DCE4",
  text: "#0F172A",
  textMuted: "#667085",
  textFaint: "#98A2B3",
  textSubtle: "#344054",
  textDim: "#475467",
  primary: "#12A150",
  primaryHover: "#0E8442",
};

export type Tone = "green" | "amber" | "red" | "blue" | "purple" | "neutral";

const TONE_COLORS: Record<Tone, [string, string, string]> = {
  green: ["#E8F7EE", "#BFE7CF", "#0E8442"],
  amber: ["#FEF6E7", "#FDE3B3", "#B54708"],
  red: ["#FEF3F2", "#FDD9D6", "#B42318"],
  blue: ["#EEF4FF", "#C7D7FE", "#3538CD"],
  purple: ["#F5F3FF", "#DDD3FE", "#6D28D9"],
  neutral: ["#F2F4F7", "#E1E5EB", "#475467"],
};

export function chipStyle(tone: Tone, extra?: CSSProperties): CSSProperties {
  const [bg, border, color] = TONE_COLORS[tone];
  return {
    height: 23,
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "0 8px",
    borderRadius: 999,
    background: bg,
    border: `1px solid ${border}`,
    color,
    fontSize: 10.5,
    fontWeight: 700,
    whiteSpace: "nowrap",
    ...extra,
  };
}

export function Chip({ tone, children, style }: { tone: Tone; children: ReactNode; style?: CSSProperties }) {
  return <span style={chipStyle(tone, style)}>{children}</span>;
}

export function kpiCardStyle(tone?: Tone): CSSProperties {
  return {
    background: BR.surface,
    borderRadius: 12,
    padding: "14px 15px",
    cursor: "pointer",
    boxShadow: "0 1px 2px rgba(16,24,40,.04)",
    border: `1px solid ${tone === "red" ? "#FDD9D6" : tone === "amber" ? "#FDE3B3" : BR.border}`,
  };
}

export function kpiValueStyle(tone?: Tone): CSSProperties {
  return {
    fontSize: 19,
    fontWeight: 800,
    letterSpacing: "-.03em",
    marginTop: 7,
    fontVariantNumeric: "tabular-nums",
    color: tone === "red" ? "#B42318" : tone === "amber" ? "#B54708" : BR.text,
  };
}

export function deltaStyle(dir: "up" | "down" | "flat"): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    fontSize: 11,
    fontWeight: 800,
    marginTop: 4,
    color: dir === "up" ? "#0E8442" : dir === "down" ? "#B42318" : "#475467",
  };
}

export function marginPillStyle(pct: number): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "0 7px",
    height: 20,
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 800,
    fontVariantNumeric: "tabular-nums",
    background: pct < 18 ? "#FEF3F2" : pct < 24 ? "#FEF6E7" : "#E8F7EE",
    color: pct < 18 ? "#B42318" : pct < 24 ? "#B54708" : "#0E8442",
  };
}

export function th(align: "left" | "center" | "right" = "left"): CSSProperties {
  return {
    textAlign: align,
    padding: "11px 12px",
    fontSize: 10.5,
    fontWeight: 800,
    letterSpacing: ".07em",
    textTransform: "uppercase",
    color: BR.textDim,
    whiteSpace: "nowrap",
  };
}

export const filterBtnStyle: CSSProperties = {
  height: 34,
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "0 11px",
  borderRadius: 10,
  border: `1px solid ${BR.borderStrong}`,
  background: BR.surface,
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export const smallBtnStyle: CSSProperties = {
  height: 30,
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "0 10px",
  borderRadius: 8,
  border: `1px solid ${BR.borderStrong}`,
  background: BR.surface,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export const primaryBtnStyle: CSSProperties = {
  height: 34,
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "0 13px",
  borderRadius: 10,
  background: BR.primary,
  color: "#fff",
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
  border: 0,
};

export function KpiTile({
  label,
  value,
  delta,
  deltaDir,
  meta,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaDir?: "up" | "down" | "flat";
  meta?: string;
  tone?: Tone;
  onClick?: () => void;
}) {
  return (
    <div onClick={onClick} style={kpiCardStyle(tone)}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: BR.textMuted }}>{label}</div>
      <div style={kpiValueStyle(tone)}>{value}</div>
      {delta != null && (
        <div style={deltaStyle(deltaDir ?? "flat")}>
          <TrendGlyph dir={deltaDir ?? "flat"} />
          <span>{delta}</span>
        </div>
      )}
      {meta && <div style={{ fontSize: 10.5, color: BR.textFaint, marginTop: 3 }}>{meta}</div>}
    </div>
  );
}

function TrendGlyph({ dir }: { dir: "up" | "down" | "flat" }) {
  if (dir === "up") return <span>↑</span>;
  if (dir === "down") return <span>↓</span>;
  return <span>–</span>;
}

export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ ...kpiCardStyle(), cursor: "default" }}>
          <div style={{ height: 11, width: "60%", borderRadius: 4, background: "#F1F3F6" }} />
          <div style={{ height: 19, width: "45%", borderRadius: 4, background: "#F1F3F6", marginTop: 9 }} />
        </div>
      ))}
    </>
  );
}

/** Generic 560px slide-over detail panel — mirrors the design's `panel` overlay, used for every
 * KPI-tile / insight-card / finding click-through across every Branches screen. */
export function DetailPanel({
  kicker,
  title,
  badge,
  badgeTone,
  answer,
  rows,
  bulletsTitle,
  bullets,
  note,
  primary = "Close",
  secondary,
  onPrimary,
  onClose,
}: {
  kicker: string;
  title: string;
  badge?: string;
  badgeTone?: Tone;
  answer?: string;
  rows?: [string, string][];
  bulletsTitle?: string;
  bullets?: string[];
  note?: string;
  primary?: string;
  secondary?: string;
  onPrimary?: () => void;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 85, background: "rgba(12,23,39,.36)", display: "flex", justifyContent: "flex-end" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 560, maxWidth: "100%", height: "100%", background: BR.surface, boxShadow: "-18px 0 44px rgba(12,23,39,.16)", display: "flex", flexDirection: "column" }}
      >
        <div style={{ padding: "18px 20px", borderBottom: `1px solid #F0F2F5`, display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: BR.textFaint }}>{kicker}</div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-.01em", marginTop: 4 }}>{title}</div>
            {badge && (
              <div style={{ marginTop: 9 }}>
                <Chip tone={badgeTone ?? "neutral"} style={{ height: 23, fontSize: 11 }}>
                  {badge}
                </Chip>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", color: BR.textDim, cursor: "pointer", border: 0, background: "transparent" }}
          >
            <X size={16} />
          </button>
        </div>
        <div className="nx-scroll" style={{ flex: 1, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {answer && (
            <div style={{ border: "1px solid #DDD3FE", background: "#FBFAFF", borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#6D28D9" }}>Answer</div>
              <div style={{ fontSize: 13, color: BR.text, lineHeight: 1.6, marginTop: 8 }}>{answer}</div>
            </div>
          )}
          {rows && rows.length > 0 && (
            <div style={{ border: `1px solid ${BR.border}`, borderRadius: 12, overflow: "hidden" }}>
              {rows.map(([label, value], i) => (
                <div
                  key={i}
                  style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 13px", borderTop: i === 0 ? "none" : "1px solid #F0F2F5", background: i % 2 ? "#FCFCFD" : "#fff" }}
                >
                  <div style={{ fontSize: 12, color: BR.textMuted, fontWeight: 600, flex: "0 0 45%" }}>{label}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, textAlign: "right", flex: 1, fontVariantNumeric: "tabular-nums" }}>{value}</div>
                </div>
              ))}
            </div>
          )}
          {bullets && bullets.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: BR.textFaint, marginBottom: 10 }}>{bulletsTitle ?? "Details"}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {bullets.map((b, i) => (
                  <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: BR.primary, marginTop: 6, flex: "0 0 6px" }} />
                    <div style={{ fontSize: 12.5, color: BR.textSubtle, lineHeight: 1.55 }}>{b}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {note && (
            <div style={{ border: `1px solid ${BR.border}`, background: "#FCFCFD", borderRadius: 12, padding: 13, display: "flex", gap: 9 }}>
              <div style={{ fontSize: 11.5, color: BR.textMuted, lineHeight: 1.55 }}>{note}</div>
            </div>
          )}
        </div>
        <div style={{ padding: "14px 20px", borderTop: "1px solid #F0F2F5", background: "#FCFCFD", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{ height: 38, display: "flex", alignItems: "center", padding: "0 14px", borderRadius: 10, border: `1px solid ${BR.borderStrong}`, background: "#fff", fontSize: 13, fontWeight: 700, color: BR.textSubtle, cursor: "pointer" }}>
            {secondary ?? "Close"}
          </button>
          <button
            type="button"
            onClick={() => {
              onPrimary?.();
              onClose();
            }}
            style={{ height: 38, display: "flex", alignItems: "center", padding: "0 14px", borderRadius: 10, cursor: "pointer", background: BR.primary, color: "#fff", fontSize: 13, fontWeight: 700, border: 0 }}
          >
            {primary}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Generic confirm modal — mirrors the design's `confirm` overlay used before any real mutating action. */
export function ConfirmModal({
  title,
  body,
  tone = "green",
  rows,
  primary = "Confirm",
  cancel = "Cancel",
  pending,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  tone?: "green" | "amber" | "red";
  rows?: [string, string][];
  primary?: string;
  cancel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const iconBg = tone === "red" ? "#FEF3F2" : tone === "amber" ? "#FEF6E7" : "#E8F7EE";
  const iconColor = tone === "red" ? "#B42318" : tone === "amber" ? "#B54708" : "#0E8442";
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 95, background: "rgba(12,23,39,.44)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 540, background: "#fff", borderRadius: 18, boxShadow: "0 24px 60px rgba(12,23,39,.28)", overflow: "hidden" }}>
        <div style={{ padding: "22px 24px 0", display: "flex", gap: 14 }}>
          <div style={{ width: 38, height: 38, flex: "0 0 38px", borderRadius: 11, background: iconBg, color: iconColor, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>!</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-.01em" }}>{title}</div>
            <div style={{ fontSize: 12.5, color: BR.textMuted, lineHeight: 1.6, marginTop: 6 }}>{body}</div>
          </div>
          <button type="button" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", color: BR.textDim, cursor: "pointer", border: 0, background: "transparent" }}>
            <X size={16} />
          </button>
        </div>
        {rows && rows.length > 0 && (
          <div style={{ margin: "18px 24px 0", border: `1px solid ${BR.border}`, borderRadius: 12, overflow: "hidden" }}>
            {rows.map(([label, value], i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 13px", borderTop: i === 0 ? "none" : "1px solid #F0F2F5", background: i % 2 ? "#FCFCFD" : "#fff" }}>
                <div style={{ fontSize: 12, color: BR.textMuted, fontWeight: 600, flex: 1 }}>{label}</div>
                <div style={{ fontSize: 12.5, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{value}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "20px 24px", marginTop: 18, borderTop: "1px solid #F0F2F5", background: "#FCFCFD" }}>
          <button type="button" onClick={onClose} disabled={pending} style={{ height: 38, display: "flex", alignItems: "center", padding: "0 14px", borderRadius: 10, border: `1px solid ${BR.borderStrong}`, background: "#fff", fontSize: 13, fontWeight: 700, color: BR.textSubtle, cursor: "pointer" }}>
            {cancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            style={{ height: 38, display: "flex", alignItems: "center", padding: "0 14px", borderRadius: 10, cursor: "pointer", background: tone === "red" ? "#DC2626" : BR.primary, color: "#fff", fontSize: 13, fontWeight: 700, border: 0, opacity: pending ? 0.6 : 1 }}
          >
            {pending ? "Working…" : primary}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SectionCard({ title, action, children, tone }: { title?: string; action?: ReactNode; children: ReactNode; tone?: "purple" | "amber" }) {
  return (
    <div
      style={{
        background: BR.surface,
        border: `1px solid ${tone === "purple" ? "#DDD3FE" : tone === "amber" ? "#FDE3B3" : BR.border}`,
        borderRadius: 13,
        boxShadow: "0 1px 2px rgba(16,24,40,.05)",
        padding: 18,
      }}
    >
      {(title || action) && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {title && <div style={{ fontSize: 14, fontWeight: 800 }}>{title}</div>}
          {action && <div style={{ marginLeft: "auto" }}>{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
