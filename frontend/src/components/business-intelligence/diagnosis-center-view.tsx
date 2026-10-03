"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  CircleCheck,
  FileSearch,
  Plus,
  Search,
} from "lucide-react";
import {
  createBiDiagnosisHypothesis,
  fetchBiDiagnoses,
  resolveBiDiagnosisHypothesis,
  type BiDiagnosisCategory,
  type BiDiagnosisStatus,
} from "@/lib/business-intelligence-api";

const CATEGORY_LABELS: Record<BiDiagnosisCategory | "all", string> = {
  all: "All domains",
  sales: "Sales",
  stock: "Stock",
  customers: "Customers",
  marketing: "Marketing",
  credit: "Credit",
};

const SOURCE_LINKS: Record<BiDiagnosisCategory, string> = {
  sales: "/profit",
  stock: "/inventory",
  customers: "/customers",
  marketing: "/marketing",
  credit: "/credit",
};

function formatImpact(value: string | number | null, currency: string): string {
  if (value === null) return "Impact not quantified";
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return "Impact not available";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(number);
  } catch {
    return `${number} ${currency}`;
  }
}

function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The request could not be completed.";
}

export function DiagnosisCenterView() {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<BiDiagnosisCategory | "all">("all");
  const [status, setStatus] = useState<BiDiagnosisStatus>("new");
  const [search, setSearch] = useState("");
  const [addingToInsight, setAddingToInsight] = useState<string | null>(null);
  const [hypothesisDraft, setHypothesisDraft] = useState("");
  const [resolvingHypothesis, setResolvingHypothesis] = useState<string | null>(
    null,
  );
  const [resolutionDraft, setResolutionDraft] = useState("");

  const diagnoses = useQuery({
    queryKey: ["business-intelligence", "diagnosis-center", category, status],
    queryFn: () => fetchBiDiagnoses(category, status),
  });

  const createHypothesis = useMutation({
    mutationFn: (input: { insightId: string; hypothesis: string }) =>
      createBiDiagnosisHypothesis(input.insightId, input.hypothesis),
    onSuccess: async () => {
      setAddingToInsight(null);
      setHypothesisDraft("");
      await queryClient.invalidateQueries({
        queryKey: ["business-intelligence", "diagnosis-center"],
      });
    },
  });

  const resolveHypothesis = useMutation({
    mutationFn: (input: { hypothesisId: string; reason: string }) =>
      resolveBiDiagnosisHypothesis(input.hypothesisId, input.reason),
    onSuccess: async () => {
      setResolvingHypothesis(null);
      setResolutionDraft("");
      await queryClient.invalidateQueries({
        queryKey: ["business-intelligence", "diagnosis-center"],
      });
    },
  });

  const visibleRows = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase();
    return (diagnoses.data?.rows ?? []).filter(
      (row) =>
        !normalized ||
        [row.observation, row.sourceFigure, row.category].some((value) =>
          value.toLocaleLowerCase().includes(normalized),
        ),
    );
  }, [diagnoses.data?.rows, search]);

  function submitHypothesis(
    event: FormEvent<HTMLFormElement>,
    insightId: string,
  ) {
    event.preventDefault();
    const hypothesis = hypothesisDraft.trim();
    if (hypothesis.length < 10) return;
    createHypothesis.mutate({ insightId, hypothesis });
  }

  function submitResolution(
    event: FormEvent<HTMLFormElement>,
    hypothesisId: string,
  ) {
    event.preventDefault();
    const reason = resolutionDraft.trim();
    if (reason.length < 3) return;
    resolveHypothesis.mutate({ hypothesisId, reason });
  }

  const rows = diagnoses.data?.rows ?? [];

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--app-primary)]">
            Business Intelligence
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-[var(--app-text)]">
            Diagnosis Center
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--app-text-muted)]">
            Investigate recorded business signals and merchant-entered
            hypotheses. Associated evidence is correlation, not proof of cause.
          </p>
        </div>
        <a
          href="/dashboard/insights"
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-4 text-sm font-medium text-[var(--app-text)] hover:bg-[var(--app-surface-muted)]"
        >
          Open canonical AI Insights{" "}
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </a>
      </header>

      <section
        className="grid gap-3 sm:grid-cols-3"
        aria-label="Diagnosis coverage"
      >
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4">
          <p className="text-sm text-[var(--app-text-muted)]">
            Recorded source insights
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--app-text)]">
            {diagnoses.data?.total ?? "—"}
          </p>
          <p className="mt-1 text-xs text-[var(--app-text-faint)]">
            Filtered source total
          </p>
        </div>
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4">
          <p className="text-sm text-[var(--app-text-muted)]">
            Evidence confidence
          </p>
          <p className="mt-2 text-2xl font-semibold text-[var(--app-text)]">
            Not tracked
          </p>
          <p className="mt-1 text-xs text-[var(--app-text-faint)]">
            AI Insight records have no calibrated confidence field
          </p>
        </div>
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4">
          <p className="text-sm text-[var(--app-text-muted)]">Cause status</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--app-text)]">
            Not established
          </p>
          <p className="mt-1 text-xs text-[var(--app-text-faint)]">
            This view does not test causality
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--app-text)]">
              Recorded issues & associated signals
            </h2>
            <p className="mt-1 text-sm text-[var(--app-text-muted)]">
              Source findings remain owned by AI Insights; hypotheses here never
              rewrite them.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="diagnosis-search">
              Search diagnoses
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-text-faint)]"
                aria-hidden="true"
              />
              <input
                id="diagnosis-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search source evidence"
                className="min-h-10 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] pl-9 pr-3 text-sm text-[var(--app-text)] sm:w-56"
              />
            </div>
            <label className="sr-only" htmlFor="diagnosis-domain">
              Filter by domain
            </label>
            <select
              id="diagnosis-domain"
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as BiDiagnosisCategory | "all")
              }
              className="min-h-10 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 text-sm text-[var(--app-text)]"
            >
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="diagnosis-status">
              Filter by insight status
            </label>
            <select
              id="diagnosis-status"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as BiDiagnosisStatus)
              }
              className="min-h-10 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 text-sm text-[var(--app-text)]"
            >
              <option value="new">Unresolved source insights</option>
              <option value="actioned">Actioned source insights</option>
              <option value="dismissed">Dismissed source insights</option>
              <option value="all">All source insights</option>
            </select>
          </div>
        </div>

        {diagnoses.isPending && (
          <div
            className="mt-5 animate-pulse space-y-3"
            aria-label="Loading diagnoses"
          >
            <div className="h-28 rounded-xl bg-[var(--app-surface-muted)]" />
            <div className="h-28 rounded-xl bg-[var(--app-surface-muted)]" />
          </div>
        )}
        {diagnoses.isError && (
          <div
            role="alert"
            className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {errorText(diagnoses.error)}{" "}
            <button
              type="button"
              onClick={() => void diagnoses.refetch()}
              className="ml-2 font-semibold underline"
            >
              Retry
            </button>
          </div>
        )}
        {diagnoses.isSuccess && visibleRows.length === 0 && (
          <div className="mt-5 rounded-xl border border-dashed border-[var(--app-border)] px-5 py-12 text-center">
            <FileSearch
              className="mx-auto h-8 w-8 text-[var(--app-text-faint)]"
              aria-hidden="true"
            />
            <h3 className="mt-3 font-semibold text-[var(--app-text)]">
              {rows.length === 0
                ? "No recorded insights in this view yet"
                : "No insights match this search"}
            </h3>
            <p className="mx-auto mt-1 max-w-xl text-sm text-[var(--app-text-muted)]">
              Diagnosis uses existing AI Insights and their recorded source
              figures. It does not create findings when the source modules have
              none.
            </p>
          </div>
        )}

        {visibleRows.length > 0 && (
          <div className="mt-5 space-y-4">
            {diagnoses.data && diagnoses.data.total > rows.length && (
              <p className="text-xs text-[var(--app-text-faint)]">
                Showing the latest {rows.length} of {diagnoses.data.total}{" "}
                records.
              </p>
            )}
            {visibleRows.map((row) => (
              <article
                key={row.id}
                className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 sm:p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[var(--app-primary-soft)] px-2.5 py-1 text-xs font-semibold capitalize text-[var(--app-primary)]">
                        {row.category}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-[var(--app-text-muted)]">
                        <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                        Associated signal · not a cause
                      </span>
                      <span className="text-xs text-[var(--app-text-faint)]">
                        {new Date(row.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-[var(--app-text)]">
                      {row.observation}
                    </h3>
                    <p className="mt-2 text-sm text-[var(--app-text-muted)]">
                      <span className="font-medium text-[var(--app-text)]">
                        Recorded source figure:
                      </span>{" "}
                      {row.sourceFigure || "Not available"}
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg bg-[var(--app-surface-muted)] p-3">
                        <p className="text-xs text-[var(--app-text-faint)]">
                          Recorded impact
                        </p>
                        <p className="mt-1 text-sm font-semibold text-[var(--app-text)]">
                          {formatImpact(
                            row.estimatedImpact,
                            diagnoses.data?.currency ?? "USD",
                          )}
                        </p>
                      </div>
                      <div className="rounded-lg bg-[var(--app-surface-muted)] p-3">
                        <p className="text-xs text-[var(--app-text-faint)]">
                          Evidence confidence
                        </p>
                        <p className="mt-1 text-sm font-semibold text-[var(--app-text)]">
                          Not tracked
                        </p>
                      </div>
                      <div className="rounded-lg bg-[var(--app-surface-muted)] p-3">
                        <p className="text-xs text-[var(--app-text-faint)]">
                          Causal status
                        </p>
                        <p className="mt-1 text-sm font-semibold text-[var(--app-text)]">
                          Correlation only
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-[var(--app-text-muted)]">
                      Recommended test: compare this source metric with a
                      suitable prior period before treating a relationship as
                      causal.
                    </p>
                  </div>
                  <a
                    href={SOURCE_LINKS[row.category]}
                    className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-[var(--app-primary)] hover:underline"
                  >
                    Open source module{" "}
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </a>
                </div>

                <div className="mt-5 border-t border-[var(--app-border)] pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-[var(--app-text)]">
                      Investigation hypotheses{" "}
                      <span className="font-normal text-[var(--app-text-faint)]">
                        ({row.diagnosisHypotheses.length})
                      </span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingToInsight(
                          addingToInsight === row.id ? null : row.id,
                        );
                        setHypothesisDraft("");
                      }}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--app-border)] px-3 text-sm font-medium text-[var(--app-text)] hover:bg-[var(--app-surface-muted)]"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" /> Add
                      hypothesis
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                    A hypothesis is an unverified question to investigate, not a
                    root-cause finding.
                  </p>

                  {addingToInsight === row.id && (
                    <form
                      onSubmit={(event) => submitHypothesis(event, row.id)}
                      className="mt-3 space-y-2 rounded-lg bg-[var(--app-surface-muted)] p-3"
                    >
                      <label
                        htmlFor={`hypothesis-${row.id}`}
                        className="text-sm font-medium text-[var(--app-text)]"
                      >
                        What should be tested?
                      </label>
                      <textarea
                        id={`hypothesis-${row.id}`}
                        value={hypothesisDraft}
                        onChange={(event) =>
                          setHypothesisDraft(event.target.value)
                        }
                        maxLength={2000}
                        minLength={10}
                        required
                        rows={3}
                        placeholder="Describe a possible relationship to investigate. Avoid stating an unverified cause as fact."
                        className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-3 text-sm text-[var(--app-text)]"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-[var(--app-text-faint)]">
                          10–2000 characters · saved with an audit entry
                        </span>
                        <button
                          type="submit"
                          disabled={
                            createHypothesis.isPending ||
                            hypothesisDraft.trim().length < 10
                          }
                          className="min-h-9 rounded-lg bg-[var(--app-primary)] px-4 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {createHypothesis.isPending
                            ? "Saving…"
                            : "Save hypothesis"}
                        </button>
                      </div>
                      {createHypothesis.isError && (
                        <p role="alert" className="text-sm text-red-700">
                          {errorText(createHypothesis.error)}
                        </p>
                      )}
                    </form>
                  )}

                  {row.diagnosisHypotheses.length > 0 && (
                    <ul className="mt-3 space-y-3">
                      {row.diagnosisHypotheses.map((hypothesis) => (
                        <li
                          key={hypothesis.id}
                          className="rounded-lg border border-[var(--app-border)] p-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <p className="text-sm text-[var(--app-text)]">
                              {hypothesis.hypothesis}
                            </p>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${hypothesis.status === "resolved" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}
                            >
                              {hypothesis.status === "resolved" ? (
                                <CircleCheck
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                              ) : null}
                              {hypothesis.status}
                            </span>
                          </div>
                          {hypothesis.resolutionNote && (
                            <p className="mt-2 text-xs text-[var(--app-text-muted)]">
                              Resolution note: {hypothesis.resolutionNote}
                            </p>
                          )}
                          {hypothesis.status === "open" && (
                            <div className="mt-3">
                              {resolvingHypothesis === hypothesis.id ? (
                                <form
                                  onSubmit={(event) =>
                                    submitResolution(event, hypothesis.id)
                                  }
                                  className="space-y-2"
                                >
                                  <label
                                    htmlFor={`resolution-${hypothesis.id}`}
                                    className="text-xs font-medium text-[var(--app-text)]"
                                  >
                                    Why is this hypothesis resolved?
                                  </label>
                                  <textarea
                                    id={`resolution-${hypothesis.id}`}
                                    value={resolutionDraft}
                                    onChange={(event) =>
                                      setResolutionDraft(event.target.value)
                                    }
                                    minLength={3}
                                    maxLength={500}
                                    required
                                    rows={2}
                                    className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-2 text-sm text-[var(--app-text)]"
                                  />
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="submit"
                                      disabled={
                                        resolveHypothesis.isPending ||
                                        resolutionDraft.trim().length < 3
                                      }
                                      className="min-h-8 rounded-lg bg-[var(--app-primary)] px-3 text-xs font-semibold text-white disabled:opacity-50"
                                    >
                                      {resolveHypothesis.isPending
                                        ? "Saving…"
                                        : "Resolve with reason"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setResolvingHypothesis(null);
                                        setResolutionDraft("");
                                      }}
                                      className="min-h-8 rounded-lg border border-[var(--app-border)] px-3 text-xs"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                  {resolveHypothesis.isError && (
                                    <p
                                      role="alert"
                                      className="text-sm text-red-700"
                                    >
                                      {errorText(resolveHypothesis.error)}
                                    </p>
                                  )}
                                </form>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setResolvingHypothesis(hypothesis.id)
                                  }
                                  className="text-xs font-semibold text-[var(--app-primary)] hover:underline"
                                >
                                  Resolve hypothesis…
                                </button>
                              )}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {diagnoses.data && (
        <p className="text-xs leading-5 text-[var(--app-text-faint)]">
          {diagnoses.data.disclosure}
        </p>
      )}
    </main>
  );
}
