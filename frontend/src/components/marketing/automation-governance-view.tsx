"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { fetchHubCategory, saveHubChanges, type HubRow } from "@/lib/settings-hub-api";
import { fetchGovernanceAudit } from "@/lib/automation-command-center-api";

const GOVERNANCE_ROWS = ["wf-max-active", "wf-approval-before-message"];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

/** One Settings → Automations governance row, edited in place through the Settings hub (versioned). */
function RuleRow({ row }: { row: HubRow }) {
  const client = useQueryClient();
  const control = row.control;
  const [draft, setDraft] = useState(control?.type === "number" ? String(control.current ?? "") : "");
  const save = useMutation({
    mutationFn: (value: string | number | boolean | null) => saveHubChanges([{ category: "automations", rowKey: row.key, value }]),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["settings-hub"] });
      toast.success("Saved.");
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't save the rule.")),
  });
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-t px-4 py-3" style={{ borderColor: "var(--app-border)" }}>
      <div className="max-w-xl">
        <p className="m-0 text-sm font-semibold">{row.label}</p>
        <p className="m-0 mt-0.5 text-xs" style={{ color: "var(--app-text-faint)" }}>{row.description}</p>
        {row.impact && <p className="m-0 mt-0.5 text-xs" style={{ color: "var(--app-text-faintest)" }}>{row.impact}</p>}
      </div>
      {!row.editable ? (
        <span className="text-xs font-bold">{row.value}{row.locked ? ` · ${row.locked}` : ""}</span>
      ) : control?.type === "toggle" ? (
        <button type="button" role="switch" aria-checked={control.on} aria-label={row.label} disabled={save.isPending} onClick={() => save.mutate(!control.on)} className="rounded-full border px-3 py-1 text-xs font-bold disabled:opacity-50" style={{ borderColor: "var(--app-border)" }}>
          {row.value}
        </button>
      ) : control?.type === "number" ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(draft.trim() === "" ? null : Number(draft));
          }}
        >
          <input type="number" min={control.min} max={control.max} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="No limit" aria-label={row.label} className="w-24 rounded-lg border px-2 py-1 text-sm" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }} />
          <button type="submit" disabled={save.isPending} className="text-xs font-bold underline disabled:opacity-50">Save</button>
        </form>
      ) : (
        <span className="text-xs font-bold">{row.value}</span>
      )}
    </div>
  );
}

export function AutomationGovernanceView() {
  const category = useQuery({ queryKey: ["settings-hub", "category", "automations"], queryFn: () => fetchHubCategory("automations") });
  const audit = useQuery({ queryKey: ["automation-governance-audit"], queryFn: fetchGovernanceAudit });
  const rows = (category.data?.groups ?? []).flatMap((group) => group.rows).filter((row) => GOVERNANCE_ROWS.includes(row.key));

  return (
    <main className="flex flex-col gap-5 p-5 md:p-7" style={{ color: "var(--app-text)" }}>
      <section className="rounded-2xl border" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
        <div className="px-4 pb-2 pt-3">
          <p className="m-0 text-sm font-bold">Automation rules</p>
          <p className="m-0 text-xs" style={{ color: "var(--app-text-faint)" }}>
            Enforced when a workflow is switched on or its steps change — in the editor, on version restore and from Settings. Changes are kept in{" "}
            <Link href="/settings/automations" className="underline">Settings → Automations</Link> history.
          </p>
        </div>
        {category.isLoading ? (
          <p className="m-0 px-4 pb-4 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading…</p>
        ) : category.isError ? (
          <p className="m-0 px-4 pb-4 text-sm" style={{ color: "var(--app-danger-strong)" }}>{errorMessage(category.error, "Couldn't load the rules.")}</p>
        ) : (
          rows.map((row) => <RuleRow key={`${row.key}-${row.value}`} row={row} />)
        )}
      </section>

      <section className="rounded-2xl border p-4 text-xs" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
        <p className="m-0 text-sm font-bold">Who can change automations</p>
        <p className="m-0 mt-1" style={{ color: "var(--app-text-muted)" }}>
          Owners and managers can create and change workflows, decide workflow approvals and resolve Recovery items; staff can&rsquo;t. Team roles are managed in{" "}
          <Link href="/settings/team" className="underline">Settings → Team</Link>.
        </p>
        <p className="m-0 mt-2" style={{ color: "var(--app-text-faint)" }}>
          Not available yet: per-plan run quotas, run-history retention settings, and automated security scans of workflows.
        </p>
      </section>

      <section className="rounded-2xl border" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
        <p className="m-0 px-4 pt-3 text-sm font-bold">Audit trail</p>
        <p className="m-0 px-4 text-xs" style={{ color: "var(--app-text-faint)" }}>Version saves, approval decisions and Recovery decisions. Version saves don&rsquo;t record who made them.</p>
        {audit.isLoading ? (
          <p className="m-0 p-4 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading…</p>
        ) : (audit.data ?? []).length === 0 ? (
          <p className="m-0 p-4 text-sm" style={{ color: "var(--app-text-faint)" }}>Nothing recorded yet.</p>
        ) : (
          <ul className="m-0 mt-2 flex list-none flex-col p-0 text-xs">
            {(audit.data ?? []).map((row, index) => (
              <li key={`${row.kind}-${row.at}-${index}`} className="border-t px-4 py-2" style={{ borderColor: "var(--app-border)" }}>
                <span className="font-semibold">{row.text}</span> · {row.actor ?? "author not recorded"} · {formatDate(row.at)}
                {row.note && <span className="block" style={{ color: "var(--app-text-faint)" }}>{row.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
