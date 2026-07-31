"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { X, Sparkles, Send } from "lucide-react";
import { useAssistantStore } from "@/store/assistant-store";
import { QUICK_CHIPS, getAssistantAnswer, type DeepLink } from "@/lib/assistant";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  fullText: string;
  displayedText: string;
  streaming: boolean;
  deepLinks?: DeepLink[];
}

const THINKING_DELAY_MS = 700;
const WORD_INTERVAL_MS = 35;

function TypingDots() {
  return (
    <span className="flex items-center gap-1 py-1">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fg-faint" style={{ animationDelay: "0ms" }} />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fg-faint" style={{ animationDelay: "150ms" }} />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-fg-faint" style={{ animationDelay: "300ms" }} />
    </span>
  );
}

export function AssistantPanel() {
  const open = useAssistantStore((s) => s.open);
  const setOpen = useAssistantStore((s) => s.setOpen);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const nextId = useRef(0);

  if (!open) return null;

  async function respondTo(question: string) {
    const userMessage: ChatMessage = {
      id: `u-${nextId.current++}`,
      role: "user",
      fullText: question,
      displayedText: question,
      streaming: false,
    };
    const assistantId = `a-${nextId.current++}`;
    setMessages((prev) => [...prev, userMessage, { id: assistantId, role: "assistant", fullText: "", displayedText: "", streaming: true }]);
    setBusy(true);

    const answer = getAssistantAnswer(question);
    await new Promise((r) => setTimeout(r, THINKING_DELAY_MS));

    const words = answer.text.split(" ");
    for (let i = 0; i < words.length; i++) {
      await new Promise((r) => setTimeout(r, WORD_INTERVAL_MS));
      const partial = words.slice(0, i + 1).join(" ");
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, fullText: answer.text, displayedText: partial } : m)));
    }

    setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, streaming: false, deepLinks: answer.deepLinks } : m)));
    setBusy(false);
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    setInput("");
    void respondTo(question);
  }

  function handleQuickChip(chip: string) {
    if (busy) return;
    void respondTo(chip);
  }

  return (
    <div className="fixed inset-0 z-[150] flex justify-end sm:items-stretch">
      <button aria-label="Close assistant" onClick={() => setOpen(false)} className="absolute inset-0 bg-[#1c231e]/45 sm:hidden" />
      <div className="animate-sheet-in relative flex h-full w-full max-w-sm flex-col border-s border-border bg-surface shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
          <p className="flex items-center gap-2 font-display text-base font-semibold text-fg">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            Assistant
          </p>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-fg-faint hover:bg-surface-2"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <Sparkles className="h-6 w-6 text-fg-faint" aria-hidden />
              <p className="text-sm text-fg-faint">
                Ask about your business — I&apos;ll only answer from your real data, or say when I can&apos;t.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {messages.map((m) => (
                <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-[var(--radius-noxtill)] px-3.5 py-2.5 text-sm",
                      m.role === "user" ? "bg-primary text-primary-foreground" : "bg-surface-2 text-fg",
                    )}
                  >
                    {m.streaming && m.displayedText === "" ? <TypingDots /> : <p className="whitespace-pre-wrap">{m.displayedText}</p>}
                    {!m.streaming && m.deepLinks && m.deepLinks.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {m.deepLinks.map((link) => (
                          <Link
                            key={link.href}
                            href={link.href}
                            onClick={() => setOpen(false)}
                            className="rounded-full border border-primary/30 bg-primary/8 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/15"
                          >
                            {link.label} →
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border p-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {QUICK_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => handleQuickChip(chip)}
                disabled={busy}
                className="rounded-full border border-border-strong px-2.5 py-1 text-xs text-fg-muted hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40"
              >
                {chip}
              </button>
            ))}
          </div>
          <form onSubmit={handleSend} className="flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question…"
              disabled={busy}
              className="h-10 flex-1 rounded-full border border-border-strong bg-surface px-4 text-sm text-fg focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
            >
              <Send className="h-4 w-4" aria-hidden />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
