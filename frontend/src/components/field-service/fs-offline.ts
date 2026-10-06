"use client";

import { create } from "zustand";
import { apiFetch } from "@/lib/api-client";

/**
 * Technician offline queue. Offline-safe actions (status taps, checklist answers, notes, signature,
 * completion) made without a connection are kept on this device with an idempotency key and sent
 * when the connection returns. The server stores each key, so a replay never acts twice.
 */
export type QItem = { id: string; key: string; label: string; wo: string; path: string; body: Record<string, unknown>; at: number; st: "Pending Sync" | "Syncing" | "Synced" | "Failed"; err?: string };

const K = "noxtill-fs-offline-queue";
const load = (): QItem[] => {
  try {
    const v = typeof window !== "undefined" ? window.localStorage.getItem(K) : null;
    return v ? (JSON.parse(v) as QItem[]) : [];
  } catch {
    return [];
  }
};
const save = (L: QItem[]) => {
  try {
    window.localStorage.setItem(K, JSON.stringify(L.slice(-100)));
  } catch {
    /* storage blocked — the queue lives for this page only */
  }
};

export const useFsQueue = create<{ items: QItem[]; online: boolean; set: (items: QItem[]) => void; setOnline: (v: boolean) => void }>((set) => ({
  items: [],
  online: true,
  set: (items) => {
    save(items);
    set({ items });
  },
  setOnline: (online) => set({ online }),
}));

export const queueInit = () => useFsQueue.getState().set(load());

const isNet = (e: unknown) => e instanceof TypeError || (typeof navigator !== "undefined" && !navigator.onLine);
export const newKey = (what: string) => `dev_${what}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * Send now, or queue on this device when offline and `offlineOk`. Returns the server result, or
 * null when queued.
 */
export async function sendOrQueue<T>(label: string, wo: string, path: string, body: Record<string, unknown>, offlineOk: boolean): Promise<T | null> {
  const withKey = { ...body, key: (body.key as string) ?? newKey(label.replace(/\W/g, "")) };
  const queue = () => {
    const q = useFsQueue.getState();
    q.set([...q.items, { id: withKey.key as string, key: withKey.key as string, label, wo, path, body: withKey, at: Date.now(), st: "Pending Sync" }]);
    return null;
  };
  if (offlineOk && typeof navigator !== "undefined" && !navigator.onLine) return queue();
  try {
    return await apiFetch<T>(path, { method: "POST", body: JSON.stringify(withKey) });
  } catch (e) {
    if (offlineOk && isNet(e)) return queue();
    throw e;
  }
}

/** Replay queued actions in order with their original keys. */
export async function syncQueue(): Promise<{ synced: number; failed: number }> {
  const q = useFsQueue.getState();
  const todo = q.items.filter((x) => x.st === "Pending Sync" || x.st === "Failed");
  let synced = 0;
  let failed = 0;
  for (const it of todo) {
    useFsQueue.getState().set(useFsQueue.getState().items.map((x) => (x.id === it.id ? { ...x, st: "Syncing", err: undefined } : x)));
    try {
      await apiFetch(it.path, { method: "POST", body: JSON.stringify(it.body) });
      synced++;
      useFsQueue.getState().set(useFsQueue.getState().items.map((x) => (x.id === it.id ? { ...x, st: "Synced" } : x)));
    } catch (e) {
      if (isNet(e)) {
        useFsQueue.getState().set(useFsQueue.getState().items.map((x) => (x.id === it.id ? { ...x, st: "Pending Sync" } : x)));
        break;
      }
      failed++;
      useFsQueue.getState().set(useFsQueue.getState().items.map((x) => (x.id === it.id ? { ...x, st: "Failed", err: (e as Error).message } : x)));
    }
  }
  return { synced, failed };
}

export const clearSynced = () => {
  const q = useFsQueue.getState();
  q.set(q.items.filter((x) => x.st !== "Synced"));
};
