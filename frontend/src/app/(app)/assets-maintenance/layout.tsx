import { Suspense, type ReactNode } from "react";
import { AssetsShell } from "@/components/assets/am-shell";

export default function AssetsMaintenanceLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <AssetsShell>{children}</AssetsShell>
    </Suspense>
  );
}
