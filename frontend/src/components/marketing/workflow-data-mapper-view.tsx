"use client";

import { useState } from "react";
import { ArrowLeft, Plus, Trash2, WandSparkles } from "lucide-react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import {
  previewWorkflowDataMapping,
  WORKFLOW_DATA_MAPPER_TRANSFORMS,
  type WorkflowDataMappingInput,
} from "@/lib/workflows-api";
import { ApiError } from "@/lib/api-client";

const TRANSFORM_LABELS: Record<(typeof WORKFLOW_DATA_MAPPER_TRANSFORMS)[number], string> = {
  copy: "Keep as-is",
  string: "Convert to text",
  number: "Convert to number",
  boolean: "Convert to true / false",
  iso_date: "Convert to ISO date",
  trim: "Trim spaces",
  lowercase: "Lowercase",
  uppercase: "Uppercase",
  json_string: "Convert JSON to text",
};

const fieldStyle = {
  background: "var(--app-surface-2)",
  border: "1px solid var(--app-border)",
  color: "var(--app-text)",
};

export function WorkflowDataMapperView() {
  const [sourceText, setSourceText] = useState("");
  const [mappings, setMappings] = useState<WorkflowDataMappingInput[]>([]);
  const [inputError, setInputError] = useState<string | null>(null);
  const previewMutation = useMutation({ mutationFn: previewWorkflowDataMapping });

  function updateMapping(index: number, patch: Partial<WorkflowDataMappingInput>) {
    setMappings((current) => current.map((mapping, row) =>
      row === index ? { ...mapping, ...patch } : mapping,
    ));
    previewMutation.reset();
  }

  function submitPreview() {
    setInputError(null);
    previewMutation.reset();
    let source: unknown;
    try {
      source = JSON.parse(sourceText);
    } catch {
      setInputError("Enter valid JSON before previewing the mapping.");
      return;
    }
    if (typeof source !== "object" || source === null || Array.isArray(source)) {
      setInputError("The source must be a JSON object.");
      return;
    }
    if (mappings.length === 0) {
      setInputError("Add at least one field mapping first.");
      return;
    }
    if (mappings.some((mapping) => !mapping.sourcePath?.trim() || !mapping.targetPath?.trim())) {
      setInputError("Each mapping needs both a source path and a target path.");
      return;
    }
    previewMutation.mutate({ source: source as Record<string, unknown>, mappings });
  }

  const serverError = previewMutation.error instanceof ApiError
    ? previewMutation.error.message
    : previewMutation.error
      ? "The mapping preview could not be completed."
      : null;

  return (
    <main className="flex flex-col gap-4 px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)" }}>Data Mapper</h1>
          <p className="m-0 mt-1 max-w-3xl text-[12px]" style={{ color: "var(--app-text-muted)" }}>
            Preview how JSON fields move from a workflow event into a target payload.
          </p>
        </div>
        <Link href="/marketing/automations" className="inline-flex min-h-10 items-center gap-2 rounded-[10px] px-3 text-[11.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />Back to workflows
        </Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-3 rounded-[14px] p-4" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div>
            <h2 className="m-0 text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}>Source JSON</h2>
            <p className="m-0 mt-1 text-[10.5px]" style={{ color: "var(--app-text-muted)" }}>Paste a sample event object to inspect the mapping. It is only used for this preview.</p>
          </div>
          <textarea
            aria-label="Source JSON"
            value={sourceText}
            onChange={(event) => { setSourceText(event.target.value); previewMutation.reset(); }}
            placeholder="Paste a JSON object"
            spellCheck={false}
            className="min-h-[220px] w-full resize-y rounded-[10px] p-3 font-mono text-[11px] outline-none"
            style={fieldStyle}
          />
        </section>

        <section className="flex min-w-0 flex-col gap-3 rounded-[14px] p-4" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="m-0 text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}>Field mappings</h2>
              <p className="m-0 mt-1 text-[10.5px]" style={{ color: "var(--app-text-muted)" }}>Use dot paths; source paths can include array indexes such as items.0.sku.</p>
            </div>
            <button
              type="button"
              onClick={() => { setMappings((current) => [...current, { sourcePath: "", targetPath: "", transform: "copy", required: true }]); previewMutation.reset(); }}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-[9px] px-3 text-[10.5px] font-bold"
              style={{ border: "1px solid var(--app-border)", color: "var(--app-text)" }}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />Add mapping
            </button>
          </div>

          {mappings.length === 0 ? (
            <p className="m-0 rounded-[10px] border border-dashed p-4 text-center text-[10.5px]" style={{ borderColor: "var(--app-border)", color: "var(--app-text-muted)" }}>
              No mappings added yet.
            </p>
          ) : mappings.map((mapping, index) => (
            <div key={index} className="grid gap-2 rounded-[10px] p-3 md:grid-cols-2" style={{ background: "var(--app-surface-2)", border: "1px solid var(--app-border)" }}>
              <label className="flex min-w-0 flex-col gap-1 text-[9.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>
                Source path
                <input
                  aria-label={`Source path ${index + 1}`}
                  value={mapping.sourcePath}
                  onChange={(event) => updateMapping(index, { sourcePath: event.target.value })}
                  placeholder="customer.email"
                  className="h-9 min-w-0 rounded-[8px] px-2 font-mono text-[10.5px] outline-none"
                  style={fieldStyle}
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-[9.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>
                Target path
                <input
                  aria-label={`Target path ${index + 1}`}
                  value={mapping.targetPath}
                  onChange={(event) => updateMapping(index, { targetPath: event.target.value })}
                  placeholder="contact.email"
                  className="h-9 min-w-0 rounded-[8px] px-2 font-mono text-[10.5px] outline-none"
                  style={fieldStyle}
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-[9.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>
                Transform
                <select
                  aria-label={`Transform ${index + 1}`}
                  value={mapping.transform ?? "copy"}
                  onChange={(event) => updateMapping(index, { transform: event.target.value as WorkflowDataMappingInput["transform"] })}
                  className="h-9 min-w-0 rounded-[8px] px-2 text-[10.5px] outline-none"
                  style={fieldStyle}
                >
                  {WORKFLOW_DATA_MAPPER_TRANSFORMS.map((transform) => <option key={transform} value={transform}>{TRANSFORM_LABELS[transform]}</option>)}
                </select>
              </label>
              <div className="flex items-end gap-2">
                <label className="flex min-h-9 flex-1 items-center gap-2 rounded-[8px] px-2 text-[10px] font-semibold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
                  <input
                    type="checkbox"
                    checked={mapping.required !== false}
                    onChange={(event) => updateMapping(index, { required: event.target.checked })}
                  />
                  Required source
                </label>
                <button
                  type="button"
                  aria-label={`Remove mapping ${index + 1}`}
                  onClick={() => { setMappings((current) => current.filter((_, row) => row !== index)); previewMutation.reset(); }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-[8px]"
                  style={{ border: "1px solid var(--app-border)", color: "var(--app-danger-strong)" }}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </div>
          ))}
        </section>
      </div>

      <div className="flex flex-col gap-3 rounded-[14px] p-4" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={submitPreview}
            disabled={previewMutation.isPending}
            className="inline-flex min-h-10 items-center gap-2 rounded-[9px] px-4 text-[11px] font-bold disabled:opacity-50"
            style={{ background: "var(--app-primary)", color: "var(--app-primary-foreground)" }}
          >
            <WandSparkles className="h-3.5 w-3.5" aria-hidden />
            {previewMutation.isPending ? "Previewing…" : "Preview mapping"}
          </button>
          <p className="m-0 text-[10px]" style={{ color: "var(--app-text-muted)" }}>No workflow is saved or executed and no external service is called.</p>
        </div>

        {inputError || serverError ? <p role="alert" className="m-0 rounded-[9px] p-3 text-[10.5px]" style={{ border: "1px solid var(--app-danger)", color: "var(--app-danger-strong)" }}>{inputError ?? serverError}</p> : null}

        {previewMutation.data ? (
          <div className="grid gap-3 xl:grid-cols-2">
            <div className="rounded-[10px] p-3" style={{ background: "var(--app-surface-2)", border: "1px solid var(--app-border)" }}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="m-0 text-[11px] font-extrabold" style={{ color: "var(--app-text)" }}>Mapped JSON</h2>
                <span className="text-[9.5px] font-bold" style={{ color: previewMutation.data.valid ? "var(--app-success-text)" : "var(--app-danger-strong)" }}>
                  {previewMutation.data.valid ? `${previewMutation.data.mappedFields} fields mapped` : "Needs correction"}
                </span>
              </div>
              <pre className="m-0 max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px]" style={{ color: "var(--app-text-muted)" }}>{JSON.stringify(previewMutation.data.mappedData, null, 2)}</pre>
            </div>
            <div className="flex flex-col gap-2">
              {previewMutation.data.errors.map((issue, index) => (
                <p key={`error-${issue.path}-${index}`} role="alert" className="m-0 rounded-[9px] p-3 text-[10.5px]" style={{ border: "1px solid var(--app-danger)", color: "var(--app-danger-strong)" }}><span className="font-bold">{issue.path}: </span>{issue.message}</p>
              ))}
              {previewMutation.data.warnings.map((issue, index) => (
                <p key={`warning-${issue.path}-${index}`} className="m-0 rounded-[9px] p-3 text-[10.5px]" style={{ border: "1px solid var(--app-warning-border)", background: "var(--app-warning-bg)", color: "var(--app-warning-text)" }}><span className="font-bold">{issue.path}: </span>{issue.message}</p>
              ))}
              {previewMutation.data.errors.length === 0 && previewMutation.data.warnings.length === 0 ? <p className="m-0 rounded-[9px] p-3 text-[10.5px]" style={{ border: "1px solid var(--app-success-border)", background: "var(--app-success-bg)", color: "var(--app-success-text)" }}>All configured mappings passed this preview.</p> : null}
            </div>
          </div>
        ) : null}

        <p className="m-0 border-t pt-3 text-[9.5px]" style={{ borderColor: "var(--app-border)", color: "var(--app-text-disabled)" }}>
          This preview supports safe JSON property paths and basic type/text conversions only. Currency conversion, arbitrary expressions, regex, CSV/XML, sorting, and aggregation are not implemented. Save mapping rules inside a workflow with its Map event data action.
        </p>
      </div>
    </main>
  );
}
