"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search } from "lucide-react";
import {
  fetchWorkflowActionCatalog,
  type WorkflowActionCatalogEntry,
} from "@/lib/workflows-api";

function includesQuery(action: WorkflowActionCatalogEntry, query: string) {
  return [
    action.type,
    action.label,
    action.description,
    action.category,
    action.effect,
    action.provider,
    action.setup,
    ...action.inputs.flatMap((input) => [input.name, input.description]),
    ...action.outputs.flatMap((output) => [output.name, output.description]),
  ].some((value) => value.toLocaleLowerCase().includes(query));
}

function SchemaFields({
  title,
  fields,
}: {
  title: string;
  fields: Array<{ name: string; type: string; required?: boolean; description: string }>;
}) {
  return (
    <section>
      <h3
        className="m-0 text-[10px] font-extrabold uppercase tracking-wide"
        style={{ color: "var(--app-text-disabled)" }}
      >
        {title}
      </h3>
      <ul className="m-0 mt-2 grid gap-2 p-0">
        {fields.map((field) => (
          <li key={field.name} className="list-none">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <code
                className="rounded px-1.5 py-0.5 font-semibold"
                style={{ background: "var(--app-surface-2)", color: "var(--app-text)" }}
              >
                {field.name}
              </code>
              <span style={{ color: "var(--app-text-disabled)" }}>{field.type}</span>
              {field.required !== undefined && (
                <span
                  className="rounded px-1.5 py-0.5 text-[9px] font-bold"
                  style={{
                    background: field.required ? "var(--app-warning-bg)" : "var(--app-surface-2)",
                    color: field.required ? "var(--app-warning-text)" : "var(--app-text-disabled)",
                  }}
                >
                  {field.required ? "required" : "optional"}
                </span>
              )}
            </div>
            <p className="m-0 mt-1 text-[10.5px]" style={{ color: "var(--app-text-muted)" }}>
              {field.description}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ActionCard({ action }: { action: WorkflowActionCatalogEntry }) {
  return (
    <article
      className="flex flex-col gap-4 rounded-[14px] p-4"
      style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}
    >
      <header>
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[10px] font-bold uppercase" style={{ color: "var(--app-text-disabled)" }}>
              {action.category} · {action.provider}
            </p>
            <h2 className="m-0 mt-1 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>
              {action.label}
            </h2>
          </div>
          <span
            className="rounded-full px-2 py-1 text-[9.5px] font-bold capitalize"
            style={{ background: "var(--app-surface-2)", color: "var(--app-text-muted)" }}
          >
            {action.risk} risk
          </span>
        </div>
        <p className="m-0 mt-2 text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>
          {action.description}
        </p>
        <p className="m-0 mt-2 text-[10px] font-semibold" style={{ color: "var(--app-text-disabled)" }}>
          {action.type} · {action.effect}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <SchemaFields title="Inputs" fields={action.inputs} />
        <SchemaFields title="Run outputs" fields={action.outputs} />
      </div>

      <dl
        className="m-0 grid gap-3 rounded-[10px] p-3 sm:grid-cols-2"
        style={{ background: "var(--app-surface-2)" }}
      >
        <div>
          <dt className="text-[10px] font-extrabold uppercase" style={{ color: "var(--app-text-disabled)" }}>
            Setup
          </dt>
          <dd className="m-0 mt-1 text-[10.5px]" style={{ color: "var(--app-text-muted)" }}>
            {action.setup}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-extrabold uppercase" style={{ color: "var(--app-text-disabled)" }}>
            Idempotency
          </dt>
          <dd className="m-0 mt-1 text-[10.5px]" style={{ color: "var(--app-text-muted)" }}>
            {action.idempotency}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[10px] font-extrabold uppercase" style={{ color: "var(--app-text-disabled)" }}>
            Limits and provider behavior
          </dt>
          <dd className="m-0 mt-1 text-[10.5px]" style={{ color: "var(--app-text-muted)" }}>
            {action.rateLimits}
          </dd>
        </div>
      </dl>
    </article>
  );
}

export function WorkflowActionCatalogView() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const { data, isPending, isError, refetch, isFetching } = useQuery({
    queryKey: ["workflow-action-catalog"],
    queryFn: fetchWorkflowActionCatalog,
  });
  const actions = useMemo(() => data ?? [], [data]);
  const categories = useMemo(
    () => [...new Set(actions.map((action) => action.category))].sort(),
    [actions],
  );
  const query = search.trim().toLocaleLowerCase();
  const filtered = actions.filter(
    (action) =>
      (category === "all" || action.category === category) &&
      includesQuery(action, query),
  );

  return (
    <main className="flex flex-col gap-4 px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)" }}>
            Actions &amp; Nodes
          </h1>
          <p className="m-0 mt-1 max-w-3xl text-[12px]" style={{ color: "var(--app-text-muted)" }}>
            Browse actions currently executable by Noxtill workflows. Provider setup may still be required; this catalog never exposes credentials.
          </p>
          <p className="m-0 mt-1 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>
            Risk labels describe the action&apos;s side-effect class; they do not replace server-side role and permission checks.
          </p>
        </div>
        <Link
          href="/marketing/automations"
          className="inline-flex min-h-10 items-center gap-2 rounded-[10px] px-3 text-[11.5px] font-bold"
          style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Back to workflows
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-[12px] p-3" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <label className="flex min-h-10 min-w-[220px] flex-1 items-center gap-2 rounded-[9px] px-3" style={{ border: "1px solid var(--app-border)" }}>
          <Search className="h-3.5 w-3.5" style={{ color: "var(--app-text-disabled)" }} aria-hidden />
          <span className="sr-only">Search actions</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search actions, providers or fields"
            className="min-w-0 flex-1 bg-transparent text-[11.5px] outline-none"
            style={{ color: "var(--app-text)" }}
          />
        </label>
        <label className="flex min-h-10 items-center gap-2 rounded-[9px] px-3 text-[10.5px] font-semibold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
          <span>Category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="bg-transparent text-[11px] outline-none" style={{ color: "var(--app-text)" }}>
            <option value="all">All</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>

      {isPending ? (
        <p className="m-0 rounded-[12px] p-4 text-[12px]" style={{ background: "var(--app-surface)", color: "var(--app-text-muted)" }}>
          Loading the available action catalog…
        </p>
      ) : isError ? (
        <div role="alert" className="rounded-[12px] p-4" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <p className="m-0 text-[12px] font-bold" style={{ color: "var(--app-text)" }}>The action catalog is unavailable</p>
          <p className="m-0 mt-1 text-[11px]" style={{ color: "var(--app-text-muted)" }}>No sample actions are shown. Check your connection and try again.</p>
          <button type="button" onClick={() => refetch()} disabled={isFetching} className="mt-3 rounded-[9px] px-3 py-2 text-[11px] font-bold disabled:opacity-50" style={{ background: "var(--app-primary)", color: "white" }}>
            {isFetching ? "Loading…" : "Retry"}
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="m-0 rounded-[12px] p-4 text-[12px]" style={{ background: "var(--app-surface)", color: "var(--app-text-muted)" }}>
          {actions.length === 0 ? "No workflow actions are currently available." : "No actions match these filters."}
        </p>
      ) : (
        <>
          <p className="m-0 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>
            Showing {filtered.length} of {actions.length} implemented actions. “Implemented” does not mean an external provider account is connected or live-tested.
          </p>
          <div className="grid items-start gap-3 xl:grid-cols-2">
            {filtered.map((action) => <ActionCard key={action.type} action={action} />)}
          </div>
        </>
      )}
    </main>
  );
}
