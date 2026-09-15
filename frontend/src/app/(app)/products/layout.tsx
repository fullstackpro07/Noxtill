import type { ReactNode } from "react";
import { ModuleTabs } from "@/components/layout/module-tabs";

export default function ProductsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <ModuleTabs moduleKey="products" />
      <div className="flex-1">{children}</div>
    </div>
  );
}
