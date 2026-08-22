"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { SuppliersPanel } from "@/components/products/suppliers-panel";
import { useSession } from "@/lib/session";

export default function ProductsSuppliersPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Suppliers">
      <SuppliersPanel currency={session.business.currency} />
    </SubscreenShell>
  );
}
