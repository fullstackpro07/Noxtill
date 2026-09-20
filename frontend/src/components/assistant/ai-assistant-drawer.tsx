"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { fetchAssistantConversation, fetchHistoryDetail, generateAssistantReport, type AssistantToolCall, type ExtractedAttachment, type HelpQueryDetail, type HistoryKind, type VoiceCommandDetail } from "@/lib/assistant-api";
import { fetchAiSettings } from "@/lib/ai-settings-api";
import type { HelpArticle } from "@/lib/help-api";
import { categoryForArticle } from "@/components/assistant/help-article-category";
import { formatDate, formatTime } from "@/lib/format";
import { useAiAssistantDrawer } from "@/components/assistant/ai-assistant-drawer-context";
import { AI, AiDrawerShell } from "@/components/assistant/ai-assistant-ui";
import { useSession } from "@/lib/session";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

/** Tool names are `snake_case` verbs (`get_revenue_today`) — this only reformats for display,
 * it never invents what the tool actually did. */
function humanizeToolName(name: string): string {
  const words = name.replace(/^get_|^find_|^search_/, "").split("_");
  if (words.length === 0 || !words[0]) return name;
  return words.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");
}

function humanizeKey(key: string): string {
  const spaced = key.replace(/([A-Z])/g, " $1").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "number") return value.toLocaleString("en-US");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length === 0 ? "None" : value.map((v) => formatValue(v)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function ToolOutputRows({ output }: { output: unknown }) {
  if (output == null) return <div style={{ fontSize: 12, color: AI.textFaint }}>No data returned.</div>;
  if (typeof output !== "object" || Array.isArray(output)) {
    return (
      <div style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: 9, padding: "9px 11px", fontSize: 11.5, color: AI.textMuted }}>{formatValue(output)}</div>
    );
  }
  const entries = Object.entries(output as Record<string, unknown>).filter(([k]) => k !== "found" && k !== "passages");
  if (entries.length === 0) return null;
  return (
    <div style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: 9, padding: "9px 11px", display: "flex", flexDirection: "column", gap: 5 }}>
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11.5 }}>
          <span style={{ color: AI.textFaint }}>{humanizeKey(k)}</span>
          <span style={{ color: AI.textMuted, fontWeight: 600, textAlign: "right" }}>{formatValue(v)}</span>
        </div>
      ))}
    </div>
  );
}

