import type { ReactNode } from "react";
import { ModuleTabs } from "@/components/layout/module-tabs";

export default function ListingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <ModuleTabs moduleKey="listings" />
      <div className="flex-1">{children}</div>
    </div>
  );
}
