"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { KpiGrid, NoteBanner, PanelCard, LoadingBlock } from "./delivery-ui";
import { invalidateDeliveryData } from "./delivery-actions";
import { fetchRoutesSummary } from "@/lib/delivery-insights-api";
import { createRoute, optimiseRoute } from "@/lib/delivery-routes-api";
import { assignDelivery, fetchDeliveries } from "@/lib/deliveries-api";
import { fetchRiders } from "@/lib/riders-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function AssignmentRoutesView() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["delivery-routes-summary"], queryFn: fetchRoutesSummary, refetchInterval: 30000 });
  const { data: deliveries } = useQuery({ queryKey: ["deliveries", "all"], queryFn: () => fetchDeliveries() });
  const { data: riders } = useQuery({ queryKey: ["delivery-riders"], queryFn: fetchRiders });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [riderId, setRiderId] = useState("");

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["delivery-routes-summary"] });
    invalidateDeliveryData(queryClient);
  };

  const optimiseMutation = useMutation({
    mutationFn: optimiseRoute,
    onSuccess: () => {
      toast.success("Route re-optimised.");
      refresh();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't optimise this route."),
  });

  const buildMutation = useMutation({
    mutationFn: async () => {
      const ids = [...selected];
      const rows = (deliveries ?? []).filter((d) => selected.has(d.id));
      // A route belongs to one rider, so any stop that has no rider yet is given to that rider first.
      for (const d of rows.filter((x) => x.riderId !== riderId)) {
        await assignDelivery(d.id, riderId);
      }
      const route = await createRoute(ids, riderId);
      return optimiseRoute(route.id).catch(() => route);
    },
    onSuccess: () => {
      toast.success("Route built and optimised.");
      setSelected(new Set());
      refresh();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't build this route."),
  });

  const candidates = (deliveries ?? []).filter((d) => !d.routeId && (d.status === "unassigned" || d.status === "assigned"));
  const activeRiders = (riders ?? []).filter((r) => r.status === "active");

  if (isLoading || !data) return <LoadingBlock label="Loading routes…" />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <NoteBanner text="A suggested route is only ever a suggestion. Riders know their roads, and any rider can reorder their own stops without asking." />
      <KpiGrid kpis={data.kpis} minWidth={180} />

      <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: "16px", padding: "17px" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: "14.5px", fontWeight: 800, color: "#101828" }}>Build a route</h3>
        <p style={{ margin: "0 0 13px", fontSize: "11.5px", color: "#98A2B3" }}>Pick the stops and a rider. Stops without that rider are given to them, then ordered nearest-first from where they are.</p>
        {candidates.length === 0 ? (
          <div style={{ fontSize: "12.5px", color: "#98A2B3" }}>Every open delivery is already on a route.</div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "260px", overflowY: "auto" }}>
              {candidates.map((d) => (
                <label key={d.id} style={{ border: "1px solid #E6EAF0", borderRadius: "11px", padding: "10px 12px", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={selected.has(d.id)}
                    onChange={() => {
                      const next = new Set(selected);
                      if (next.has(d.id)) next.delete(d.id);
                      else next.add(d.id);
                      setSelected(next);
                    }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#0E8442" }}>DEL-{d.order?.orderNo}</span>
                    <span style={{ fontSize: "12px", color: "#344054", marginLeft: "8px" }}>{d.order?.customer?.name ?? "Walk-in customer"}</span>
                    <span style={{ display: "block", fontSize: "11px", color: "#98A2B3" }}>
                      {d.addressLine}
                      {d.lat === null ? " · no coordinates, will stay where it is in the order" : ""}
                    </span>
                  </span>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: d.rider ? "#475467" : "#B42318" }}>{d.rider?.name ?? "Not assigned"}</span>
                </label>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "10px", marginTop: "12px", flexWrap: "wrap" }}>
              <Select label="Rider for this route" value={riderId} onChange={(e) => setRiderId(e.target.value)}>
                <option value="">Choose a rider…</option>
                {activeRiders.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {r.displayStatus} · {r.activeDeliveries} active
                  </option>
                ))}
              </Select>
              <Button onClick={() => buildMutation.mutate()} disabled={selected.size === 0 || !riderId || buildMutation.isPending}>
                {buildMutation.isPending ? "Building…" : `Build route (${selected.size} stop${selected.size === 1 ? "" : "s"})`}
              </Button>
            </div>
          </>
        )}
      </div>

      {data.panels.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: "16px", padding: "44px 18px", textAlign: "center" }}>
          <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#344054" }}>No routes built today</div>
          <div style={{ fontSize: "12px", color: "#98A2B3", marginTop: "5px" }}>Build one above from open deliveries.</div>
        </div>
      ) : (
        data.panels.map((p) => (
          <div key={p.routeId} style={{ position: "relative" }}>
            <PanelCard panel={p} />
            <div style={{ position: "absolute", top: "17px", right: "17px" }}>
              <Button size="sm" variant="outline" disabled={optimiseMutation.isPending} onClick={() => optimiseMutation.mutate(p.routeId)}>
                {optimiseMutation.isPending ? "Optimising…" : "Re-optimise"}
              </Button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