function SourcesBody({ question, toolCalls, helpSources }: { question: string; toolCalls: AssistantToolCall[]; helpSources: { title: string; url: string }[] }) {
  const dataTools = toolCalls.filter((t) => t.name !== "search_help_docs");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: 12, padding: 13 }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: AI.textFaint }}>Question</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#101828", marginTop: 5, lineHeight: 1.5 }}>{question}</div>
      </div>

      {dataTools.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: AI.textFaint, marginBottom: 9 }}>What it read</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {dataTools.map((t, i) => (
              <div key={i} style={{ border: `1px solid ${AI.border}`, borderRadius: 11, padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
                  <CheckCircle2 size={14} color="#0E8442" style={{ flex: "0 0 14px" }} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "#344054" }}>{humanizeToolName(t.name)}</span>
                </div>
                <ToolOutputRows output={t.output} />
              </div>
            ))}
          </div>
        </div>
      )}

      {helpSources.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: AI.textFaint, marginBottom: 9 }}>Help documentation used</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {helpSources.map((s) => (
              <Link key={s.url} href={s.url} style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${AI.border}`, borderRadius: 10, padding: 11, fontSize: 12.5, fontWeight: 600, color: "#0E8442" }}>
                {s.title}
                <ExternalLink size={13} style={{ marginLeft: "auto" }} />
              </Link>
            ))}
          </div>
        </div>
      )}

      {dataTools.length === 0 && helpSources.length === 0 && <div style={{ fontSize: 12.5, color: AI.textFaint }}>This answer didn&apos;t need to read anything — it was answered directly.</div>}

      <div style={{ background: "#EEF4FF", border: "1px solid #C7D7FE", borderRadius: 11, padding: "11px 13px", fontSize: 11.5, color: "#3538CD", lineHeight: 1.55 }}>
        Nothing here is estimated. Every figure comes directly from the tool calls listed above, run fresh against your live data for this question.
      </div>
    </div>
  );
}

function ReportBody({ question, answer, toolCalls, helpSources, askedAt }: { question: string; answer: string; toolCalls: AssistantToolCall[]; helpSources: { title: string; url: string }[]; askedAt: string }) {
  const session = useSession();
  const dataTools = toolCalls.filter((t) => t.name !== "search_help_docs");
  const sourceLabel = dataTools.length > 0 ? dataTools.map((t) => humanizeToolName(t.name)).join(", ") : helpSources.length > 0 ? "Noxtill help documentation" : "General knowledge — no live data was read";

  const downloadMutation = useMutation({
    mutationFn: () => generateAssistantReport({ question, answer, toolCalls, helpSources }),
    onSuccess: ({ url }) => {
      window.open(url, "_blank", "noopener,noreferrer");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't generate the PDF — please try again."),
  });

  function copyReport() {
    const lines = [
      "Noxtill report",
      `${session.business.name} · generated ${formatDate(askedAt)}, ${formatTime(askedAt)}`,
      "",
      `Question: ${question}`,
      "",
      answer,
      "",
      `Sources: ${sourceLabel}`,
      `Generated by: ${session.user.name} (${session.user.role})`,
    ];
    void navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Report copied — paste it anywhere to share.");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ border: `1px solid ${AI.border}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ background: AI.navy, padding: 16, color: "#fff" }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".6px", textTransform: "uppercase", color: "#8FF0BB" }}>Noxtill report</div>
          <div style={{ fontSize: 16, fontWeight: 800, marginTop: 5, letterSpacing: "-.2px" }}>{question}</div>
          <div style={{ fontSize: 11.5, color: "#AFC0CE", marginTop: 4 }}>
            {session.business.name} · generated {formatTime(askedAt)}
          </div>
        </div>
        <div style={{ padding: 14 }}>
          <div style={{ fontSize: 12.5, color: "#344054", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{answer}</div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0 0", marginTop: 9, borderTop: "1px solid #F2F4F7" }}>
            <span style={{ fontSize: 12, color: "#667085" }}>Sources</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#344054", textAlign: "right", maxWidth: "60%" }}>{sourceLabel}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0 0" }}>
            <span style={{ fontSize: 12, color: "#667085" }}>Generated by</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#344054", textAlign: "right" }}>
              {session.user.name} ({session.user.role})
            </span>
          </div>
        </div>
      </div>
      <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: 12, padding: 13 }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#B54708" }}>Limitations</div>
        <div style={{ fontSize: 12, color: "#93370D", marginTop: 6, lineHeight: 1.6 }}>Figures cover connected modules only, as of the moment the question was asked. Nothing here is a forecast.</div>
      </div>
      <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
        <button type="button" onClick={copyReport} style={{ flex: 1, border: `1px solid ${AI.border}`, background: "#fff", borderRadius: 11, padding: 12, fontSize: 12.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 46 }}>
          Copy report
        </button>
        <button
          type="button"
          onClick={() => downloadMutation.mutate()}
          disabled={downloadMutation.isPending}
          style={{ flex: 1, border: 0, background: AI.primary, borderRadius: 11, padding: 12, fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46, opacity: downloadMutation.isPending ? 0.6 : 1 }}
        >
          {downloadMutation.isPending ? "Generating…" : "Download PDF"}
        </button>
      </div>
    </div>
  );
}

