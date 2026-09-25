"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { KpiGrid, PanelCard, LoadingBlock } from "./delivery-ui";
import { OwnerGate } from "./owner-gate";
import { useDeliverySettingMutation } from "./use-delivery-setting";
import { fetchZonesSummary } from "@/lib/delivery-insights-api";
import {
  fetchDeliveryZones,
  createDeliveryZone,
  updateDeliveryZone,
  removeDeliveryZone,
  CHARGE_TYPE_LABELS,
  type DeliveryChargeType,
  type DeliveryZone,
} from "@/lib/delivery-zones-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function ZonesView() {
  return (
    <OwnerGate title="Zones are owner-only">
      <ZonesBody />
    </OwnerGate>
  );
}

function ZonesBody() {
  const { data, isLoading } = useQuery({ queryKey: ["delivery-zones-summary"], queryFn: fetchZonesSummary, refetchInterval: 60000 });
  const [addOpen, setAddOpen] = useState(false);
  const save = useDeliverySettingMutation("Zone rule updated.");
  if (isLoading || !data) return <LoadingBlock label="Loading zones…" />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <KpiGrid kpis={data.kpis} minWidth={180} />
      <PanelCard panel={{ h: "Your zones", sub: "Fee rule, volume and what each zone earns after cost, last 30 days", bd: "#E6EAF0", items: data.zones }} />
      {data.lossPanel && <PanelCard panel={data.lossPanel} />}
      <ZoneManagementPanel onAdd={() => setAddOpen(true)} />
      <PanelCard
        panel={{
          h: "Zone rules",
          sub: "Enforced by the public ordering flow the moment you switch them on",
          bd: "#BFE7CF",
          items: data.rules.map((r) => ({
            t: r.t,
            d: r.d,
            toggle: true,
            toggleOn: r.on,
            onToggle: () => save.mutate({ [r.key]: !r.on }),
          })),
        }}
      />
      <AddZoneDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

function ZoneManagementPanel({ onAdd }: { onAdd: () => void }) {
  const queryClient = useQueryClient();
  const { data: zones } = useQuery({ queryKey: ["delivery-zones"], queryFn: fetchDeliveryZones });

  const removeMutation = useMutation({
    mutationFn: removeDeliveryZone,
    onSuccess: () => {
      toast.success("Zone removed.");
      void queryClient.invalidateQueries({ queryKey: ["delivery-zones"] });
      void queryClient.invalidateQueries({ queryKey: ["delivery-zones-summary"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't remove this zone."),
  });
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => updateDeliveryZone(id, { active }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["delivery-zones"] });
      void queryClient.invalidateQueries({ queryKey: ["delivery-zones-summary"] });
    },
  });

  return (
    <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: "16px", padding: "17px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "13px" }}>
        <h3 style={{ margin: 0, fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>Manage zones</h3>
        <button onClick={onAdd} style={{ marginLeft: "auto", border: 0, background: "#12A150", borderRadius: "9px", padding: "8px 13px", fontSize: "12px", fontWeight: 800, color: "#fff", cursor: "pointer" }}>
          Add zone
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
        {(zones ?? []).map((zone) => (
          <div key={zone.id} style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "13px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <span style={{ flex: 1, minWidth: "180px" }}>
              <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#101828" }}>{zone.name}</span>
              <span style={{ display: "block", fontSize: "11px", color: "#98A2B3", marginTop: "3px" }}>
                {CHARGE_TYPE_LABELS[zone.chargeType]}
                {zone.slaMinutes ? ` · ${zone.slaMinutes} min SLA` : ""}
              </span>
            </span>
            <ZoneSlaEditor zone={zone} />
            <Button variant="outline" size="sm" onClick={() => toggleActiveMutation.mutate({ id: zone.id, active: !zone.active })}>
              {zone.active ? "Pause" : "Resume"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => removeMutation.mutate(zone.id)} disabled={removeMutation.isPending}>
              Remove
            </Button>
          </div>
        ))}
        {zones && zones.length === 0 && <div style={{ fontSize: "12.5px", color: "#98A2B3" }}>No zones yet — add one to start covering deliveries.</div>}
      </div>
    </div>
  );
}

function ZoneSlaEditor({ zone }: { zone: DeliveryZone }) {
  const queryClient = useQueryClient();
  const [minutes, setMinutes] = useState("");
  const [dirty, setDirty] = useState(false);
  const currentMinutes = dirty ? minutes : zone.slaMinutes != null ? String(zone.slaMinutes) : "";

  const mutation = useMutation({
    mutationFn: (slaMinutes: number | null) => updateDeliveryZone(zone.id, { slaMinutes }),
    onSuccess: () => {
      toast.success(`${zone.name}'s SLA updated.`);
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: ["delivery-zones"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this zone's SLA."),
  });
  const valid = currentMinutes === "" || (Number.isInteger(Number(currentMinutes)) && Number(currentMinutes) >= 5 && Number(currentMinutes) <= 1440);

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "6px" }}>
      <Input label="SLA (min)" type="number" min={5} max={1440} placeholder="Default" value={currentMinutes} onChange={(e) => { setMinutes(e.target.value); setDirty(true); }} className="w-24" />
      {dirty && (
        <Button size="sm" variant="outline" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate(currentMinutes === "" ? null : Number(currentMinutes))}>
          {mutation.isPending ? "…" : "Save"}
        </Button>
      )}
    </div>
  );
}

function AddZoneDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [chargeType, setChargeType] = useState<DeliveryChargeType>("flat");
  const [flatAmount, setFlatAmount] = useState("");
  const [perKmAmount, setPerKmAmount] = useState("");
  const [freeAboveOrderValue, setFreeAboveOrderValue] = useState("");
  const [slaMinutes, setSlaMinutes] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      createDeliveryZone({
        name,
        chargeType,
        flatAmount: flatAmount ? Number(flatAmount) : undefined,
        perKmAmount: perKmAmount ? Number(perKmAmount) : undefined,
        freeAboveOrderValue: freeAboveOrderValue ? Number(freeAboveOrderValue) : undefined,
        slaMinutes: slaMinutes ? Number(slaMinutes) : undefined,
      }),
    onSuccess: () => {
      toast.success(`${name} added.`);
      void queryClient.invalidateQueries({ queryKey: ["delivery-zones"] });
      void queryClient.invalidateQueries({ queryKey: ["delivery-zones-summary"] });
      handleClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't add this zone."),
  });

  function handleClose() {
    setName("");
    setChargeType("flat");
    setFlatAmount("");
    setPerKmAmount("");
    setFreeAboveOrderValue("");
    setSlaMinutes("");
    onClose();
  }

  if (!open) return null;

  return (
    <Dialog
      open
      onClose={handleClose}
      title="Add delivery zone"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!name.trim() || mutation.isPending}>
            {mutation.isPending ? "Adding…" : "Add zone"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <Select label="Charge type" value={chargeType} onChange={(e) => setChargeType(e.target.value as DeliveryChargeType)}>
          {Object.entries(CHARGE_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        {chargeType === "flat" && <Input label="Flat amount" type="number" min={0} value={flatAmount} onChange={(e) => setFlatAmount(e.target.value)} />}
        {chargeType === "by_distance" && <Input label="Amount per km" type="number" min={0} value={perKmAmount} onChange={(e) => setPerKmAmount(e.target.value)} />}
        <Input label="Free delivery above order value (optional)" type="number" min={0} value={freeAboveOrderValue} onChange={(e) => setFreeAboveOrderValue(e.target.value)} />
        <Input label="Delivery SLA for this zone, in minutes (optional — uses the business default when left blank)" type="number" min={5} max={1440} value={slaMinutes} onChange={(e) => setSlaMinutes(e.target.value)} />
      </div>
    </Dialog>
  );
}
