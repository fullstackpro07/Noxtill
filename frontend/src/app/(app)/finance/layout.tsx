import { Suspense, type ReactNode } from "react";
import { FinanceShell } from "@/components/finance/fin-shell";

export default function FinanceLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <FinanceShell>{children}</FinanceShell>
    </Suspense>
  );
}
