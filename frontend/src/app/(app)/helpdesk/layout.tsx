import { Suspense, type ReactNode } from "react";
import { HelpdeskShell } from "@/components/helpdesk/hd-shell";

export default function HelpdeskLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <HelpdeskShell>{children}</HelpdeskShell>
    </Suspense>
  );
}
