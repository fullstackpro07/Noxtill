"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DeliveryMapCanvas, MapFilterChips, type MapFilter } from "./delivery-map";
import { LoadingBlock } from "./delivery-ui";
import { useDeliveryStore } from "./delivery-store";
import { fetchDispatchQueue, fetchOverviewMap, fetchRidersLive, fetchOverviewActivity, type QueueEntry } from "@/lib/delivery-overview-api";

export function DispatchView() {
  const openDrawer = useDeliveryStore((s) => s.openDrawer);
  const openModal = useDeliveryStore((s) => s.openModal);
  const { data: queue, isLoading: queueLoading } = useQuery({ queryKey: ["delivery-queue"], queryFn: fetchDispatchQueue, refetchInterval: 20000 });
  const { data: map } = useQuery({ queryKey: ["delivery-map"], queryFn: fetchOverviewMap, refetchInterval: 20000 });
  const { data: riders } = useQuery({ queryKey: ["delivery-riders-live"], queryFn: fetchRidersLive, refetchInterval: 20000 });
  const { data: activity } = useQuery({ queryKey: ["delivery-activity"], queryFn: fetchOverviewActivity, refetchInterval: 20000 });

  const [mapFilter, setMapFilter] = useState<MapFilter>("Everyone");
  const oldestWaited = queue && queue.length > 0 ? queue[0].waited : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      {queue && queue.length > 0 && (
        <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: "12px", padding: "12px 14px", display: "flex", alignItems: "center", gap: "11px", flexWrap: "wrap" }}>
          <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#B54708" strokeWidth={2} strokeLinecap="round" style={{ flex: "0 0 17px" }}>
            <path d="M12 9v5M12 17.5h.01M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
          <span style={{ flex: 1, minWidth: "200px", fontSize: "12.5px", fontWeight: 700, color: "#93370D" }}>
            {queue.length} order{queue.length === 1 ? " is" : "s are"} waiting for a rider — the oldest has been waiting {oldestWaited}
          </span>
          <button
            onClick={() => openModal({ type: "assign", deliveryId: queue[0].i })}
            style={{ border: 0, background: "#B54708", borderRadius: "10px", padding: "10px 15px", fontSize: "12px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "44px" }}
          >
            Review suggested assignments
          </button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "340px minmax(0,1fr) 320px", gap: "15px", alignItems: "start" }}>
        <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: "16px", overflow: "hidden" }}>
          <div style={{ padding: "13px 15px", borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "center", gap: "9px" }}>
            <h3 style={{ margin: 0, fontSize: "13.5px", fontWeight: 800, color: "#101828" }}>Waiting for a rider</h3>
            <span style={{ fontSize: "10.5px", fontWeight: 800, color: "#B42318", background: "#FEF3F2", borderRadius: "20px", padding: "2px 8px" }}>{queue?.length ?? 0}</span>
          </div>
          <div style={{ maxHeight: "520px", overflowY: "auto" }}>
            {queueLoading && <LoadingBlock />}
            {(queue ?? []).map((o) => (
              <QueueRow key={o.i} o={o} onAssign={() => openModal({ type: "assign", deliveryId: o.i })} onDetails={() => openDrawer({ type: "order", deliveryId: o.i })} />
            ))}
          </div>
          {queue && queue.length === 0 && (
            <div style={{ padding: "44px 18px", textAlign: "center" }}>
              <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#344054" }}>Everything is assigned</div>
              <div style={{ fontSize: "12px", color: "#98A2B3", marginTop: "5px" }}>Nothing is waiting for a rider right now.</div>
            </div>
          )}
        </div>

        <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: "16px", overflow: "hidden" }}>
          <div style={{ padding: "13px 15px", borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: "13.5px", fontWeight: 800, color: "#101828" }}>Live map</h3>
            <span style={{ marginLeft: "auto" }}>
              <MapFilterChips value={mapFilter} onChange={setMapFilter} />
            </span>
          </div>
          <DeliveryMapCanvas map={map} height={400} filter={mapFilter} onPin={(p) => (p.kind === "rider" ? openDrawer({ type: "rider", riderId: p.i }) : undefined)} />
        </div>

        <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: "16px", overflow: "hidden" }}>
          <div style={{ padding: "13px 15px", borderBottom: "1px solid #F0F2F5" }}>
            <h3 style={{ margin: 0, fontSize: "13.5px", fontWeight: 800, color: "#101828" }}>Riders on shift</h3>
          </div>
          <div style={{ maxHeight: "520px", overflowY: "auto" }}>
            {(riders ?? []).map((r) => (
              <button
                key={r.i}
                onClick={() => openDrawer({ type: "rider", riderId: r.i })}
                style={{ display: "block", width: "100%", textAlign: "left", border: 0, borderTop: "1px solid #F2F4F7", background: "#fff", padding: "13px 15px", cursor: "pointer" }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ width: "34px", height: "34px", borderRadius: "50%", background: "#0A1B2A", color: "#fff", fontSize: "11.5px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 34px" }}>{r.init}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: "12.5px", fontWeight: 800, color: "#101828" }}>{r.n}</span>
                    <span style={{ display: "block", fontSize: "10.5px", color: "#98A2B3", marginTop: "2px" }}>{r.zone}</span>
                  </span>
                  <span style={{ fontSize: "9.5px", fontWeight: 800, padding: "2px 8px", borderRadius: "20px", background: r.bg, color: r.fg, whiteSpace: "nowrap" }}>{r.st}</span>
                </span>
                <span style={{ display: "block", marginTop: "9px" }}>
                  <span style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span style={{ fontSize: "10.5px", color: "#667085" }}>Workload</span>
                    <span style={{ fontSize: "10.5px", fontWeight: 800, color: r.loadColor }}>
                      {r.stops} of {r.cap} stops
                    </span>
                  </span>
                  <span style={{ display: "block", height: "7px", borderRadius: "5px", background: "#F2F4F7", overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", borderRadius: "5px", background: r.loadColor, width: r.loadW }} />
                  </span>
                </span>
                {r.stale && <span style={{ display: "block", marginTop: "8px", fontSize: "10.5px", fontWeight: 700, color: "#B54708" }}>Last GPS fix {r.seen} — position may be out of date</span>}
              </button>
            ))}
            {riders && riders.length === 0 && <div style={{ padding: "24px", textAlign: "center", fontSize: "12.5px", color: "#98A2B3" }}>No riders on shift right now.</div>}
          </div>
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: "16px", overflow: "hidden" }}>
        <div style={{ padding: "13px 17px", borderBottom: "1px solid #F0F2F5" }}>
          <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 800, color: "#101828" }}>What just happened</h3>
        </div>
        <div>
          {(activity ?? []).map((a, i) => (
            <div key={i} style={{ padding: "11px 17px", borderTop: "1px solid #F2F4F7", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <span style={{ width: "26px", height: "26px", borderRadius: "8px", background: a.bg, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 26px" }}>
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={a.fg} strokeWidth={2.4} strokeLinecap="round">
                  <path d={a.icon} />
                </svg>
              </span>
              <span style={{ flex: 1, minWidth: "200px", fontSize: "12.5px", color: "#344054" }}>{a.t}</span>
              <span style={{ fontSize: "11px", color: "#98A2B3" }}>{a.when}</span>
            </div>
          ))}
          {activity && activity.length === 0 && <div style={{ padding: "24px", textAlign: "center", fontSize: "12.5px", color: "#98A2B3" }}>Nothing has happened yet today.</div>}
        </div>
      </div>
    </div>
  );
}

function QueueRow({ o, onAssign, onDetails }: { o: QueueEntry; onAssign: () => void; onDetails: () => void }) {
  const p = o.pri === "Urgent" ? { bg: "#FEF3F2", fg: "#B42318" } : o.pri === "High value" ? { bg: "#FEF6E7", fg: "#B54708" } : { bg: "#F2F4F7", fg: "#475467" };
  return (
    <div style={{ padding: "13px 15px", borderTop: "1px solid #F2F4F7", background: o.pri === "Urgent" ? "#FFFBFA" : "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#0E8442" }}>{o.id}</span>
        <span title={o.pri === "Urgent" ? "Waiting longer than your Urgent-after setting" : o.pri === "High value" ? "At or above your high-value setting" : "Neither rule applies"} style={{ fontSize: "9.5px", fontWeight: 800, padding: "2px 7px", borderRadius: "5px", background: p.bg, color: p.fg }}>{o.pri}</span>
        <span style={{ fontSize: "10.5px", color: "#98A2B3", marginLeft: "auto" }}>waiting {o.waited}</span>
      </div>
      <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#101828", marginTop: "7px" }}>{o.cust}</div>
      <div style={{ fontSize: "11.5px", color: "#667085", marginTop: "3px", lineHeight: 1.5 }}>{o.addr}</div>
      <div style={{ display: "flex", gap: "12px", marginTop: "8px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "11px", color: "#667085" }}>{o.dist}</span>
        <span style={{ fontSize: "11px", color: "#667085" }}>{o.items} items</span>
        <span style={{ fontSize: "11px", fontWeight: 700, color: o.paid ? "#0E8442" : "#B54708" }}>{o.pay}</span>
      </div>
      {o.note && <div style={{ marginTop: "8px", background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: "9px", padding: "8px 10px", fontSize: "11px", color: "#93370D" }}>{o.note}</div>}
      <div style={{ marginTop: "10px", background: "#F7FCF9", border: "1px solid #D5EFE0", borderRadius: "10px", padding: "10px" }}>
        <div style={{ fontSize: "9.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#0E8442" }}>Best fit</div>
        <div style={{ fontSize: "12px", fontWeight: 800, color: "#101828", marginTop: "5px" }}>{o.rider ?? "No rider free right now"}</div>
        <div style={{ fontSize: "10.5px", color: "#475467", marginTop: "4px", lineHeight: 1.5 }}>{o.why}</div>
      </div>
      <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
        <button onClick={onAssign} style={{ flex: 1, border: 0, background: "#12A150", borderRadius: "10px", padding: "10px", fontSize: "12px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "44px" }}>
          Assign
        </button>
        <button onClick={onDetails} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "10px 13px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "44px" }}>
          Details
        </button>
      </div>
    </div>
  );
}
