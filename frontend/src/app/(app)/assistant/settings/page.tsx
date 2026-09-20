"use client";

import { AiSettingsView } from "@/components/assistant/ai-settings-view";
import { useSession } from "@/lib/session";

export default function AiSettingsPage() {
  const session = useSession();
  return <AiSettingsView currency={session.business.currency} />;
}
