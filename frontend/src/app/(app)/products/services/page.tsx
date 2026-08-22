"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { ServicesPanel } from "@/components/products/services-panel";
import { useSession } from "@/lib/session";

export default function ProductsServicesPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Services">
      <ServicesPanel currency={session.business.currency} />
    </SubscreenShell>
  );
}
