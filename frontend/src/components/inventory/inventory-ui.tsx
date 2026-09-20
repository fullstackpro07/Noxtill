"use client";

import type { CSSProperties, ReactNode } from "react";
import { X } from "lucide-react";

/** Exact palette from the canonical Inventory design (Dashboard module with sidebar — same source
 * family as Staff/Branches v2, matching the real `--app-primary: #12a150` theme). Kept local to
 * this module rather than the shared `--app-*` tokens, same convention as `branches-ui.tsx`. */
export const INV = {
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

export function kpiCardStyle(tone?: Tone): CSSProperties {
  return {
    background: INV.surface,
    borderRadius: 14,
    padding: 15,
    boxShadow: "0 1px 2px rgba(16,24,40,.04)",
    border: `1px solid ${tone === "red" ? "#FDD9D6" : tone === "amber" ? "#FDE3B3" : tone === "green" ? "#BFE7CF" : INV.border}`,
    borderWidth: tone ? 1.5 : 1,
  };
}

export function kpiValueStyle(tone?: Tone): CSSProperties {
  return {
    fontSize: 22,
    fontWeight: 800,
    marginTop: 6,
    fontVariantNumeric: "tabular-nums",
    color: tone === "red" ? undefined : tone === "blue" ? "#3538CD" : tone === "green" ? undefined : INV.text,
  };
}

export function KpiTile({
  label,
  value,
  meta,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  meta?: ReactNode;
  tone?: Tone;
  onClick?: () => void;
}) {
  const labelColor = tone === "red" ? "#B42318" : tone === "amber" ? "#B54708" : tone === "green" ? "#0E8442" : INV.textMuted;
  return (
    <div onClick={onClick} style={{ ...kpiCardStyle(tone), cursor: onClick ? "pointer" : "default" }}>
      <div style={{ fontSize: 12, fontWeight: tone ? 700 : 600, color: labelColor }}>{label}</div>
      <div style={kpiValueStyle(tone)}>{value}</div>
      {meta && <div style={{ fontSize: 10.5, color: INV.textFaint, marginTop: 3 }}>{typeof meta === "string" ? meta : meta}</div>}
    </div>
  );
}

export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={kpiCardStyle()}>
          <div style={{ height: 10, width: "58%", borderRadius: 6, background: "#F2F4F7" }} />
          <div style={{ height: 22, width: "74%", borderRadius: 7, marginTop: 11, background: "#F2F4F7" }} />
        </div>
      ))}
    </>
  );
}

export function th(align: "left" | "center" | "right" = "left"): CSSProperties {
  return {
    textAlign: align,
    padding: "10px 12px",
    fontSize: 11,
    fontWeight: 700,
    color: INV.textFaint,
    whiteSpace: "nowrap",
  };
}

export const filterSelectStyle: CSSProperties = {
  border: `1px solid ${INV.border}`,
  borderRadius: 11,
  padding: "10px 12px",
  fontSize: 12.5,
  fontWeight: 600,
  color: INV.textSubtle,
  background: "#fff",
  minHeight: 44,
};

export const outlineBtnStyle: CSSProperties = {
  border: `1px solid ${INV.border}`,
  background: "#fff",
  borderRadius: 11,
  padding: "11px 15px",
  fontSize: 12.5,
  fontWeight: 700,
  color: INV.textSubtle,
  cursor: "pointer",
  minHeight: 44,
};

export const primaryBtnStyle: CSSProperties = {
  border: 0,
  background: INV.primary,
  borderRadius: 11,
  padding: "11px 18px",
  fontSize: 12.5,
  fontWeight: 800,
  color: "#fff",
  cursor: "pointer",
  minHeight: 44,
};

export function marginPillStyle(pct: number): CSSProperties {
  return {
    fontWeight: 700,
    color: pct < 15 ? "#B42318" : pct < 25 ? "#B54708" : "#0E8442",
  };
}

export function EmptyBlock({ icon: Icon, iconBg, iconColor, title, description, action }: { icon: React.ComponentType<{ size?: number; color?: string }>; iconBg: string; iconColor: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div style={{ padding: "52px 18px", textAlign: "center" }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: iconBg, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
        <Icon size={23} color={iconColor} />
      </div>
      <div style={{ fontSize: 14.5, fontWeight: 800, color: INV.textSubtle }}>{title}</div>
      {description && <div style={{ fontSize: 12.5, color: INV.textFaint, marginTop: 5 }}>{description}</div>}
      {action && <div style={{ marginTop: 15 }}>{action}</div>}
    </div>
  );
}

/** Generic right-side 500px drawer shell — mirrors the design's single unified `drawer`, whose body
 * switches by mode (history / movement / purchase order / wastage / rationale / …). */
export function InventoryDrawerShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,27,42,.36)", zIndex: 80 }} />
      <aside role="dialog" aria-modal="true" style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 500, maxWidth: "100%", background: "#fff", zIndex: 85, boxShadow: "-18px 0 46px rgba(10,27,42,.18)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 17, borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "center", gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#0F172A", flex: 1 }}>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 34, height: 34, border: `1px solid ${INV.border}`, background: "#fff", borderRadius: 9, color: INV.textDim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
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

/** Generic centered 490px modal shell — mirrors the design's `modal`. */
export function InventoryModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,27,42,.42)", zIndex: 88, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" style={{ background: "#fff", borderRadius: 18, width: 490, maxWidth: "100%", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 30px 80px rgba(10,27,42,.32)" }}>
        <div style={{ padding: 17, borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "center", gap: 11 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#0F172A", flex: 1 }}>{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 32, height: 32, border: `1px solid ${INV.border}`, background: "#fff", borderRadius: 9, color: INV.textDim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const fieldLabelStyle: CSSProperties = { display: "block", fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: INV.textFaint, marginBottom: 5 };
export const fieldInputStyle: CSSProperties = { width: "100%", border: `1px solid ${INV.border}`, borderRadius: 11, padding: 12, fontSize: 13.5, minHeight: 48 };
export const fieldSelectStyle: CSSProperties = { width: "100%", border: `1px solid ${INV.border}`, borderRadius: 11, padding: 12, fontSize: 12.5, fontWeight: 700, color: INV.textSubtle, background: "#fff", minHeight: 48 };
