"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search } from "lucide-react";
import {
  fetchWorkflowTriggerCatalog,
  type WorkflowTriggerCatalogEntry,
} from "@/lib/workflows-api";

function matchesQuery(trigger: WorkflowTriggerCatalogEntry, query: string) {
  return [trigger.key, trigger.label, trigger.module, trigger.mode, ...trigger.fields]
    .some((value) => value.toLocaleLowerCase().includes(query));
}

function TriggerCard({ trigger }: { trigger: WorkflowTriggerCatalogEntry }) {
  return (
    <article
      className="flex flex-col gap-3 rounded-[14px] p-4"
      style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}
    >
      <header>
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[10px] font-bold uppercase" style={{ color: "var(--app-text-disabled)" }}>
              {trigger.module} · {trigger.mode === "scheduled" ? "Schedule" : "Noxtill event"}
            </p>
            <h2 className="m-0 mt-1 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>
              {trigger.label}
            </h2>
          </div>
          <code className="rounded px-2 py-1 text-[9.5px]" style={{ background: "var(--app-surface-2)", color: "var(--app-text-muted)" }}>
            {trigger.key}
          </code>
        </div>
      </header>

      <section>
        <h3 className="m-0 text-[10px] font-extrabold uppercase tracking-wide" style={{ color: "var(--app-text-disabled)" }}>
          Available context fields
        </h3>
        <p className="m-0 mt-1 text-[10.5px]" style={{ color: "var(--app-text-muted)" }}>
          These names are exposed to workflow conditions and message templates. A value may be absent when its source record has no corresponding data.
        </p>
        <ul className="m-0 mt-2 flex flex-wrap gap-1.5 p-0">
          {trigger.fields.map((field) => (
            <li key={field} className="list-none">
              <code className="inline-block rounded px-2 py-1 text-[10px]" style={{ background: "var(--app-surface-2)", color: "var(--app-text)" }}>
                {field}
              </code>
            </li>
          ))}
        </ul>
      </section>

      <Link
        href={`/marketing/automations?newTrigger=${encodeURIComponent(trigger.key)}`}
        className="self-start rounded-[9px] px-3 py-2 text-[11px] font-bold"
        style={{ background: "var(--app-primary)", color: "var(--app-primary-foreground)" }}
      >
        Use this trigger
      </Link>
    </article>
  );
}

export function WorkflowTriggerCatalogView() {
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const { data, isPending, isError, refetch, isFetching } = useQuery({
    queryKey: ["workflow-trigger-catalog"],
    queryFn: fetchWorkflowTriggerCatalog,
  });
  const triggers = useMemo(() => data ?? [], [data]);
  const modules = useMemo(
    () => [...new Set(triggers.map((trigger) => trigger.module))].sort(),
    [triggers],
  );
  const query = search.trim().toLocaleLowerCase();
  const filtered = triggers.filter(
    (trigger) =>
      (moduleFilter === "all" || trigger.module === moduleFilter) &&
      matchesQuery(trigger, query),
  );

  return (
    <main className="flex flex-col gap-4 px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)" }}>
            Trigger &amp; Event Catalog
          </h1>
          <p className="m-0 mt-1 max-w-3xl text-[12px]" style={{ color: "var(--app-text-muted)" }}>
            Explore the Noxtill events and schedule trigger types currently exposed to workflow definitions.
          </p>
          <p className="m-0 mt-1 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>
            Field names describe the runtime context; they are not sample or live event values.
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
          <span className="sr-only">Search triggers</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search triggers, modules or fields"
            className="min-w-0 flex-1 bg-transparent text-[11.5px] outline-none"
            style={{ color: "var(--app-text)" }}
          />
        </label>
        <label className="flex min-h-10 items-center gap-2 rounded-[9px] px-3 text-[10.5px] font-semibold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
          <span>Module</span>
          <select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)} className="bg-transparent text-[11px] outline-none" style={{ color: "var(--app-text)" }}>
            <option value="all">All</option>
            {modules.map((module) => <option key={module} value={module}>{module}</option>)}
          </select>
        </label>
      </div>

      {isPending ? (
        <p className="m-0 rounded-[12px] p-4 text-[12px]" style={{ background: "var(--app-surface)", color: "var(--app-text-muted)" }}>
          Loading the available triggers…
        </p>
      ) : isError ? (
        <div role="alert" className="rounded-[12px] p-4" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <p className="m-0 text-[12px] font-bold" style={{ color: "var(--app-text)" }}>The trigger catalog is unavailable</p>
          <p className="m-0 mt-1 text-[11px]" style={{ color: "var(--app-text-muted)" }}>No sample triggers are shown. Check your connection and try again.</p>
          <button type="button" onClick={() => refetch()} disabled={isFetching} className="mt-3 rounded-[9px] px-3 py-2 text-[11px] font-bold disabled:opacity-50" style={{ background: "var(--app-primary)", color: "white" }}>
            {isFetching ? "Loading…" : "Retry"}
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="m-0 rounded-[12px] p-4 text-[12px]" style={{ background: "var(--app-surface)", color: "var(--app-text-muted)" }}>
          {triggers.length === 0 ? "No workflow triggers are currently available." : "No triggers match these filters."}
        </p>
      ) : (
        <>
          <p className="m-0 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>
            Showing {filtered.length} of {triggers.length} trigger types exposed by the current workflow API.
          </p>
          <div className="grid items-start gap-3 xl:grid-cols-2">
            {filtered.map((trigger) => <TriggerCard key={trigger.key} trigger={trigger} />)}
          </div>
        </>
      )}
    </main>
  );
}
