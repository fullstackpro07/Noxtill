"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { CreditRemindersPanel } from "@/components/credit/credit-reminders-panel";

export default function CreditRemindersPage() {
  return (
    <SubscreenShell title="Reminders & Recovery">
      <CreditRemindersPanel />
    </SubscreenShell>
  );
}
