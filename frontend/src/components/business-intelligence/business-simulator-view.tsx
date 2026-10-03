"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calculator,
  FlaskConical,
  History,
  Plus,
  Save,
  ShieldCheck,
} from "lucide-react";
import {
  fetchBiScenarioVersions,
  fetchBiSimulatorContext,
  saveBiScenarioVersion,
  type BiScenarioType,
  type BiScenarioVersion,
  type CreateBiScenarioInput,
} from "@/lib/business-intelligence-api";

const SCENARIO_TYPES: { value: BiScenarioType; label: string }[] = [
  { value: "price", label: "Price change" },
  { value: "stock", label: "Stock quantity" },
  { value: "staff", label: "Staff size" },
  { value: "marketing", label: "Marketing budget" },
];

function recordNumber(
  record: Record<string, unknown>,
  key: string,
): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

function assumptionSummary(
  scenario: BiScenarioVersion,
  currency: string,
): string {
  switch (scenario.scenarioType) {
    case "price": {
      const change = recordNumber(scenario.assumptions, "priceChangePercent");
      return change === null
        ? "Price assumption unavailable"
        : `${change > 0 ? "+" : ""}${change}% price change; assumes unit volume stays unchanged`;
    }
    case "stock": {
      const units = recordNumber(scenario.assumptions, "additionalStockUnits");
      const product =
        typeof scenario.baseline.productName === "string"
          ? scenario.baseline.productName
          : "selected product";
      return units === null
        ? `Stock assumption for ${product}`
        : `${units} hypothetical units added to ${product}`;
    }
    case "staff": {
      const change = recordNumber(scenario.assumptions, "staffCountChange");
      return change === null
        ? "Staff-count assumption unavailable"
        : `${change > 0 ? "+" : ""}${change} people against recorded team size`;
    }
    case "marketing": {
      const change = recordNumber(
        scenario.assumptions,
        "marketingBudgetChange",
      );
      return change === null
        ? "Marketing budget assumption unavailable"
        : `${formatCurrency(change, currency)} hypothetical budget change; ROI not available`;
    }
  }
}

function ScenarioOutcome({
  scenario,
  currency,
}: {
  scenario: BiScenarioVersion;
  currency: string;
}) {
  const outcome = scenario.outcome;
  if (!outcome) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--app-border)] p-4">
        <p className="text-sm font-semibold text-[var(--app-text)]">
          Outcome not available
        </p>
        <p className="mt-1 text-sm text-[var(--app-text-muted)]">
          {scenario.calculationNote}
        </p>
      </div>
    );
  }

  if (scenario.scenarioType === "price") {
    const current = recordNumber(scenario.baseline, "revenueThisMonth");
    const adjusted = recordNumber(outcome, "revenueAtUnchangedVolume");
    const difference = recordNumber(outcome, "revenueDeltaAtUnchangedVolume");
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        <ResultValue
          label="Recorded revenue baseline"
          value={
            current === null
              ? "Not available"
              : formatCurrency(current, currency)
          }
        />
        <ResultValue
          label="At unchanged unit volume"
          value={
            adjusted === null
              ? "Not available"
              : formatCurrency(adjusted, currency)
          }
        />
        <ResultValue
          label="Arithmetic difference"
          value={
            difference === null
              ? "Not available"
              : formatCurrency(difference, currency)
          }
        />
      </div>
    );
  }

  if (scenario.scenarioType === "stock") {
    const current = recordNumber(scenario.baseline, "stockQty");
    const projected = recordNumber(outcome, "projectedStockQty");
    const threshold = recordNumber(scenario.baseline, "lowStockThreshold");
    const clearsThreshold = outcome.atOrAboveReorderThreshold === true;
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        <ResultValue
          label="Current recorded stock"
          value={current === null ? "Not available" : String(current)}
        />
        <ResultValue
          label="After assumed units"
          value={projected === null ? "Not available" : String(projected)}
        />
        <ResultValue
          label="Reorder threshold"
          value={threshold === null ? "Not available" : String(threshold)}
          hint={
            clearsThreshold
              ? "Above recorded threshold"
              : "At or below threshold"
          }
        />
      </div>
    );
  }

  if (scenario.scenarioType === "staff") {
    const current = recordNumber(scenario.baseline, "recordedTeamSize");
    const projected = recordNumber(outcome, "hypotheticalTeamSize");
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <ResultValue
          label="Recorded team size"
          value={current === null ? "Not available" : String(current)}
        />
        <ResultValue
          label="Hypothetical team size"
          value={projected === null ? "Not available" : String(projected)}
          hint="Headcount only; not capacity or productivity"
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-dashed border-[var(--app-border)] p-4">
      <p className="text-sm font-semibold text-[var(--app-text)]">
        Marketing outcome not available
      </p>
      <p className="mt-1 text-sm text-[var(--app-text-muted)]">
        {scenario.calculationNote}
      </p>
    </div>
  );
}

