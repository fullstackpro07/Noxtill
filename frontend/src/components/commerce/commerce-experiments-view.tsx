"use client";

import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { fetchProducts } from "@/lib/products-api";
import {
  createExperiment,
  decideExperiment,
  deleteExperimentDraft,
  fetchExperiments,
  fetchExperimentSummary,
  startExperiment,
  stopExperiment,
  type Experiment,
  type ExperimentDecision,
  type ExperimentMetric,
  type ExperimentStatus,
  type ExperimentType,
  type WindowMetrics,
} from "@/lib/commerce-experiments-api";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

const fieldClass = "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--app-primary)]";
const fieldStyle = { borderColor: "var(--app-border)", background: "var(--app-surface)" };
const primaryButton = "rounded-lg px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50";

const TYPE_LABEL: Record<ExperimentType, string> = {
  price: "Price",
  bundle: "Bundle",
  listing_copy: "Listing copy",
  photo: "Photos",
  shipping_offer: "Shipping offer",
  other: "Other",
};
const METRIC_LABEL: Record<ExperimentMetric, string> = {
  units: "Units sold",
  revenue: "Revenue",
  gross_margin: "Gross margin %",
  return_rate: "Return rate %",
};
const STATUS_LABEL: Record<ExperimentStatus, string> = {
  draft: "Draft",
  running: "Running",
  stopped: "Awaiting decision",
  adopted: "Adopted",
  reverted: "Reverted",
  inconclusive: "Inconclusive",
};
/** For return rate, lower is better; for everything else higher is better. */
const LOWER_IS_BETTER: Record<ExperimentMetric, boolean> = { units: false, revenue: false, gross_margin: false, return_rate: true };

