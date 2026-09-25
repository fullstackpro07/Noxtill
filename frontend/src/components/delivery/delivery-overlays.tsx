"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import { toast as showToast } from "@/lib/toast";
import { useDeliveryStore, type DeliveryDrawer } from "./delivery-store";
import {
  fetchDelayedDeliveries,
  fetchRidersLive,
  fetchDispatchQueue,
  fetchRiderDetail,
  fetchFreshness,
  fetchOverviewIntel,
} from "@/lib/delivery-overview-api";
import { assignDelivery } from "@/lib/deliveries-api";
import { fetchDeliverySettings } from "@/lib/delivery-settings-api";
import { createRider, VEHICLE_TYPE_LABELS, type RiderVehicleType } from "@/lib/riders-api";
import { fetchDeliveryZones } from "@/lib/delivery-zones-api";
import { handInRiderCash } from "@/lib/riders-api";
import { CreateDeliveryModal, RiderActions, invalidateDeliveryData } from "./delivery-actions";

function money(n: number): string {
  return `Rs. ${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
}

export function DeliveryOverlays() {
  const drawer = useDeliveryStore((s) => s.drawer);
  const modal = useDeliveryStore((s) => s.modal);
  const closeAll = useDeliveryStore((s) => s.closeAll);
  const toast = useDeliveryStore((s) => s.toast);

  return (
    <>
      {drawer && (
        <>
          <div onClick={closeAll} style={{ position: "fixed", inset: 0, background: "rgba(10,27,42,.36)", zIndex: 80 }} />
          <aside
            role="dialog"
            aria-modal="true"
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: "520px",
              maxWidth: "100%",
              background: "#fff",
              zIndex: 85,
              boxShadow: "-18px 0 46px rgba(10,27,42,.18)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ padding: "17px", borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "center", gap: "12px" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#0F172A", flex: 1 }}>{drawerTitle(drawer)}</h3>
              <button onClick={closeAll} aria-label="Close" style={{ width: "34px", height: "34px", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", color: "#475467", cursor: "pointer" }}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "17px" }}>
              <DrawerBody drawer={drawer} />
            </div>
          </aside>
        </>
      )}

      {modal && (modal.type === "assign" || modal.type === "fresh") && (
        <div onClick={closeAll} style={{ position: "fixed", inset: 0, background: "rgba(10,27,42,.42)", zIndex: 88, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: "18px", width: "500px", maxWidth: "100%", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 30px 80px rgba(10,27,42,.32)" }}
          >
            {modal.type === "assign" && <AssignModal deliveryId={modal.deliveryId} onClose={closeAll} />}
            {modal.type === "fresh" && <FreshModal onClose={closeAll} />}
          </div>
        </div>
      )}
      {modal?.type === "add-rider" && <AddRiderModal onClose={closeAll} />}
      {modal?.type === "create-delivery" && <CreateDeliveryModal onClose={closeAll} />}

      {toast && (
        <div role="status" style={{ position: "fixed", bottom: "22px", left: "50%", transform: "translateX(-50%)", background: "#0A1B2A", color: "#fff", padding: "11px 18px", borderRadius: "11px", fontSize: "12.5px", fontWeight: 600, boxShadow: "0 14px 34px rgba(10,27,42,.3)", zIndex: 98 }}>
          {toast}
        </div>
      )}
    </>
  );
}

function drawerTitle(drawer: DeliveryDrawer): string {
  switch (drawer.type) {
    case "kpi":
      return "Behind the number";
    case "intel":
      return "What is going on";
    case "rider":
      return "Rider";
    case "order":
      return "Delivery";
  }
}

function DrawerBody({ drawer }: { drawer: DeliveryDrawer }) {
  if (drawer.type === "kpi") return <KpiDrawer drawer={drawer} />;
  if (drawer.type === "intel") return <IntelDrawer index={drawer.index} />;
  if (drawer.type === "rider") return <RiderDrawer riderId={drawer.riderId} />;
  return <OrderDrawer deliveryId={drawer.deliveryId} />;
}

function KpiDrawer({ drawer }: { drawer: Extract<DeliveryDrawer, { type: "kpi" }> }) {
  const closeAll = useDeliveryStore((s) => s.closeAll);
  const isDelayed = drawer.key === "delayed";
  const isCash = drawer.key === "cash";

  const { data: delayed } = useQuery({ queryKey: ["delivery-delayed"], queryFn: fetchDelayedDeliveries, enabled: isDelayed });
  const { data: riders } = useQuery({ queryKey: ["delivery-riders-live"], queryFn: fetchRidersLive, enabled: isCash });

  if (isDelayed) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ fontSize: "16px", fontWeight: 800, color: "#0F172A" }}>{delayed ? `${delayed.length} deliveries running late` : "Running late"}</div>
        <div style={{ fontSize: "12.5px", color: "#475467", lineHeight: 1.65 }}>These are past the promised time recorded when a rider was assigned.</div>
        <div>
          {(delayed ?? []).map((r, i) => (
            <div key={i} style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "13px", marginBottom: "9px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#0E8442" }}>{r.id}</span>
                <span style={{ fontSize: "12px", color: "#344054" }}>{r.cust}</span>
                <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#101828", marginLeft: "auto" }}>{r.amt}</span>
              </div>
              <div style={{ fontSize: "11.5px", color: "#667085", marginTop: "6px", lineHeight: 1.55 }}>{r.note}</div>
            </div>
          ))}
        </div>
        <div style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: "11px", padding: "12px", fontSize: "11.5px", color: "#667085", lineHeight: 1.6 }}>
          Compared with the promised time recorded when each rider was assigned.
        </div>
        <Button variant="ghost" onClick={closeAll}>
          Close
        </Button>
      </div>
    );
  }

  if (isCash) {
    const held = (riders ?? []).filter((r) => r.cash > 0);
    const total = held.reduce((s, r) => s + r.cash, 0);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ fontSize: "16px", fontWeight: 800, color: "#0F172A" }}>{money(total)} waiting to be collected</div>
        <div style={{ fontSize: "12.5px", color: "#475467", lineHeight: 1.65 }}>Cash your riders are carrying, collected on delivery but not yet handed in. This is not revenue until it reaches the till.</div>
        <div>
          {held.map((r) => (
            <div key={r.i} style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "13px", marginBottom: "9px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#0E8442" }}>{r.n}</span>
                <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#101828", marginLeft: "auto" }}>{money(r.cash)}</span>
              </div>
              <div style={{ fontSize: "11.5px", color: "#667085", marginTop: "6px", lineHeight: 1.55 }}>
                {r.stale ? "No GPS signal right now — worth a phone call." : `Currently ${r.st.toLowerCase()}.`}
              </div>
            </div>
          ))}
          {held.length === 0 && <div style={{ fontSize: "12.5px", color: "#98A2B3" }}>Nobody is holding cash right now.</div>}
        </div>
        <div style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: "11px", padding: "12px", fontSize: "11.5px", color: "#667085", lineHeight: 1.6 }}>
          From orders marked cash on delivery that have not yet been reconciled at the till.
        </div>
        <Button variant="ghost" onClick={closeAll}>
          Close
        </Button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ fontSize: "16px", fontWeight: 800, color: "#0F172A" }}>How this is counted</div>
      <div style={{ fontSize: "12.5px", color: "#475467", lineHeight: 1.65 }}>{drawer.label} is counted live from real delivery and order records for this business — nothing here is estimated.</div>
      <div style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: "11px", padding: "12px", fontSize: "11.5px", color: "#667085", lineHeight: 1.6 }}>
        Source: Orders and Delivery records, counted at the moment this page loaded.
      </div>
      <Button variant="ghost" onClick={closeAll}>
        Close
      </Button>
    </div>
  );
}

function IntelDrawer({ index }: { index: number }) {
  const closeAll = useDeliveryStore((s) => s.closeAll);
  const openModal = useDeliveryStore((s) => s.openModal);
  const flash = useDeliveryStore((s) => s.flash);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: intel } = useQuery({ queryKey: ["delivery-intel"], queryFn: fetchOverviewIntel });
  const item = intel?.[index];

  const handIn = useMutation({
    mutationFn: (riderId: string) => handInRiderCash(riderId),
    onSuccess: () => {
      invalidateDeliveryData(queryClient);
      flash("Cash hand-in recorded.");
      closeAll();
    },
    onError: (err) => showToast.error(err instanceof ApiError ? err.message : "Couldn't record the hand-in."),
  });

  if (!item) return <div style={{ fontSize: "12.5px", color: "#98A2B3" }}>Loading…</div>;
  const a = item.action;

  function act() {
    if (a.kind === "call" && a.phone) {
      window.location.href = `tel:${a.phone}`;
    } else if (a.kind === "handin" && a.riderId) {
      handIn.mutate(a.riderId);
    } else if (a.kind === "assign" && a.deliveryId) {
      openModal({ type: "assign", deliveryId: a.deliveryId });
    } else {
      closeAll();
      router.push("/deliveries/dispatch");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ fontSize: "15.5px", fontWeight: 800, color: "#0F172A", lineHeight: 1.45 }}>{item.t}</div>
      <div>
        <div style={{ fontSize: "10.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3" }}>Why</div>
        <div style={{ fontSize: "12.5px", color: "#344054", marginTop: "6px", lineHeight: 1.65 }}>{item.why}</div>
      </div>
      <div style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: "12px", padding: "13px" }}>
        <div style={{ fontSize: "10.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3" }}>What it is based on</div>
        <div style={{ fontSize: "12px", color: "#475467", marginTop: "6px", lineHeight: 1.6 }}>{item.ev}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid #F2F4F7" }}>
        <span style={{ fontSize: "12.5px", color: "#667085" }}>Basis</span>
        <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#344054" }}>{item.basis}</span>
      </div>
      <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: "11px", padding: "11px 13px", fontSize: "11.5px", color: "#93370D", lineHeight: 1.55 }}>
        Nothing here moves a delivery on its own. Reassigning a rider changes what someone is doing right now, so it always waits for you.
      </div>
      <div style={{ display: "flex", gap: "9px" }}>
        <Button variant="ghost" onClick={closeAll}>
          Dismiss
        </Button>
        <Button style={{ flex: 1 }} onClick={act} disabled={handIn.isPending}>
          {a.label}
        </Button>
      </div>
    </div>
  );
}

function RiderDrawer({ riderId }: { riderId: string }) {
  const closeAll = useDeliveryStore((s) => s.closeAll);
  const router = useRouter();
  const { data: rider, isLoading } = useQuery({ queryKey: ["delivery-rider-detail", riderId], queryFn: () => fetchRiderDetail(riderId) });
  if (isLoading || !rider) return <div style={{ fontSize: "12.5px", color: "#98A2B3" }}>Loading…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <span style={{ width: "46px", height: "46px", borderRadius: "50%", background: "#0A1B2A", color: "#fff", fontSize: "14px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 46px" }}>{rider.init}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: "16px", fontWeight: 800, color: "#0F172A" }}>{rider.n}</span>
          <span style={{ display: "block", fontSize: "11.5px", color: "#98A2B3", marginTop: "3px" }}>
            {rider.zone} · {rider.veh}
          </span>
        </span>
        <span style={{ fontSize: "10.5px", fontWeight: 800, padding: "3px 10px", borderRadius: "20px", background: rider.bg, color: rider.fg }}>{rider.st}</span>
      </div>
      {rider.stale && (
        <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: "12px", padding: "12px" }}>
          <div style={{ fontSize: "12.5px", fontWeight: 800, color: "#93370D" }}>Position may be out of date</div>
          <div style={{ fontSize: "12px", color: "#B54708", marginTop: "5px", lineHeight: 1.6 }}>Their last GPS fix was {rider.seen}. They may have moved since — the map dot is where they were, not where they are.</div>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <StatBox label="Stops today" value={`${rider.done} done`} />
        <StatBox label="Still to do" value={`${rider.stops} of ${rider.capacity} stops`} />
        <StatBox label="On time" value={rider.otd} />
        <StatBox label="Cash held" value={rider.cash} />
      </div>
      <div>
        <div style={{ fontSize: "10.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: "9px" }}>Their next stops</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {rider.next.map((s, i) => (
            <div key={i} style={{ border: "1px solid #E6EAF0", borderRadius: "11px", padding: "11px", display: "flex", alignItems: "center", gap: "11px" }}>
              <span style={{ width: "22px", height: "22px", borderRadius: "50%", background: "#F2F4F7", color: "#475467", fontSize: "10.5px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 22px" }}>{s.n}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#101828" }}>{s.cust}</span>
                <span style={{ display: "block", fontSize: "10.5px", color: "#98A2B3", marginTop: "2px" }}>{s.addr}</span>
              </span>
              <span style={{ fontSize: "11.5px", fontWeight: 800, color: s.etaColor }}>{s.eta}</span>
            </div>
          ))}
          {rider.next.length === 0 && <div style={{ fontSize: "12px", color: "#98A2B3" }}>No active stops right now.</div>}
        </div>
      </div>
      <RiderActions riderId={riderId} />
      <div style={{ display: "flex", gap: "9px" }}>
        <Button variant="ghost" onClick={closeAll}>
          Close
        </Button>
        <Button
          variant="outline"
          style={{ flex: 1 }}
          onClick={() => {
            closeAll();
            router.push(`/deliveries/rider/${riderId}`);
          }}
        >
          Open full Rider 360
        </Button>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "12px" }}>
      <div style={{ fontSize: "11px", fontWeight: 700, color: "#667085" }}>{label}</div>
      <div style={{ fontSize: "18px", fontWeight: 800, color: "#0F172A", marginTop: "4px" }}>{value}</div>
    </div>
  );
}

function OrderDrawer({ deliveryId }: { deliveryId: string }) {
  const closeAll = useDeliveryStore((s) => s.closeAll);
  const openModal = useDeliveryStore((s) => s.openModal);
  const { data: queue } = useQuery({ queryKey: ["delivery-queue"], queryFn: fetchDispatchQueue });
  const order = queue?.find((q) => q.i === deliveryId);
  if (!order) return <div style={{ fontSize: "12.5px", color: "#98A2B3" }}>This delivery is no longer waiting for a rider.</div>;

  const p = order.pri === "Urgent" ? { bg: "#FEF3F2", fg: "#B42318" } : order.pri === "High value" ? { bg: "#FEF6E7", fg: "#B54708" } : { bg: "#F2F4F7", fg: "#475467" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "16px", fontWeight: 800, color: "#0F172A" }}>{order.id}</span>
        <span style={{ fontSize: "10.5px", fontWeight: 800, padding: "3px 9px", borderRadius: "20px", background: p.bg, color: p.fg }}>{order.pri}</span>
      </div>
      <div>
        <Row label="Customer" value={order.cust} />
        <Row label="Address" value={order.addr} />
        <Row label="Distance" value={order.dist} />
        <Row label="Items" value={String(order.items)} />
        <Row label="Payment" value={order.pay} valueColor={order.paid ? "#0E8442" : "#B54708"} last />
      </div>
      {order.note && (
        <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: "11px", padding: "12px" }}>
          <div style={{ fontSize: "10.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#93370D" }}>Delivery note</div>
          <div style={{ fontSize: "12.5px", color: "#344054", marginTop: "5px", lineHeight: 1.6 }}>{order.note}</div>
        </div>
      )}
      <div style={{ display: "flex", gap: "9px" }}>
        <Button variant="ghost" onClick={closeAll}>
          Close
        </Button>
        <Button style={{ flex: 1 }} onClick={() => openModal({ type: "assign", deliveryId: order.i })}>
          Assign a rider
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value, valueColor, last }: { label: string; value: string; valueColor?: string; last?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "14px", padding: "9px 0", borderBottom: last ? "none" : "1px solid #F2F4F7" }}>
      <span style={{ fontSize: "12.5px", color: "#667085" }}>{label}</span>
      <span style={{ fontSize: "12.5px", fontWeight: 700, color: valueColor ?? "#344054", textAlign: "right" }}>{value}</span>
    </div>
  );
}

function AssignModal({ deliveryId, onClose }: { deliveryId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const flash = useDeliveryStore((s) => s.flash);
  const { data: queue } = useQuery({ queryKey: ["delivery-queue"], queryFn: fetchDispatchQueue });
  const { data: riders } = useQuery({ queryKey: ["delivery-riders-live"], queryFn: fetchRidersLive });
  const { data: settings } = useQuery({ queryKey: ["delivery-settings"], queryFn: fetchDeliverySettings });
  const order = queue?.find((q) => q.i === deliveryId);
  const [chosen, setChosen] = useState<string | null>(null);
  const riderId = chosen ?? order?.riderId ?? null;
  const rider = riders?.find((r) => r.i === riderId);

  const computed = useMemo(() => {
    if (!order || !rider) return null;
    const after = rider.stops + 1;
    const over = after > rider.cap;
    const remainingCash = order.paid ? 0 : Number(order.pay.replace(/[^0-9]/g, "")) || 0;
    const promiseMin = settings ? settings.defaultSlaMinutes + settings.etaPaddingMinutes : null;
    const cashAfter = rider.cash + remainingCash;
    const limit = settings?.cashLimitAmount ? Number(settings.cashLimitAmount) : null;
    const overCash = limit !== null && cashAfter > limit;
    return {
      eta: promiseMin !== null ? `about ${promiseMin} minutes (default promise${settings && settings.etaPaddingMinutes ? " incl. padding" : ""})` : "the default promise",
      overCash,
      before: `${rider.stops} of ${rider.cap} stops`,
      after: `${after} of ${rider.cap} stops`,
      impact: over ? "Pushes their later stops back" : "Adds one more stop to their route",
      impactColor: over ? "#B42318" : "#475467",
      cash: order.paid ? "No extra cash" : `${money(remainingCash)} more`,
      warn: over || overCash,
      warnText: over
        ? "This takes them over their stop-warning threshold. Their other drops may slip."
        : `This rider would be carrying Rs. ${Math.round(cashAfter).toLocaleString("en-US")} in cash, above your Rs. ${Math.round(limit ?? 0).toLocaleString("en-US")} limit.`,
    };
  }, [order, rider, settings]);

  const mutation = useMutation({
    mutationFn: () => assignDelivery(deliveryId, rider!.i),
    onSuccess: () => {
      flash(`${order?.id ?? "Delivery"} assigned to ${rider?.n ?? "the rider"}.`);
      invalidateDeliveryData(queryClient);
      onClose();
    },
    onError: (err) => showToast.error(err instanceof ApiError ? err.message : "Couldn't assign this delivery."),
  });

  if (!order) {
    return (
      <div style={{ padding: "17px" }}>
        <div style={{ fontSize: "13px", color: "#475467" }}>This delivery is no longer waiting for a rider.</div>
        <div style={{ marginTop: "14px" }}>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ padding: "17px", borderBottom: "1px solid #F0F2F5" }}>
        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#0F172A" }}>Confirm assignment</h3>
      </div>
      <div style={{ padding: "17px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ fontSize: "13px", color: "#475467", lineHeight: 1.6 }}>
          Give <strong style={{ color: "#101828" }}>{order.id}</strong> to <strong style={{ color: "#101828" }}>{rider?.n ?? "a rider"}</strong>?
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: "5px", fontSize: "11px", fontWeight: 700, color: "#667085" }}>
          Rider{order.riderId && riderId === order.riderId ? " (best fit)" : ""}
          <select
            value={riderId ?? ""}
            onChange={(e) => setChosen(e.target.value)}
            style={{ border: "1px solid #E6EAF0", borderRadius: "10px", padding: "10px 12px", fontSize: "12.5px", fontWeight: 600, color: "#344054", background: "#fff" }}
          >
            {(riders ?? []).map((r) => (
              <option key={r.i} value={r.i}>
                {r.n} · {r.st} · {r.stops} of {r.cap} stops
              </option>
            ))}
          </select>
        </label>
        {computed && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <StatBox label="Their load now" value={computed.before} />
              <StatBox label="After this" value={computed.after} />
            </div>
            <div>
              <Row label="Customer will be told" value={computed.eta} />
              <Row label="Effect on their other stops" value={computed.impact} valueColor={computed.impactColor} />
              <Row label="Cash they will be carrying" value={computed.cash} last />
            </div>
            {computed.warn && (
              <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: "11px", padding: "11px 13px", fontSize: "12px", color: "#93370D", lineHeight: 1.55 }}>{computed.warnText}</div>
            )}
          </>
        )}
        {!rider && <div style={{ fontSize: "12.5px", color: "#B42318" }}>No rider is currently free to take this delivery.</div>}
      </div>
      <div style={{ padding: "14px 17px", borderTop: "1px solid #F0F2F5", display: "flex", gap: "10px", justifyContent: "flex-end" }}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => mutation.mutate()} disabled={!rider || mutation.isPending}>
          {mutation.isPending ? "Assigning…" : "Assign and notify"}
        </Button>
      </div>
    </div>
  );
}

function FreshModal({ onClose }: { onClose: () => void }) {
  const { data } = useQuery({ queryKey: ["delivery-freshness"], queryFn: fetchFreshness });
  return (
    <div>
      <div style={{ padding: "17px", borderBottom: "1px solid #F0F2F5" }}>
        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#0F172A" }}>Where this data comes from</h3>
      </div>
      <div style={{ padding: "17px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {(data?.rows ?? []).map((f, i) => (
          <div key={i} style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "12px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <span style={{ flex: 1, minWidth: "150px" }}>
              <span style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{f.l}</span>
              <span style={{ display: "block", fontSize: "11px", color: "#98A2B3", marginTop: "2px" }}>{f.v}</span>
            </span>
            <span style={{ fontSize: "11.5px", fontWeight: 800, color: f.c }}>{f.last}</span>
          </div>
        ))}
        <div style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: "11px", padding: "12px", fontSize: "11.5px", color: "#667085", lineHeight: 1.6 }}>
          Rider positions come from their phones, so they stop updating if a phone loses signal or its battery dies. Anything a rider&apos;s own configured stale-position window flags is shown as such rather than current.
        </div>
      </div>
      <div style={{ padding: "14px 17px", borderTop: "1px solid #F0F2F5", display: "flex", justifyContent: "flex-end" }}>
        <Button onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}

function AddRiderModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: zones } = useQuery({ queryKey: ["delivery-zones"], queryFn: fetchDeliveryZones });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleType, setVehicleType] = useState<RiderVehicleType>("bike");
  const [commissionRate, setCommissionRate] = useState("");
  const [zoneIds, setZoneIds] = useState<string[]>([]);

  const mutation = useMutation({
    mutationFn: () =>
      createRider({
        name,
        phone,
        vehicleType,
        commissionRate: commissionRate ? Number(commissionRate) : undefined,
        zoneIds,
      }),
    onSuccess: () => {
      showToast.success(`${name} added.`);
      void queryClient.invalidateQueries({ queryKey: ["delivery-riders"] });
      void queryClient.invalidateQueries({ queryKey: ["delivery-riders-live"] });
      onClose();
    },
    onError: (err) => showToast.error(err instanceof ApiError ? err.message : "Couldn't add this rider."),
  });

  function toggleZone(id: string) {
    setZoneIds((prev) => (prev.includes(id) ? prev.filter((z) => z !== id) : [...prev, id]));
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add rider"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!name.trim() || !phone.trim() || mutation.isPending}>
            {mutation.isPending ? "Adding…" : "Add rider"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 000 0000" />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Vehicle" value={vehicleType} onChange={(e) => setVehicleType(e.target.value as RiderVehicleType)}>
            {Object.entries(VEHICLE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Input label="Commission rate (%)" type="number" min={0} max={100} value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)} />
        </div>
        {zones && zones.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-fg-muted">Zones covered</p>
            <div className="flex flex-wrap gap-2">
              {zones.map((zone) => (
                <button
                  key={zone.id}
                  onClick={() => toggleZone(zone.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                    zoneIds.includes(zone.id) ? "border-primary bg-primary/10 text-primary" : "border-border-strong text-fg hover:bg-surface-2"
                  }`}
                >
                  {zone.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
