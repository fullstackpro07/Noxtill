"use client";

import { useQuery } from "@tanstack/react-query";
import { KpiGrid, PanelCard, NoteBanner, LoadingBlock } from "./delivery-ui";
import { fetchAnalytics } from "@/lib/delivery-insights-api";

export function AnalyticsView() {
  const { data, isLoading } = useQuery({ queryKey: ["delivery-analytics"], queryFn: fetchAnalytics, refetchInterval: 60000 });
  if (isLoading || !data) return <LoadingBlock label="Loading analytics…" />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <KpiGrid kpis={data.kpis} minWidth={180} />
      <PanelCard
        panel={{
          h: "Where the time goes",
          sub: "Averaged across delivered orders in the last 30 days",
          bd: "#E6EAF0",
          items: data.stageBreakdown.map((s) => ({ t: s.t, d: s.d, v: s.v, vColor: s.vColor })),
        }}
      />
      {data.panels.map((p, i) => (
        <PanelCard key={i} panel={p} />
      ))}
      {data.note && <NoteBanner text={data.note} bg="#FEF6E7" bd="#FDE3B3" fg="#93370D" />}
    </div>
  );
}
