import { useAuthStore } from "@/store/auth-store";
import { useBranchContextStore } from "@/store/branch-context-store";
import { refreshAccessToken, BASE_URL } from "@/lib/api-client";

export interface SseEvent {
  /** The backend's `MessageEvent.type` (e.g. an `ActivityEventType`) — null for an unnamed/default event. */
  type: string | null;
  data: string;
  id?: string;
}

/**
 * Real SSE consumption over `fetch` + a streamed response body, not the native `EventSource` API —
 * `EventSource` cannot attach an `Authorization` header (or the app's `X-Branch` header), and every
 * SSE route in this backend requires both, same as any other authenticated endpoint. This
 * reimplements the pieces `EventSource` would normally give for free: framing (`field: value` lines
 * separated by a blank line), and auto-reconnect with backoff on a dropped connection.
 *
 * `onEvent` fires for every parsed frame; the caller distinguishes event types via `event.type`.
 * Reconnection carries a fresh access token each attempt, so a token refreshed by an unrelated
 * `apiFetch` call mid-session is picked up automatically on the next reconnect.
 */
export function subscribeSse(
  path: string,
  handlers: { onEvent: (event: SseEvent) => void; onStatusChange?: (status: "connecting" | "open" | "closed") => void },
  signal: AbortSignal,
): void {
  void runLoop(path, handlers, signal);
}

const RECONNECT_DELAY_MS = 3000;

async function runLoop(
  path: string,
  handlers: { onEvent: (event: SseEvent) => void; onStatusChange?: (status: "connecting" | "open" | "closed") => void },
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    handlers.onStatusChange?.("connecting");
    try {
      await connectOnce(path, handlers, signal);
    } catch {
      // Falls through to the reconnect delay below — a dropped/failed connection is expected
      // over a long-lived session (sleep, network change, server restart), not an error to surface.
    }
    handlers.onStatusChange?.("closed");
    if (signal.aborted) return;
    await sleep(RECONNECT_DELAY_MS, signal);
  }
}

async function connectOnce(
  path: string,
  handlers: { onEvent: (event: SseEvent) => void; onStatusChange?: (status: "connecting" | "open" | "closed") => void },
  signal: AbortSignal,
): Promise<void> {
  const { accessToken } = useAuthStore.getState();
  const headers = new Headers({ Accept: "text/event-stream" });
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const selectedBranchId = useBranchContextStore.getState().selectedBranchId;
  if (selectedBranchId) headers.set("X-Branch", selectedBranchId);

  let res = await fetch(`${BASE_URL}${path}`, { headers, signal });

  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) return; // session truly expired — apiFetch's own 401 handling (elsewhere) redirects to /login
    const retryHeaders = new Headers(headers);
    retryHeaders.set("Authorization", `Bearer ${useAuthStore.getState().accessToken}`);
    res = await fetch(`${BASE_URL}${path}`, { headers: retryHeaders, signal });
  }

  if (!res.ok || !res.body) {
    throw new Error(`SSE connect failed: ${res.status}`);
  }

  handlers.onStatusChange?.("open");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });

      let frameEnd = buffer.indexOf("\n\n");
      while (frameEnd !== -1) {
        const frame = buffer.slice(0, frameEnd);
        buffer = buffer.slice(frameEnd + 2);
        const event = parseFrame(frame);
        if (event) handlers.onEvent(event);
        frameEnd = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseFrame(frame: string): SseEvent | null {
  let type: string | null = null;
  let id: string | undefined;
  const dataLines: string[] = [];

  for (const rawLine of frame.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (!line || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") type = value;
    else if (field === "data") dataLines.push(value);
    else if (field === "id") id = value;
  }

  if (dataLines.length === 0) return null;
  return { type, data: dataLines.join("\n"), id };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
