"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { SegmentsPanel } from "@/components/customers/segments-panel";

export default function CustomerSegmentsPage() {
  return (
    <SubscreenShell title="Segments">
      <SegmentsPanel />
    </SubscreenShell>
  );
}
