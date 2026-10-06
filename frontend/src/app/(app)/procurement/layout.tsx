"use client";

import { ModuleTabs } from "@/components/layout/module-tabs";

export default function ProcurementLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <ModuleTabs moduleKey="procurement" />
      <div className="flex-1">{children}</div>
    </div>
  );
}
