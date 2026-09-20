"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, CheckCircle2, Copy, FileDown, RotateCcw, ThumbsDown, ThumbsUp, Mic, Send, Receipt, Wallet, AlertTriangle, TrendingUp, Package, Calendar, Users, Paperclip, FileText, Plus, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { streamAssistantChat, fetchAssistantConversation, extractAssistantAttachment, type AssistantToolCall, type AssistantConversationDetail, type ExtractedAttachment } from "@/lib/assistant-api";
import { loadCustomShortcuts, onCustomShortcutsChanged, type CustomShortcut } from "@/lib/chat-shortcuts";
import { useAiAssistantDrawer } from "@/components/assistant/ai-assistant-drawer-context";
import { AI } from "@/components/assistant/ai-assistant-ui";
import { formatCurrency, formatNumber, formatPercent, formatTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

interface DeepLink {
  label: string;
  href: string;
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
  get_expenses_this_month: { label: "View expenses", href: "/expenses" },
  get_top_products_month: { label: "View product profitability", href: "/profit/product-profitability" },
  get_top_customers: { label: "View customers", href: "/customers" },
  get_bookings_on_date: { label: "Open calendar", href: "/bookings" },
  get_low_stock_products: { label: "View inventory", href: "/inventory" },
  get_top_debtors: { label: "View credit", href: "/credit" },
};

const SHORTCUTS: { l: string; q: string; icon: LucideIcon; color: string }[] = [
  { l: "Today's sales", q: "How much did we sell today?", icon: Receipt, color: "#12A150" },
  { l: "Who owes me?", q: "Who owes us money?", icon: Wallet, color: "#B42318" },
  { l: "Low stock", q: "Which products are low in stock?", icon: AlertTriangle, color: "#B54708" },
  { l: "This month's profit", q: "What is this month's profit?", icon: TrendingUp, color: "#0E8442" },
  { l: "Top products", q: "Which products sold best?", icon: Package, color: "#3538CD" },
  { l: "Tomorrow's bookings", q: "How are bookings looking tomorrow?", icon: Calendar, color: "#7E22CE" },
  { l: "Best customers", q: "Show my top customers.", icon: Users, color: "#0D9488" },
];

const THINKING_STEPS = ["Understanding your question", "Checking what you can access", "Reading connected data", "Preparing the answer"];

/** Field-name heuristic for whether a raw tool-output number reads better as money or a plain
 * count — the widget resolvers this reuses return flat objects like `{revenue, count}` or
 * `{grossProfit}`, never a currency flag, so this is inferred from the key rather than fabricated. */
const MONEY_KEY_PATTERN = /revenue|profit|total|cost|spend|balance|amount|value|price|outstanding|expense|sales/i;
/** e.g. `no_show_rate_month`'s `rate` or `message_quota_usage`'s `percent` — both already
 * 0-100 scaled by the widget resolver, so this only needs the "%" appended, never divided. */
const PERCENT_KEY_PATTERN = /rate|percent|pct|ratio/i;

function humanizeKey(key: string): string {
  const spaced = key.replace(/([A-Z])/g, " $1").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

interface Kpi {
  label: string;
  value: string;
}

/** Pulls real numeric fields straight off the tool call outputs already returned for this answer
 * — no fabricated trend arrows or comparisons, since the backend doesn't compute those. Caps at 4
 * to match the design's KPI grid without overflowing it. */
function extractKpis(toolCalls: AssistantToolCall[], currency: string): Kpi[] {
  const kpis: Kpi[] = [];
  for (const call of toolCalls) {
    if (call.name === "search_help_docs") continue;
    const output = call.output;
    if (!output || typeof output !== "object" || Array.isArray(output)) continue;
    for (const [key, value] of Object.entries(output as Record<string, unknown>)) {
      if (typeof value !== "number") continue;
      const label = humanizeKey(key);
      const formatted = MONEY_KEY_PATTERN.test(key)
        ? formatCurrency(value, currency)
        : PERCENT_KEY_PATTERN.test(key)
          ? formatPercent(value)
          : formatNumber(value);
      kpis.push({ label, value: formatted });
      if (kpis.length >= 4) return kpis;
    }
  }
  return kpis;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  streaming: boolean;
  isError?: boolean;
  toolCalls: AssistantToolCall[];
  deepLinks: DeepLink[];
  helpSources: { title: string; url: string }[];
  completedAt?: string;
}

function deriveLinksAndSources(toolCalls: AssistantToolCall[]): { deepLinks: DeepLink[]; helpSources: { title: string; url: string }[] } {
  const deepLinks: DeepLink[] = [];
  const helpSources: { title: string; url: string }[] = [];
  const seenLinks = new Set<string>();
  for (const call of toolCalls) {
    if (call.name === "search_help_docs") {
      const output = call.output as { found?: boolean; passages?: { title: string; url: string }[] } | undefined;
      if (output?.found && output.passages) {
        for (const p of output.passages) {
          if (!helpSources.some((s) => s.url === p.url)) helpSources.push(p);
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
  return { deepLinks, helpSources };
}

/** Tool names are `snake_case` verbs (`get_revenue_today`) — reformatted for the "Based on"
 * source chip, same convention the sources drawer already uses. */
function humanizeToolName(name: string): string {
  const words = name.replace(/^get_|^find_|^search_/, "").split("_");
  if (words.length === 0 || !words[0]) return name;
  return words.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");
}

function sourceLabelFor(toolCalls: AssistantToolCall[], helpSources: { title: string; url: string }[]): string {
  const dataTools = toolCalls.filter((t) => t.name !== "search_help_docs");
  if (dataTools.length > 0) return dataTools.map((t) => humanizeToolName(t.name)).join(" + ");
  if (helpSources.length > 0) return "Noxtill help documentation";
  return "general knowledge — no live data was read";
}

function ThinkingSteps({ step }: { step: number }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 16, padding: 15, display: "flex", flexDirection: "column", gap: 9 }}>
      {THINKING_STEPS.map((label, i) => {
        const done = step > i;
        const active = step === i;
        const color = done ? "#0E8442" : active ? "#101828" : "#98A2B3";
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 9 }}>
            {done ? (
              <CheckCircle2 size={14} color="#0E8442" strokeWidth={2.4} />
            ) : active ? (
              <span className="animate-spin" style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid #12A150", borderTopColor: "transparent" }} />
            ) : (
              <span style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${AI.border}` }} />
            )}
            <span style={{ fontSize: 12.5, fontWeight: 600, color }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function BusinessChatView() {
  const searchParams = useSearchParams();
  const initialConversationId = searchParams.get("conversationId");

  const { data: loadedConversation, isPending } = useQuery({
    queryKey: ["assistant-conversation", initialConversationId],
    queryFn: () => fetchAssistantConversation(initialConversationId!),
    enabled: Boolean(initialConversationId),
  });

  if (initialConversationId && isPending) {
    return <div style={{ padding: 40, textAlign: "center", fontSize: 12.5, color: AI.textFaint }}>Loading conversation…</div>;
  }

  // Keyed by conversation id so switching to a different `?conversationId=` (or starting fresh)
  // mounts a new instance with its initial state read straight from props — no effect needed to
  // sync a fetched conversation into local state after the fact.
  return <ChatSession key={loadedConversation?.id ?? "new"} initial={loadedConversation ?? null} />;
}

/** Turns a real attachment extraction into readable text prepended to the outgoing chat message —
 * `/assistant/chat` has no file field, so this is how the model genuinely receives what was read
 * from a PDF, Word doc, text file or photo via `POST /assistant/attachments`. */
function summarizeAttachmentForChat(attachment: ExtractedAttachment): string {
  const note = attachment.truncated ? " (only the first part of this file is shown; it was too long to read in full)" : "";
  return `I've attached a file (${attachment.filename})${note}. Here is what was read from it:\n${attachment.text}\n\nMy question:`;
}

function ChatSession({ initial }: { initial: AssistantConversationDetail | null }) {
  const { openSources, openReport, openFile, openShortcutEditor } = useAiAssistantDrawer();
  const session = useSession();

  const [conversationId, setConversationId] = useState<string | undefined>(initial?.id);
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    initial
      ? initial.messages.map((m) => {
          const toolCalls = m.toolCalls ?? [];
          const { deepLinks, helpSources } = deriveLinksAndSources(toolCalls);
          return { id: m.id, role: m.role, text: m.content, streaming: false, toolCalls, deepLinks, helpSources, completedAt: m.createdAt };
        })
      : [],
  );
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [ratings, setRatings] = useState<Record<string, "up" | "down">>({});
  const [attachment, setAttachment] = useState<ExtractedAttachment | null>(null);
  const [thinkingStep, setThinkingStep] = useState(0);
  const [customShortcuts, setCustomShortcuts] = useState<CustomShortcut[]>(() => loadCustomShortcuts());
  const nextId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const thinkingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => onCustomShortcutsChanged(() => setCustomShortcuts(loadCustomShortcuts())), []);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => extractAssistantAttachment(file),
    onSuccess: (result) => {
      setAttachment(result);
      toast.success("File attached — read for analysis only, nothing was written into your data.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't read that file — please try again."),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => () => {
    if (thinkingTimer.current) clearTimeout(thinkingTimer.current);
  }, []);

  /** Purely decorative pacing for the "thinking" checklist — same idea as the reference design's
   * own client-side timed animation (it has no real per-step backend signal either). Stops the
   * moment real streamed text starts arriving. */
  function advanceThinking(step: number) {
    thinkingTimer.current = setTimeout(() => {
      if (step >= THINKING_STEPS.length - 1) return;
      setThinkingStep(step + 1);
      advanceThinking(step + 1);
    }, step === 0 ? 220 : 320);
  }

  async function respondTo(displayText: string, sendText: string) {
    const userMessage: ChatMessage = { id: `u-${nextId.current++}`, role: "user", text: displayText, streaming: false, toolCalls: [], deepLinks: [], helpSources: [] };
    const assistantId = `a-${nextId.current++}`;
    setMessages((prev) => [...prev, userMessage, { id: assistantId, role: "assistant", text: "", streaming: true, toolCalls: [], deepLinks: [], helpSources: [] }]);
    setBusy(true);
    setThinkingStep(0);
    advanceThinking(0);

    const controller = new AbortController();
    abortRef.current = controller;
    let firstDelta = true;

    await streamAssistantChat(
      sendText,
      {
        onDelta: (text) => {
          if (firstDelta) {
            firstDelta = false;
            if (thinkingTimer.current) clearTimeout(thinkingTimer.current);
          }
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, text: m.text + text } : m)));
        },
        onDone: (result) => {
          if (thinkingTimer.current) clearTimeout(thinkingTimer.current);
          const { deepLinks, helpSources } = deriveLinksAndSources(result.toolCalls);
          setConversationId(result.conversationId);
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, streaming: false, text: result.text, toolCalls: result.toolCalls, deepLinks, helpSources, completedAt: new Date().toISOString() } : m)));
        },
        onError: (message) => {
          if (thinkingTimer.current) clearTimeout(thinkingTimer.current);
          setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, streaming: false, isError: true, text: message } : m)));
        },
      },
      controller.signal,
      conversationId,
    );

    abortRef.current = null;
    setBusy(false);
  }

  function ask(q: string) {
    if (!q.trim() || busy) return;
    const sendText = attachment ? `${summarizeAttachmentForChat(attachment)} ${q}` : q;
    void respondTo(q, sendText);
  }

  function send() {
    const q = draft.trim();
    if (!q) return;
    setDraft("");
    ask(q);
  }

  function attachFile() {
    fileInputRef.current?.click();
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    uploadMutation.mutate(file);
  }

  function newConversation() {
    abortRef.current?.abort();
    setConversationId(undefined);
    setMessages([]);
    setRatings({});
    setAttachment(null);
  }

  function regenerate(userQuestion: string) {
    if (busy) return;
    void respondTo(userQuestion, userQuestion);
  }

  function rate(id: string, value: "up" | "down") {
    setRatings((prev) => ({ ...prev, [id]: prev[id] === value ? undefined : value }) as Record<string, "up" | "down">);
  }

  function followUpsFor(askedText: string): { l: string; q: string }[] {
    return SHORTCUTS.filter((s) => s.q !== askedText).slice(0, 3);
  }

  return (
    <main style={{ padding: "16px 22px 26px", display: "flex", flexDirection: "column", gap: 15, height: "100%" }}>
      {messages.length === 0 ? (
        <div style={{ background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 16, padding: "34px 22px" }}>
          <div style={{ maxWidth: 620, margin: "0 auto", textAlign: "center" }}>
            <span style={{ width: 52, height: 52, borderRadius: 15, background: "#E8F7EE", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
              <Bot size={26} color="#0E8442" />
            </span>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: "#0F172A", letterSpacing: "-.4px" }}>Ask your first business question</h2>
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "#667085", lineHeight: 1.6 }}>Every answer comes from your connected Noxtill data, with the sources shown. If the data isn&apos;t there, the assistant says so rather than guessing.</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 20 }}>
            {SHORTCUTS.map((c) => (
              <button key={c.q} type="button" onClick={() => ask(c.q)} style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${AI.border}`, background: "#fff", borderRadius: 20, padding: "9px 14px", fontSize: 12, fontWeight: 600, color: "#344054", cursor: "pointer", minHeight: 42 }}>
                <c.icon size={13} color={c.color} />
                {c.l}
              </button>
            ))}
            {customShortcuts.map((c) => (
              <button key={c.id} type="button" onClick={() => ask(c.question)} style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${AI.border}`, background: "#fff", borderRadius: 20, padding: "9px 14px", fontSize: 12, fontWeight: 600, color: "#344054", cursor: "pointer", minHeight: 42 }}>
                <Bot size={13} color="#3538CD" />
                {c.label}
              </button>
            ))}
            <button type="button" onClick={openShortcutEditor} style={{ display: "flex", alignItems: "center", gap: 7, border: "1px dashed #C6CFD8", background: "#fff", borderRadius: 20, padding: "9px 14px", fontSize: 12, fontWeight: 700, color: "#0E8442", cursor: "pointer", minHeight: 42 }}>
              <Plus size={13} />
              Add custom shortcut
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 13, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3" }}>Conversation context</span>
            <button type="button" onClick={newConversation} style={{ marginLeft: "auto", border: `1px solid ${AI.border}`, background: "#fff", borderRadius: 10, padding: "8px 13px", fontSize: 11.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 40 }}>
              Clear context
            </button>
          </div>

          {messages.map((m) => {
            const rating = ratings[m.id];
            if (m.role === "user") {
              return (
                <div key={m.id} style={{ display: "flex", justifyContent: "flex-end" }}>
                  <div style={{ maxWidth: "78%", background: AI.navy, color: "#fff", borderRadius: 16, borderBottomRightRadius: 5, padding: "12px 15px", fontSize: 13, lineHeight: 1.55 }}>{m.text}</div>
                </div>
              );
            }

            if (m.streaming && m.text === "") {
              return (
                <div key={m.id} style={{ display: "flex", gap: 11 }}>
                  <span style={{ width: 32, height: 32, borderRadius: 10, background: "#E8F7EE", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 32px" }}>
                    <Bot size={17} color="#0E8442" />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <ThinkingSteps step={thinkingStep} />
                  </div>
                </div>
              );
            }

            const kpis = !m.streaming && !m.isError ? extractKpis(m.toolCalls, session.business.currency) : [];
            const userQ = messages[messages.indexOf(m) - 1]?.text ?? "";

            return (
              <div key={m.id} style={{ display: "flex", gap: 11 }}>
                <span style={{ width: 32, height: 32, borderRadius: 10, background: "#E8F7EE", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 32px" }}>
                  <Bot size={17} color="#0E8442" />
                </span>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ background: m.isError ? "#FEF3F2" : "#fff", border: `1px solid ${m.isError ? "#FDD9D6" : AI.border}`, borderRadius: 16, padding: 17 }}>
                    <div style={{ fontSize: 13, color: m.isError ? "#B42318" : "#344054", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{m.text}</div>

                    {!m.streaming && !m.isError && kpis.length > 0 && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 11, marginTop: 14 }}>
                        {kpis.map((k) => (
                          <div key={k.label} style={{ border: `1px solid ${AI.border}`, background: "#FCFDFD", borderRadius: 13, padding: 13 }}>
                            <span style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: "#667085" }}>{k.label}</span>
                            <span style={{ display: "block", fontSize: 19, fontWeight: 800, color: "#0F172A", marginTop: 5, letterSpacing: "-.4px" }}>{k.value}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {!m.streaming && !m.isError && (m.deepLinks.length > 0 || m.helpSources.length > 0) && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 13, flexWrap: "wrap" }}>
                        {m.deepLinks.map((link) => (
                          <Link key={link.href} href={link.href} style={{ borderRadius: 20, border: "1px solid #BFE7CF", background: "#F7FCF9", padding: "7px 12px", fontSize: 11, fontWeight: 700, color: "#0E8442" }}>
                            {link.label} →
                          </Link>
                        ))}
                      </div>
                    )}

                    {!m.streaming && !m.isError && (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 15, paddingTop: 13, borderTop: "1px solid #F0F2F5", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => openSources(userQ, m.toolCalls, m.helpSources)}
                          style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${AI.border}`, background: "#FAFBFC", borderRadius: 20, padding: "7px 12px", fontSize: 11, fontWeight: 700, color: "#475467", cursor: "pointer", minHeight: 38 }}
                        >
                          Based on {sourceLabelFor(m.toolCalls, m.helpSources)}
                        </button>
                        {m.completedAt && <span style={{ fontSize: 11, color: "#98A2B3" }}>Data as of {formatTime(m.completedAt)}</span>}
                      </div>
                    )}
                  </div>

                  {!m.streaming && !m.isError && (
                    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() => openSources(userQ, m.toolCalls, m.helpSources)}
                        style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${AI.border}`, background: "#fff", borderRadius: 10, padding: "8px 13px", fontSize: 11.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 40 }}
                      >
                        Why?
                      </button>
                      <button
                        type="button"
                        onClick={() => openSources(userQ, m.toolCalls, m.helpSources)}
                        style={{ border: `1px solid ${AI.border}`, background: "#fff", borderRadius: 10, padding: "8px 13px", fontSize: 11.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 40 }}
                      >
                        View sources
                      </button>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(m.text)}
                        aria-label="Copy answer"
                        style={{ border: `1px solid ${AI.border}`, background: "#fff", borderRadius: 10, padding: "8px 11px", color: "#475467", cursor: "pointer", minHeight: 40, display: "flex", alignItems: "center" }}
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => m.completedAt && openReport(userQ, m.text, m.toolCalls, m.helpSources, m.completedAt)}
                        style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${AI.border}`, background: "#fff", borderRadius: 10, padding: "8px 13px", fontSize: 11.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 40 }}
                      >
                        <FileDown size={13} />
                        Generate report
                      </button>
                      <button
                        type="button"
                        onClick={() => regenerate(userQ)}
                        aria-label="Regenerate"
                        style={{ border: `1px solid ${AI.border}`, background: "#fff", borderRadius: 10, padding: "8px 11px", color: "#475467", cursor: "pointer", minHeight: 40, display: "flex", alignItems: "center" }}
                      >
                        <RotateCcw size={14} />
                      </button>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
                        <button type="button" onClick={() => rate(m.id, "up")} aria-label="Helpful" style={{ border: `1px solid ${rating === "up" ? "#12A150" : AI.border}`, background: rating === "up" ? "#E8F7EE" : "#fff", borderRadius: 10, padding: "8px 11px", color: rating === "up" ? "#0E8442" : "#475467", cursor: "pointer", minHeight: 40, display: "flex", alignItems: "center" }}>
                          <ThumbsUp size={14} />
                        </button>
                        <button type="button" onClick={() => rate(m.id, "down")} aria-label="Not helpful" style={{ border: `1px solid ${rating === "down" ? "#EF4444" : AI.border}`, background: rating === "down" ? "#FEF3F2" : "#fff", borderRadius: 10, padding: "8px 11px", color: rating === "down" ? "#B42318" : "#475467", cursor: "pointer", minHeight: 40, display: "flex", alignItems: "center" }}>
                          <ThumbsDown size={14} />
                        </button>
                      </span>
                    </div>
                  )}

                  {!m.streaming && !m.isError && (
                    <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                      {followUpsFor(userQ).map((f) => (
                        <button key={f.q} type="button" onClick={() => ask(f.q)} style={{ border: `1px solid ${AI.border}`, background: "#fff", borderRadius: 20, padding: "8px 14px", fontSize: 11.5, fontWeight: 600, color: "#475467", cursor: "pointer", minHeight: 40 }}>
                          {f.l}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}

      <div style={{ background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 16, padding: 13, position: "sticky", bottom: 0, boxShadow: "0 -4px 16px rgba(16,24,40,.05)" }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,text/markdown,application/json"
          onChange={onFileSelected}
          style={{ display: "none" }}
        />
        {uploadMutation.isPending && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${AI.border}`, borderRadius: 11, padding: "10px 12px", marginBottom: 11, background: "#FAFBFC" }}>
            <span style={{ fontSize: 12, color: AI.textMuted }}>Reading the file…</span>
          </div>
        )}
        {attachment && !uploadMutation.isPending && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${AI.border}`, borderRadius: 11, padding: "10px 12px", marginBottom: 11, background: "#FAFBFC" }}>
            <FileText size={16} color="#475467" />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#101828", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{attachment.filename}</span>
              <span style={{ display: "block", fontSize: 10.5, color: "#98A2B3", marginTop: 2 }}>Read for analysis only — nothing is written into your business data</span>
            </span>
            <button type="button" onClick={() => openFile(attachment)} style={{ border: `1px solid ${AI.border}`, background: "#fff", borderRadius: 9, padding: "8px 12px", fontSize: 11.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 40 }}>
              View extract
            </button>
            <button type="button" onClick={() => setAttachment(null)} aria-label="Remove attachment" style={{ border: 0, background: "none", color: "#98A2B3", cursor: "pointer", padding: 4, display: "flex" }}>
              <X size={15} />
            </button>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 9 }}>
          <textarea
            id="nxask"
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask anything about your business..."
            aria-label="Ask a business question"
            style={{ flex: 1, border: `1px solid ${AI.border}`, borderRadius: 12, padding: "13px 14px", fontSize: 13.5, fontFamily: "inherit", resize: "none", minHeight: 50, background: "#F9FAFB" }}
          />
          <button
            type="button"
            onClick={attachFile}
            disabled={uploadMutation.isPending}
            aria-label="Attach a file"
            style={{ border: `1px solid ${AI.border}`, background: "#fff", borderRadius: 11, padding: "0 13px", color: "#475467", cursor: "pointer", minHeight: 50, display: "flex", alignItems: "center", opacity: uploadMutation.isPending ? 0.5 : 1 }}
          >
            <Paperclip size={18} />
          </button>
          <Link
            href="/assistant/voice"
            aria-label="Use voice"
            style={{ border: `1px solid ${AI.border}`, background: "#fff", borderRadius: 11, padding: "0 13px", color: "#475467", cursor: "pointer", minHeight: 50, display: "flex", alignItems: "center" }}
          >
            <Mic size={18} />
          </Link>
          <button
            type="button"
            onClick={send}
            disabled={busy || !draft.trim()}
            aria-label="Send"
            style={{ border: 0, background: AI.primary, borderRadius: 11, padding: "0 17px", color: "#fff", cursor: "pointer", minHeight: 50, display: "flex", alignItems: "center", opacity: busy || !draft.trim() ? 0.5 : 1 }}
          >
            <Send size={18} />
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#98A2B3" }}>Read-only — the assistant reports on your data and never changes it without confirmation. Attachments accept a PDF, Word document, text/CSV file, or photo. Voice commands that do write data live on the Voice tab.</span>
        </div>
      </div>
    </main>
  );
}
