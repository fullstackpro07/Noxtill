"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  Building2,
  History,
  Package,
  Plus,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  fetchDigitalTwinAssumptions,
  fetchDigitalTwinContext,
  saveDigitalTwinAssumption,
  type CreateDigitalTwinAssumption,
  type DigitalTwinAssumption,
  type DigitalTwinContext,
  type TwinAssumptionKey,
  type TwinEntityType,
} from "@/lib/digital-twin-api";

const ENTITY_LABELS: Record<TwinEntityType, string> = {
  business: "Business",
  branch: "Branch",
  staff: "Staff member",
  product: "Product or service",
  supplier: "Supplier",
};

const ASSUMPTION_OPTIONS: Record<
  TwinEntityType,
  {
    value: TwinAssumptionKey;
    label: string;
    unit: string;
    min: number;
    max: number;
    step: number;
  }[]
> = {
  business: [
    {
      value: "expense_adjustment_percent",
      label: "Expense adjustment",
      unit: "%",
      min: -100,
      max: 1000,
      step: 0.1,
    },
  ],
  branch: [
    {
      value: "branch_daily_capacity",
      label: "Daily service capacity",
      unit: "jobs / day",
      min: 0,
      max: 1_000_000,
      step: 1,
    },
    {
      value: "expense_adjustment_percent",
      label: "Expense adjustment",
      unit: "%",
      min: -100,
      max: 1000,
      step: 0.1,
    },
  ],
  staff: [
    {
      value: "staff_weekly_hours",
      label: "Weekly hours",
      unit: "hours / week",
      min: 0,
      max: 168,
      step: 0.25,
    },
  ],
  product: [
    {
      value: "product_reorder_buffer_units",
      label: "Reorder buffer",
      unit: "units",
      min: 0,
      max: 1_000_000,
      step: 1,
    },
  ],
  supplier: [
    {
      value: "supplier_lead_days",
      label: "Supplier lead time",
      unit: "days",
      min: 0,
      max: 3650,
      step: 0.25,
    },
  ],
};

function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The request could not be completed.";
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

function targetLabel(
  entityType: TwinEntityType,
  entityId: string,
  context: DigitalTwinContext,
): string {
  if (entityType === "business") return context.targets.business.name;
  const collection =
    entityType === "branch"
      ? context.targets.branches
      : entityType === "staff"
        ? context.targets.staff
        : entityType === "product"
          ? context.targets.products
          : context.targets.suppliers;
  return (
    collection.find((target) => target.id === entityId)?.name ??
    "Source entity unavailable"
  );
}

function AssumptionHistory({
  rows,
  context,
  onVersion,
}: {
  rows: DigitalTwinAssumption[];
  context: DigitalTwinContext;
  onVersion: (row: DigitalTwinAssumption) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, DigitalTwinAssumption[]>();
    for (const row of rows) {
      const versions = map.get(row.seriesId) ?? [];
      versions.push(row);
      map.set(row.seriesId, versions);
    }
    return [...map.values()].map((versions) =>
      versions.sort((a, b) => b.version - a.version),
    );
  }, [rows]);

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--app-border)] p-8 text-center">
        <History
          className="mx-auto h-6 w-6 text-[var(--app-text-faint)]"
          aria-hidden
        />
        <p className="mt-3 text-sm font-semibold text-[var(--app-text)]">
          No assumptions saved
        </p>
        <p className="mt-1 text-sm text-[var(--app-text-muted)]">
          Operational records above are live. Add an assumption only when you
          want to model an unrecorded value.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((versions) => {
        const latest = versions[0];
        const option = ASSUMPTION_OPTIONS[latest.entityType].find(
          (entry) => entry.value === latest.assumptionKey,
        );
        return (
          <article
            key={latest.seriesId}
            className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--app-primary)]">
                  {ENTITY_LABELS[latest.entityType]} ·{" "}
                  {option?.label ?? latest.assumptionKey}
                </p>
                <h3 className="mt-1 font-semibold text-[var(--app-text)]">
                  {targetLabel(latest.entityType, latest.entityId, context)}
                </h3>
                <p className="mt-1 text-sm text-[var(--app-text-muted)]">
                  {latest.value} {option?.unit} · {latest.rationale}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[var(--app-surface-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--app-text-muted)]">
                  Version {latest.version}
                </span>
                <button
                  type="button"
                  onClick={() => onVersion(latest)}
                  className="rounded-lg border border-[var(--app-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--app-text)] hover:bg-[var(--app-surface-muted)]"
                >
                  Create next version
                </button>
              </div>
            </div>
            {versions.length > 1 && (
              <details className="mt-3 border-t border-[var(--app-border)] pt-3">
                <summary className="cursor-pointer text-sm font-medium text-[var(--app-text-muted)]">
                  Compare earlier versions ({versions.length - 1})
                </summary>
                <ol className="mt-3 space-y-2">
                  {versions.slice(1).map((version) => (
                    <li
                      key={version.id}
                      className="flex flex-wrap justify-between gap-2 text-sm text-[var(--app-text-muted)]"
                    >
                      <span>
                        v{version.version}: {version.value} {option?.unit} —{" "}
                        {version.rationale}
                      </span>
                      <time dateTime={version.createdAt}>
                        {new Date(version.createdAt).toLocaleString()}
                      </time>
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </article>
        );
      })}
    </div>
  );
}

