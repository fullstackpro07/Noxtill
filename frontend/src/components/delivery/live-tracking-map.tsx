"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LiveDelivery } from "@/hooks/use-delivery-stream";
import { DELIVERY_STATUS_LABELS, type DeliveryStatus } from "@/lib/deliveries-api";

const STATUS_COLOR: Record<string, string> = {
  assigned: "#3b7dd8",
  picked_up: "#d99a1f",
  en_route: "#2f9e57",
};

export interface RouteLine {
  routeId: string;
  color: string;
  points: { lat: number; lng: number }[];
}

/**
 * Live Tracking (UPD-FE-055) — a real interactive Leaflet map (same real OpenStreetMap tile setup
 * as the SEO Heatmap map), plotting real rider positions (`Rider.lastLat/lastLng`, live-updated via
 * SSE) and real active-delivery locations, colored by real status. Route lines connect a route's
 * real deliveries in their real `routeSequence` order — not a fabricated path.
 */
export function LiveTrackingMap({
  deliveries,
  riderPositions,
  routeLines,
}: {
  deliveries: LiveDelivery[];
  riderPositions: { riderId: string; name: string; lat: number; lng: number }[];
  routeLines: RouteLine[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView([0, 0], 2);
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const layer = L.layerGroup().addTo(map);
    const allPoints: [number, number][] = [];

    for (const rider of riderPositions) {
      allPoints.push([rider.lat, rider.lng]);
      L.marker([rider.lat, rider.lng], {
        icon: L.divIcon({ className: "", html: `<div style="background:#1c231e;color:#fff;border-radius:9999px;padding:3px 8px;font-size:11px;font-weight:600;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.4)">🏍 ${rider.name}</div>`, iconSize: [0, 0] }),
      }).addTo(layer);
    }

    for (const delivery of deliveries) {
      if (delivery.lat == null || delivery.lng == null) continue;
      allPoints.push([delivery.lat, delivery.lng]);
      L.circleMarker([delivery.lat, delivery.lng], {
        radius: 8,
        color: "#fff",
        weight: 2,
        fillColor: STATUS_COLOR[delivery.status] ?? "#9aa1a9",
        fillOpacity: 0.9,
      })
        .addTo(layer)
        .bindPopup(DELIVERY_STATUS_LABELS[delivery.status as DeliveryStatus] ?? delivery.status);
    }

    for (const route of routeLines) {
      if (route.points.length < 2) continue;
      L.polyline(route.points.map((p) => [p.lat, p.lng]), { color: route.color, weight: 3, opacity: 0.7 }).addTo(layer);
      for (const p of route.points) allPoints.push([p.lat, p.lng]);
    }

    if (allPoints.length > 0) {
      map.fitBounds(L.latLngBounds(allPoints), { padding: [40, 40], maxZoom: 15 });
    }

    return () => {
      layer.remove();
    };
  }, [deliveries, riderPositions, routeLines]);

  return <div ref={containerRef} className="h-[480px] w-full rounded-[var(--radius-sm)]" />;
}
