"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { TaxReportsView } from "@/components/reports/tax-reports-view";
import { useSession } from "@/lib/session";

export default function TaxReportsPage() {
  const session = useSession();
  return (
    <SubscreenShell title="Tax Reports" description="Taxable sales and tax collected, by period.">
      <TaxReportsView currency={session.business.currency} />
    </SubscreenShell>
  );
}
