"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HUB_KEYS,
  disconnectProvider,
  fetchHubOverview,
  pauseConnection,
  resumeConnection,
  syncConnection,
  type HubProvider,
} from "@/lib/integrations-hub-api";
import { useIntegrations } from "./integrations-store";
import { errorMessage, isConnected, recordsLabel, whenLabel } from "./hub-ui";

export function useHubOverview() {
  return useQuery({ queryKey: HUB_KEYS.overview, queryFn: fetchHubOverview, staleTime: 15_000 });
}

/** One provider's live card, from the shared overview query. */
export function useProviderCard(key: string | null | undefined): HubProvider | undefined {
  const { data } = useHubOverview();
  return key ? data?.providers.find((p) => p.key === key) : undefined;
}

/** Everything that a connection change can affect is re-read, in this module and in the ones that show connection state. */
export function useRefreshHub() {
  const qc = useQueryClient();
  return useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["integrations-hub"] });
    void qc.invalidateQueries({ queryKey: ["integrations"] });
    void qc.invalidateQueries({ queryKey: ["integration-directory"] });
  }, [qc]);
}

/** A short, honest one-liner for whatever a sync returned. */
export function summarizeSync(result: unknown): string {
  if (Array.isArray(result)) {
    if (result.length === 0) return "Nothing to sync.";
    return result
      .map((r) => {
        const x = r as Record<string, unknown>;
        if (typeof x.productsReconciled === "number") {
          return `${String(x.provider)}: ${x.productsReconciled} product(s) reconciled, ${x.ordersImported ?? 0} order(s) imported`;
        }
        return `${String(x.provider ?? "sync")}: ${String(x.status ?? "done")}`;
      })
      .join(" · ");
  }
  const r = (result ?? {}) as Record<string, unknown>;
  if (typeof r.message === "string") return r.message;
  if (typeof r.pushed === "number") return `${r.pushed} posted${r.failed ? `, ${r.failed} failed` : ""}.`;
  if (typeof r.synced === "number") return `${r.synced} of ${r.total ?? r.synced} campaign(s) refreshed.`;
  if (typeof r.retried === "number") return `${r.retried} failed delivery attempt(s) re-queued.`;
  if (typeof r.created === "number") return `${r.created} created · ${r.updated ?? 0} updated · ${r.removed ?? 0} removed${r.failed ? ` · ${r.failed} failed` : ""}.`;
  return "Sync finished.";
}

/**
 * The connection actions shared by the directory cards, the connections table, the drawer and the
 * command bar. Every one hits the real endpoint, asks first when it changes something, and refreshes
 * the module's data afterwards.
 */
export function useHubActions() {
  const router = useRouter();
  const refresh = useRefreshHub();
  const { openPanel, openConfirm, openDrawer, closeOverlays, notify } = useIntegrations();

  const startConnect = useCallback(
    (p: HubProvider) => {
      if (p.connectKind === "developer") {
        closeOverlays();
        router.push("/integrations/developer");
        return;
      }
      if (p.connectKind === "automation") {
        openPanel({ type: "subscribe", provider: p.key });
        return;
      }
      openPanel({ type: "connect", key: p.key });
    },
    [closeOverlays, openPanel, router],
  );

  const syncNow = useCallback(
    (p: HubProvider) => {
      const records = recordsLabel(p);
      openConfirm({
        title: `Run a sync now for ${p.name}?`,
        tone: "amber",
        icon: "refresh-cw",
        body: "This runs a sync outside the normal schedule. Nothing is marked as synced until the provider confirms it, and a failure is recorded with its reason.",
        rows: [
          { label: "Integration", value: p.name },
          { label: "Direction", value: p.direction },
          { label: "Records so far", value: records ?? "Not tracked" },
          { label: "Last successful sync", value: whenLabel(p.lastSuccessAt) },
        ],
        primary: "Start sync",
        cancel: "Cancel",
        onConfirm: async () => {
          try {
            const result = await syncConnection(p.key);
            notify(`Sync finished · ${p.name}`, summarizeSync(result));
          } catch (e) {
            notify(`Sync failed · ${p.name}`, errorMessage(e));
          } finally {
            refresh();
            useIntegrations.setState({ confirm: null });
          }
        },
      });
    },
    [notify, openConfirm, refresh],
  );

  const pause = useCallback(
    (p: HubProvider) => {
      openConfirm({
        title: `Pause ${p.name} sync?`,
        tone: "amber",
        icon: "pause",
        body: "Syncing stops until you resume it. The connection stays authorised and nothing is deleted.",
        rows: [
          { label: "Stops", value: p.modules.join(" · ") },
          { label: "Stays connected", value: "Yes", tone: "pos" },
          { label: "Data already imported", value: "Kept", tone: "pos" },
          { label: "While paused", value: "The two systems can drift apart", tone: "neg" },
        ],
        primary: "Pause sync",
        cancel: "Keep syncing",
        onConfirm: async () => {
          try {
            await pauseConnection(p.key);
            notify(`${p.name} paused`, "Syncing is stopped. Resume it any time.");
          } catch (e) {
            notify("Could not pause", errorMessage(e));
          } finally {
            refresh();
            useIntegrations.setState({ confirm: null });
          }
        },
      });
    },
    [notify, openConfirm, refresh],
  );

  const resume = useCallback(
    async (p: HubProvider) => {
      try {
        await resumeConnection(p.key);
        notify(`${p.name} resumed`, "Syncing is running again.");
      } catch (e) {
        notify("Could not resume", errorMessage(e));
      } finally {
        refresh();
      }
    },
    [notify, refresh],
  );

  const disconnect = useCallback(
    (p: HubProvider) => {
      openConfirm({
        title: `Disconnect ${p.name}?`,
        tone: "red",
        icon: "unplug",
        body: `These ${p.modules.length} part${p.modules.length === 1 ? "" : "s"} of Noxtill stop receiving data from ${p.name} immediately. Data already imported stays exactly as it is — nothing is deleted.`,
        rows: [
          { label: "Stops syncing", value: p.modules.join(" · "), tone: "neg" },
          { label: "Data already imported", value: "Kept · nothing is deleted", tone: "pos" },
          { label: "Reconnecting", value: "Possible · requires authorising again" },
          { label: "Recorded in audit", value: "Yes · with your name" },
        ],
        primary: `Disconnect ${p.name}`,
        cancel: "Keep connected",
        onConfirm: async () => {
          try {
            await disconnectProvider(p);
            notify(`${p.name} disconnected`, "Imported data was kept.");
            openDrawer(p.key);
          } catch (e) {
            notify("Could not disconnect", errorMessage(e));
          } finally {
            refresh();
            useIntegrations.setState({ confirm: null });
          }
        },
      });
    },
    [notify, openConfirm, openDrawer, refresh],
  );

  /** The primary button on a provider: manage when connected, otherwise start connecting. */
  const primary = useCallback(
    (p: HubProvider) => {
      if (isConnected(p)) {
        if (p.status === "paused") return void resume(p);
        if (p.status === "needs_attention") return startConnect(p);
        return openDrawer(p.key);
      }
      return startConnect(p);
    },
    [openDrawer, resume, startConnect],
  );

  return { startConnect, syncNow, pause, resume, disconnect, primary, refresh };
}
