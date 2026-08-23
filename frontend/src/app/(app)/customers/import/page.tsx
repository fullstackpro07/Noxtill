"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { ImportCustomersPanel } from "@/components/customers/import-customers-panel";
import { useSession } from "@/lib/session";

export default function CustomerImportPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Import Customers">
      <ImportCustomersPanel currency={session.business.currency} />
    </SubscreenShell>
  );
}
