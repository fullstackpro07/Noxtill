import type { ReactNode } from "react";
import { SeoAutopilotTabs } from "@/components/marketing/seo-autopilot-tabs";

export default function SeoAutopilotLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SeoAutopilotTabs />
      {children}
    </>
  );
}
