"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { AiSettingsView } from "@/components/assistant/ai-settings-view";
import { useSession } from "@/lib/session";

export default function AiSettingsPage() {
  const session = useSession();
  return (
    <SubscreenShell title="AI Settings" description="Per-feature usage, cost cap, and rate limit — owner only.">
      <AiSettingsView currency={session.business.currency} />
    </SubscreenShell>
  );
}
