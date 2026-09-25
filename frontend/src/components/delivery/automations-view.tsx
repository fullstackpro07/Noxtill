"use client";

import { useQuery } from "@tanstack/react-query";
import { KpiGrid, PanelCard, NoteBanner, LoadingBlock } from "./delivery-ui";
import { OwnerGate } from "./owner-gate";
import { useDeliverySettingMutation } from "./use-delivery-setting";
import { fetchAutomationsSummary } from "@/lib/delivery-insights-api";

export function AutomationsView() {
  return (
    <OwnerGate title="Automations are owner-only">
      <AutomationsBody />
    </OwnerGate>
  );
}

function AutomationsBody() {
  const { data, isLoading } = useQuery({ queryKey: ["delivery-automations"], queryFn: fetchAutomationsSummary, refetchInterval: 30000 });
  const save = useDeliverySettingMutation("Rule updated.");
  if (isLoading || !data) return <LoadingBlock label="Loading automations…" />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <NoteBanner text="These rules only ever send messages or raise alerts. None of them assigns a rider, cancels a delivery or refunds anyone. Anything that changes what a person is doing waits for you." />
      <KpiGrid kpis={data.kpis} minWidth={180} />
      {data.panels.map((p, i) => (
        <PanelCard
          key={i}
          panel={{
            ...p,
            items: p.items.map((it) => ({
              ...it,
              onToggle: it.settingKey ? () => save.mutate({ [it.settingKey as string]: !it.toggleOn }) : undefined,
            })),
          }}
        />
      ))}
    </div>
  );
}
