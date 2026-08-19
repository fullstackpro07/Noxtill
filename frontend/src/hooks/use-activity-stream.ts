"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeSse } from "@/lib/sse";
import { ACTIVITY_FEED_MAX, type LiveActivityEvent } from "@/lib/activity-api";

export type ActivityStreamStatus = "connecting" | "open" | "closed";

/** Live-tails GET /activity/stream (UPD-BE-002/UPD-FE-002) — real SSE, backfilled with the business's most recent events on connect. */
export function useActivityStream() {
  const [events, setEvents] = useState<LiveActivityEvent[]>([]);
  const [status, setStatus] = useState<ActivityStreamStatus>("connecting");
  const seenIds = useRef(new Set<string>());

  useEffect(() => {
    const controller = new AbortController();

    subscribeSse(
      "/activity/stream",
      {
        onStatusChange: setStatus,
        onEvent: (event) => {
          if (!event.type) return;
          let parsed: LiveActivityEvent;
          try {
            parsed = JSON.parse(event.data) as LiveActivityEvent;
          } catch {
            return; // malformed frame — skip rather than crash the feed
          }
          if (seenIds.current.has(parsed.id)) return; // a reconnect re-plays backfill; never duplicate
          seenIds.current.add(parsed.id);
          setEvents((prev) => [parsed, ...prev].slice(0, ACTIVITY_FEED_MAX));
        },
      },
      controller.signal,
    );

    return () => controller.abort();
  }, []);

  return { events, status };
}
