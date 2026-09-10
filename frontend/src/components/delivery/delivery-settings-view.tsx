"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import {
  fetchDeliveryZones,
  createDeliveryZone,
  updateDeliveryZone,
  removeDeliveryZone,
  CHARGE_TYPE_LABELS,
  type DeliveryChargeType,
  type DeliveryZone,
} from "@/lib/delivery-zones-api";
import { fetchDeliverySettings, updateDeliverySettings } from "@/lib/delivery-settings-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function DeliverySettingsView() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["delivery-zones"], queryFn: fetchDeliveryZones });

  const removeMutation = useMutation({
    mutationFn: removeDeliveryZone,
    onSuccess: () => {
      toast.success("Zone removed.");
      void queryClient.invalidateQueries({ queryKey: ["delivery-zones"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't remove this zone."),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => updateDeliveryZone(id, { active }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["delivery-zones"] }),
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">Delivery Settings</h1>
          <p className="mt-0.5 text-sm text-fg-muted">Charge rules by zone — a settings CRUD, not yet wired into POS pricing.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Add zone
        </Button>
      </div>

      <SlaSettingsCard />

      {isError ? (
        <ErrorBanner title="Couldn't load delivery zones" onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={Settings2} title="No zones yet" description="Add a delivery zone with its own charge rule." action={{ label: "Add zone", onClick: () => setAddOpen(true) }} />
      ) : (
        <div className="flex flex-col gap-3">
          {data.map((zone) => (
            <div key={zone.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-fg">{zone.name}</p>
                  <Badge tone={zone.active ? "success" : "neutral"}>{zone.active ? "Active" : "Inactive"}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-fg-muted">
                  {CHARGE_TYPE_LABELS[zone.chargeType]}
                  {zone.chargeType === "flat" && zone.flatAmount ? ` · $${zone.flatAmount}` : ""}
                  {zone.chargeType === "by_distance" && zone.perKmAmount ? ` · $${zone.perKmAmount}/km` : ""}
                  {zone.freeAboveOrderValue ? ` · Free above $${zone.freeAboveOrderValue}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <ZoneSlaEditor zone={zone} />
                <Button variant="ghost" size="sm" onClick={() => toggleActiveMutation.mutate({ id: zone.id, active: !zone.active })}>
                  {zone.active ? "Deactivate" : "Activate"}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => removeMutation.mutate(zone.id)} disabled={removeMutation.isPending} aria-label={`Remove ${zone.name}`}>
                  <Trash2 className="h-4 w-4 text-fg-faint" aria-hidden />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddZoneDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}

/**
 * On-time-rate depth fix — this is the real promise window: whatever minutes a business sets here
 * is what the backend actually stamps onto `Delivery.promisedAt` the moment a rider is assigned, and
 * is what "on-time rate" on the All Deliveries screen is measured against. The business-wide
 * default — a zone below can override it with its own SLA.
 */
function SlaSettingsCard() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: ["delivery-settings"], queryFn: fetchDeliverySettings });
  const [minutes, setMinutes] = useState("");
  const [dirty, setDirty] = useState(false);

  const currentMinutes = dirty ? minutes : data ? String(data.defaultSlaMinutes) : "";

  const mutation = useMutation({
    mutationFn: (defaultSlaMinutes: number) => updateDeliverySettings({ defaultSlaMinutes }),
    onSuccess: () => {
      toast.success("Delivery SLA updated.");
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: ["delivery-settings"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update the SLA."),
  });

  const parsed = Number(currentMinutes);
  const valid = currentMinutes !== "" && Number.isInteger(parsed) && parsed >= 5 && parsed <= 1440;

  return (
    <div className="mb-5 rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <p className="text-sm font-medium text-fg">Delivery time promise (SLA)</p>
      <p className="mt-0.5 text-xs text-fg-muted">
        How many minutes after a rider is assigned a delivery is expected to arrive by. Drives the real on-time rate on the All Deliveries screen.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Input
          label="Minutes"
          type="number"
          min={5}
          max={1440}
          value={currentMinutes}
          onChange={(e) => {
            setMinutes(e.target.value);
            setDirty(true);
          }}
          disabled={isPending}
          className="w-32"
        />
        <Button
          onClick={() => mutation.mutate(parsed)}
          disabled={!valid || !dirty || mutation.isPending}
        >
          {mutation.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Per-zone SLA depth fix — an empty field means "use the business default"; a real number overrides
 * it for deliveries in this zone. Clearing the field back to empty reverts to the default.
 */
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
    <div className="flex items-end gap-1.5">
      <Input
        label="SLA (min)"
        type="number"
        min={5}
        max={1440}
        placeholder="Default"
        value={currentMinutes}
        onChange={(e) => {
          setMinutes(e.target.value);
          setDirty(true);
        }}
        className="w-24"
      />
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
        <Input
          label="Delivery SLA for this zone, in minutes (optional — uses the business default when left blank)"
          type="number"
          min={5}
          max={1440}
          value={slaMinutes}
          onChange={(e) => setSlaMinutes(e.target.value)}
        />
      </div>
    </Dialog>
  );
}
