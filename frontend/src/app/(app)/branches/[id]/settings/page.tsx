"use client";

import { use } from "react";
import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { BranchSettingsView } from "@/components/branches/branch-settings-view";

export default function BranchSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <SubscreenShell title="Branch Settings" description="Per-branch overrides — hours, tax, payment methods, and branding.">
      <BranchSettingsView branchId={id} />
    </SubscreenShell>
  );
}