function ResultValue({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg bg-[var(--app-surface-muted)] p-3">
      <p className="text-xs text-[var(--app-text-muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--app-text)]">
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-xs text-[var(--app-text-faint)]">{hint}</p>
      )}
    </div>
  );
}

function ScenarioGroup({
  versions,
  currency,
  onNextVersion,
}: {
  versions: BiScenarioVersion[];
  currency: string;
  onNextVersion: (scenario: BiScenarioVersion) => void;
}) {
  const latest = versions[0];
  const versionHistory = [...versions].sort((a, b) => a.version - b.version);
  return (
    <article className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[var(--app-primary-soft)] px-2.5 py-1 text-xs font-semibold capitalize text-[var(--app-primary)]">
              {latest.scenarioType}
            </span>
            <span className="text-xs text-[var(--app-text-faint)]">
              Version {latest.version}
            </span>
          </div>
          <h2 className="mt-2 text-lg font-semibold text-[var(--app-text)]">
            {latest.name}
          </h2>
          <p className="mt-1 text-sm text-[var(--app-text-muted)]">
            {assumptionSummary(latest, currency)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNextVersion(latest)}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--app-border)] px-3 py-2 text-sm font-medium text-[var(--app-text)] hover:bg-[var(--app-surface-muted)]"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Create next version
        </button>
      </div>
      <div className="mt-4">
        <ScenarioOutcome scenario={latest} currency={currency} />
      </div>
      <p className="mt-3 text-xs leading-5 text-[var(--app-text-faint)]">
        {latest.calculationNote} · Saved{" "}
        {new Date(latest.createdAt).toLocaleString()}
      </p>
      {versionHistory.length > 1 && (
        <details className="mt-4 border-t border-[var(--app-border)] pt-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-[var(--app-text-muted)]">
            <History className="h-4 w-4" aria-hidden />
            Version history ({versionHistory.length - 1} earlier)
          </summary>
          <ol className="mt-3 flex flex-col gap-3">
            {versionHistory.slice(0, -1).map((version) => (
              <li
                key={version.id}
                className="rounded-lg border border-[var(--app-border)] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-[var(--app-text)]">
                    Version {version.version} ·{" "}
                    {assumptionSummary(version, currency)}
                  </p>
                  <p className="text-xs text-[var(--app-text-faint)]">
                    {new Date(version.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="mt-3">
                  <ScenarioOutcome scenario={version} currency={currency} />
                </div>
              </li>
            ))}
          </ol>
        </details>
      )}
    </article>
  );
}

