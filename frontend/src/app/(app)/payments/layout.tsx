import { Suspense, type ReactNode } from "react";
import { PaymentsShell } from "@/components/payments/pay-shell";

export default function PaymentsLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <PaymentsShell>{children}</PaymentsShell>
    </Suspense>
  );
}