export function DigitalTwinView() {
  const context = useQuery({
    queryKey: ["business-intelligence", "digital-twin", "context"],
    queryFn: fetchDigitalTwinContext,
  });
  const assumptions = useQuery({
    queryKey: ["business-intelligence", "digital-twin", "assumptions"],
    queryFn: fetchDigitalTwinAssumptions,
  });
  const queryClient = useQueryClient();
  const [entityType, setEntityType] = useState<TwinEntityType>("business");
  const [entityId, setEntityId] = useState("");
  const [assumptionKey, setAssumptionKey] = useState<TwinAssumptionKey>(
    "expense_adjustment_percent",
  );
  const [value, setValue] = useState("");
  const [rationale, setRationale] = useState("");
  const [editingSeriesId, setEditingSeriesId] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: (input: CreateDigitalTwinAssumption) =>
      saveDigitalTwinAssumption(input),
    onSuccess: async () => {
      setValue("");
      setRationale("");
      setEditingSeriesId(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["business-intelligence", "digital-twin", "context"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["business-intelligence", "digital-twin", "assumptions"],
        }),
      ]);
    },
  });

  const options = ASSUMPTION_OPTIONS[entityType];
  const targets = context.data?.targets;
  const entityOptions =
    entityType === "business"
      ? targets
        ? [targets.business]
        : []
      : entityType === "branch"
        ? (targets?.branches ?? [])
        : entityType === "staff"
          ? (targets?.staff ?? [])
          : entityType === "product"
            ? (targets?.products ?? [])
            : (targets?.suppliers ?? []);

  function changeEntityType(nextType: TwinEntityType) {
    setEntityType(nextType);
    setAssumptionKey(ASSUMPTION_OPTIONS[nextType][0].value);
    setEntityId("");
    setEditingSeriesId(null);
  }

  function startNextVersion(row: DigitalTwinAssumption) {
    setEntityType(row.entityType);
    setEntityId(row.entityType === "business" ? "" : row.entityId);
    setAssumptionKey(row.assumptionKey);
    setValue(String(row.value));
    setRationale("");
    setEditingSeriesId(row.seriesId);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedTargetId =
      entityType === "business" ? targets?.business.id : entityId;
    if (
      !selectedTargetId ||
      !Number.isFinite(Number(value)) ||
      !rationale.trim()
    )
      return;
    mutation.mutate({
      entityType,
      entityId: selectedTargetId,
      assumptionKey,
      value: Number(value),
      rationale: rationale.trim(),
      ...(editingSeriesId ? { seriesId: editingSeriesId } : {}),
    });
  }

  if (context.isLoading || assumptions.isLoading)
    return (
      <div className="p-6 text-sm text-[var(--app-text-muted)]">
        Loading live business model…
      </div>
    );
  if (
    context.isError ||
    assumptions.isError ||
    !context.data ||
    !assumptions.data
  ) {
    return (
      <section className="mx-auto max-w-5xl p-6">
        <div className="rounded-xl border border-[var(--app-danger)]/30 bg-[var(--app-surface)] p-5">
          <h1 className="text-xl font-semibold text-[var(--app-text)]">
            Digital Twin could not load
          </h1>
          <p className="mt-2 text-sm text-[var(--app-danger-strong)]">
            {errorText(context.error ?? assumptions.error)}
          </p>
          <button
            onClick={() => {
              void context.refetch();
              void assumptions.refetch();
            }}
            className="mt-4 rounded-lg border border-[var(--app-border)] px-3 py-2 text-sm font-medium"
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  const data = context.data;
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[var(--app-primary)]">
            Business Intelligence
          </p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--app-text)]">
            Digital Twin
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--app-text-muted)]">
            A live view of recorded branches, staff, products, suppliers,
            expenses and workflows. Saved inputs are versioned assumptions only.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-[var(--app-success-border)] bg-[var(--app-success-bg)] px-3 py-2 text-sm font-medium text-[var(--app-success-text)]">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          No operational records changed
        </div>
      </header>

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Business model coverage"
      >
        <CoverageCard
          icon={Building2}
          label="Locations"
          value={String(data.branches.length)}
          hint="Root business and active branches"
        />
        <CoverageCard
          icon={Users}
          label="Recorded staff"
          value={String(
            data.branches.reduce(
              (sum, branch) => sum + branch.staff.activeCount,
              0,
            ),
          )}
          hint="Active business memberships"
        />
        <CoverageCard
          icon={Package}
          label="Products & services"
          value={String(
            data.branches.reduce(
              (sum, branch) => sum + branch.products.activeCount,
              0,
            ),
          )}
          hint="Read from Products"
        />
        <CoverageCard
          icon={Boxes}
          label="Supplier records"
          value={String(
            data.branches.reduce(
              (sum, branch) => sum + branch.suppliers.count,
              0,
            ),
          )}
          hint="Lead times are not tracked"
        />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--app-text)]">
            Live operating model
          </h2>
          <p className="mt-1 text-sm text-[var(--app-text-muted)]">
            Each branch keeps its own currency. Expense totals are never
            combined across currencies.
          </p>
        </div>
        {data.branches.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--app-border)] bg-[var(--app-surface)] p-8 text-center text-sm text-[var(--app-text-muted)]">
            No active business locations were returned by Branches.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {data.branches.map((branch) => (
              <article
                key={branch.id}
                className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--app-text)]">
                      {branch.name}
                    </h3>
                    <p className="mt-1 text-xs text-[var(--app-text-faint)]">
                      {branch.parentId ? "Branch" : "Root business"} ·{" "}
                      {branch.currency}
                    </p>
                  </div>
                  <span className="rounded-full bg-[var(--app-success-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--app-success-text)]">
                    {branch.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Metric
                    label="Staff"
                    value={`${branch.staff.activeCount} active`}
                    detail={`${branch.staff.scheduledPeopleNext7Days} scheduled · ${branch.staff.scheduledHoursNext7Days} hours next 7 days · capacity ${branch.staff.capacityStatus.toLowerCase()}`}
                  />
                  <Metric
                    label="Products & services"
                    value={`${branch.products.activeCount} active`}
                    detail={`${branch.products.totalRecordedStockUnits} recorded units · ${branch.products.costCoverage}`}
                  />
                  <Metric
                    label="Suppliers"
                    value={`${branch.suppliers.count} records`}
                    detail={`${branch.suppliers.openPurchaseOrders} open purchase orders · lead times ${branch.suppliers.leadTimes.toLowerCase()}`}
                  />
                  <Metric
                    label="Recorded costs"
                    value={formatCurrency(
                      branch.costs.recordedExpenseTotalLast30Days,
                      branch.costs.currency,
                    )}
                    detail={`${branch.costs.recordedExpenseCountLast30Days} expenses in the last 30 days`}
                  />
                  <Metric
                    label="Processes"
                    value={`${branch.processes.activeWorkflowCount} active workflows`}
                    detail={`From ${branch.processes.source}`}
                  />
                  <Metric
                    label="Integrations"
                    value={`${branch.integrations.filter((integration) => integration.status === "connected").length} connected`}
                    detail={
                      branch.integrations.length
                        ? branch.integrations
                            .map(
                              (integration) =>
                                `${integration.provider}: ${integration.status.replaceAll("_", " ")}`,
                            )
                            .join(" · ")
                        : "No integration records"
                    }
                  />
                </div>
                <p className="mt-4 rounded-lg bg-[var(--app-surface-muted)] p-3 text-xs text-[var(--app-text-faint)]">
                  Service durations recorded:{" "}
                  {branch.products.serviceDurationsRecorded} of{" "}
                  {branch.products.serviceCount}. Available labor capacity and
                  productivity are not inferred from headcount.
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Plus className="h-5 w-5 text-[var(--app-primary)]" aria-hidden />
            <h2 className="text-lg font-semibold text-[var(--app-text)]">
              Save a versioned assumption
            </h2>
          </div>
          {editingSeriesId && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-[var(--app-info)]/10 p-3 text-sm">
              <span className="text-[var(--app-text)]">
                Creating the next version. The earlier value will remain
                unchanged.
              </span>
              <button
                type="button"
                onClick={() => {
                  setEditingSeriesId(null);
                  setValue("");
                  setRationale("");
                }}
                className="font-medium text-[var(--app-info)]"
              >
                Cancel
              </button>
            </div>
          )}
          <form className="space-y-4" onSubmit={submit}>
            <label className="block text-sm font-medium text-[var(--app-text)]">
              Model area
              <select
                value={entityType}
                onChange={(event) =>
                  changeEntityType(event.target.value as TwinEntityType)
                }
                className="mt-1.5 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2.5 text-sm"
              >
                {Object.entries(ENTITY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {entityType !== "business" && (
              <label className="block text-sm font-medium text-[var(--app-text)]">
                Record
                <select
                  required
                  value={entityId}
                  onChange={(event) => setEntityId(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2.5 text-sm"
                >
                  <option value="">Choose a live record</option>
                  {entityOptions.map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block text-sm font-medium text-[var(--app-text)]">
              Assumption
              <select
                value={assumptionKey}
                onChange={(event) =>
                  setAssumptionKey(event.target.value as TwinAssumptionKey)
                }
                className="mt-1.5 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2.5 text-sm"
              >
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {(() => {
              const option =
                options.find((item) => item.value === assumptionKey) ??
                options[0];
              return (
                <label className="block text-sm font-medium text-[var(--app-text)]">
                  Value ({option.unit})
                  <input
                    required
                    type="number"
                    min={option.min}
                    max={option.max}
                    step={option.step}
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2.5 text-sm"
                  />
                </label>
              );
            })()}
            <label className="block text-sm font-medium text-[var(--app-text)]">
              Why this assumption is being modeled
              <textarea
                required
                minLength={3}
                maxLength={1000}
                rows={3}
                value={rationale}
                onChange={(event) => setRationale(event.target.value)}
                className="mt-1.5 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2.5 text-sm"
                placeholder="State the source or reason for this hypothetical input"
              />
            </label>
            {mutation.isError && (
              <p
                role="alert"
                className="text-sm text-[var(--app-danger-strong)]"
              >
                {errorText(mutation.error)}
              </p>
            )}
            {mutation.isSuccess && (
              <p
                role="status"
                className="text-sm text-[var(--app-success-text)]"
              >
                Assumption version saved. Live operational data was not changed.
              </p>
            )}
            <button
              type="submit"
              disabled={
                mutation.isPending ||
                (entityType !== "business" && entityOptions.length === 0)
              }
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--app-primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" aria-hidden />
              {mutation.isPending ? "Saving…" : "Save assumption version"}
            </button>
            {entityType !== "business" && entityOptions.length === 0 && (
              <p className="text-xs text-[var(--app-text-faint)]">
                No matching source records are available in this business group.
              </p>
            )}
          </form>
        </div>
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <History
              className="h-5 w-5 text-[var(--app-primary)]"
              aria-hidden
            />
            <div>
              <h2 className="text-lg font-semibold text-[var(--app-text)]">
                Assumption history
              </h2>
              <p className="text-sm text-[var(--app-text-muted)]">
                New saves create immutable versions; compare earlier values
                below.
              </p>
            </div>
          </div>
          <AssumptionHistory
            rows={assumptions.data}
            context={data}
            onVersion={startNextVersion}
          />
        </div>
      </section>

      <section className="rounded-xl border border-[var(--app-warning-border)] bg-[var(--app-warning-bg)] p-5">
        <h2 className="font-semibold text-[var(--app-warning-text)]">
          Coverage and limits
        </h2>
        <ul className="mt-3 grid gap-2 text-sm text-[var(--app-text-muted)] md:grid-cols-2">
          {data.disclosures.map((disclosure) => (
            <li key={disclosure} className="flex gap-2">
              <span aria-hidden>•</span>
              <span>{disclosure}</span>
            </li>
          ))}
          <li className="flex gap-2">
            <span aria-hidden>•</span>
            <span>{data.assetCoverage}</span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden>•</span>
            <span>{data.serviceCapacity}</span>
          </li>
        </ul>
      </section>
      <p className="text-xs text-[var(--app-text-faint)]">
        Live source data last assembled{" "}
        {new Date(data.generatedAt).toLocaleString()}.
      </p>
    </main>
  );
}

function CoverageCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Boxes;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <article className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 shadow-sm">
      <div className="flex items-center gap-2 text-[var(--app-text-muted)]">
        <Icon className="h-4 w-4" aria-hidden />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums text-[var(--app-text)]">
        {value}
      </p>
      <p className="mt-1 text-xs text-[var(--app-text-faint)]">{hint}</p>
    </article>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg bg-[var(--app-surface-muted)] p-3">
      <p className="text-xs text-[var(--app-text-faint)]">{label}</p>
      <p className="mt-1 font-semibold text-[var(--app-text)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--app-text-muted)]">{detail}</p>
    </div>
  );
}
