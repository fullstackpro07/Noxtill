"use client";

import { SubscreenShell } from "@/components/layout/subscreen-shell";
import { ChatHistoryView } from "@/components/assistant/chat-history-view";

export default function ChatHistoryPage() {
  return (
    <SubscreenShell title="Chat History" description="Every real conversation with the Assistant, kept and searchable.">
      <ChatHistoryView />
    </SubscreenShell>
  );
}
