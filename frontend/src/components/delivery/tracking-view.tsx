"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { KpiGrid, NoteBanner, DeliveryTableCard, StatusChip, LoadingBlock, type TableColumn } from "./delivery-ui";
import { fetchTracking } from "@/lib/delivery-insights-api";
import type { InsightRow } from "@/lib/delivery-insights-api";

const AGAINST_STYLES: Record<string, { bg: string; fg: string }> = {
  "On time": { bg: "#E8F7EE", fg: "#0E8442" },
  Unknown: { bg: "#F2F4F7", fg: "#475467" },
  Late: { bg: "#FEF3F2", fg: "#B42318" },
};

const COLUMNS: TableColumn<InsightRow>[] = [
  { label: "Delivery", render: (r) => <span style={{ fontWeight: 700, color: "#0E8442" }}>{r.cells.id}</span> },
  { label: "Customer", render: (r) => <span style={{ fontWeight: 700, color: "#101828" }}>{r.cells.cust}</span> },
  { label: "Rider", render: (r) => <span style={{ color: "#475467" }}>{r.cells.rider}</span> },
  {
    label: "Against promise",
    render: (r) => {
      const style = AGAINST_STYLES[r.cells.against] ?? AGAINST_STYLES.Unknown;
      return (
        <StatusChip bg={style.bg} fg={style.fg}>
          {r.cells.against}
        </StatusChip>
      );
    },
  },
  { label: "Customer told", render: (r) => <span style={{ color: "#98A2B3" }}>{r.cells.told}</span> },
  { label: "Why", render: (r) => <span style={{ color: "#475467" }}>{r.cells.why}</span> },
];

export function TrackingView() {
  const router = useRouter();
  const { data, isLoading } = useQuery({ queryKey: ["delivery-tracking"], queryFn: fetchTracking, refetchInterval: 20000 });
  if (isLoading || !data) return <LoadingBlock label="Loading live tracking…" />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <NoteBanner text="Against promise compares each delivery's recorded promised time with the current time. Where a rider's phone has gone quiet it says unknown rather than guess. Customer told shows the real status of the message that was sent." />
      <KpiGrid kpis={data.kpis} minWidth={180} />
      <DeliveryTableCard
        onRowClick={(r) => router.push(`/deliveries/all?open=${r.i}`)}
        title="Live tracking"
        sub="What each customer would currently see"
        columns={COLUMNS}
        rows={data.rows}
        footer="Against-promise is computed live from the real promised time and each rider's real GPS staleness."
        emptyTitle="Nothing is out for delivery"
        emptySub="No delivery is currently assigned, picked up or en route."
      />
    </div>
  );
}
