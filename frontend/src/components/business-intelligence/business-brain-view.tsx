"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Brain, Send } from "lucide-react";
import {
  askBusinessBrain,
  fetchBusinessBrainAnswers,
  type BusinessBrainAnswer,
} from "@/lib/business-intelligence-api";

const EXAMPLE_QUESTIONS = [
  "How are today's sales?",
  "What should I check in inventory?",
  "What customer metrics are available?",
];

function valueText(value: unknown): string {
  if (value === null || value === undefined) return "Not tracked";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function AnswerCard({ answer }: { answer: BusinessBrainAnswer }) {
  return (
    <article className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--app-text-faint)]">
        Question
      </p>
      <h2 className="mt-1 font-semibold text-[var(--app-text)]">
        {answer.question}
      </h2>
      <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[var(--app-text)]">
        {answer.answer}
      </p>
      <div className="mt-5 border-t border-[var(--app-border)] pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
          Source metrics
        </h3>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {answer.sourceMetrics.map((source) => (
            <li
              key={source.key}
              className="rounded-lg bg-[var(--app-surface-muted)] p-3"
            >
              <p className="text-xs text-[var(--app-text-muted)]">
                {source.title}
              </p>
              <p className="mt-1 break-words text-sm font-medium text-[var(--app-text)]">
                {valueText(source.value)}
              </p>
            </li>
          ))}
        </ul>
      </div>
      <dl className="mt-4 grid gap-3 border-t border-[var(--app-border)] pt-4 text-sm md:grid-cols-3">
        <div>
          <dt className="font-semibold text-[var(--app-text)]">Calculation</dt>
          <dd className="mt-1 text-[var(--app-text-muted)]">
            {answer.calculation}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-[var(--app-text)]">Assumptions</dt>
          <dd className="mt-1 text-[var(--app-text-muted)]">
            {answer.assumptions.join(" ")}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-[var(--app-text)]">Confidence</dt>
          <dd className="mt-1 text-[var(--app-text-muted)]">
            {answer.confidenceNote}
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-xs text-[var(--app-text-faint)]">
        Saved {new Date(answer.createdAt).toLocaleString()}
      </p>
    </article>
  );
}

export function BusinessBrainView() {
  const [question, setQuestion] = useState("");
  const queryClient = useQueryClient();
  const answers = useQuery({
    queryKey: ["business-intelligence", "brain", "answers"],
    queryFn: fetchBusinessBrainAnswers,
  });
  const ask = useMutation({
    mutationFn: askBusinessBrain,
    onSuccess: async () => {
      setQuestion("");
      await queryClient.invalidateQueries({
        queryKey: ["business-intelligence", "brain", "answers"],
      });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (question.trim().length >= 3) ask.mutate(question.trim());
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-5 md:p-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--app-primary)]">
          Business Intelligence
        </p>
        <h1 className="mt-2 text-2xl font-bold text-[var(--app-text)] md:text-3xl">
          Business Brain
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--app-text-muted)]">
          Ask a question about your recorded business metrics. This is a
          read-only analytics feature, not a general assistant; each answer
          keeps its source metrics and caveats.
        </p>
      </header>

      <section className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5">
        <form onSubmit={submit}>
          <label
            htmlFor="business-brain-question"
            className="text-sm font-semibold text-[var(--app-text)]"
          >
            Your question
          </label>
          <textarea
            id="business-brain-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value.slice(0, 500))}
            maxLength={500}
            rows={3}
            placeholder="Ask about the metrics currently recorded in Noxtill"
            className="mt-2 w-full resize-y rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-3 text-sm text-[var(--app-text)] outline-none focus:ring-2 focus:ring-[var(--app-primary)]"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-[var(--app-text-faint)]">
              {question.length} / 500 characters
            </span>
            <button
              type="submit"
              disabled={ask.isPending || question.trim().length < 3}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--app-primary)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" aria-hidden />
              {ask.isPending ? "Checking sources…" : "Ask Business Brain"}
            </button>
          </div>
        </form>
        <div
          className="mt-4 flex flex-wrap gap-2"
          aria-label="Example questions"
        >
          {EXAMPLE_QUESTIONS.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setQuestion(example)}
              className="rounded-full border border-[var(--app-border)] px-3 py-1.5 text-xs text-[var(--app-text-muted)] hover:bg-[var(--app-surface-muted)]"
            >
              {example}
            </button>
          ))}
        </div>
        {ask.isError && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-3 rounded-lg border border-[var(--app-danger-border)] bg-[var(--app-danger-bg)] p-3 text-sm text-[var(--app-danger)]"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{ask.error.message}</span>
          </div>
        )}
      </section>

      <section
        className="flex flex-col gap-3"
        aria-label="Saved Business Brain answers"
      >
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-[var(--app-primary)]" aria-hidden />
          <h2 className="font-semibold text-[var(--app-text)]">
            Recent saved answers
          </h2>
        </div>
        {answers.isLoading ? (
          <p className="text-sm text-[var(--app-text-muted)]">
            Loading saved answers…
          </p>
        ) : answers.isError ? (
          <p role="alert" className="text-sm text-[var(--app-danger)]">
            Could not load saved answers. {answers.error.message}
          </p>
        ) : answers.data?.length ? (
          answers.data.map((answer) => (
            <AnswerCard key={answer.id} answer={answer} />
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-[var(--app-border)] p-5 text-sm text-[var(--app-text-muted)]">
            No saved answers yet. Ask a question to create an answer with its
            source evidence.
          </p>
        )}
      </section>
    </main>
  );
}
