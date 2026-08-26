"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { AutomationsPanel } from "@/components/marketing/automations-panel";

export default function MarketingAutomationsPage() {
  return (
    <SubscreenShell title="Automations">
      <AutomationsPanel />
    </SubscreenShell>
  );
}
