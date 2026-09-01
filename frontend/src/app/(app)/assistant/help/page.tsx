"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { HelpAssistantView } from "@/components/assistant/help-assistant-view";

export default function HelpAssistantPage() {
  return (
    <SubscreenShell title="Help Assistant" description="Ask how anything in Noxtill works — answered strictly from the real help docs.">
      <HelpAssistantView />
    </SubscreenShell>
  );
}
