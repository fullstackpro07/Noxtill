"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { MemoryNotesView } from "@/components/customers/memory-notes-view";

export default function MemoryNotesPage() {
  return (
    <SubscreenShell title="Memory Notes" description="Real, persistent notes tied to a customer, supplier, product, or table.">
      <MemoryNotesView />
    </SubscreenShell>
  );
}
