"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Search } from "lucide-react";
import {
  fetchWorkflowActionCatalog,
  fetchWorkflowTemplates,
  installWorkflowTemplate,
  type WorkflowActionCatalogEntry,
  type WorkflowTemplatePreview,
} from "@/lib/workflows-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

function matchesQuery(template: WorkflowTemplatePreview, query: string) {
  return [
    template.name,
    template.description,
    template.module,
    template.goal,
    template.triggerLabel,
    ...template.actions.map((action) => action.type),
  ].some((value) => value.toLocaleLowerCase().includes(query));
}

function actionLabel(
  actionType: string,
  actionCatalog: WorkflowActionCatalogEntry[],
) {
  return actionCatalog.find((entry) => entry.type === actionType)?.label ?? actionType;
}

export function WorkflowTemplatesView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>({});
  const {
    data: templateData,
    isPending,
    isError,
    refetch,
    isFetching,
  } = useQuery({ queryKey: ["workflow-templates"], queryFn: fetchWorkflowTemplates });
  const { data: actionCatalog = [] } = useQuery({
    queryKey: ["workflow-action-catalog"],
    queryFn: fetchWorkflowActionCatalog,
  });
  const templates = useMemo(() => templateData ?? [], [templateData]);
  const modules = useMemo(
    () => [...new Set(templates.map((template) => template.module))].sort(),
    [templates],
  );
  const query = search.trim().toLocaleLowerCase();
  const filtered = templates.filter(
    (template) =>
      (moduleFilter === "all" || template.module === moduleFilter) &&
      matchesQuery(template, query),
  );
  const installMutation = useMutation({
    mutationFn: ({ templateId, name }: { templateId: string; name?: string }) =>
      installWorkflowTemplate(templateId, name),
    onSuccess: async (workflow) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workflows"] }),
        queryClient.invalidateQueries({ queryKey: ["workflow-summary"] }),
      ]);
      toast.success(`Added ${workflow.name} as a paused draft`);
      router.push("/marketing/automations");
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : "This workflow template could not be installed.",
      ),
  });

  return (
    <main className="flex flex-col gap-4 px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)" }}>
            Workflow templates
          </h1>
          <p className="m-0 mt-1 max-w-3xl text-[12px]" style={{ color: "var(--app-text-muted)" }}>
            Install a fixture-checked starter as a paused workflow draft. Fixture previews never send messages or call providers.
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
          <span className="sr-only">Search templates</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search templates, modules or triggers"
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
          Loading workflow templates…
        </p>
      ) : isError ? (
        <div role="alert" className="rounded-[12px] p-4" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <p className="m-0 text-[12px] font-bold" style={{ color: "var(--app-text)" }}>Workflow templates are unavailable</p>
          <p className="m-0 mt-1 text-[11px]" style={{ color: "var(--app-text-muted)" }}>No sample templates are shown. Check your connection and try again.</p>
          <button type="button" onClick={() => refetch()} disabled={isFetching} className="mt-3 rounded-[9px] px-3 py-2 text-[11px] font-bold disabled:opacity-50" style={{ background: "var(--app-primary)", color: "white" }}>
            {isFetching ? "Loading…" : "Retry"}
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="m-0 rounded-[12px] p-4 text-[12px]" style={{ background: "var(--app-surface)", color: "var(--app-text-muted)" }}>
          {templates.length === 0 ? "No workflow templates are currently available." : "No templates match these filters."}
        </p>
      ) : (
        <>
          <p className="m-0 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>
            Showing {filtered.length} of {templates.length} built-in templates. Installed workflows start paused and must be reviewed before activation.
          </p>
          <div className="grid items-start gap-3 xl:grid-cols-2">
            {filtered.map((template) => {
              const mutationPending =
                installMutation.isPending &&
                installMutation.variables?.templateId === template.id;
              return (
                <article key={template.id} className="flex flex-col gap-3 rounded-[14px] p-4" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
                  <header>
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="m-0 text-[10px] font-bold uppercase" style={{ color: "var(--app-text-disabled)" }}>
                          {template.module} · v{template.version} · {template.triggerLabel}
                        </p>
                        <h2 className="m-0 mt-1 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>
                          {template.name}
                        </h2>
                      </div>
                      <span className="rounded-full px-2 py-1 text-[9.5px] font-bold" style={{ background: template.preview.fixtureValid ? "var(--app-success-bg)" : "var(--app-warning-bg)", color: template.preview.fixtureValid ? "var(--app-success-text)" : "var(--app-warning-text)" }}>
                        {template.preview.fixtureValid ? "Fixture checked" : "Fixture invalid"}
                      </span>
                    </div>
                    <p className="m-0 mt-2 text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>{template.description}</p>
                    <p className="m-0 mt-1 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>{template.goal}</p>
                  </header>

                  <section className="rounded-[10px] p-3" style={{ background: "var(--app-surface-2)" }}>
                    <p className="m-0 text-[10px] font-extrabold uppercase" style={{ color: "var(--app-text-disabled)" }}>Actions</p>
                    <ul className="m-0 mt-1 grid gap-1 p-0">
                      {template.actions.map((action, index) => (
                        <li key={`${action.type}-${index}`} className="list-none text-[11px] font-semibold" style={{ color: "var(--app-text)" }}>
                          {actionLabel(action.type, actionCatalog)}
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section>
                    <p className="m-0 text-[10px] font-extrabold uppercase" style={{ color: "var(--app-text-disabled)" }}>Example fixture preview · not sent</p>
                    <pre className="m-0 mt-1 overflow-x-auto whitespace-pre-wrap rounded-[9px] p-2.5 text-[10.5px]" style={{ background: "var(--app-surface-2)", color: "var(--app-text-muted)" }}>
                      {template.preview.renderedMessages[0] ?? template.preview.validationError ?? "No message preview available."}
                    </pre>
                  </section>

                  <section>
                    <p className="m-0 text-[10px] font-extrabold uppercase" style={{ color: "var(--app-text-disabled)" }}>Setup before activation</p>
                    <ul className="m-0 mt-1 grid gap-1 ps-4 text-[10.5px]" style={{ color: "var(--app-text-muted)" }}>
                      {template.requiredSetup.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </section>

                  <label className="flex flex-col gap-1 text-[10.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>
                    Workflow name
                    <input
                      value={nameOverrides[template.id] ?? template.name}
                      onChange={(event) => setNameOverrides((current) => ({ ...current, [template.id]: event.target.value }))}
                      maxLength={191}
                      className="rounded-[9px] px-3 py-2 text-[11.5px]"
                      style={{ border: "1px solid var(--app-border)", color: "var(--app-text)" }}
                    />
                  </label>

                  <button
                    type="button"
                    disabled={!template.preview.fixtureValid || installMutation.isPending || !(nameOverrides[template.id] ?? template.name).trim()}
                    onClick={() => installMutation.mutate({ templateId: template.id, name: (nameOverrides[template.id] ?? template.name).trim() })}
                    className="self-start rounded-[9px] px-3 py-2 text-[11px] font-bold disabled:opacity-50"
                    style={{ background: "var(--app-primary)", color: "white" }}
                  >
                    {mutationPending ? "Installing…" : "Add paused draft"}
                  </button>
                </article>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