function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint: string; tone?: "warning" }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      <p className="m-0 text-xs font-semibold" style={{ color: "var(--app-text-faint)" }}>{label}</p>
      <p className="m-0 mt-1 text-2xl font-bold" style={{ color: tone === "warning" ? "var(--app-warning-text)" : "var(--app-text)" }}>{value}</p>
      <p className="m-0 mt-1 text-xs" style={{ color: "var(--app-text-faintest)" }}>{hint}</p>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="my-auto max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border p-5 shadow-xl"
        style={{ borderColor: "var(--app-border)", background: "var(--app-surface)", color: "var(--app-text)" }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="m-0 text-base font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="text-sm font-semibold" style={{ color: "var(--app-text-faint)" }}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--app-text-muted)" }}>
      {label}
      {children}
      {hint && <span className="font-normal" style={{ color: "var(--app-text-faintest)" }}>{hint}</span>}
    </label>
  );
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => Promise.all(["experiment-summary", "experiments"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
}

function NewExperimentDialog({ onClose }: { onClose: () => void }) {
  const refresh = useRefresh();
  const productsQuery = useQuery({ queryKey: ["experiment-products"], queryFn: () => fetchProducts({ active: true }) });
  const [productId, setProductId] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<ExperimentType>("price");
  const [hypothesis, setHypothesis] = useState("");
  const [change, setChange] = useState("");
  const [metric, setMetric] = useState<ExperimentMetric>("revenue");
  const [minMargin, setMinMargin] = useState("");
  const [days, setDays] = useState("14");
  const create = useMutation({
    mutationFn: createExperiment,
    onSuccess: async () => {
      await refresh();
      toast.success("Experiment saved as a draft.");
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't save the experiment.")),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate({
      productId,
      name,
      type,
      hypothesis,
      changeDescription: change,
      primaryMetric: metric,
      minMarginPct: minMargin.trim() === "" ? undefined : Number(minMargin),
      plannedDays: Number(days),
    });
  };
  return (
    <Modal title="New experiment" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Product">
          <select required value={productId} onChange={(event) => setProductId(event.target.value)} className={fieldClass} style={fieldStyle}>
            <option value="">{productsQuery.isLoading ? "Loading products…" : "Choose a product"}</option>
            {(productsQuery.data ?? []).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
        </Field>
        <Field label="Name">
          <input required minLength={3} maxLength={160} value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} style={fieldStyle} placeholder="e.g. Price +10%" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="What changes">
            <select value={type} onChange={(event) => setType(event.target.value as ExperimentType)} className={fieldClass} style={fieldStyle}>
              {Object.entries(TYPE_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </Field>
          <Field label="Judge it by">
            <select value={metric} onChange={(event) => setMetric(event.target.value as ExperimentMetric)} className={fieldClass} style={fieldStyle}>
              {Object.entries(METRIC_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Hypothesis">
          <textarea required minLength={5} maxLength={2000} rows={2} value={hypothesis} onChange={(event) => setHypothesis(event.target.value)} className={fieldClass} style={fieldStyle} placeholder="What do you expect to happen, and why?" />
        </Field>
        <Field label="The change you'll make" hint="You make this change yourself when you start — Noxtill doesn't edit prices or listings here.">
          <textarea required minLength={3} maxLength={2000} rows={2} value={change} onChange={(event) => setChange(event.target.value)} className={fieldClass} style={fieldStyle} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Planned days" hint="7–180">
            <input type="number" required min={7} max={180} value={days} onChange={(event) => setDays(event.target.value)} className={fieldClass} style={fieldStyle} />
          </Field>
          <Field label="Margin guardrail % (optional)" hint="Flag if gross margin drops below">
            <input type="number" step="0.01" min={-100} max={100} value={minMargin} onChange={(event) => setMinMargin(event.target.value)} className={fieldClass} style={fieldStyle} />
          </Field>
        </div>
        <div className="flex justify-end">
          <button type="submit" disabled={create.isPending} className={primaryButton} style={{ background: "var(--app-primary)" }}>
            {create.isPending ? "Saving…" : "Save draft"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DecideDialog({ experiment, onClose }: { experiment: Experiment; onClose: () => void }) {
  const refresh = useRefresh();
  const [decision, setDecision] = useState<ExperimentDecision>(experiment.results?.sufficient ? "adopted" : "inconclusive");
  const [note, setNote] = useState("");
  const decide = useMutation({
    mutationFn: () => decideExperiment(experiment.id, decision, note),
    onSuccess: async () => {
      await refresh();
      toast.success("Decision recorded.");
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't record the decision.")),
  });
  return (
    <Modal title={`Decide: ${experiment.name}`} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          decide.mutate();
        }}
        className="flex flex-col gap-3"
      >
        {experiment.results && !experiment.results.sufficient && (
          <p className="m-0 text-xs" style={{ color: "var(--app-warning-text)" }}>
            Not enough data for a read: {experiment.results.insufficientReasons.join(" ")}
          </p>
        )}
        <Field label="Decision" hint={decision === "reverted" ? "Undo the change yourself in Products or the listing — Noxtill doesn't revert it for you." : undefined}>
          <select value={decision} onChange={(event) => setDecision(event.target.value as ExperimentDecision)} className={fieldClass} style={fieldStyle}>
            <option value="adopted">Adopt — keep the change</option>
            <option value="reverted">Revert — go back</option>
            <option value="inconclusive">Inconclusive</option>
          </select>
        </Field>
        <Field label="Why">
          <textarea required minLength={3} maxLength={2000} rows={3} value={note} onChange={(event) => setNote(event.target.value)} className={fieldClass} style={fieldStyle} />
        </Field>
        <div className="flex justify-end">
          <button type="submit" disabled={decide.isPending} className={primaryButton} style={{ background: "var(--app-primary)" }}>
            {decide.isPending ? "Saving…" : "Record decision"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function formatMetric(value: number | null, metric: ExperimentMetric, currency: string) {
  if (value === null) return "—";
  if (metric === "revenue") return money(value, currency);
  if (metric === "units") return String(value);
  return `${value}%`;
}

function WindowColumn({ label, window, currency }: { label: string; window: WindowMetrics; currency: string }) {
  return (
    <div>
      <p className="m-0 font-semibold" style={{ color: "var(--app-text-faint)" }}>
        {label} · {formatDate(window.from)} – {formatDate(window.to)}
      </p>
      <p className="m-0 mt-0.5">
        {window.units} units · {window.orders} orders · {money(window.revenue, currency)} · margin {window.grossMarginPct === null ? "—" : `${window.grossMarginPct}%`} · returns{" "}
        {window.returnRatePct === null ? "—" : `${window.returnRatePct}%`}
      </p>
    </div>
  );
}

function ExperimentCard({ experiment, currency, onDecide }: { experiment: Experiment; currency: string; onDecide: () => void }) {
  const refresh = useRefresh();
  const act = useMutation({
    mutationFn: (action: "start" | "stop" | "delete") =>
      action === "start" ? startExperiment(experiment.id) : action === "stop" ? stopExperiment(experiment.id) : deleteExperimentDraft(experiment.id),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error, "Couldn't update the experiment.")),
  });
  const results = experiment.results;
  const change = results?.primary.change ?? null;
  const better = change === null || change === 0 ? null : LOWER_IS_BETTER[experiment.primaryMetric] ? change < 0 : change > 0;
  const plannedEnd = experiment.startedAt ? new Date(new Date(experiment.startedAt).getTime() + experiment.plannedDays * 86_400_000) : null;
  return (
    <article className="rounded-2xl border p-4 text-xs" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="m-0 text-sm font-bold">{experiment.name}</p>
          <p className="m-0 mt-0.5" style={{ color: "var(--app-text-faint)" }}>
            {experiment.product.name} · {TYPE_LABEL[experiment.type]} · judged by {METRIC_LABEL[experiment.primaryMetric]}
          </p>
        </div>
        <span className="rounded-full px-2.5 py-1 font-bold" style={{ background: "var(--app-surface-2)" }}>{STATUS_LABEL[experiment.status]}</span>
      </div>
      <p className="m-0 mt-2"><strong>Hypothesis:</strong> {experiment.hypothesis}</p>
      <p className="m-0 mt-1"><strong>Change:</strong> {experiment.changeDescription}</p>
      {experiment.startedAt && (
        <p className="m-0 mt-1" style={{ color: "var(--app-text-faint)" }}>
          Started {formatDate(experiment.startedAt)}
          {experiment.stoppedAt ? ` · stopped ${formatDate(experiment.stoppedAt)}` : plannedEnd ? ` · planned to run until ${formatDate(plannedEnd.toISOString())}` : ""}
          {experiment.priceAtStart !== null && ` · price at start ${money(experiment.priceAtStart, currency)}`}
          {experiment.priceAtStop !== null && ` → at stop ${money(experiment.priceAtStop, currency)}`}
        </p>
      )}
      {experiment.priceUnchanged && (
        <p className="m-0 mt-1 font-semibold" style={{ color: "var(--app-warning-text)" }}>
          The product&rsquo;s price was the same at start and stop — this price test may not have been applied.
        </p>
      )}

      {results && (
        <div className="mt-3 flex flex-col gap-2 rounded-xl border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)" }}>
          <WindowColumn label="Before" window={results.baseline} currency={currency} />
          <WindowColumn label={experiment.status === "running" ? "During (so far)" : "During"} window={results.test} currency={currency} />
          {results.sufficient ? (
            <p className="m-0 font-semibold">
              {METRIC_LABEL[experiment.primaryMetric]}: {formatMetric(results.primary.baselineValue, experiment.primaryMetric, currency)} →{" "}
              {formatMetric(results.primary.testValue, experiment.primaryMetric, currency)}
              {change !== null && (
                <span style={{ color: better === null ? undefined : better ? "var(--app-success-text)" : "var(--app-danger-strong)" }}>
                  {" "}({change > 0 ? "+" : ""}{change}{results.primary.changeUnit === "pct" ? "%" : " pts"})
                </span>
              )}
              <span className="block font-normal" style={{ color: "var(--app-text-faintest)" }}>
                Directional only — a before/after comparison over {results.windowDays} days, not a significance test.
              </span>
            </p>
          ) : (
            <p className="m-0" style={{ color: "var(--app-warning-text)" }}>Not enough data for a read yet: {results.insufficientReasons.join(" ")}</p>
          )}
          {results.guardrail?.breached && (
            <p className="m-0 font-semibold" style={{ color: "var(--app-danger-strong)" }}>
              Guardrail breached: margin {results.guardrail.testMarginPct}% is below your {results.guardrail.minMarginPct}% floor.
            </p>
          )}
        </div>
      )}

      {experiment.decisionNote && (
        <p className="m-0 mt-2"><strong>Decision note:</strong> {experiment.decisionNote}{experiment.decidedAt && ` (${formatDate(experiment.decidedAt)})`}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-3">
        {experiment.status === "draft" && (
          <>
            <button type="button" disabled={act.isPending} onClick={() => act.mutate("start")} className="font-bold underline">Start — I&rsquo;ve made the change</button>
            <button type="button" disabled={act.isPending} onClick={() => act.mutate("delete")} className="font-bold underline" style={{ color: "var(--app-text-faint)" }}>Delete draft</button>
          </>
        )}
        {experiment.status === "running" && (
          <button type="button" disabled={act.isPending} onClick={() => act.mutate("stop")} className="font-bold underline">Stop &amp; freeze results</button>
        )}
        {experiment.status === "stopped" && <button type="button" onClick={onDecide} className="font-bold underline">Record decision</button>}
      </div>
    </article>
  );
}

export function CommerceExperimentsView() {
  const [creating, setCreating] = useState(false);
  const [deciding, setDeciding] = useState<Experiment | null>(null);
  const headerActions = useMemo(
    () => (
      <button type="button" onClick={() => setCreating(true)} className={primaryButton} style={{ background: "var(--app-primary)" }}>
        New experiment
      </button>
    ),
    [],
  );
  useModuleHeader({
    title: "Experiment Lab",
    subtitle: "Try one change on one product and compare sales before and after it, on your real orders.",
    actions: headerActions,
  });
  const session = useSession();
  const currency = session.business.currency || "USD";
  const summaryQuery = useQuery({ queryKey: ["experiment-summary"], queryFn: fetchExperimentSummary });
  const listQuery = useQuery({ queryKey: ["experiments"], queryFn: fetchExperiments });
  const summary = summaryQuery.data;
  const loading = summaryQuery.isLoading;

  return (
    <main className="flex flex-col gap-5 p-5 md:p-7" style={{ color: "var(--app-text)" }}>
      <p className="m-0 rounded-xl border px-4 py-3 text-xs" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)", color: "var(--app-text-muted)" }}>
        Noxtill has no storefront traffic and can&rsquo;t split visitors between versions, so this is <strong>not a randomized A/B test</strong> and
        conversion rate is <strong>not tracked</strong>. Each experiment compares one product&rsquo;s real orders and returns during the test with an
        equal-length period right before it. Seasonality and promotions aren&rsquo;t controlled for, so treat results as directional. A read appears only
        after {summary ? `${summary.rules.minDays} days and ${summary.rules.minUnitsPerWindow} units sold in each period` : "a minimum run and sample"};
        only one experiment can run per product at a time. You make and undo the change yourself.
      </p>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Running" value={loading ? "…" : summary?.running ?? "—"} hint="Collecting sales now" />
        <Kpi label="Awaiting decision" value={loading ? "…" : summary?.awaitingDecision ?? "—"} hint="Stopped, results frozen" tone={summary?.awaitingDecision ? "warning" : undefined} />
        <Kpi label="Adopted" value={loading ? "…" : summary?.adopted ?? "—"} hint="Change kept" />
        <Kpi label="Reverted / inconclusive" value={loading ? "…" : summary ? summary.reverted + summary.inconclusive : "—"} hint="Change dropped or unclear" />
        <Kpi label="Conversion rate" value="Not tracked" hint="No storefront traffic data" />
      </section>

      {listQuery.isLoading ? (
        <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading experiments…</p>
      ) : listQuery.isError ? (
        <div className="flex flex-wrap items-center gap-3 text-sm" style={{ color: "var(--app-danger-strong)" }}>
          {errorMessage(listQuery.error, "Couldn't load experiments.")}
          <button type="button" onClick={() => listQuery.refetch()} className="font-bold underline">Retry</button>
        </div>
      ) : (listQuery.data ?? []).length === 0 ? (
        <div className="rounded-2xl border p-6 text-sm" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-faint)" }}>
          No experiments yet. Store Optimizer findings are a good place to find a change worth testing.
        </div>
      ) : (
        <section className="grid gap-3 lg:grid-cols-2">
          {(listQuery.data ?? []).map((experiment) => (
            <ExperimentCard key={experiment.id} experiment={experiment} currency={currency} onDecide={() => setDeciding(experiment)} />
          ))}
        </section>
      )}

      {creating && <NewExperimentDialog onClose={() => setCreating(false)} />}
      {deciding && <DecideDialog experiment={deciding} onClose={() => setDeciding(null)} />}
    </main>
  );
}
