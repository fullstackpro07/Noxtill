"use client";

import { ModuleTabs } from "@/components/layout/module-tabs";

export default function WebsiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <ModuleTabs moduleKey="website" />
      <div className="flex-1">{children}</div>
    </div>
  );
}
