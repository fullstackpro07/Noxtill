"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Send, X } from "lucide-react";
import { sendMarketingChatMessage, type ChatTurn } from "@/lib/marketing/chat-api";

const ROBOT_IMAGE = "/marketing/ai-assistant-robot-cutout-1.png";

const GREETING = "Hi, I'm the Noxtill assistant. Ask me anything about the product, pricing or features — I'll do my best to help.";

const SUGGESTIONS = ["What does Noxtill cost?", "What AI features do you have?", "How does the Nightly Close work?"];

interface DisplayMessage extends ChatTurn {
  id: string;
  pending?: boolean;
}

function newId() {
  return Math.random().toString(36).slice(2);
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([{ id: "greeting", role: "assistant", content: GREETING }]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, sending]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const history: ChatTurn[] = messages.filter((m) => m.id !== "greeting").map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [...prev, { id: newId(), role: "user", content: trimmed }]);
    setInput("");
    setSending(true);

    try {
      const reply = await sendMarketingChatMessage(trimmed, history);
      setMessages((prev) => [...prev, { id: newId(), role: "assistant", content: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          content: "Sorry, that didn't go through. You can book a quick demo at /book-a-demo or try again in a moment.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
  }

  const showSuggestions = messages.length === 1;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end sm:bottom-7 sm:right-7">
      {open ? (
        <div className="mb-3 flex h-[min(560px,calc(100vh-140px))] w-[min(380px,calc(100vw-40px))] flex-col overflow-hidden rounded-[20px] border border-border bg-white shadow-[0_30px_70px_-24px_rgba(13,21,18,0.35)]">
          <div className="flex flex-none items-center justify-between gap-3 bg-surface-deep px-4.5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-9 w-9 flex-none items-center justify-center overflow-hidden rounded-full bg-white/15">
                <Image src={ROBOT_IMAGE} alt="" fill sizes="36px" className="object-cover object-top" />
              </span>
              <div>
                <div className="font-display text-[14.5px] font-semibold text-fg-on-deep">Noxtill AI Assistant</div>
                <div className="text-[11.5px] text-fg-on-deep-muted">Replies in a seconds</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-fg-on-deep-muted hover:bg-white/10 hover:text-fg-on-deep"
            >
              <X className="h-[18px] w-[18px]" aria-hidden />
            </button>
          </div>

          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="flex flex-col gap-3">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
                      m.role === "user"
                        ? "rounded-br-sm bg-primary text-primary-foreground"
                        : "rounded-bl-sm border border-border bg-surface-2 text-fg"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {sending ? (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-border bg-surface-2 px-3.5 py-3">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-fg-faint [animation-delay:-0.2s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-fg-faint [animation-delay:-0.1s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-fg-faint" />
                  </div>
                </div>
              ) : null}
            </div>

            {showSuggestions ? (
              <div className="mt-4 flex flex-col gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-full border border-border-strong px-3.5 py-2 text-left text-[12.5px] text-fg-muted transition-colors hover:border-primary hover:text-primary"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-none items-center gap-2 border-t border-border p-3">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about pricing, features…"
              maxLength={800}
              disabled={sending}
              className="h-10 flex-1 rounded-full border border-border-strong bg-surface-2 px-4 text-[13.5px] text-fg placeholder:text-fg-faint focus:border-primary focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              aria-label="Send message"
              className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" aria-hidden />
            </button>
          </form>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close chat" : "Open chat"}
        className="relative h-14 w-14 transition-transform hover:scale-105 sm:h-[84px] sm:w-[84px]"
      >
        <Image
          src={ROBOT_IMAGE}
          alt="Noxtill AI Assistant"
          fill
          sizes="(min-width: 640px) 84px, 56px"
          priority
          className="object-contain drop-shadow-[0_14px_28px_rgba(13,21,18,0.35)]"
        />
      </button>
    </div>
  );
}
