"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { VoiceAssistantView } from "@/components/assistant/voice-assistant-view";

export default function VoiceAssistantPage() {
  return (
    <SubscreenShell title="Voice Assistant" description="Hands-free actions — hold to speak, review, and confirm before anything is written.">
      <VoiceAssistantView />
    </SubscreenShell>
  );
}
