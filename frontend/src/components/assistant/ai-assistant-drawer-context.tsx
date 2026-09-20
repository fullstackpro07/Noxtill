"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { AssistantToolCall, ExtractedAttachment, HistoryKind } from "@/lib/assistant-api";
import type { HelpArticle } from "@/lib/help-api";

export type AiDrawerState =
  | { mode: "sources"; question: string; toolCalls: AssistantToolCall[]; helpSources: { title: string; url: string }[] }
  | { mode: "report"; question: string; answer: string; toolCalls: AssistantToolCall[]; helpSources: { title: string; url: string }[]; askedAt: string }
  | { mode: "convo"; kind: HistoryKind; id: string }
  | { mode: "disclosure" }
  | { mode: "article"; article: HelpArticle }
  | { mode: "file"; attachment: ExtractedAttachment }
  | null;

export type AiModalState = { mode: "deleteHistory"; kind: HistoryKind; id: string; title: string } | { mode: "limits" } | { mode: "shortcut" } | null;

interface AiAssistantDrawerContextValue {
  drawer: AiDrawerState;
  modal: AiModalState;
  openSources: (question: string, toolCalls: AssistantToolCall[], helpSources: { title: string; url: string }[]) => void;
  openReport: (question: string, answer: string, toolCalls: AssistantToolCall[], helpSources: { title: string; url: string }[], askedAt: string) => void;
  openHistoryEntry: (kind: HistoryKind, id: string) => void;
  openDisclosure: () => void;
  openArticle: (article: HelpArticle) => void;
  openFile: (attachment: ExtractedAttachment) => void;
  openDeleteHistoryEntry: (kind: HistoryKind, id: string, title: string) => void;
  openLimits: () => void;
  openShortcutEditor: () => void;
  close: () => void;
}

const AiAssistantDrawerContext = createContext<AiAssistantDrawerContextValue | null>(null);

export function AiAssistantDrawerProvider({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState<AiDrawerState>(null);
  const [modal, setModal] = useState<AiModalState>(null);

  const value = useMemo<AiAssistantDrawerContextValue>(
    () => ({
      drawer,
      modal,
      openSources: (question, toolCalls, helpSources) => setDrawer({ mode: "sources", question, toolCalls, helpSources }),
      openReport: (question, answer, toolCalls, helpSources, askedAt) => setDrawer({ mode: "report", question, answer, toolCalls, helpSources, askedAt }),
      openHistoryEntry: (kind, id) => setDrawer({ mode: "convo", kind, id }),
      openDisclosure: () => setDrawer({ mode: "disclosure" }),
      openArticle: (article) => setDrawer({ mode: "article", article }),
      openFile: (attachment) => setDrawer({ mode: "file", attachment }),
      openDeleteHistoryEntry: (kind, id, title) => setModal({ mode: "deleteHistory", kind, id, title }),
      openLimits: () => setModal({ mode: "limits" }),
      openShortcutEditor: () => setModal({ mode: "shortcut" }),
      close: () => {
        setDrawer(null);
        setModal(null);
      },
    }),
    [drawer, modal],
  );

  return <AiAssistantDrawerContext.Provider value={value}>{children}</AiAssistantDrawerContext.Provider>;
}

export function useAiAssistantDrawer(): AiAssistantDrawerContextValue {
  const ctx = useContext(AiAssistantDrawerContext);
  if (!ctx) throw new Error("useAiAssistantDrawer must be used within AiAssistantDrawerProvider");
  return ctx;
}
