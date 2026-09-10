"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, MapPin, Star, UserX, UserCheck, BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import {
  fetchRiders,
  createRider,
  updateRider,
  fetchRiderPerformance,
  VEHICLE_TYPE_LABELS,
  type RiderRosterRow,
  type RiderVehicleType,
  type RiderPerformance,
} from "@/lib/riders-api";
import { fetchDeliveryZones } from "@/lib/delivery-zones-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function RidersView() {
  const [addOpen, setAddOpen] = useState(false);
  const [detailRider, setDetailRider] = useState<RiderRosterRow | null>(null);
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["riders"], queryFn: fetchRiders });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">Riders</h1>
          <p className="mt-0.5 text-sm text-fg-muted">Your delivery roster — vehicle, status, load, and real performance.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Add rider
        </Button>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load riders" onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={UserCheck} title="No riders yet" description="Add your first delivery rider." action={{ label: "Add rider", onClick: () => setAddOpen(true) }} />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-fg-faint">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Vehicle</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Today</th>
                <th className="px-4 py-2 font-medium">Location</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.map((rider) => (
                <tr key={rider.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    <button onClick={() => setDetailRider(rider)} className="font-medium text-fg hover:underline">
                      {rider.name}
                    </button>
                    <p className="text-xs text-fg-faint">{rider.phone}</p>
                  </td>
                  <td className="px-4 py-2 text-fg-muted">{rider.vehicleType ? VEHICLE_TYPE_LABELS[rider.vehicleType] : "—"}</td>
                  <td className="px-4 py-2">
                    <Badge tone={rider.status === "active" ? "success" : "neutral"}>{rider.status}</Badge>
                  </td>
                  <td className="px-4 py-2 tabular-nums text-fg-muted">
                    {rider.deliveriesToday} {rider.activeDeliveries > 0 && <span className="text-primary">({rider.activeDeliveries} active)</span>}
                  </td>
                  <td className="px-4 py-2 text-xs text-fg-faint">
                    {rider.lastLat != null ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" aria-hidden />
                        {Number(rider.lastLat).toFixed(3)}, {Number(rider.lastLng).toFixed(3)}
                      </span>
                    ) : (
                      "No check-in yet"
                    )}
                  </td>
                  <td className="px-4 py-2 text-end">
                    <DeactivateButton rider={rider} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddRiderDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <RiderDetailDialog rider={detailRider} onClose={() => setDetailRider(null)} />
    </div>
  );
}

function DeactivateButton({ rider }: { rider: RiderRosterRow }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => updateRider(rider.id, { status: rider.status === "active" ? "inactive" : "active" }),
    onSuccess: () => {
      toast.success(rider.status === "active" ? "Deactivated." : "Reactivated.");
      void queryClient.invalidateQueries({ queryKey: ["riders"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this rider."),
  });

  return (
    <Button variant="ghost" size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
      {rider.status === "active" ? <UserX className="h-3.5 w-3.5" aria-hidden /> : <UserCheck className="h-3.5 w-3.5" aria-hidden />}
      {rider.status === "active" ? "Deactivate" : "Reactivate"}
    </Button>
  );
}

function AddRiderDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: zones } = useQuery({ queryKey: ["delivery-zones"], queryFn: fetchDeliveryZones, enabled: open });
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
      toast.success(`${name} added.`);
      void queryClient.invalidateQueries({ queryKey: ["riders"] });
      handleClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't add this rider."),
  });

  function handleClose() {
    setName("");
    setPhone("");
    setVehicleType("bike");
    setCommissionRate("");
    setZoneIds([]);
    onClose();
  }

  function toggleZone(id: string) {
    setZoneIds((prev) => (prev.includes(id) ? prev.filter((z) => z !== id) : [...prev, id]));
  }

  if (!open) return null;

  return (
    <Dialog
      open
      onClose={handleClose}
      title="Add rider"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={mutation.isPending}>
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

function RiderDetailDialog({ rider, onClose }: { rider: RiderRosterRow | null; onClose: () => void }) {
  return rider ? <RiderDetailDialogBody rider={rider} onClose={onClose} /> : null;
}

function RiderDetailDialogBody({ rider, onClose }: { rider: RiderRosterRow; onClose: () => void }) {
  const { data: perf, isPending } = useQuery<RiderPerformance>({
    queryKey: ["rider-performance", rider.id],
    queryFn: () => fetchRiderPerformance(rider.id),
  });

  return (
    <Dialog open onClose={onClose} title={rider.name} description={rider.phone} className="max-w-md">
      {isPending || !perf ? (
        <SkeletonRow />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Total deliveries" value={String(perf.totalDeliveries)} />
            <Stat label="Success rate" value={perf.successRate != null ? `${perf.successRate}%` : "—"} />
            <Stat label="Avg. delivery time" value={perf.averageDeliveryMinutes != null ? `${Math.round(perf.averageDeliveryMinutes)}m` : "—"} />
            <Stat
              label="Rating"
              value={
                perf.averageRating != null ? (
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-4 w-4 fill-accent text-accent" aria-hidden />
                    {perf.averageRating.toFixed(1)}
                  </span>
                ) : (
                  "Not yet rated"
                )
              }
            />
          </div>
          <p className="flex items-center gap-1.5 text-xs text-fg-faint">
            <BarChart3 className="h-3 w-3" aria-hidden />
            Based on {perf.ratedDeliveries} rated deliver{perf.ratedDeliveries === 1 ? "y" : "ies"} of {perf.delivered} completed.
          </p>
        </div>
      )}
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-sm)] bg-surface-2 p-3">
      <p className="text-xs text-fg-faint">{label}</p>
      <p className="mt-0.5 font-display text-lg font-bold text-fg">{value}</p>
    </div>
  );
}
