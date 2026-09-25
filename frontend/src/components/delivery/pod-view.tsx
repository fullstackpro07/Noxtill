"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { KpiGrid, DeliveryTableCard, StatusChip, LoadingBlock, type TableColumn } from "./delivery-ui";
import { fetchPod } from "@/lib/delivery-insights-api";
import type { InsightRow } from "@/lib/delivery-insights-api";

const COLUMNS: TableColumn<InsightRow>[] = [
  { label: "Delivery", render: (r) => <span style={{ fontWeight: 700, color: "#0E8442" }}>{r.cells.id}</span> },
  { label: "Customer", render: (r) => <span style={{ fontWeight: 700, color: "#101828" }}>{r.cells.cust}</span> },
  { label: "Proof", render: (r) => <span style={{ color: r.cells.proof === "None recorded" ? "#B42318" : "#475467" }}>{r.cells.proof}</span> },
  { label: "Rider", render: (r) => <span style={{ color: "#475467" }}>{r.cells.rider}</span> },
  { label: "Time", render: (r) => <span style={{ color: "#475467" }}>{r.cells.time}</span> },
  {
    label: "Status",
    render: (r) => (
      <StatusChip bg={r.cells.status === "Captured" ? "#E8F7EE" : "#FEF3F2"} fg={r.cells.status === "Captured" ? "#0E8442" : "#B42318"}>
        {r.cells.status}
      </StatusChip>
    ),
  },
];

export function PodView() {
  const router = useRouter();
  const { data, isLoading } = useQuery({ queryKey: ["delivery-pod"], queryFn: fetchPod, refetchInterval: 30000 });
  if (isLoading || !data) return <LoadingBlock label="Loading proof of delivery…" />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <KpiGrid kpis={data.kpis} minWidth={180} />
      <DeliveryTableCard
        onRowClick={(r) => router.push(`/deliveries/all?open=${r.i}`)}
        title="Proof of delivery"
        sub="Today"
        columns={COLUMNS}
        rows={data.rows}
        footer="A delivery can be marked complete without proof, but it is flagged here so a dispute isn't the first time you find out."
        emptyTitle="Nothing delivered yet today"
      />
    </div>
  );
}
