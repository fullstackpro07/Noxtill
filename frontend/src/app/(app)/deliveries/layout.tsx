import type { ReactNode } from "react";
import { ModuleTabs } from "@/components/layout/module-tabs";

export default function DeliveriesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <ModuleTabs moduleKey="deliveries" />
      <div className="flex-1">{children}</div>
    </div>
  );
}
