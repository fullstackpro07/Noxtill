"use client";

import type { DeliveryMap, DeliveryMapPin } from "@/lib/delivery-overview-api";

export type MapFilter = "Everyone" | "Late only" | "Unassigned";
export const MAP_FILTERS: MapFilter[] = ["Everyone", "Late only", "Unassigned"];

const GRID = (h: number) => [
  { d: `M0 ${h * 0.21} H800`, w: 1 },
  { d: `M0 ${h * 0.42} H800`, w: 2 },
  { d: `M0 ${h * 0.63} H800`, w: 1 },
  { d: `M0 ${h * 0.84} H800`, w: 2 },
  { d: `M120 0 V${h}`, w: 1 },
  { d: `M260 0 V${h}`, w: 2 },
  { d: `M400 0 V${h}`, w: 1 },
  { d: `M540 0 V${h}`, w: 2 },
  { d: `M680 0 V${h}`, w: 1 },
];

export function MapFilterChips({ value, onChange }: { value: MapFilter; onChange: (f: MapFilter) => void }) {
  return (
    <span style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
      {MAP_FILTERS.map((f) => (
        <button
          key={f}
          onClick={() => onChange(f)}
          style={{
            border: `1px solid ${value === f ? "#12A150" : "#E6EAF0"}`,
            background: value === f ? "#F7FCF9" : "#fff",
            color: value === f ? "#0E8442" : "#475467",
            borderRadius: "20px",
            padding: "6px 11px",
            fontSize: "11px",
            fontWeight: 700,
            cursor: "pointer",
            minHeight: "36px",
          }}
        >
          {f}
        </button>
      ))}
    </span>
  );
}

function visible(pin: DeliveryMapPin, filter: MapFilter): boolean {
  if (filter === "Late only") return pin.late;
  if (filter === "Unassigned") return pin.unassigned;
  return true;
}

/** One real map used by both Overview and Dispatch: real GPS pins projected around the real hub (or the centre of the real positions when no hub is set). */
export function DeliveryMapCanvas({
  map,
  height,
  filter,
  showLegend,
  onPin,
}: {
  map: DeliveryMap | undefined;
  height: number;
  filter: MapFilter;
  showLegend?: boolean;
  onPin: (pin: DeliveryMapPin) => void;
}) {
  if (!map || !map.hub) {
    return (
      <div style={{ position: "relative", height, background: "#EDF1F5" }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12.5px", color: "#98A2B3", textAlign: "center", padding: "0 20px" }}>
          No rider or delivery has a real GPS position right now.
        </div>
      </div>
    );
  }
  const hubPin = map.hubPin ?? { left: "50%", top: "50%" };
  const hx = (parseFloat(hubPin.left) / 100) * 800;
  const hy = (parseFloat(hubPin.top) / 100) * height;
  const pins = map.pins.filter((p) => visible(p, filter));

  return (
    <div style={{ position: "relative", height, background: "#EDF1F5", overflow: "hidden" }}>
      <svg viewBox={`0 0 800 ${height}`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <rect width={800} height={height} fill="#EDF1F5" />
        {GRID(height).map((g, i) => (
          <path key={i} d={g.d} stroke="#DFE5EC" strokeWidth={g.w} fill="none" />
        ))}
        {pins
          .filter((p) => p.kind === "rider")
          .map((p) => (
            <path
              key={p.i}
              d={`M${hx} ${hy} L${(parseFloat(p.left) / 100) * 800} ${(parseFloat(p.top) / 100) * height}`}
              stroke={p.bg}
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
              opacity={0.55}
            />
          ))}
      </svg>
      <div
        title={map.hubIsReal ? "Dispatch hub" : "Centre of the real positions — set the dispatch hub in Settings"}
        style={{ position: "absolute", left: hubPin.left, top: hubPin.top, transform: "translate(-50%,-50%)", width: "26px", height: "26px", borderRadius: "50%", background: "#0A1B2A", color: "#fff", fontSize: "9.5px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        HQ
      </div>
      {pins.length === 0 && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12.5px", color: "#98A2B3" }}>Nothing matches this filter.</div>
      )}
      {pins.map((p) => (
        <button
          key={`${p.kind}-${p.i}-${p.late ? "l" : ""}`}
          onClick={() => onPin(p)}
          aria-label={p.aria}
          style={{
            position: "absolute",
            left: p.left,
            top: p.top,
            transform: "translate(-50%,-50%)",
            border: "2px solid #fff",
            background: p.bg,
            color: "#fff",
            borderRadius: p.radius,
            minWidth: "34px",
            height: "34px",
            padding: "0 8px",
            fontSize: "10.5px",
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 3px 10px rgba(10,27,42,.28)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {p.label}
        </button>
      ))}
      {showLegend && (
        <div style={{ position: "absolute", left: "12px", bottom: "12px", background: "#fff", border: "1px solid #E6EAF0", borderRadius: "11px", padding: "10px 12px", display: "flex", gap: "13px", flexWrap: "wrap" }}>
          {map.legend.map((l, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10.5px", fontWeight: 700, color: "#475467" }}>
              <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: l.c }} />
              {l.l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
