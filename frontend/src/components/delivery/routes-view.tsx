"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Route as RouteIcon, Wand2, GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import { fetchDeliveries, assignDelivery, assignDeliveryZone, DELIVERY_STATUS_LABELS } from "@/lib/deliveries-api";
import { fetchRiders } from "@/lib/riders-api";
import { fetchDeliveryZones } from "@/lib/delivery-zones-api";
import { fetchRoutes, createRoute, optimiseRoute } from "@/lib/delivery-routes-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

/** Real HTML5 drag-and-drop payload — a delivery row's `dataTransfer` carries its own id under this MIME type. */
const DELIVERY_DRAG_MIME = "application/x-noxtill-delivery-id";

export function AssignmentRoutesView() {
  const queryClient = useQueryClient();
  const [selectedForRoute, setSelectedForRoute] = useState<Set<string>>(new Set());
  const [routeRiderId, setRouteRiderId] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverRiderId, setDragOverRiderId] = useState<string | null>(null);

  const { data: unassigned, isPending, isError, refetch } = useQuery({
    queryKey: ["deliveries", "unassigned"],
    queryFn: () => fetchDeliveries("unassigned"),
  });
  const { data: riders } = useQuery({ queryKey: ["riders"], queryFn: fetchRiders });
  const { data: zones } = useQuery({ queryKey: ["delivery-zones"], queryFn: fetchDeliveryZones });
  const { data: routes } = useQuery({ queryKey: ["delivery-routes"], queryFn: fetchRoutes });

  const activeRiders = (riders ?? []).filter((r) => r.status === "active");
  const activeZones = (zones ?? []).filter((z) => z.active);

  const assignMutation = useMutation({
    mutationFn: ({ deliveryId, riderId }: { deliveryId: string; riderId: string }) => assignDelivery(deliveryId, riderId),
    onSuccess: () => {
      toast.success("Assigned.");
      void queryClient.invalidateQueries({ queryKey: ["deliveries"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't assign this delivery."),
  });

  const assignZoneMutation = useMutation({
    mutationFn: ({ deliveryId, zoneId }: { deliveryId: string; zoneId: string | null }) => assignDeliveryZone(deliveryId, zoneId),
    onSuccess: () => {
      toast.success("Zone set — its SLA now applies to this delivery's on-time promise.");
      void queryClient.invalidateQueries({ queryKey: ["deliveries"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't set this delivery's zone."),
  });

  const createRouteMutation = useMutation({
    mutationFn: () => createRoute([...selectedForRoute], routeRiderId || undefined),
    onSuccess: () => {
      toast.success("Route created.");
      setSelectedForRoute(new Set());
      void queryClient.invalidateQueries({ queryKey: ["delivery-routes"] });
      void queryClient.invalidateQueries({ queryKey: ["deliveries"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't create this route."),
  });

  function toggleForRoute(id: string) {
    setSelectedForRoute((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleDropOnRider(riderId: string) {
    if (draggingId) assignMutation.mutate({ deliveryId: draggingId, riderId });
    setDraggingId(null);
    setDragOverRiderId(null);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">Assignment & Routes</h1>
        <p className="mt-0.5 text-sm text-fg-muted">
          Drag a delivery onto a rider to assign it, or use the dropdown in each row — both do the same real assignment. Set a zone per
          delivery to apply that zone&apos;s own SLA to its on-time promise.
        </p>
      </div>

      {activeRiders.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {activeRiders.map((r) => (
            <div
              key={r.id}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverRiderId(r.id);
              }}
              onDragLeave={() => setDragOverRiderId((prev) => (prev === r.id ? null : prev))}
              onDrop={(e) => {
                e.preventDefault();
                handleDropOnRider(r.id);
              }}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                dragOverRiderId === r.id ? "border-primary bg-primary/10 text-primary" : "border-border-strong text-fg"
              }`}
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden />
              {r.name}
            </div>
          ))}
        </div>
      )}

      {isError ? (
        <ErrorBanner title="Couldn't load unassigned deliveries" onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
        </div>
      ) : !unassigned || unassigned.length === 0 ? (
        <EmptyState icon={UserPlus} title="Nothing to assign" description="Every delivery already has a rider." />
      ) : (
        <>
          {selectedForRoute.size > 0 && (
            <div className="mb-3 flex items-center gap-2 rounded-[var(--radius-noxtill)] border border-primary/30 bg-primary/8 p-3">
              <span className="text-sm text-fg">{selectedForRoute.size} selected for a route</span>
              <Select value={routeRiderId} onChange={(e) => setRouteRiderId(e.target.value)} className="ml-auto w-40">
                <option value="">No rider yet</option>
                {activeRiders.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
              <Button size="sm" onClick={() => createRouteMutation.mutate()} disabled={createRouteMutation.isPending}>
                <RouteIcon className="h-3.5 w-3.5" aria-hidden />
                Build route
              </Button>
            </div>
          )}

          <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-fg-faint">
                  <th className="w-8 px-4 py-2" />
                  <th className="w-8 px-2 py-2" />
                  <th className="px-4 py-2 font-medium">Order</th>
                  <th className="px-4 py-2 font-medium">Address</th>
                  <th className="px-4 py-2 font-medium">Zone (SLA)</th>
                  <th className="px-4 py-2 font-medium">Assign to</th>
                </tr>
              </thead>
              <tbody>
                {unassigned.map((d) => (
                  <tr
                    key={d.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DELIVERY_DRAG_MIME, d.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDraggingId(d.id);
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDragOverRiderId(null);
                    }}
                    className={`border-b border-border last:border-0 ${draggingId === d.id ? "opacity-40" : ""}`}
                  >
                    <td className="px-4 py-2">
                      <input type="checkbox" checked={selectedForRoute.has(d.id)} onChange={() => toggleForRoute(d.id)} className="h-4 w-4 rounded border-border-strong accent-primary" />
                    </td>
                    <td className="cursor-grab px-2 py-2 text-fg-faint" aria-hidden>
                      <GripVertical className="h-4 w-4" />
                    </td>
                    <td className="px-4 py-2 font-medium text-fg">#{d.order?.orderNo ?? "—"}</td>
                    <td className="max-w-[240px] truncate px-4 py-2 text-fg-muted">{d.addressLine}</td>
                    <td className="px-4 py-2">
                      <Select
                        value={d.zoneId ?? ""}
                        onChange={(e) => assignZoneMutation.mutate({ deliveryId: d.id, zoneId: e.target.value || null })}
                        className="w-36"
                      >
                        <option value="">Business default</option>
                        {activeZones.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.name}
                            {z.slaMinutes != null ? ` (${z.slaMinutes}m)` : ""}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-4 py-2">
                      <Select
                        defaultValue=""
                        onChange={(e) => e.target.value && assignMutation.mutate({ deliveryId: d.id, riderId: e.target.value })}
                        className="w-40"
                      >
                        <option value="" disabled>
                          Choose a rider…
                        </option>
                        {activeRiders.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="mt-6">
        <p className="mb-3 text-sm font-medium text-fg">Routes</p>
        {!routes || routes.length === 0 ? (
          <p className="text-sm text-fg-faint">No routes built yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {routes.map((route) => (
              <RouteCard key={route.id} routeId={route.id} riderName={route.rider?.name ?? "Unassigned"} status={route.status} stops={route.deliveries} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RouteCard({
  routeId,
  riderName,
  status,
  stops,
}: {
  routeId: string;
  riderName: string;
  status: string;
  stops: { id: string; addressLine: string; routeSequence: number | null; status: string }[];
}) {
  const queryClient = useQueryClient();
  const optimiseMutation = useMutation({
    mutationFn: () => optimiseRoute(routeId),
    onSuccess: () => {
      toast.success("Route optimised.");
      void queryClient.invalidateQueries({ queryKey: ["delivery-routes"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't optimise this route."),
  });

  const ordered = [...stops].sort((a, b) => (a.routeSequence ?? 0) - (b.routeSequence ?? 0));

  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-fg">{riderName}</span>
          <Badge tone="neutral">{status}</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={() => optimiseMutation.mutate()} disabled={optimiseMutation.isPending}>
          <Wand2 className="h-3.5 w-3.5" aria-hidden />
          {optimiseMutation.isPending ? "Optimising…" : "Optimise"}
        </Button>
      </div>
      <ol className="flex flex-col gap-1">
        {ordered.map((stop, i) => (
          <li key={stop.id} className="flex items-center gap-2 text-xs text-fg-muted">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[10px] font-semibold text-fg">{i + 1}</span>
            <span className="truncate">{stop.addressLine}</span>
            <Badge tone="neutral" className="ml-auto shrink-0">
              {DELIVERY_STATUS_LABELS[stop.status as keyof typeof DELIVERY_STATUS_LABELS] ?? stop.status}
            </Badge>
          </li>
        ))}
      </ol>
    </div>
  );
}