export function BusinessSimulatorView() {
  const queryClient = useQueryClient();
  const context = useQuery({
    queryKey: ["business-intelligence", "simulator", "context"],
    queryFn: fetchBiSimulatorContext,
  });
  const scenarios = useQuery({
    queryKey: ["business-intelligence", "simulator", "versions"],
    queryFn: fetchBiScenarioVersions,
  });
  const [name, setName] = useState("");
  const [scenarioType, setScenarioType] = useState<BiScenarioType>("price");
  const [seriesId, setSeriesId] = useState<string | undefined>();
  const [priceChange, setPriceChange] = useState("");
  const [productId, setProductId] = useState("");
  const [additionalStock, setAdditionalStock] = useState("");
  const [staffChange, setStaffChange] = useState("");
  const [marketingBudgetChange, setMarketingBudgetChange] = useState("");
  const simulationDefaultsApplied = useRef(false);
  const save = useMutation({
    mutationFn: saveBiScenarioVersion,
    onSuccess: async (saved) => {
      setSeriesId(saved.seriesId);
      await queryClient.invalidateQueries({
        queryKey: ["business-intelligence", "simulator", "versions"],
      });
    },
  });

  useEffect(() => {
    if (!context.data || simulationDefaultsApplied.current) return;
    const defaults = context.data.simulationDefaults;
    setPriceChange(String(defaults.priceChangePercent ?? ""));
    setAdditionalStock(String(defaults.additionalStockUnits ?? ""));
    setStaffChange(String(defaults.staffCountChange ?? ""));
    setMarketingBudgetChange(String(defaults.marketingBudgetChange ?? ""));
    simulationDefaultsApplied.current = true;
  }, [context.data]);

  const groups = useMemo(() => {
    const bySeries = new Map<string, BiScenarioVersion[]>();
    for (const version of scenarios.data ?? []) {
      const group = bySeries.get(version.seriesId) ?? [];
      group.push(version);
      bySeries.set(version.seriesId, group);
    }
    return Array.from(bySeries.values())
      .map((versions) => [...versions].sort((a, b) => b.version - a.version))
      .sort(
        (a, b) =>
          new Date(b[0].createdAt).getTime() -
          new Date(a[0].createdAt).getTime(),
      );
  }, [scenarios.data]);

  function startNewScenario() {
    setName("");
    setScenarioType("price");
    setSeriesId(undefined);
    setPriceChange(
      String(context.data?.simulationDefaults.priceChangePercent ?? ""),
    );
    setProductId("");
    setAdditionalStock(
      String(context.data?.simulationDefaults.additionalStockUnits ?? ""),
    );
    setStaffChange(
      String(context.data?.simulationDefaults.staffCountChange ?? ""),
    );
    setMarketingBudgetChange(
      String(context.data?.simulationDefaults.marketingBudgetChange ?? ""),
    );
    save.reset();
  }

  function startNextVersion(scenario: BiScenarioVersion) {
    setName(scenario.name);
    setScenarioType(scenario.scenarioType);
    setSeriesId(scenario.seriesId);
    setPriceChange(String(scenario.assumptions.priceChangePercent ?? ""));
    setProductId(String(scenario.assumptions.productId ?? ""));
    setAdditionalStock(String(scenario.assumptions.additionalStockUnits ?? ""));
    setStaffChange(String(scenario.assumptions.staffCountChange ?? ""));
    setMarketingBudgetChange(
      String(scenario.assumptions.marketingBudgetChange ?? ""),
    );
    save.reset();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    const input: CreateBiScenarioInput = {
      name: name.trim(),
      scenarioType,
      ...(seriesId ? { seriesId } : {}),
    };
    if (scenarioType === "price") {
      input.priceChangePercent = Number(priceChange);
    } else if (scenarioType === "stock") {
      input.productId = productId;
      input.additionalStockUnits = Number(additionalStock);
    } else if (scenarioType === "staff") {
      input.staffCountChange = Number(staffChange);
    } else {
      input.marketingBudgetChange = Number(marketingBudgetChange);
    }
    save.mutate(input);
  }

  const controlClass =
    "mt-1 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-sm text-[var(--app-text)] outline-none focus:ring-2 focus:ring-[var(--app-primary)]";

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-5 md:p-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--app-primary)]">
          Business Intelligence
        </p>
        <h1 className="mt-2 text-2xl font-bold text-[var(--app-text)] md:text-3xl">
          Business Simulator
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--app-text-muted)]">
          Compare clearly stated what-if assumptions against recorded data. Each
          save creates an immutable version; scenarios never change live
          products, orders, staff, or campaigns.
        </p>
      </header>

      {context.isLoading ? (
        <p className="text-sm text-[var(--app-text-muted)]">
          Loading recorded baselines…
        </p>
      ) : context.isError ? (
        <section
          role="alert"
          className="rounded-xl border border-[var(--app-danger-border)] bg-[var(--app-danger-bg)] p-5 text-sm text-[var(--app-danger)]"
        >
          Could not load simulator baselines. {context.error.message}
        </section>
      ) : context.data ? (
        <>
          <section
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            aria-label="Recorded simulation baselines"
          >
            <ResultValue
              label="Revenue this month · Dashboard"
              value={
                context.data.priceBaseline.value === null
                  ? "Not available"
                  : formatCurrency(
                      context.data.priceBaseline.value,
                      context.data.currency,
                    )
              }
            />
            <ResultValue
              label="Team size · Dashboard"
              value={
                context.data.staffBaseline.value === null
                  ? "Not available"
                  : String(context.data.staffBaseline.value)
              }
              hint="Recorded count; not capacity"
            />
            <ResultValue
              label="Products available for stock what-if"
              value={String(context.data.products.length)}
            />
            <ResultValue
              label="Marketing spend / attributed revenue"
              value={context.data.marketingBaseline.budgetAndAttributedRevenue}
              hint={`${context.data.marketingBaseline.campaignRecords} campaign records; no budgets`}
            />
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--app-primary-soft)] text-[var(--app-primary)]">
                  <FlaskConical className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h2 className="font-semibold text-[var(--app-text)]">
                    {seriesId ? "Create a new version" : "Build a scenario"}
                  </h2>
                  <p className="text-xs text-[var(--app-text-muted)]">
                    Saved defaults prefill assumptions for review
                  </p>
                </div>
              </div>
              <form className="mt-5 flex flex-col gap-4" onSubmit={submit}>
                <label className="text-sm font-medium text-[var(--app-text)]">
                  Scenario name
                  <input
                    className={controlClass}
                    value={name}
                    onChange={(event) =>
                      setName(event.target.value.slice(0, 120))
                    }
                    minLength={2}
                    maxLength={120}
                    required
                    placeholder="e.g. Small price adjustment"
                  />
                </label>
                <label className="text-sm font-medium text-[var(--app-text)]">
                  What do you want to explore?
                  <select
                    className={controlClass}
                    value={scenarioType}
                    disabled={Boolean(seriesId)}
                    onChange={(event) =>
                      setScenarioType(event.target.value as BiScenarioType)
                    }
                  >
                    {SCENARIO_TYPES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                {scenarioType === "price" && (
                  <label className="text-sm font-medium text-[var(--app-text)]">
                    Hypothetical price change (%)
                    <input
                      className={controlClass}
                      type="number"
                      inputMode="decimal"
                      min={-90}
                      max={500}
                      step="0.01"
                      value={priceChange}
                      onChange={(event) => setPriceChange(event.target.value)}
                      required
                    />
                    <span className="mt-1 block text-xs font-normal text-[var(--app-text-muted)]">
                      Revenue arithmetic assumes unit volume stays unchanged.
                    </span>
                  </label>
                )}
                {scenarioType === "stock" && (
                  <>
                    <label className="text-sm font-medium text-[var(--app-text)]">
                      Product
                      <select
                        className={controlClass}
                        value={productId}
                        onChange={(event) => setProductId(event.target.value)}
                        required
                      >
                        <option value="">Select a recorded product</option>
                        {context.data.products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name} · {product.stockQty} recorded
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-medium text-[var(--app-text)]">
                      Hypothetical additional units
                      <input
                        className={controlClass}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={1000000}
                        step={1}
                        value={additionalStock}
                        onChange={(event) =>
                          setAdditionalStock(event.target.value)
                        }
                        required
                      />
                    </label>
                  </>
                )}
                {scenarioType === "staff" && (
                  <label className="text-sm font-medium text-[var(--app-text)]">
                    Change to recorded team size
                    <input
                      className={controlClass}
                      type="number"
                      inputMode="numeric"
                      min={-100}
                      max={100}
                      step={1}
                      value={staffChange}
                      onChange={(event) => setStaffChange(event.target.value)}
                      required
                    />
                    <span className="mt-1 block text-xs font-normal text-[var(--app-text-muted)]">
                      Headcount arithmetic only; capacity, payroll and
                      productivity are not modeled.
                    </span>
                  </label>
                )}
                {scenarioType === "marketing" && (
                  <label className="text-sm font-medium text-[var(--app-text)]">
                    Hypothetical budget change ({context.data.currency})
                    <input
                      className={controlClass}
                      type="number"
                      inputMode="decimal"
                      min={-1000000}
                      max={1000000}
                      step="0.01"
                      value={marketingBudgetChange}
                      onChange={(event) =>
                        setMarketingBudgetChange(event.target.value)
                      }
                      required
                    />
                    <span className="mt-1 block text-xs font-normal text-[var(--app-text-muted)]">
                      Saved as an assumption only. No ROI or revenue outcome is
                      estimated.
                    </span>
                  </label>
                )}
                {save.isError && (
                  <p
                    role="alert"
                    className="rounded-lg border border-[var(--app-danger-border)] bg-[var(--app-danger-bg)] p-3 text-sm text-[var(--app-danger)]"
                  >
                    Could not save scenario. {save.error.message}
                  </p>
                )}
                {save.isSuccess && (
                  <p
                    role="status"
                    className="rounded-lg border border-[var(--app-success-border)] bg-[var(--app-success-bg)] p-3 text-sm text-[var(--app-success)]"
                  >
                    Saved immutable version {save.data.version}. Live business
                    records were not changed.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={save.isPending}
                    className="inline-flex items-center gap-2 rounded-lg bg-[var(--app-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" aria-hidden />
                    {save.isPending
                      ? "Saving version…"
                      : seriesId
                        ? "Save next version"
                        : "Save scenario"}
                  </button>
                  {seriesId && (
                    <button
                      type="button"
                      onClick={startNewScenario}
                      className="inline-flex items-center gap-2 rounded-lg border border-[var(--app-border)] px-4 py-2 text-sm font-medium text-[var(--app-text)] hover:bg-[var(--app-surface-muted)]"
                    >
                      <Plus className="h-4 w-4" aria-hidden /> New scenario
                    </button>
                  )}
                </div>
              </form>
            </div>

            <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--app-success-bg)] text-[var(--app-success)]">
                  <ShieldCheck className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h2 className="font-semibold text-[var(--app-text)]">
                    Read-only simulation rules
                  </h2>
                  <p className="text-xs text-[var(--app-text-muted)]">
                    The live catalog and operations are never changed
                  </p>
                </div>
              </div>
              <ul className="mt-4 flex flex-col gap-3 text-sm leading-5 text-[var(--app-text-muted)]">
                <li>
                  • Every save creates a separately stored scenario version with
                  its baseline and assumptions.
                </li>
                <li>
                  • Price and stock results are transparent arithmetic, not
                  demand forecasts.
                </li>
                <li>
                  • Staff output is headcount only. Marketing ROI is unavailable
                  without recorded spend and attribution.
                </li>
              </ul>
              <p className="mt-4 border-t border-[var(--app-border)] pt-3 text-xs leading-5 text-[var(--app-text-faint)]">
                {context.data.disclosure}
              </p>
            </div>
          </section>

          <section
            className="flex flex-col gap-3"
            aria-label="Saved scenario versions"
          >
            <div className="flex items-center gap-2">
              <Calculator
                className="h-5 w-5 text-[var(--app-primary)]"
                aria-hidden
              />
              <h2 className="text-lg font-semibold text-[var(--app-text)]">
                Saved scenarios
              </h2>
            </div>
            {scenarios.isLoading ? (
              <p className="text-sm text-[var(--app-text-muted)]">
                Loading scenario history…
              </p>
            ) : scenarios.isError ? (
              <p role="alert" className="text-sm text-[var(--app-danger)]">
                Could not load scenario history. {scenarios.error.message}
              </p>
            ) : groups.length ? (
              groups.map((versions) => (
                <ScenarioGroup
                  key={versions[0].seriesId}
                  versions={versions}
                  currency={context.data.currency}
                  onNextVersion={startNextVersion}
                />
              ))
            ) : (
              <p className="rounded-xl border border-dashed border-[var(--app-border)] p-5 text-sm text-[var(--app-text-muted)]">
                No scenarios saved yet. A scenario will appear here after you
                save its first version.
              </p>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
