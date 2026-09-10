"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeSse } from "@/lib/sse";

export type DeliveryStreamStatus = "connecting" | "open" | "closed";

interface DeliveryPayload {
  kind: "delivery_snapshot" | "delivery_update";
  id: string;
  status: string;
  riderId: string | null;
  lat: number | null;
  lng: number | null;
}

interface RiderLocationPayload {
  kind: "rider_location";
  riderId: string;
  lat: number;
  lng: number;
  at: string;
}

export interface LiveDelivery {
  id: string;
  status: string;
  riderId: string | null;
  lat: number | null;
  lng: number | null;
}

export interface LiveRiderLocation {
  riderId: string;
  lat: number;
  lng: number;
  at: string;
}

/** Live-tails GET /deliveries/live (UPD-BE-065/UPD-FE-055) — real SSE, backfilled with the business's currently-active deliveries on connect. */
export function useDeliveryStream() {
  const [deliveries, setDeliveries] = useState<Map<string, LiveDelivery>>(new Map());
  const [riderLocations, setRiderLocations] = useState<Map<string, LiveRiderLocation>>(new Map());
  const [status, setStatus] = useState<DeliveryStreamStatus>("connecting");
  const seenSnapshot = useRef(false);

  useEffect(() => {
    const controller = new AbortController();

    subscribeSse(
      "/deliveries/live",
      {
        onStatusChange: setStatus,
        onEvent: (event) => {
          if (!event.type) return;
          let parsed: DeliveryPayload | RiderLocationPayload;
          try {
            parsed = JSON.parse(event.data) as DeliveryPayload | RiderLocationPayload;
          } catch {
            return;
          }

          if (parsed.kind === "rider_location") {
            setRiderLocations((prev) => {
              const next = new Map(prev);
              next.set(parsed.riderId, { riderId: parsed.riderId, lat: parsed.lat, lng: parsed.lng, at: parsed.at });
              return next;
            });
            return;
          }

          // A reconnect re-plays a fresh snapshot — clear stale rows from the previous connection first.
          if (parsed.kind === "delivery_snapshot" && !seenSnapshot.current) {
            seenSnapshot.current = true;
            setDeliveries(new Map());
          }
          setDeliveries((prev) => {
            const next = new Map(prev);
            if (parsed.status === "delivered" || parsed.status === "failed" || parsed.status === "unassigned") {
              next.delete(parsed.id);
            } else {
              next.set(parsed.id, { id: parsed.id, status: parsed.status, riderId: parsed.riderId, lat: parsed.lat, lng: parsed.lng });
            }
            return next;
          });
        },
      },
      controller.signal,
    );

    return () => controller.abort();
  }, []);

  return { deliveries: [...deliveries.values()], riderLocations: [...riderLocations.values()], status };
}
