import type { ReactNode } from "react";
import { HubShell } from "@/components/settings-hub/hub-shell";

export default function SettingsHubLayout({ children }: { children: ReactNode }) {
  return <HubShell>{children}</HubShell>;
}
