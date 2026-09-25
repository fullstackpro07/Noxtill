"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { KpiGrid, PanelCard, LoadingBlock, EmptyState } from "./delivery-ui";
import { fetchRider360 } from "@/lib/delivery-insights-api";
import { fetchRiders } from "@/lib/riders-api";
import { RiderActions } from "./delivery-actions";

export function Rider360View({ riderId }: { riderId?: string }) {
  const router = useRouter();
  const { data: riders, isLoading: ridersLoading } = useQuery({ queryKey: ["delivery-riders"], queryFn: fetchRiders });

  const resolvedId = riderId ?? riders?.find((r) => r.status === "active")?.id ?? riders?.[0]?.id;
  const { data, isLoading } = useQuery({
    queryKey: ["delivery-rider360", resolvedId],
    queryFn: () => fetchRider360(resolvedId!),
    enabled: !!resolvedId,
  });

  if (ridersLoading) return <LoadingBlock label="Loading riders…" />;
  if (!resolvedId) return <EmptyState title="No riders yet" sub="Add a rider from the Riders screen to see their performance here." />;
  if (isLoading || !data) return <LoadingBlock label="Loading rider performance…" />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      {riders && riders.length > 1 && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {riders.map((r) => (
            <button
              key={r.id}
              onClick={() => router.push(`/deliveries/rider/${r.id}`)}
              style={{
                border: `1px solid ${r.id === resolvedId ? "#12A150" : "#E6EAF0"}`,
                background: r.id === resolvedId ? "#F7FCF9" : "#fff",
                color: r.id === resolvedId ? "#0E8442" : "#475467",
                borderRadius: "20px",
                padding: "7px 13px",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
      <RiderActions riderId={resolvedId} />
      <KpiGrid kpis={data.kpis} minWidth={180} />
      {data.panels.map((p, i) => (
        <PanelCard key={i} panel={p} />
      ))}
    </div>
  );
}
