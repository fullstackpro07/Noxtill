"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { OfflineBanner } from "@/components/shared/offline-banner";
import { DeepSearchOverlay } from "@/components/search/deep-search-overlay";
import { useMockSession } from "@/lib/mock-session";

export function AppShell({ children }: { children: React.ReactNode }) {
  const session = useMockSession();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-bg">
      <Sidebar
        role={session.user.role}
        businessName={session.business.name}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBanner />
        <Topbar session={session} onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
      <DeepSearchOverlay />
    </div>
  );
}
