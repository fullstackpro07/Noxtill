"use client";

import type { CSSProperties, ReactNode } from "react";
import { DeliveryPathIcon } from "./delivery-icon";

export interface KpiCardData {
  key?: string;
  l: string;
  v: string;
  sub: string;
  color: string;
  bd: string;
}

export function KpiGrid({ kpis, onOpen, minWidth = 165 }: { kpis: KpiCardData[]; onOpen?: (kpi: KpiCardData, index: number) => void; minWidth?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`, gap: "14px" }}>
      {kpis.map((k, i) => (
        <button
          key={`${k.l}-${i}`}
          onClick={onOpen ? () => onOpen(k, i) : undefined}
          style={{
            textAlign: "left",
            background: "#fff",
            border: `1px solid ${k.bd}`,
            borderRadius: "14px",
            padding: "15px",
            cursor: onOpen ? "pointer" : "default",
            minHeight: "44px",
            font: "inherit",
          }}
        >
          <span style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475467" }}>{k.l}</span>
          <span style={{ display: "block", fontSize: "21px", fontWeight: 800, color: k.color, marginTop: "6px", letterSpacing: "-.5px" }}>{k.v}</span>
          <span style={{ display: "block", fontSize: "10.5px", color: "#98A2B3", marginTop: "5px" }}>{k.sub}</span>
        </button>
      ))}
    </div>
  );
}

export function NoteBanner({ text, bg = "#EEF4FF", bd = "#C7D7FE", fg = "#3538CD" }: { text: string; bg?: string; bd?: string; fg?: string }) {
  return (
    <div style={{ background: bg, border: `1px solid ${bd}`, borderRadius: "12px", padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: "10px" }}>
      <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={fg} strokeWidth={2} strokeLinecap="round" style={{ flex: "0 0 17px", marginTop: "1px" }}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 16v-4M12 8.5h.01" />
      </svg>
      <div style={{ fontSize: "12px", color: fg, lineHeight: 1.55 }}>{text}</div>
    </div>
  );
}

export function StatusChip({ bg, fg, children }: { bg: string; fg: string; children: ReactNode }) {
  return (
    <span style={{ fontSize: "10.5px", fontWeight: 800, padding: "3px 9px", borderRadius: "20px", background: bg, color: fg, whiteSpace: "nowrap" }}>{children}</span>
  );
}

export function TagChip({ bg, fg, children }: { bg: string; fg: string; children: ReactNode }) {
  return (
    <span style={{ fontSize: "9.5px", fontWeight: 800, padding: "2px 8px", borderRadius: "5px", background: bg, color: fg, whiteSpace: "nowrap" }}>{children}</span>
  );
}

export interface TableColumn<Row> {
  label: string;
  align?: "left" | "right";
  render: (row: Row) => ReactNode;
}

export function DeliveryTableCard<Row extends { i: string | number }>({
  title,
  sub,
  columns,
  rows,
  footer,
  onRowClick,
  emptyTitle,
  emptySub,
}: {
  title: string;
  sub?: string;
  columns: TableColumn<Row>[];
  rows: Row[];
  footer?: string;
  onRowClick?: (row: Row) => void;
  emptyTitle?: string;
  emptySub?: string;
}) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: "16px", overflow: "hidden" }}>
      <div style={{ padding: "13px 17px", borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>{title}</h3>
        {sub && <span style={{ fontSize: "11px", color: "#98A2B3" }}>{sub}</span>}
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: "44px 18px", textAlign: "center" }}>
          <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#344054" }}>{emptyTitle ?? "Nothing here yet"}</div>
          {emptySub && <div style={{ fontSize: "12px", color: "#98A2B3", marginTop: "5px" }}>{emptySub}</div>}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "900px" }}>
            <thead>
              <tr style={{ background: "#FAFBFC" }}>
                {columns.map((c) => (
                  <th key={c.label} style={{ textAlign: c.align ?? "left", fontSize: "11px", fontWeight: 700, color: "#98A2B3", padding: "10px 14px" }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.i}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={{ borderTop: "1px solid #F2F4F7", cursor: onRowClick ? "pointer" : "default" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#F7FCF9")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                >
                  {columns.map((c) => (
                    <td key={c.label} style={{ padding: "12px 14px", textAlign: c.align ?? "left" }}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {footer && <div style={{ padding: "11px 17px", borderTop: "1px solid #F0F2F5", fontSize: "11.5px", color: "#98A2B3" }}>{footer}</div>}
    </div>
  );
}

export interface PanelItemData {
  t: string;
  d?: string;
  v?: string;
  vColor?: string;
  tag?: string;
  tagBg?: string;
  tagFg?: string;
  toggle?: boolean;
  toggleOn?: boolean;
  onToggle?: () => void;
  settingKey?: string;
}

export interface PanelData {
  h: string;
  sub?: string;
  bd: string;
  items: PanelItemData[];
}

export function PanelCard({ panel }: { panel: PanelData }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${panel.bd}`, borderRadius: "16px", padding: "17px" }}>
      <h3 style={{ margin: "0 0 4px", fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>{panel.h}</h3>
      {panel.sub && <p style={{ margin: "0 0 13px", fontSize: "11.5px", color: "#98A2B3" }}>{panel.sub}</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
        {panel.items.map((it, i) => (
          <div key={i} style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "13px", display: "flex", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
            <span style={{ flex: 1, minWidth: "200px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#101828" }}>{it.t}</span>
                {it.tag && (
                  <TagChip bg={it.tagBg ?? "#F2F4F7"} fg={it.tagFg ?? "#475467"}>
                    {it.tag}
                  </TagChip>
                )}
              </span>
              {it.d && <span style={{ display: "block", fontSize: "12px", color: "#475467", marginTop: "6px", lineHeight: 1.6 }}>{it.d}</span>}
            </span>
            {it.v && (
              <span style={{ fontSize: "13px", fontWeight: 800, color: it.vColor ?? "#101828", whiteSpace: "nowrap" }}>{it.v}</span>
            )}
            {it.toggle && (
              <button
                onClick={it.onToggle}
                aria-pressed={it.toggleOn}
                disabled={!it.onToggle}
                style={{
                  width: "40px",
                  height: "22px",
                  borderRadius: "20px",
                  background: it.toggleOn ? "#12A150" : "#D5DCE4",
                  position: "relative",
                  flex: "0 0 40px",
                  border: 0,
                  padding: 0,
                  cursor: it.onToggle ? "pointer" : "default",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: "2px",
                    left: it.toggleOn ? "20px" : "2px",
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    background: "#fff",
                    transition: "left .15s ease",
                  }}
                />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PeriodSelect({ value, onChange, style }: { value: string; onChange: (v: string) => void; style?: CSSProperties }) {
  return (
    <select
      aria-label="Period"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ border: "1px solid #E6EAF0", borderRadius: "11px", padding: "10px 12px", fontSize: "12.5px", fontWeight: 600, color: "#344054", background: "#fff", minHeight: "44px", ...style }}
    >
      <option>Today</option>
      <option>Yesterday</option>
      <option>Last 7 days</option>
      <option>Last 30 days</option>
    </select>
  );
}

export function SectionCard({ title, sub, children, right }: { title: string; sub?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: "16px", overflow: "hidden" }}>
      <div style={{ padding: "13px 17px", borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>{title}</h3>
        {sub && <span style={{ fontSize: "11px", color: "#98A2B3" }}>{sub}</span>}
        {right && <span style={{ marginLeft: "auto" }}>{right}</span>}
      </div>
      {children}
    </div>
  );
}

export function EmptyState({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ padding: "44px 18px", textAlign: "center" }}>
      <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#344054" }}>{title}</div>
      {sub && <div style={{ fontSize: "12px", color: "#98A2B3", marginTop: "5px" }}>{sub}</div>}
    </div>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div style={{ padding: "44px 18px", textAlign: "center", fontSize: "12.5px", color: "#98A2B3" }}>{label}</div>
  );
}

export { DeliveryPathIcon };
