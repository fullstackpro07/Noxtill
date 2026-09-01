"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { Search, MessageCircleQuestion, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { askHelp, type HelpAnswer } from "@/lib/help-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const SUGGESTED_QUESTIONS = [
  "How do I record a wastage?",
  "How does the credit recovery flow work?",
  "How do I set up a nightly close?",
  "How do coupons and vouchers differ?",
  "How do I approve a stock transfer?",
];

interface Turn {
  question: string;
  answer: HelpAnswer;
}

export function HelpAssistantView() {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<Turn[]>([]);

  const mutation = useMutation({
    mutationFn: (q: string) => askHelp(q),
    onSuccess: (answer, q) => {
      setHistory((prev) => [{ question: q, answer }, ...prev]);
      setQuestion("");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't get an answer — please try again."),
  });

  function ask(q: string) {
    const trimmed = q.trim();
    if (!trimmed || mutation.isPending) return;
    mutation.mutate(trimmed);
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="flex items-center gap-2"
      >
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask how something in Noxtill works…"
          className="flex-1"
        />
        <Button type="submit" disabled={!question.trim() || mutation.isPending}>
          <Search className="h-3.5 w-3.5" aria-hidden />
          {mutation.isPending ? "Searching…" : "Ask"}
        </Button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {SUGGESTED_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => ask(q)}
            disabled={mutation.isPending}
            className="rounded-full border border-border-strong px-3 py-1.5 text-xs text-fg-muted hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40"
          >
            {q}
          </button>
        ))}
      </div>

      {history.length === 0 ? (
        <EmptyState
          icon={MessageCircleQuestion}
          title="Ask a question to get started"
          description="Answers come only from Noxtill's real help documentation — never a guess. Try one of the suggestions above, or type your own."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {history.map((turn, i) => (
            <div key={i} className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
              <p className="text-sm font-semibold text-fg">{turn.question}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-fg-muted">{turn.answer.answer}</p>
              {turn.answer.sources.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
                  {turn.answer.sources.map((s) => (
                    <Link
                      key={s.url}
                      href={s.url}
                      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/8 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/15"
                    >
                      {s.title}
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-fg-faint">
        This screen answers from Noxtill&apos;s own help documentation only — it doesn&apos;t yet browse a full article
        index or filter by topic, since the backend only exposes search-by-question, not a listing endpoint.
      </p>
    </div>
  );
}
