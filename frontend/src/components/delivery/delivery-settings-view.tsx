"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { KpiGrid, PanelCard, LoadingBlock } from "./delivery-ui";
import { OwnerGate } from "./owner-gate";
import { useDeliverySettingMutation } from "./use-delivery-setting";
import { fetchDeliverySettings } from "@/lib/delivery-settings-api";
import { fetchDeliveryZones } from "@/lib/delivery-zones-api";
import { fetchRiders } from "@/lib/riders-api";
import { fetchDeliveries } from "@/lib/deliveries-api";
import { toast } from "@/lib/toast";

function money(n: number): string {
  return `Rs. ${Math.round(n).toLocaleString("en-US")}`;
}

export function DeliverySettingsView() {
  return (
    <OwnerGate title="Delivery settings are owner-only">
      <SettingsBody />
    </OwnerGate>
  );
}

function SettingsBody() {
  const { data: settings, isLoading } = useQuery({ queryKey: ["delivery-settings"], queryFn: fetchDeliverySettings });
  const { data: zones } = useQuery({ queryKey: ["delivery-zones"], queryFn: fetchDeliveryZones });
  const { data: riders } = useQuery({ queryKey: ["delivery-riders"], queryFn: fetchRiders });
  const { data: delivered } = useQuery({ queryKey: ["deliveries", "delivered"], queryFn: () => fetchDeliveries("delivered") });
  const save = useDeliverySettingMutation("Setting updated.");
  const [dirty, setDirty] = useState<Record<string, string | undefined>>({});

  if (isLoading || !settings) return <LoadingBlock label="Loading settings…" />;

  const onShift = (riders ?? []).filter((r) => r.status === "active").length;
  const value = (key: string, current: number | string | null) => (dirty[key] !== undefined ? (dirty[key] as string) : current === null ? "" : String(current));

  function saveField(key: string, patchKey: string, kind: "int" | "float" | "nullableFloat") {
    const raw = (dirty[key] ?? "").trim();
    let parsed: number | null;
    if (raw === "") {
      if (kind !== "nullableFloat") return;
      parsed = null;
    } else {
      parsed = Number(raw);
      if (!Number.isFinite(parsed) || (kind === "int" && !Number.isInteger(parsed))) {
        toast.error("Enter a valid number.");
        return;
      }
    }
    save.mutate({ [patchKey]: parsed });
    setDirty((d) => ({ ...d, [key]: undefined }));
  }

  function setHubFromBrowser() {
    if (!navigator.geolocation) {
      toast.error("This browser can't share a location.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        save.mutate({ hubLat: Number(pos.coords.latitude.toFixed(6)), hubLng: Number(pos.coords.longitude.toFixed(6)) });
        setDirty((d) => ({ ...d, hubLat: undefined, hubLng: undefined }));
      },
      () => toast.error("Couldn't read your location — type it in instead."),
    );
  }

  const row = (label: string, desc: string, key: string, current: number | string | null, suffix: string, patchKey: string, kind: "int" | "float" | "nullableFloat") => (
    <SettingRow key={key} label={label} desc={desc} value={value(key, current)} suffix={suffix} pending={save.isPending} onChange={(v) => setDirty((d) => ({ ...d, [key]: v }))} onSave={() => saveField(key, patchKey, kind)} allowEmpty={kind === "nullableFloat"} />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <KpiGrid
        minWidth={180}
        kpis={[
          { l: "Riders set up", v: String(riders?.length ?? 0), sub: `${onShift} on shift today`, color: "#0F172A", bd: "#E6EAF0" },
          { l: "Zones", v: String(zones?.length ?? 0), sub: `${(zones ?? []).filter((z) => z.active).length} delivering`, color: "#0F172A", bd: "#E6EAF0" },
          { l: "Cash limit", v: settings.cashLimitAmount ? money(Number(settings.cashLimitAmount)) : "No limit set", sub: "per rider", color: "#0F172A", bd: "#E6EAF0" },
          {
            l: "Delivered with proof",
            v: delivered ? `${delivered.filter((d) => d.proofAt).length} of ${delivered.length}` : "…",
            sub: "proof is captured by the rider flow; marking delivered by hand skips it and shows on Proof of Delivery",
            color: "#0F172A",
            bd: "#E6EAF0",
          },
        ]}
      />

      <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: "16px", padding: "17px" }}>
        <h3 style={{ margin: "0 0 13px", fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>How dispatch behaves</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
          {row("Delivery time promise (SLA)", "Minutes after a rider is assigned that a delivery is expected to arrive by.", "sla", settings.defaultSlaMinutes, "min", "defaultSlaMinutes", "int")}
          {row("ETA padding added for the customer", "A small buffer so most deliveries beat the promise rather than miss it.", "padding", settings.etaPaddingMinutes, "min", "etaPaddingMinutes", "int")}
          {row("Stops per rider before a warning", "Dispatch flags a rider once they reach this many active stops.", "warn", settings.warnAtStopCount, "stops", "warnAtStopCount", "int")}
          {row("Cash a rider may carry", "A warning, not a block. Riders are not stopped mid-round. Leave blank for no limit.", "cash", settings.cashLimitAmount, "Rs.", "cashLimitAmount", "nullableFloat")}
          {row("How long before a quiet phone is flagged", "Minutes since a rider's last GPS fix before their position is labelled stale.", "stale", settings.staleLocationMinutes, "min", "staleLocationMinutes", "int")}
          {row("Urgent after", "A waiting order gets the Urgent chip once it has waited this long.", "urgent", settings.urgentAfterMinutes, "min", "urgentAfterMinutes", "int")}
          {row("High-value order from", "A waiting order at or above this total gets the High value chip. Leave blank to turn it off.", "highValue", settings.highValueAmount, "Rs.", "highValueAmount", "nullableFloat")}
          {row("ETA-slip threshold", "How many minutes past the promise before a delay message can go out (when that rule is on).", "slip", settings.slipThresholdMinutes, "min", "slipThresholdMinutes", "int")}
        </div>
      </div>

      <PanelCard
        panel={{
          h: "Assignment",
          bd: "#E6EAF0",
          items: [
            {
              t: "Hand new deliveries to the least-busy rider automatically",
              d: "When on, a delivery created from the dashboard goes straight to the active rider with the fewest open stops. When off, it waits in the Dispatch queue for you. Deliveries from the public storefront always wait for dispatch.",
              toggle: true,
              toggleOn: settings.autoAssignNew,
              onToggle: () => save.mutate({ autoAssignNew: !settings.autoAssignNew }),
            },
          ],
        }}
      />

      <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: "16px", padding: "17px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px", flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>Dispatch hub and delivery costs</h3>
          <Button size="sm" variant="outline" style={{ marginLeft: "auto" }} onClick={setHubFromBrowser} disabled={save.isPending}>
            Use my current location as the hub
          </Button>
        </div>
        <p style={{ margin: "0 0 13px", fontSize: "11.5px", color: "#98A2B3" }}>
          The hub is where deliveries leave from. With it, every delivery gets a real distance, a by-distance fee and a cost. Without it those figures stay blank.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
          {row("Hub latitude", "Where your branch is, north-south.", "hubLat", settings.hubLat, "°", "hubLat", "nullableFloat")}
          {row("Hub longitude", "Where your branch is, east-west.", "hubLng", settings.hubLng, "°", "hubLng", "nullableFloat")}
          {row("Fuel and vehicle cost per km", "Applied to the round trip (out and back). Leave blank if you don't cost it.", "costPerKm", settings.costPerKm, "Rs./km", "costPerKm", "nullableFloat")}
          {row("Rider pay per delivery", "A fixed amount per delivery. Leave blank if riders are not paid per delivery.", "riderPay", settings.riderPayPerDelivery, "Rs.", "riderPayPerDelivery", "nullableFloat")}
        </div>
      </div>

      <PanelCard
        panel={{
          h: "What the customer is told",
          sub: "Each switch is real and off until you turn it on. Messages go through your connected messaging channels.",
          bd: "#E6EAF0",
          items: [
            { t: "Send an ETA when a rider is assigned", d: "Includes the promised time and a private tracking link.", toggle: true, toggleOn: settings.autoEtaOnAssign, onToggle: () => save.mutate({ autoEtaOnAssign: !settings.autoEtaOnAssign }) },
            { t: "Send an update if the ETA slips", d: `Once, when an active delivery is ${settings.slipThresholdMinutes}+ minutes past its promise.`, toggle: true, toggleOn: settings.autoEtaOnSlip, onToggle: () => save.mutate({ autoEtaOnSlip: !settings.autoEtaOnSlip }) },
            { t: "Share the rider's live position on the tracking link", d: "Only for riders who have given consent (recorded on each rider), and only while their position is fresh.", toggle: true, toggleOn: settings.shareLiveLocation, onToggle: () => save.mutate({ shareLiveLocation: !settings.shareLiveLocation }) },
            { t: "Send proof of delivery to the customer", d: "A delivered notice with a link showing the captured signature or photo.", toggle: true, toggleOn: settings.sendProofToCustomer, onToggle: () => save.mutate({ sendProofToCustomer: !settings.sendProofToCustomer }) },
          ],
        }}
      />

      <PanelCard
        panel={{
          h: "Fixed rules",
          sub: "These are built into the code and cannot be switched off",
          bd: "#BFE7CF",
          items: [
            { t: "Money never moves on its own", d: "No refund, fee change or price adjustment happens without a person approving it." },
            { t: "A rider is never moved off a delivery automatically", d: "Once a delivery has a rider, only a person can change it. The only automatic assignment is the switch above, which applies to a brand-new delivery." },
            { t: "Rider location is only used for dispatch", d: "It reaches a customer only if you switch sharing on and that rider has consented, and it is erased when a rider goes off shift." },
            { t: "“Cash held” tracks custody, not revenue timing", d: "A cash payment is recorded on the order as soon as it is taken; “held” only tracks whether it has physically reached the till." },
            { t: "A stale position is always labelled", d: "Anything past the stale-position window above is marked rather than shown as current." },
          ],
        }}
      />
    </div>
  );
}

