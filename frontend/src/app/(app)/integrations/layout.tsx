import type { ReactNode } from "react";
import { IntegrationsShell } from "@/components/integrations/hub/integrations-shell";

export default function IntegrationsLayout({ children }: { children: ReactNode }) {
  return <IntegrationsShell>{children}</IntegrationsShell>;
}
