"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { SeoHeatmapPoint } from "@/lib/seo-heatmap-api";

function rankColor(rank: number | null): string {
  if (rank == null) return "#9aa1a9";
  if (rank <= 3) return "#2f9e57";
  if (rank <= 10) return "#d99a1f";
  return "#d64545";
}

/**
 * SEO Heatmap real-map fix — a genuine interactive Leaflet map (pan/zoom/real OpenStreetMap tiles),
 * replacing the earlier relative-position grid. Markers use `L.circleMarker` (no image assets), one
 * per real scanned lat/lng point, colored by the real rank captured there; the business's own
 * location is plotted as the map's center marker.
 */
export function SeoHeatmapMap({ points }: { points: SeoHeatmapPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || points.length === 0) return;

    const map = L.map(containerRef.current, { scrollWheelZoom: false });
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [30, 30] });

    for (const point of points) {
      const marker = L.circleMarker([point.lat, point.lng], {
        radius: 12,
        color: "#fff",
        weight: 2,
        fillColor: rankColor(point.rank),
        fillOpacity: 0.9,
      }).addTo(map);
      marker.bindTooltip(point.rank != null ? `#${point.rank}` : "Not found", { permanent: true, direction: "center", className: "seo-heatmap-tooltip" });
      marker.bindPopup(point.rank != null ? `Rank #${point.rank} at this location` : "Not found in local results here");
    }

    const center = bounds.getCenter();
    L.circleMarker(center, { radius: 5, color: "#1c231e", weight: 2, fillColor: "#1c231e", fillOpacity: 1 })
      .addTo(map)
      .bindTooltip("Your business", { direction: "top" });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [points]);

  return (
    <>
      <style>{`
        .seo-heatmap-tooltip {
          background: transparent;
          border: none;
          box-shadow: none;
          font-size: 10px;
          font-weight: 600;
          color: #fff;
          text-shadow: 0 1px 2px rgba(0,0,0,0.6);
        }
        .seo-heatmap-tooltip::before { display: none; }
      `}</style>
      <div ref={containerRef} className="h-96 w-full rounded-[var(--radius-sm)]" />
    </>
  );
}
