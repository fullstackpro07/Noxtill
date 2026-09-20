"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ModuleTabs } from "@/components/layout/module-tabs";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { AiAssistantDrawerProvider } from "@/components/assistant/ai-assistant-drawer-context";
import { AiAssistantDrawer } from "@/components/assistant/ai-assistant-drawer";
import { AiAssistantModal } from "@/components/assistant/ai-assistant-modal";
import { AI } from "@/components/assistant/ai-assistant-ui";

const TITLE_BY_PATH: { prefix: string; title: string; subtitle: string }[] = [
  { prefix: "/assistant/chat", title: "Business Assistant", subtitle: "Ask a question — answered only from your connected data." },
  { prefix: "/assistant/help", title: "Help Assistant", subtitle: "Answers drawn from Noxtill documentation only" },
  { prefix: "/assistant/voice", title: "Voice Assistant", subtitle: "Speak a command — nothing is written until you confirm" },
  { prefix: "/assistant/history", title: "Chat History", subtitle: "Search and reopen previous conversations" },
  { prefix: "/assistant/settings", title: "AI Settings", subtitle: "Control what the assistant can access and do" },
];

function AssistantHeaderContent() {
  const pathname = usePathname();
  const match = TITLE_BY_PATH.find((s) => pathname.startsWith(s.prefix)) ?? TITLE_BY_PATH[0];

  useModuleHeader({
    title: match.title,
    subtitle: match.subtitle,
    actions: (
      <Link href="/assistant/chat" style={{ display: "flex", alignItems: "center", gap: 7, background: AI.primary, borderRadius: 10, padding: "10px 16px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 }}>
        <Plus size={16} />
        New conversation
      </Link>
    ),
  });

  return null;
}

export default function AssistantLayout({ children }: { children: ReactNode }) {
  return (
    <AiAssistantDrawerProvider>
      <div className="flex min-h-full flex-col">
        <AssistantHeaderContent />
        <ModuleTabs moduleKey="ai-assistant" />
        <div className="flex-1" style={{ background: AI.bg }}>
          {children}
        </div>
        <AiAssistantDrawer />
        <AiAssistantModal />
      </div>
    </AiAssistantDrawerProvider>
  );
}
