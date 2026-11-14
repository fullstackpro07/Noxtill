"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { askFinancialAgent, type FinancialAgentQuestionRun } from "@/lib/profit-api";

function readableToolName(value: string) {
  return value.replaceAll("_", " ");
}

export function FinancialAgentQuestionPanel({ canAsk }: { canAsk: boolean }) {
  const [question, setQuestion] = useState("");
  const [run, setRun] = useState<FinancialAgentQuestionRun | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const ask = useMutation({
    mutationFn: (value: string) => askFinancialAgent({ question: value }),
    onSuccess: (result) => {
      setRun(result);
      setErrorMessage(null);
      queryClient.invalidateQueries({ queryKey: ["financial-agent-runs"] });
    },
    onError: (error) => {
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : "The Finance Agent could not answer right now.",
      );
    },
  });

  if (!canAsk) return null;

  return (
    <section
      className="rounded-[16px] p-4"
      style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}
      aria-label="Ask the Financial Intelligence Agent"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>
            Ask Financial Intelligence
          </h2>
          <p className="mb-0 mt-1 max-w-[760px] text-[11.5px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
            Answers use registered Finance read tools and list their source screens. Period-close review order is a fixed workflow aid, not a materiality score. This is read-only: it cannot post journals, reconcile transactions, close periods, or move money.
          </p>
        </div>
        <span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: "var(--app-surface-2)", color: "var(--app-text-muted)" }}>
          Read only
        </span>
      </div>

      <form
        className="mt-3 flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const normalized = question.trim();
          if (normalized.length >= 4 && !ask.isPending) ask.mutate(normalized);
        }}
      >
        <label className="sr-only" htmlFor="finance-agent-question">Finance question</label>
        <textarea
          id="finance-agent-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={1_000}
          minLength={4}
          rows={3}
          placeholder="For example: how do this month’s recorded expenses compare with the approved budget?"
          className="w-full resize-y rounded-[10px] px-3 py-2.5 text-[12px] outline-none"
          style={{ border: "1px solid var(--app-border)", background: "var(--app-surface-2)", color: "var(--app-text)" }}
          disabled={ask.isPending}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[10px]" style={{ color: "var(--app-text-faint)" }}>{question.length}/1000 · question text is not saved in Finance run history</span>
          <button
            type="submit"
            disabled={question.trim().length < 4 || ask.isPending}
            className="rounded-[9px] px-3.5 py-2 text-[11px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--app-primary)" }}
          >
            {ask.isPending ? "Checking sources…" : "Ask Finance Agent"}
          </button>
        </div>
      </form>

      {errorMessage && (
        <p role="alert" className="mb-0 mt-3 rounded-[9px] p-2.5 text-[11px]" style={{ background: "var(--app-surface-2)", color: "var(--app-danger-strong)" }}>
          {errorMessage}
        </p>
      )}

      {run && (
        <div className="mt-4 rounded-[11px] p-3" style={{ background: "var(--app-surface-2)" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-[11.5px]" style={{ color: "var(--app-text)" }}>
              {run.output.answerStatus === "ready" ? "Source-backed answer" : "No answer available"}
            </strong>
            <span className="text-[10px]" style={{ color: "var(--app-text-faint)" }}>
              {new Date(run.createdAt).toLocaleString()} · {run.output.writesPerformed ? "Changes made" : "No records changed"}
            </span>
          </div>
          {run.output.answer ? (
            <div className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
              {run.output.answer}
            </div>
          ) : (
            <p className="mb-0 mt-2 text-[11px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
              {run.output.message || "No registered source result was available."}
            </p>
          )}

          {run.output.toolTrace.length > 0 && (
            <div className="mt-3 border-t pt-2.5" style={{ borderColor: "var(--app-border)" }}>
              <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--app-text-faint)" }}>Sources checked</div>
              <ul className="mb-0 mt-2 flex list-none flex-col gap-2 p-0">
                {run.output.toolTrace.map((item, index) => (
                  <li key={`${item.tool}-${index}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[10.5px]">
                    <span>
                      <strong style={{ color: "var(--app-text-muted)" }}>{readableToolName(item.tool)}</strong>
                      <span className="ml-2" style={{ color: item.outcome === "succeeded" ? "var(--app-success-text)" : "var(--app-warning-text)" }}>{item.outcome}</span>
                      <span className="ml-2" style={{ color: "var(--app-text-faint)" }}>{item.summary}</span>
                    </span>
                    {item.screen?.startsWith("/") && <Link href={item.screen} className="font-bold underline" style={{ color: "var(--app-primary)" }}>Open source</Link>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
