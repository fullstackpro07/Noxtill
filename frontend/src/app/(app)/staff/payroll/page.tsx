"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { PayrollView } from "@/components/staff/payroll-view";

export default function StaffPayrollPage() {
  return (
    <SubscreenShell title="Payroll Export" description="A real payroll workbook — hours, commission, and advances netted automatically.">
      <PayrollView />
    </SubscreenShell>
  );
}
