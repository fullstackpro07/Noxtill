"use client";

import type { CSSProperties, ReactNode } from "react";
import { X } from "lucide-react";

/** Exact palette from the canonical AI Assistant design (Dashboard module with sidebar — same
 * source family as Staff/Branches/Inventory v2). Kept local to this module, same convention as
 * `inventory-ui.tsx`. */
export const AI = {
  bg: "#F4F6F8",
  surface: "#fff",
  border: "#E6EAF0",
  borderStrong: "#D5DCE4",
  navy: "#0A1B2A",
  navySurface: "#132C3E",
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
  purple: ["#F5EBFE", "#E4CFFB", "#7E22CE"],
  neutral: ["#F2F4F7", "#E1E5EB", "#475467"],
};

export function chipStyle(tone: Tone, extra?: CSSProperties): CSSProperties {
  const [bg, border, color] = TONE_COLORS[tone];
  return {
    height: 23,
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "0 9px",
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

export function KpiTile({ label, value, meta }: { label: string; value: string; meta?: ReactNode }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 14, padding: 15 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: AI.textMuted }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: AI.text, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {meta && <div style={{ fontSize: 10.5, color: AI.textFaint, marginTop: 3 }}>{meta}</div>}
    </div>
  );
}

export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 14, padding: 16 }}>
          <div style={{ height: 10, width: "58%", borderRadius: 6, background: "#F2F4F7" }} />
          <div style={{ height: 22, width: "74%", borderRadius: 7, marginTop: 11, background: "#F2F4F7" }} />
        </div>
      ))}
    </>
  );
}

export const outlineBtnStyle: CSSProperties = {
  border: `1px solid ${AI.border}`,
  background: "#fff",
  borderRadius: 11,
  padding: "11px 15px",
  fontSize: 12.5,
  fontWeight: 700,
  color: AI.textSubtle,
  cursor: "pointer",
  minHeight: 44,
};

export const primaryBtnStyle: CSSProperties = {
  border: 0,
  background: AI.primary,
  borderRadius: 11,
  padding: "11px 18px",
  fontSize: 12.5,
  fontWeight: 800,
  color: "#fff",
  cursor: "pointer",
  minHeight: 44,
};

export const filterSelectStyle: CSSProperties = {
  border: `1px solid ${AI.border}`,
  borderRadius: 10,
  padding: "9px 11px",
  fontSize: 12.5,
  fontWeight: 600,
  color: AI.textSubtle,
  background: "#fff",
  minHeight: 42,
};

export function EmptyBlock({
  icon: Icon,
  iconBg,
  iconColor,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  iconBg: string;
  iconColor: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div style={{ padding: "52px 18px", textAlign: "center" }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: iconBg, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
        <Icon size={23} color={iconColor} />
      </div>
      <div style={{ fontSize: 14.5, fontWeight: 800, color: AI.textSubtle }}>{title}</div>
      {description && <div style={{ fontSize: 12.5, color: AI.textFaint, marginTop: 5, maxWidth: "52ch", marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>{description}</div>}
      {action && <div style={{ marginTop: 15 }}>{action}</div>}
    </div>
  );
}

/** Generic right-side 490px drawer shell — mirrors the design's single unified `drawer`. */
export function AiDrawerShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,27,42,.36)", zIndex: 80 }} />
      <aside role="dialog" aria-modal="true" style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 490, maxWidth: "100%", background: "#fff", zIndex: 85, boxShadow: "-18px 0 46px rgba(10,27,42,.18)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 17, borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "center", gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#0F172A", flex: 1 }}>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, border: `1px solid ${AI.border}`, background: "#fff", borderRadius: 9, color: AI.textDim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={16} />
          </button>
        </div>
        <div className="nx-scroll" style={{ flex: 1, overflowY: "auto", padding: 17 }}>
          {children}
        </div>
      </aside>
    </>
  );
}

/** Generic centered 480px modal shell — mirrors the design's `modal`. */
export function AiModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,27,42,.42)", zIndex: 88, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" style={{ background: "#fff", borderRadius: 18, width: 480, maxWidth: "100%", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 30px 80px rgba(10,27,42,.32)" }}>
        <div style={{ padding: 17, borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "center", gap: 11 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#0F172A", flex: 1 }}>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 32, height: 32, border: `1px solid ${AI.border}`, background: "#fff", borderRadius: 9, color: AI.textDim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const fieldLabelStyle: CSSProperties = { display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: AI.textFaint, marginBottom: 5 };
export const fieldInputStyle: CSSProperties = { width: "100%", border: `1px solid ${AI.border}`, borderRadius: 11, padding: 12, fontSize: 13.5, minHeight: 48 };
