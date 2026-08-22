"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { ShiftClosingView } from "@/components/pos/shift-closing-view";

export default function SalesShiftClosingPage() {
  return (
    <SubscreenShell title="Shift Closing">
      <ShiftClosingView />
    </SubscreenShell>
  );
}
