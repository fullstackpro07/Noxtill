"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { CashRegisterView } from "@/components/pos/cash-register-view";

export default function SalesCashRegisterPage() {
  return (
    <SubscreenShell title="Cash Register">
      <CashRegisterView />
    </SubscreenShell>
  );
}
