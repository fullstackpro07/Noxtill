"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Search, MessageCircleQuestion, ExternalLink, AlertCircle, ChevronRight } from "lucide-react";
import Link from "next/link";
import { askHelp, fetchHelpArticles, fetchHelpSuggestions, type HelpAnswer, type HelpArticle } from "@/lib/help-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { AI, EmptyBlock } from "@/components/assistant/ai-assistant-ui";
import { useAiAssistantDrawer } from "@/components/assistant/ai-assistant-drawer-context";
import { categoryForArticle } from "@/components/assistant/help-article-category";

interface Turn {
  question: string;
  answer: HelpAnswer;
}

/** Must match `HELP_NOT_FOUND_MESSAGE` in `backend/src/help/help.service.ts` exactly — the
 * backend returns this precise string (never a paraphrase) when nothing relevant was found. */
const HELP_NOT_FOUND_MESSAGE = "I couldn't find anything about that in the help docs — try rephrasing, or contact support.";

export function HelpAssistantView() {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<Turn[]>([]);
  const [notFound, setNotFound] = useState(false);
  const { openArticle } = useAiAssistantDrawer();

  const { data: articles = [], isPending: articlesPending } = useQuery({ queryKey: ["help-articles"], queryFn: fetchHelpArticles });
  const { data: suggestions } = useQuery({ queryKey: ["help-suggestions"], queryFn: fetchHelpSuggestions });

  const filteredArticles = useMemo(() => {
    const q = question.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter((a) => a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q) || categoryForArticle(a).toLowerCase().includes(q));
  }, [articles, question]);

  const mutation = useMutation({
    mutationFn: (q: string) => askHelp(q),
    onSuccess: (answer, q) => {
      if (answer.answer === HELP_NOT_FOUND_MESSAGE) {
        setNotFound(true);
      } else {
        setNotFound(false);
        setHistory((prev) => [{ question: q, answer }, ...prev]);
      }
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't get an answer — please try again."),
  });

  function ask(q: string) {
    const trimmed = q.trim();
    if (!trimmed || mutation.isPending) return;
    setNotFound(false);
    mutation.mutate(trimmed);
  }

  function openFullArticle(article: HelpArticle) {
    openArticle(article);
  }

  return (
    <main style={{ padding: "16px 22px 26px", display: "flex", flexDirection: "column", gap: 15 }}>
      <div style={{ background: "#EEF4FF", border: "1px solid #C7D7FE", borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 10 }}>
        <AlertCircle size={17} style={{ color: "#3538CD", flex: "0 0 17px", marginTop: 1 }} />
        <div style={{ fontSize: 12, color: "#3538CD", lineHeight: 1.55 }}>This assistant answers from Noxtill&apos;s own documentation — how the product works. For questions about your own figures, use Business Chat instead.</div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 16, padding: 17 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
          style={{ position: "relative" }}
        >
          <Search size={17} style={{ position: "absolute", left: 14, top: 15, color: "#98A2B3" }} />
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Search help — how do I…"
            aria-label="Search help"
            style={{ width: "100%", padding: "14px 14px 14px 40px", border: `1px solid ${AI.border}`, borderRadius: 12, fontSize: 13.5, background: "#F9FAFB", minHeight: 50 }}
          />
        </form>
        {suggestions && suggestions.questions.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 13 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", alignSelf: "center" }}>{suggestions.basedOn === "usage" ? "Popular" : "Try asking"}</span>
            {suggestions.questions.map((q) => (
              <button key={q} type="button" onClick={() => ask(q)} disabled={mutation.isPending} style={{ border: `1px solid ${AI.border}`, background: "#fff", borderRadius: 20, padding: "8px 14px", fontSize: 11.5, fontWeight: 600, color: "#475467", cursor: "pointer", minHeight: 40, opacity: mutation.isPending ? 0.5 : 1 }}>
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      {notFound && (
        <div style={{ background: "#fff", border: "1px solid #FDE3B3", borderRadius: 16, padding: "44px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: "#93370D" }}>I couldn&apos;t find that in the available Noxtill documentation</div>
          <div style={{ fontSize: 12.5, color: "#B54708", marginTop: 6, maxWidth: "52ch", marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>Rather than describe a feature that may not exist, I would rather say nothing. Try different wording, or browse the articles below.</div>
        </div>
      )}

      {mutation.isPending && <div style={{ fontSize: 12.5, color: AI.textFaint, textAlign: "center", padding: 20 }}>Searching the documentation…</div>}

      {history.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3" }}>Answered</span>
          {history.map((turn, i) => (
            <div key={i} style={{ background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 16, padding: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#101828" }}>{turn.question}</span>
              <div style={{ fontSize: 12, color: "#475467", marginTop: 7, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{turn.answer.answer}</div>
              {turn.answer.sources.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 11, paddingTop: 11, borderTop: "1px solid #F0F2F5" }}>
                  {turn.answer.sources.map((s) => (
                    <Link key={s.url} href={s.url} style={{ display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 20, border: "1px solid #C7D7FE", background: "#EEF4FF", padding: "5px 10px", fontSize: 10.5, fontWeight: 700, color: "#3538CD" }}>
                      {s.title}
                      <ExternalLink size={11} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3" }}>
          {question.trim() ? "Matching articles" : "All documentation"}
        </span>
        {articlesPending ? (
          <div style={{ fontSize: 12.5, color: AI.textFaint }}>Loading…</div>
        ) : filteredArticles.length === 0 ? (
          history.length === 0 && !notFound ? (
            <EmptyBlock icon={MessageCircleQuestion} iconBg="#F2F4F7" iconColor="#98A2B3" title="Nothing matches that search" description="Try a different search, or ask the question directly above." />
          ) : null
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 14 }}>
            {filteredArticles.map((article) => (
              <button
                key={article.slug}
                type="button"
                onClick={() => openFullArticle(article)}
                style={{ textAlign: "left", background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 16, padding: 16, cursor: "pointer", minHeight: 44 }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#101828", flex: 1, minWidth: 0 }}>{article.title}</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: "#3538CD", background: "#EEF4FF", borderRadius: 20, padding: "3px 8px", whiteSpace: "nowrap" }}>{categoryForArticle(article)}</span>
                </span>
                <span style={{ fontSize: 12, color: "#475467", marginTop: 7, lineHeight: 1.6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>{article.body}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 11, fontSize: 11.5, fontWeight: 700, color: "#0E8442" }}>
                  Read the full answer
                  <ChevronRight size={13} />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
