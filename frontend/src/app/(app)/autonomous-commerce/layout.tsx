"use client";

import { type ReactNode } from "react";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { ModuleTabs } from "@/components/layout/module-tabs";

function CommerceHeader() {
  useModuleHeader({
    title: "Autonomous Commerce",
    subtitle: "Research, validate and operate commerce work from canonical Noxtill records.",
  });
  return null;
}

export default function AutonomousCommerceLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-full flex-col"><CommerceHeader /><ModuleTabs moduleKey="autonomous-commerce" /><div className="flex-1">{children}</div></div>;
}
