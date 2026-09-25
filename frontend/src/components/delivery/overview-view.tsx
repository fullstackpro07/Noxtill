"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { KpiGrid, LoadingBlock, type KpiCardData } from "./delivery-ui";
import { useDeliveryStore } from "./delivery-store";
import { DeliveryMapCanvas, MapFilterChips, type MapFilter } from "./delivery-map";
import {
  fetchOverviewKpis,
  fetchOverviewFunnel,
  fetchOverviewMap,
  fetchOverviewIntel,
  type OverviewPeriod,
} from "@/lib/delivery-overview-api";

const PERIODS: { value: OverviewPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "Last 7 days" },
  { value: "month", label: "Last 30 days" },
];

const STAGE_STATUS: Record<string, string> = {
  "Ready, no rider": "unassigned",
  "Rider assigned": "assigned",
  "Picked up": "picked_up",
  "Nearly there": "en_route",
  Delivered: "delivered",
};

export function OverviewView() {
  const openDrawer = useDeliveryStore((s) => s.openDrawer);
  const [period, setPeriod] = useState<OverviewPeriod>("today");
  const { data: kpis, isLoading: kpisLoading } = useQuery({ queryKey: ["delivery-kpis", period], queryFn: () => fetchOverviewKpis(period), refetchInterval: 30000 });
  const { data: funnel } = useQuery({ queryKey: ["delivery-funnel"], queryFn: fetchOverviewFunnel, refetchInterval: 30000 });
  const { data: map } = useQuery({ queryKey: ["delivery-map"], queryFn: fetchOverviewMap, refetchInterval: 30000 });
  const { data: intel } = useQuery({ queryKey: ["delivery-intel"], queryFn: fetchOverviewIntel, refetchInterval: 30000 });

  function openKpi(k: KpiCardData) {
    openDrawer({ type: "kpi", key: k.key ?? "generic", label: k.l });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
        <select
          aria-label="Period"
          value={period}
          onChange={(e) => setPeriod(e.target.value as OverviewPeriod)}
          style={{ border: "1px solid #E6EAF0", borderRadius: "11px", padding: "10px 12px", fontSize: "12.5px", fontWeight: 600, color: "#344054", background: "#fff", minHeight: "44px" }}
        >
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <span style={{ fontSize: "11px", color: "#98A2B3" }}>Counts follow the period; waiting, out-for-delivery, running late, cash and riders are always live.</span>
      </div>

      {kpisLoading || !kpis ? <LoadingBlock label="Loading live figures…" /> : <KpiGrid kpis={kpis} onOpen={openKpi} />}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 360px", gap: "15px", alignItems: "start" }}>
        <DeliveryMapCard map={map} />
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <IntelCard intel={intel} />
          <FunnelCard funnel={funnel} />
        </div>
      </div>
    </div>
  );
}

function DeliveryMapCard({ map }: { map: Parameters<typeof DeliveryMapCanvas>[0]["map"] }) {
  const openDrawer = useDeliveryStore((s) => s.openDrawer);
  const router = useRouter();
  const [filter, setFilter] = useState<MapFilter>("Everyone");

  return (
    <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: "16px", overflow: "hidden" }}>
      <div style={{ padding: "13px 17px", borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>Where everyone is</h3>
        <span style={{ fontSize: "11px", color: "#98A2B3" }}>Real GPS from rider phones</span>
        <span style={{ marginLeft: "auto" }}>
          <MapFilterChips value={filter} onChange={setFilter} />
        </span>
      </div>
      <DeliveryMapCanvas
        map={map}
        height={330}
        filter={filter}
        showLegend
        onPin={(p) => {
          if (p.kind === "rider") openDrawer({ type: "rider", riderId: p.i });
          else router.push(p.unassigned ? "/deliveries/dispatch" : "/deliveries/all?status=en_route");
        }}
      />
      <div style={{ padding: "11px 17px", borderTop: "1px solid #F0F2F5", fontSize: "11.5px", color: "#98A2B3" }}>
        Positions are the last real GPS fix each rider&apos;s phone sent, not a live feed. Anything past the stale-position window is marked on their card.
      </div>
    </div>
  );
}

function IntelCard({ intel }: { intel: ReturnType<typeof fetchOverviewIntel> extends Promise<infer T> ? T | undefined : never }) {
  const openDrawer = useDeliveryStore((s) => s.openDrawer);
  return (
    <div style={{ background: "#fff", border: "1.5px solid #BFE7CF", borderRadius: "16px", padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#0E8442" strokeWidth={2} strokeLinecap="round">
          <path d="m11 3 1.7 5L17.7 9.7 12.7 11.4 11 16.4 9.3 11.4 4.3 9.7 9.3 8Z" />
        </svg>
        <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 800, color: "#101828" }}>Needs a decision</h3>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
        {(intel ?? []).map((x) => (
          <button
            key={x.i}
            onClick={() => openDrawer({ type: "intel", index: x.i })}
            style={{ textAlign: "left", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "12px", padding: "12px", cursor: "pointer", width: "100%" }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "7px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "9.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: x.fg, background: x.bg, borderRadius: "5px", padding: "2px 7px" }}>{x.kind}</span>
              <span style={{ fontSize: "9.5px", fontWeight: 700, color: "#98A2B3" }}>{x.basis}</span>
            </span>
            <span style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#101828", marginTop: "7px", lineHeight: 1.5 }}>{x.t}</span>
            <span style={{ display: "block", fontSize: "11px", color: "#98A2B3", marginTop: "4px" }}>{x.ev}</span>
          </button>
        ))}
        {intel && intel.length === 0 && <div style={{ fontSize: "12px", color: "#98A2B3" }}>Nothing needs a decision right now.</div>}
      </div>
    </div>
  );
}

function FunnelCard({ funnel }: { funnel: ReturnType<typeof fetchOverviewFunnel> extends Promise<infer T> ? T | undefined : never }) {
  const router = useRouter();
  const openModal = useDeliveryStore((s) => s.openModal);
  return (
    <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: "16px", padding: "16px" }}>
      <h3 style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: 800, color: "#101828" }}>Where today&apos;s orders are</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
        {(funnel ?? []).map((f, i) => (
          <button
            key={i}
            onClick={() => {
              const status = STAGE_STATUS[f.l];
              if (status) router.push(`/deliveries/all?status=${status}`);
              else openModal({ type: "create-delivery" });
            }}
            title={STAGE_STATUS[f.l] ? "Open this list" : "Turn these orders into deliveries"}
            style={{ textAlign: "left", border: 0, background: "none", padding: 0, cursor: "pointer", width: "100%" }}
          >
            <span style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#344054" }}>{f.l}</span>
              <span style={{ fontSize: "12px", fontWeight: 800, color: "#101828" }}>{f.v}</span>
            </span>
            <span style={{ display: "block", height: "11px", borderRadius: "6px", background: "#F2F4F7", overflow: "hidden" }}>
              <span style={{ display: "block", height: "100%", borderRadius: "6px", background: f.c, width: f.w }} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
