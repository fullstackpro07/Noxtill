"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { KpiGrid, DeliveryTableCard, StatusChip, LoadingBlock, type TableColumn } from "./delivery-ui";
import { fetchRiders, updateRider, type RiderRosterRow, VEHICLE_TYPE_LABELS } from "@/lib/riders-api";
import { fetchDeliverySettings } from "@/lib/delivery-settings-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const STATUS_CHIP: Record<string, { bg: string; fg: string }> = {
  "On delivery": { bg: "#EEF4FF", fg: "#3538CD" },
  Available: { bg: "#E8F7EE", fg: "#0E8442" },
  "On break": { bg: "#FEF6E7", fg: "#B54708" },
  "No signal": { bg: "#FEF3F2", fg: "#B42318" },
  Offline: { bg: "#F2F4F7", fg: "#475467" },
};

function money(n: number): string {
  return `Rs. ${Math.round(n).toLocaleString("en-US")}`;
}

export function RidersView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["delivery-riders"], queryFn: fetchRiders, refetchInterval: 30000 });
  const { data: settings } = useQuery({ queryKey: ["delivery-settings"], queryFn: fetchDeliverySettings });

  const deactivateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "active" | "inactive" }) => updateRider(id, { status }),
    onSuccess: () => {
      toast.success("Updated.");
      void queryClient.invalidateQueries({ queryKey: ["delivery-riders"] });
      void queryClient.invalidateQueries({ queryKey: ["delivery-riders-live"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this rider."),
  });

  const kpis = useMemo(() => {
    const rows = data ?? [];
    const onShift = rows.filter((r) => r.status === "active");
    const free = onShift.filter((r) => r.displayStatus === "Available");
    const warnAt = settings?.warnAtStopCount ?? null;
    const atCapacity = warnAt === null ? [] : onShift.filter((r) => r.activeDeliveries >= warnAt);
    const cashTotal = rows.reduce((s, r) => s + r.cashHeld, 0);
    const cashRiders = rows.filter((r) => r.cashHeld > 0).length;
    return [
      { l: "On shift", v: String(onShift.length), sub: `of ${rows.length} riders`, color: "#0F172A", bd: "#E6EAF0" },
      { l: "Free now", v: String(free.length), sub: free[0] ? `${free[0].name}, ${free[0].zoneName ?? "no zone"}` : "nobody free right now", color: free.length > 0 ? "#12A150" : "#0F172A", bd: free.length > 0 ? "#BFE7CF" : "#E6EAF0" },
      { l: "At capacity", v: String(atCapacity.length), sub: atCapacity[0] ? `${atCapacity[0].name}, ${atCapacity[0].activeDeliveries} of ${warnAt} stops` : "nobody at capacity", color: atCapacity.length > 0 ? "#B54708" : "#0F172A", bd: "#E6EAF0" },
      { l: "Cash held", v: money(cashTotal), sub: `across ${cashRiders} riders`, color: cashTotal > 0 ? "#B42318" : "#0F172A", bd: cashTotal > 0 ? "#FDD9D6" : "#E6EAF0" },
    ];
  }, [data, settings]);

  const columns: TableColumn<RiderRosterRow>[] = [
    {
      label: "Rider",
      render: (r) => (
        <span>
          <span style={{ fontWeight: 700, color: "#101828" }}>{r.name}</span>
          <span style={{ display: "block", fontSize: "11px", color: "#98A2B3" }}>{r.phone}</span>
        </span>
      ),
    },
    { label: "Zone", render: (r) => <span style={{ color: "#475467" }}>{[r.zoneName, r.vehicleType ? VEHICLE_TYPE_LABELS[r.vehicleType] : null].filter(Boolean).join(" · ") || "Not set"}</span> },
    {
      label: "Status",
      render: (r) => {
        const c = STATUS_CHIP[r.displayStatus] ?? STATUS_CHIP.Offline;
        return (
          <StatusChip bg={c.bg} fg={c.fg}>
            {r.displayStatus}
          </StatusChip>
        );
      },
    },
    { label: "Stops", align: "right", render: (r) => <span style={{ fontWeight: 700, color: r.activeDeliveries >= (settings?.warnAtStopCount ?? Infinity) ? "#B42318" : "#101828" }}>{r.activeDeliveries}</span> },
    { label: "Done", align: "right", render: (r) => <span style={{ color: "#475467" }}>{r.deliveredToday}</span> },
    { label: "On time", align: "right", render: (r) => <span style={{ fontWeight: 700, color: "#101828" }}>{r.onTimeRateToday !== null ? `${r.onTimeRateToday}%` : "—"}</span> },
    { label: "Cash held", align: "right", render: (r) => <span style={{ color: "#475467" }}>{money(r.cashHeld)}</span> },
    {
      label: "Last seen",
      align: "right",
      render: (r) => (
        <span style={{ fontWeight: r.stale ? 700 : 400, color: r.stale ? "#B42318" : "#98A2B3" }}>
          {r.lastLocationAt ? new Date(r.lastLocationAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "never"}
        </span>
      ),
    },
    {
      label: "",
      align: "right",
      render: (r) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            deactivateMutation.mutate({ id: r.id, status: r.status === "active" ? "inactive" : "active" });
          }}
          disabled={deactivateMutation.isPending}
        >
          {r.status === "active" ? "Deactivate" : "Reactivate"}
        </Button>
      ),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <KpiGrid kpis={kpis} minWidth={180} />
      {isLoading || !data ? (
        <LoadingBlock label="Loading riders…" />
      ) : (
        <DeliveryTableCard
          title="Riders"
          sub="Today"
          columns={columns}
          rows={data.map((r) => ({ ...r, i: r.id }))}
          footer="Cash held is what a rider has collected but not yet handed in. It is not counted as revenue until it reaches the till."
          onRowClick={(r) => router.push(`/deliveries/rider/${r.id}`)}
          emptyTitle="No riders yet"
          emptySub="Add your first delivery rider from the button above."
        />
      )}
    </div>
  );
}
