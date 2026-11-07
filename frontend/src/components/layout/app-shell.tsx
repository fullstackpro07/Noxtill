"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { ModuleHeaderProvider } from "./module-header-context";
import { OfflineBanner } from "@/components/shared/offline-banner";
import { DeepSearchOverlay } from "@/components/search/deep-search-overlay";
import { AssistantPanel } from "@/components/assistant/assistant-panel";
import { AssistantTriggerButton } from "@/components/assistant/assistant-trigger-button";
import { useSession } from "@/lib/session";
import { UiPreferencesApplier } from "./ui-preferences-applier";
import { AskDialogHost } from "@/components/shared/ask-dialog-host";
import { ModuleGate, useDisabledModules } from "./module-gate";

export function AppShell({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const assistantOff = useDisabledModules().has("ai-assistant");

  return (
    <div className="nx-app flex h-dvh w-full overflow-hidden bg-[var(--app-bg)]">
      <Sidebar
        role={session.user.role}
        businessName={session.business.name}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBanner />
        <ModuleHeaderProvider>
          <Topbar session={session} onMenuClick={() => setMobileNavOpen(true)} />
          <main className="flex-1 overflow-y-auto">
            <ModuleGate>{children}</ModuleGate>
          </main>
        </ModuleHeaderProvider>
      </div>
      <UiPreferencesApplier />
      <AskDialogHost />
      <DeepSearchOverlay />
      {!assistantOff && <AssistantPanel />}
      {!assistantOff && <AssistantTriggerButton />}
      {/* Portal target for dashboard drawers/dialogs that use `var(--app-*)` tokens — those tokens
          are scoped to `.nx-app`, so anything portaled straight to `document.body` (outside this
          div) would silently fail to resolve them. See `portal-root.tsx`. */}
      <div id="nx-portal-root" />
    </div>
  );
}