function BusinessConvoBody({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const { close } = useAiAssistantDrawer();
  const { data: conversation, isPending } = useQuery({ queryKey: ["assistant-conversation", conversationId], queryFn: () => fetchAssistantConversation(conversationId) });

  if (isPending) return <div style={{ fontSize: 12.5, color: AI.textFaint }}>Loading…</div>;
  if (!conversation) return <div style={{ fontSize: 12.5, color: AI.textFaint }}>Conversation not found.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: "#0F172A" }}>{conversation.title ?? "Untitled conversation"}</div>
        <div style={{ fontSize: 11.5, color: AI.textFaint, marginTop: 4 }}>
          {formatDate(conversation.createdAt)} · {conversation.messages.filter((m) => m.role === "user").length} question{conversation.messages.filter((m) => m.role === "user").length === 1 ? "" : "s"}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {conversation.messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} style={{ display: "flex", justifyContent: "flex-end" }}>
              <div style={{ maxWidth: "80%", background: AI.navy, color: "#fff", borderRadius: 13, borderBottomRightRadius: 5, padding: "11px 13px", fontSize: 12.5, lineHeight: 1.55 }}>{m.content}</div>
            </div>
          ) : (
            <div key={m.id} style={{ background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 13, borderBottomLeftRadius: 5, padding: "12px 14px" }}>
              <div style={{ fontSize: 12.5, color: "#344054", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{m.content}</div>
              {m.toolCalls && m.toolCalls.length > 0 && (
                <div style={{ fontSize: 10.5, color: AI.textFaint, marginTop: 7 }}>Used {m.toolCalls.map((t) => humanizeToolName(t.name)).join(", ")}</div>
              )}
            </div>
          ),
        )}
      </div>
      <div style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: 11, padding: "11px 13px", fontSize: 11.5, color: AI.textMuted, lineHeight: 1.55 }}>
        Deleting this conversation removes only this record — every sale, order, booking and payment it referred to stays exactly as it is.
      </div>
      <button
        type="button"
        onClick={() => {
          close();
          router.push(`/assistant/chat?conversationId=${conversationId}`);
        }}
        style={{ border: 0, background: AI.primary, borderRadius: 11, padding: 12, fontSize: 12.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46 }}
      >
        Continue this conversation
      </button>
    </div>
  );
}

