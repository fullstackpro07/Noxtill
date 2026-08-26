"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { RolesView } from "@/components/staff/roles-view";

export default function StaffRolesPage() {
  return (
    <SubscreenShell title="Roles & Permissions" description="Real system roles plus custom roles built from the actual capability set.">
      <RolesView />
    </SubscreenShell>
  );
}
