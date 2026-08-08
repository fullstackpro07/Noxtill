"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { X, Sparkles, Send } from "lucide-react";
import { useAssistantStore } from "@/store/assistant-store";
import { QUICK_CHIPS, type DeepLink } from "@/lib/assistant";
import { streamAssistantChat, type AssistantToolCall } from "@/lib/assistant-api";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  fullText: string;
  displayedText: string;
  streaming: boolean;
  isError?: boolean;
  deepLinks?: DeepLink[];
  sources?: string[];
}

const TOOL_DEEP_LINKS: Record<string, DeepLink> = {
  get_revenue_today: { label: "View dashboard", href: "/dashboard" },
  get_orders_today: { label: "View orders", href: "/orders" },
  get_revenue_this_month: { label: "View P&L", href: "/profit" },
  get_low_stock_count: { label: "View inventory", href: "/inventory" },
  get_credit_outstanding: { label: "View credit", href: "/credit" },
  get_upcoming_appointments: { label: "Open calendar", href: "/bookings" },
  get_todays_bookings: { label: "Open calendar", href: "/bookings" },
  get_no_show_rate: { label: "Open calendar", href: "/bookings" },
  get_reviews_average: { label: "View reviews", href: "/reviews" },
  get_open_complaints: { label: "View reviews", href: "/reviews" },
  get_campaign_performance: { label: "View marketing", href: "/marketing" },
  get_staff_leaderboard: { label: "View staff", href: "/staff" },
  get_message_quota_usage: { label: "View settings", href: "/settings" },
  get_new_customers_this_month: { label: "View customers", href: "/customers" },
  find_customer_by_phone: { label: "View customers", href: "/customers" },
  get_order_by_number: { label: "View orders", href: "/orders" },
};

/** Derives deep-link chips + help-doc source labels from the real tool trace — the backend's `toolCalls[]` carries no suggested link itself. */
function deriveLinksAndSources(toolCalls: AssistantToolCall[]): { deepLinks: DeepLink[]; sources: string[] } {
  const deepLinks: DeepLink[] = [];
  const sources: string[] = [];
  const seenLinks = new Set<string>();

  for (const call of toolCalls) {
    if (call.name === "search_help_docs") {
      const output = call.output as { found?: boolean; passages?: { title: string }[] } | undefined;
      if (output?.found && output.passages) {
        for (const p of output.passages) {
          if (!sources.includes(p.title)) sources.push(p.title);
        }
      }
      continue;
    }
    const link = TOOL_DEEP_LINKS[call.name];
    if (link && !seenLinks.has(link.href)) {
      seenLinks.add(link.href);
      deepLinks.push(link);
    }
  }

  return { deepLinks, sources };
}

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
  const abortRef = useRef<AbortController | null>(null);

  function close() {
    abortRef.current?.abort();
    setOpen(false);
  }

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

    const controller = new AbortController();
    abortRef.current = controller;

    await streamAssistantChat(
      question,
      {
        onDelta: (text) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, fullText: m.fullText + text, displayedText: m.displayedText + text } : m)),
          );
        },
        onDone: (result) => {
          const { deepLinks, sources } = deriveLinksAndSources(result.toolCalls);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, streaming: false, fullText: result.text, displayedText: result.text, deepLinks, sources } : m,
            ),
          );
        },
        onError: (message) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, streaming: false, isError: true, fullText: message, displayedText: message } : m)),
          );
        },
      },
      controller.signal,
    );

    abortRef.current = null;
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
      <button aria-label="Close assistant" onClick={close} className="absolute inset-0 bg-[#1c231e]/45 sm:hidden" />
      <div className="animate-sheet-in relative flex h-full w-full max-w-sm flex-col border-s border-border bg-surface shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between border-b border-border px-4 py-3.5">
          <p className="flex items-center gap-2 font-display text-base font-semibold text-fg">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            Assistant
          </p>
          <button
            onClick={close}
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
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : m.isError
                          ? "bg-destructive/8 text-destructive"
                          : "bg-surface-2 text-fg",
                    )}
                  >
                    {m.streaming && m.displayedText === "" ? <TypingDots /> : <p className="whitespace-pre-wrap">{m.displayedText}</p>}
                    {!m.streaming && m.sources && m.sources.length > 0 && (
                      <p className="mt-2 text-xs text-fg-faint">Source: {m.sources.join(", ")}</p>
                    )}
                    {!m.streaming && m.deepLinks && m.deepLinks.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {m.deepLinks.map((link) => (
                          <Link
                            key={link.href}
                            href={link.href}
                            onClick={close}
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
