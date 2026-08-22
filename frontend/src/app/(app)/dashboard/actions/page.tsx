"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { ActionCenter } from "@/components/dashboard/action-center";

export default function DashboardActionsPage() {
  return (
    <SubscreenShell title="Action Center">
      <ActionCenter />
    </SubscreenShell>
  );
}
