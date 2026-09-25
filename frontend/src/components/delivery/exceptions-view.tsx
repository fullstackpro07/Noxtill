"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { retryDelivery } from "@/lib/deliveries-api";
import { invalidateDeliveryData } from "./delivery-actions";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { KpiGrid, NoteBanner, DeliveryTableCard, StatusChip, LoadingBlock, type TableColumn } from "./delivery-ui";
import { fetchExceptions } from "@/lib/delivery-insights-api";
import type { InsightRow } from "@/lib/delivery-insights-api";

function buildColumns(retry: (id: string) => void, pending: boolean): TableColumn<InsightRow>[] {
  return [
  { label: "Delivery", render: (r) => <span style={{ fontWeight: 700, color: "#0E8442" }}>{r.cells.id}</span> },
  { label: "Customer", render: (r) => <span style={{ fontWeight: 700, color: "#101828" }}>{r.cells.cust}</span> },
  { label: "What happened", render: (r) => <span style={{ fontWeight: 700, color: "#B42318" }}>{r.cells.what}</span> },
  { label: "Detail", render: (r) => <span style={{ color: "#475467" }}>{r.cells.detail}</span> },
  { label: "Next step", render: (r) => <span style={{ color: "#475467" }}>{r.cells.next}</span> },
  {
    label: "Status",
    render: (r) => (
      <StatusChip bg={r.cells.status === "Open" ? "#FEF3F2" : "#E8F7EE"} fg={r.cells.status === "Open" ? "#B42318" : "#0E8442"}>
        {r.cells.status}
      </StatusChip>
    ),
  },
  {
    label: "Action",
    render: (r) =>
      r.cells.status === "Open" ? (
        <span style={{ display: "flex", gap: "6px" }}>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={(e) => {
              e.stopPropagation();
              retry(r.i);
            }}
          >
            Retry delivery
          </Button>
          <Link href="/orders/returns" onClick={(e) => e.stopPropagation()} style={{ fontSize: "12px", fontWeight: 700, color: "#0E8442", alignSelf: "center" }}>
            Refund
          </Link>
        </span>
      ) : (
        <span style={{ color: "#98A2B3" }}>Resolved</span>
      ),
  },
  ];
}

export function ExceptionsView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const retryMutation = useMutation({
    mutationFn: retryDelivery,
    onSuccess: () => {
      toast.success("Sent back to the dispatch queue.");
      invalidateDeliveryData(queryClient);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't retry this delivery."),
  });
  const { data, isLoading } = useQuery({ queryKey: ["delivery-exceptions"], queryFn: fetchExceptions, refetchInterval: 30000 });
  if (isLoading || !data) return <LoadingBlock label="Loading exceptions…" />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <NoteBanner text="Nothing here resolves itself. A failed delivery stays open until an approved return records what happened to the order, the stock and the money." />
      <KpiGrid kpis={data.kpis} minWidth={180} />
      <DeliveryTableCard
        onRowClick={(r) => router.push(`/deliveries/all?open=${r.i}`)}
        title="Exceptions"
        sub="Anything that did not go to plan"
        columns={buildColumns((id) => retryMutation.mutate(id), retryMutation.isPending)}
        rows={data.rows}
        footer="Every exception keeps the rider's own recorded reason. Nothing is rewritten after the fact."
        emptyTitle="No exceptions"
        emptySub="Every delivery has gone to plan."
      />
    </div>
  );
}