function HelpQueryBody({ id }: { id: string }) {
  const { data: entry, isPending } = useQuery({ queryKey: ["history-detail", "help", id], queryFn: () => fetchHistoryDetail("help", id) as Promise<HelpQueryDetail> });

  if (isPending) return <div style={{ fontSize: 12.5, color: AI.textFaint }}>Loading…</div>;
  if (!entry) return <div style={{ fontSize: 12.5, color: AI.textFaint }}>Entry not found.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: "#0F172A" }}>{entry.question}</div>
        <div style={{ fontSize: 11.5, color: AI.textFaint, marginTop: 4 }}>{formatDate(entry.createdAt)} · Help Assistant</div>
      </div>
      <div style={{ background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 13, padding: "12px 14px" }}>
        <div style={{ fontSize: 12.5, color: "#344054", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{entry.answer}</div>
      </div>
      {entry.sources.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: AI.textFaint, marginBottom: 9 }}>Sources</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {entry.sources.map((s) => (
              <Link key={s.url} href={s.url} style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${AI.border}`, borderRadius: 10, padding: 11, fontSize: 12.5, fontWeight: 600, color: "#0E8442" }}>
                {s.title}
                <ExternalLink size={13} style={{ marginLeft: "auto" }} />
              </Link>
            ))}
          </div>
        </div>
      )}
      <div style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: 11, padding: "11px 13px", fontSize: 11.5, color: AI.textMuted, lineHeight: 1.55 }}>
        Deleting this record removes only this entry — nothing in your business data is affected.
      </div>
    </div>
  );
}

const VOICE_ACTION_LABELS: Record<string, string> = {
  record_wastage: "Record wastage",
  add_expense: "Add expense",
  add_customer: "Add customer",
  record_cash_movement: "Cash drawer movement",
};

const VOICE_STATUS_STYLE: Record<VoiceCommandDetail["status"], { bg: string; fg: string; label: string }> = {
  confirmed: { bg: "#E8F7EE", fg: "#0E8442", label: "Confirmed and applied" },
  pending: { bg: "#FEF6E7", fg: "#B54708", label: "Never confirmed" },
  rejected: { bg: "#F2F4F7", fg: "#475467", label: "Cancelled" },
};

function VoiceCommandBody({ id }: { id: string }) {
  const { data: entry, isPending } = useQuery({ queryKey: ["history-detail", "voice", id], queryFn: () => fetchHistoryDetail("voice", id) as Promise<VoiceCommandDetail> });

  if (isPending) return <div style={{ fontSize: 12.5, color: AI.textFaint }}>Loading…</div>;
  if (!entry) return <div style={{ fontSize: 12.5, color: AI.textFaint }}>Entry not found.</div>;

  const status = VOICE_STATUS_STYLE[entry.status];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: "#0F172A" }}>{VOICE_ACTION_LABELS[entry.action] ?? entry.action}</div>
        <div style={{ fontSize: 11.5, color: AI.textFaint, marginTop: 4 }}>{formatDate(entry.createdAt)} · Voice Assistant</div>
      </div>
      <div style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: 12, padding: 13 }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: AI.textFaint }}>What was said</div>
        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6, lineHeight: 1.55, fontStyle: "italic", color: "#344054" }}>&ldquo;{entry.transcript}&rdquo;</div>
      </div>
      <div style={{ background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 13, padding: "12px 14px" }}>
        <div style={{ fontSize: 12.5, color: "#344054", lineHeight: 1.6 }}>{entry.humanSummary}</div>
      </div>
      <span style={{ alignSelf: "flex-start", fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: status.bg, color: status.fg }}>{status.label}</span>
      <div style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: 11, padding: "11px 13px", fontSize: 11.5, color: AI.textMuted, lineHeight: 1.55 }}>
        Deleting this record removes only this log entry — {entry.status === "confirmed" ? "the real change it made stays exactly as it is." : "nothing was ever written to your business data."}
      </div>
    </div>
  );
}

function ConvoBody({ kind, id }: { kind: HistoryKind; id: string }) {
  if (kind === "help") return <HelpQueryBody id={id} />;
  if (kind === "voice") return <VoiceCommandBody id={id} />;
  return <BusinessConvoBody conversationId={id} />;
}

function DisclosureBody() {
  const { data: settings, isPending } = useQuery({ queryKey: ["ai-settings"], queryFn: fetchAiSettings });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#0E8442", marginBottom: 9 }}>What it does</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {["Reads your connected business data to answer questions", "Answers how-to questions strictly from Noxtill's own help documentation", "Transcribes and stages a small set of voice commands for your review", "Names every tool it used so a figure can always be traced"].map((d) => (
            <div key={d} style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
              <CheckCircle2 size={14} color="#0E8442" style={{ flex: "0 0 14px", marginTop: 3 }} />
              <span style={{ fontSize: 12.5, color: "#344054", lineHeight: 1.55 }}>{d}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#B42318", marginBottom: 9 }}>What it will not do</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {["Change, create or delete business data on its own", "Run a voice command without your explicit confirmation", "Estimate a figure when the data isn't available", "Read a module your role isn't permitted to see"].map((d) => (
            <div key={d} style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
              <span style={{ color: "#B42318", flex: "0 0 14px", marginTop: 1, fontWeight: 800 }}>×</span>
              <span style={{ fontSize: 12.5, color: "#344054", lineHeight: 1.55 }}>{d}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: AI.textFaint, marginBottom: 7 }}>The required disclosure</div>
        {isPending ? <div style={{ fontSize: 12.5, color: AI.textFaint }}>Loading…</div> : <div style={{ fontSize: 12.5, color: "#344054", lineHeight: 1.6 }}>{settings?.disclosureText}</div>}
      </div>
      <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: 12, padding: 13 }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#B54708", marginBottom: 8 }}>Known limitations</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {["Answers depend entirely on what a tool call returns — a question outside its 23 tools gets an honest “I can’t check that” rather than a guess.", "Voice commands cover a curated set of actions today — wastage, expenses, new customers and cash-drawer movements — not every write action in Noxtill.", "The assistant can be wrong. Every business-data answer can be traced back to the exact tool call that produced it."].map((l) => (
            <span key={l} style={{ fontSize: 12, color: "#93370D", lineHeight: 1.55 }}>
              · {l}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

const ATTACHMENT_KIND_LABELS: Record<ExtractedAttachment["kind"], string> = {
  pdf: "PDF",
  docx: "Word document",
  text: "Text file",
  image: "Photo",
};

function FileBody({ attachment }: { attachment: ExtractedAttachment }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: 11, padding: "11px 13px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0" }}>
          <span style={{ fontSize: 12.5, color: "#667085" }}>Filename</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#344054", textAlign: "right" }}>{attachment.filename}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", borderTop: "1px solid #F2F4F7" }}>
          <span style={{ fontSize: 12.5, color: "#667085" }}>Type</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#344054", textAlign: "right" }}>{ATTACHMENT_KIND_LABELS[attachment.kind]}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", borderTop: "1px solid #F2F4F7" }}>
          <span style={{ fontSize: 12.5, color: "#667085" }}>Characters read</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#344054", textAlign: "right" }}>{attachment.charCount.toLocaleString("en-US")}</span>
        </div>
      </div>
      {attachment.truncated && (
        <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: 11, padding: "10px 13px", fontSize: 11.5, color: "#B54708", lineHeight: 1.55 }}>
          This file was longer than the assistant can read in one go — only the first part shown below was used to answer your question.
        </div>
      )}
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: AI.textFaint, marginBottom: 9 }}>What it read</div>
        <div style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: 11, padding: 13, fontSize: 12, color: "#344054", lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: 360, overflowY: "auto" }}>
          {attachment.text}
        </div>
      </div>
      <div style={{ background: "#EEF4FF", border: "1px solid #C7D7FE", borderRadius: 12, padding: 13, fontSize: 12, color: "#3538CD", lineHeight: 1.6 }}>
        Read for analysis only. Nothing from this file has been written into your business data — that needs a separate confirmed import from the Photo Digitizer screen.
      </div>
    </div>
  );
}

/** Best-effort real route for the category derived from the article's own slug — a reasonable,
 * honest guess (not a fabricated taxonomy) since `HelpArticle` carries no module reference. */
const CATEGORY_ROUTES: Record<string, string> = {
  Bookings: "/bookings",
  Credit: "/credit",
  Review: "/reviews",
  Campaign: "/marketing",
  Plans: "/settings",
  Staff: "/staff",
};

function ArticleBody({ article }: { article: HelpArticle }) {
  const { close } = useAiAssistantDrawer();
  const category = categoryForArticle(article);
  const href = CATEGORY_ROUTES[category];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, color: "#3538CD", background: "#EEF4FF", borderRadius: 20, padding: "4px 10px", alignSelf: "flex-start" }}>{category}</span>
      <div style={{ fontSize: 12.5, color: "#344054", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{article.body}</div>
      {article.steps.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: AI.textFaint, marginBottom: 9 }}>Steps</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {article.steps.map((step, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, border: `1px solid ${AI.border}`, borderRadius: 11, padding: 11 }}>
                <span style={{ width: 20, height: 20, borderRadius: "50%", background: "#E8F7EE", color: "#0E8442", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 20px" }}>{i + 1}</span>
                <span style={{ fontSize: 12.5, color: "#344054", lineHeight: 1.55 }}>{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: 11, padding: "11px 13px", fontSize: 11.5, color: "#667085", lineHeight: 1.55 }}>Taken from Noxtill&apos;s own documentation. If something is not documented, the assistant says so rather than describing a feature that may not exist.</div>
      {href && (
        <Link href={href} onClick={close} style={{ display: "block", textAlign: "center", border: 0, background: AI.primary, borderRadius: 11, padding: 12, fontSize: 13, fontWeight: 800, color: "#fff" }}>
          Open {category}
        </Link>
      )}
    </div>
  );
}

export function AiAssistantDrawer() {
  const { drawer, close } = useAiAssistantDrawer();
  if (!drawer) return null;

  const CONVO_TITLES: Record<HistoryKind, string> = { business: "Conversation", help: "Help question", voice: "Voice command" };

  const title =
    drawer.mode === "sources"
      ? "Data used for this answer"
      : drawer.mode === "report"
        ? "Report preview"
        : drawer.mode === "convo"
          ? CONVO_TITLES[drawer.kind]
          : drawer.mode === "article"
            ? drawer.article.title
            : drawer.mode === "file"
              ? "File extract"
              : "How Noxtill uses AI";

  return (
    <AiDrawerShell title={title} onClose={close}>
      {drawer.mode === "sources" && <SourcesBody question={drawer.question} toolCalls={drawer.toolCalls} helpSources={drawer.helpSources} />}
      {drawer.mode === "report" && <ReportBody question={drawer.question} answer={drawer.answer} toolCalls={drawer.toolCalls} helpSources={drawer.helpSources} askedAt={drawer.askedAt} />}
      {drawer.mode === "convo" && <ConvoBody kind={drawer.kind} id={drawer.id} />}
      {drawer.mode === "article" && <ArticleBody article={drawer.article} />}
      {drawer.mode === "file" && <FileBody attachment={drawer.attachment} />}
      {drawer.mode === "disclosure" && <DisclosureBody />}
    </AiDrawerShell>
  );
}
