import { Suspense, type ReactNode } from "react";
import { ContractsShell } from "@/components/contracts/ct-shell";

export default function ContractsLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <ContractsShell>{children}</ContractsShell>
    </Suspense>
  );
}
