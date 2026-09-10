"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Radio, PackageSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SkeletonRow } from "@/components/shared/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { LiveTrackingMap, type RouteLine } from "@/components/delivery/live-tracking-map";
import { useDeliveryStream } from "@/hooks/use-delivery-stream";
import { fetchRiders } from "@/lib/riders-api";
import { fetchRoutes } from "@/lib/delivery-routes-api";
import { DELIVERY_STATUS_LABELS, type DeliveryStatus } from "@/lib/deliveries-api";

const ROUTE_COLORS = ["#3b7dd8", "#2f9e57", "#d99a1f", "#a35fd9", "#d64545"];

export function LiveTrackingView() {
  const { deliveries, riderLocations, status } = useDeliveryStream();
  const { data: riders } = useQuery({ queryKey: ["riders"], queryFn: fetchRiders, refetchInterval: 30_000 });
  const { data: routes } = useQuery({ queryKey: ["delivery-routes"], queryFn: fetchRoutes, refetchInterval: 30_000 });

  const riderPositions = useMemo(() => {
    if (!riders) return [];
    const liveByRider = new Map(riderLocations.map((r) => [r.riderId, r]));
    return riders
      .filter((r) => r.status === "active")
      .map((rider) => {
        const live = liveByRider.get(rider.id);
        const lat = live?.lat ?? (rider.lastLat != null ? Number(rider.lastLat) : null);
        const lng = live?.lng ?? (rider.lastLng != null ? Number(rider.lastLng) : null);
        return lat != null && lng != null ? { riderId: rider.id, name: rider.name, lat, lng } : null;
      })
      .filter((r): r is { riderId: string; name: string; lat: number; lng: number } => r != null);
  }, [riders, riderLocations]);

  const routeLines: RouteLine[] = useMemo(() => {
    if (!routes) return [];
    return routes
      .filter((r) => r.status !== "completed")
      .map((route, i) => ({
        routeId: route.id,
        color: ROUTE_COLORS[i % ROUTE_COLORS.length],
        points: route.deliveries
          .filter((d) => d.lat != null && d.lng != null)
          .sort((a, b) => (a.routeSequence ?? 0) - (b.routeSequence ?? 0))
          .map((d) => ({ lat: Number(d.lat), lng: Number(d.lng) })),
      }));
  }, [routes]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">Live Tracking</h1>
          <p className="mt-0.5 text-sm text-fg-muted">Real rider positions and active deliveries, updating live.</p>
        </div>
        <Badge tone={status === "open" ? "success" : status === "connecting" ? "primary" : "danger"}>
          <Radio className="h-3 w-3" aria-hidden />
          {status === "open" ? "Live" : status === "connecting" ? "Connecting…" : "Disconnected"}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-2 lg:col-span-2">
          <LiveTrackingMap deliveries={deliveries} riderPositions={riderPositions} routeLines={routeLines} />
        </div>

        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
          <p className="mb-3 text-sm font-medium text-fg">Active now ({deliveries.length})</p>
          {!riders ? (
            <SkeletonRow />
          ) : deliveries.length === 0 ? (
            <EmptyState icon={PackageSearch} title="Nothing active" description="No deliveries are currently in progress." />
          ) : (
            <div className="flex flex-col gap-2">
              {deliveries.map((d) => {
                const rider = riders.find((r) => r.id === d.riderId);
                return (
                  <div key={d.id} className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-surface-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-fg">{rider?.name ?? "Unassigned"}</p>
                      <p className="text-[10px] text-fg-faint">{DELIVERY_STATUS_LABELS[d.status as DeliveryStatus] ?? d.status}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