function SettingRow({
  label,
  desc,
  value,
  suffix,
  onChange,
  onSave,
  pending,
  allowEmpty,
}: {
  label: string;
  desc: string;
  value: string;
  suffix: string;
  onChange: (v: string) => void;
  onSave: () => void;
  pending: boolean;
  allowEmpty?: boolean;
}) {
  return (
    <div style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "13px", display: "flex", alignItems: "flex-end", gap: "12px", flexWrap: "wrap" }}>
      <span style={{ flex: 1, minWidth: "200px" }}>
        <span style={{ display: "block", fontSize: "12.5px", fontWeight: 800, color: "#101828" }}>{label}</span>
        <span style={{ display: "block", fontSize: "12px", color: "#475467", marginTop: "6px", lineHeight: 1.6 }}>{desc}</span>
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <input
          type="number"
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={allowEmpty ? "Not set" : undefined}
          style={{ width: "110px", border: "1px solid #E6EAF0", borderRadius: "9px", padding: "8px 10px", fontSize: "12.5px", fontWeight: 700, color: "#101828" }}
        />
        <span style={{ fontSize: "11px", color: "#98A2B3", minWidth: "34px" }}>{suffix}</span>
        <Button size="sm" variant="outline" disabled={pending} onClick={onSave}>
          {pending ? "…" : "Save"}
        </Button>
      </span>
    </div>
  );
}
